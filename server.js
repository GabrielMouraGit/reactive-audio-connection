import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

// Observer pattern simples para eventos de sinalização
class Observer {
  constructor() {
    this.listeners = new Map();
  }

  register(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  notify(type, payload) {
    const handlers = this.listeners.get(type) || [];
    for (const handler of handlers) {
      handler(payload);
    }
  }
}

const observer = new Observer();

class RoomService {
  constructor() {
    this.rooms = new Map();
  }

  join(ws, roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    const room = this.rooms.get(roomId);
    room.add(ws);
    ws.roomId = roomId;
    observer.notify('room.update', { roomId, clients: [...room].map((c) => c.id) });
    return room;
  }

  leave(ws) {
    const roomId = ws.roomId;
    if (!roomId || !this.rooms.has(roomId)) return;
    const room = this.rooms.get(roomId);
    room.delete(ws);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    } else {
      observer.notify('room.update', { roomId, clients: [...room].map((c) => c.id) });
    }
    ws.roomId = null;
    return room;
  }

  broadcast(ws, data) {
    if (!ws.roomId || !this.rooms.has(ws.roomId)) return;
    const room = this.rooms.get(ws.roomId);
    const payload = { ...data, from: ws.id };
    for (const client of room) {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(JSON.stringify(payload));
      }
    }
  }
}

const roomService = new RoomService();

function log(...args) {
  console.log('[SIGNALING]', ...args);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.send('Reactive Audio Connection signaling server is running.');
});

// observadores para logs e notificações adicionais (exemplo DDD event store)
observer.register('room.update', ({ roomId, clients }) => {
  log(`room.update ${roomId}: participantes=`, clients.join(', '));
});

wss.on('connection', (ws) => {
  log('new websocket connection');
  ws.id = `${Math.random().toString(36).slice(2)}-${Date.now()}`;
  ws.roomId = null;

  ws.send(JSON.stringify({ type: 'connected', id: ws.id }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (!data || !data.type) return;

      switch (data.type) {
        case 'join': {
          const roomId = data.roomId?.toString() || 'default';
          const room = roomService.join(ws, roomId);
          log(`client ${ws.id} joined room ${roomId}, total ${room.size}`);
          room.forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(JSON.stringify({ type: 'participants', participants: [...room].map((p) => p.id) }));
            }
          });
          break;
        }

        case 'leave': {
          const room = roomService.leave(ws);
          if (room) {
            room.forEach((client) => {
              if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({ type: 'participant-left', id: ws.id }));
              }
            });
            log(`client ${ws.id} left room`);
          }
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          roomService.broadcast(ws, data);
          break;

        default:
          log('unknown message type', data.type);
      }
    } catch (error) {
      log('error parsing message', error);
    }
  });

  ws.on('close', () => {
    log(`client ${ws.id} disconnected`);
    const room = roomService.leave(ws);
    if (room) {
      room.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: 'participant-left', id: ws.id }));
        }
      });
    }
  });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`Signaling server is running on http://localhost:${port}`);
});
