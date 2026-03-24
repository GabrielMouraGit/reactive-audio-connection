import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

function log(...args) {
  console.log('[SIGNALING]', ...args);
}

app.get('/', (req, res) => {
  res.send('Reactive Audio Connection signaling server is running.');
});

wss.on('connection', (ws) => {
  log('new websocket connection');
  ws.id = `${Math.random().toString(36).slice(2)}-${Date.now()}`;
  ws.roomId = null;

  ws.send(JSON.stringify({ type: 'connected', id: ws.id }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (!data || !data.type) {
        return;
      }

      switch (data.type) {
        case 'join': {
          const roomId = data.roomId?.toString() || 'default';
          ws.roomId = roomId;

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }
          const room = rooms.get(roomId);
          room.add(ws);

          log(`client ${ws.id} joined room ${roomId}, total ${room.size}`);

          const peerIds = [...room].filter((peer) => peer !== ws).map((peer) => peer.id);
          room.forEach((peer) => {
            peer.send(JSON.stringify({ type: 'participants', participants: [...room].map((p) => p.id) }));
          });
          break;
        }

        case 'leave': {
          if (ws.roomId && rooms.has(ws.roomId)) {
            const room = rooms.get(ws.roomId);
            room.delete(ws);
            room.forEach((peer) => {
              peer.send(JSON.stringify({ type: 'participant-left', id: ws.id }));
            });
            if (room.size === 0) {
              rooms.delete(ws.roomId);
            }
            log(`client ${ws.id} left room ${ws.roomId}`);
            ws.roomId = null;
          }
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          if (!ws.roomId || !rooms.has(ws.roomId)) return;
          const room = rooms.get(ws.roomId);
          const payload = { ...data, from: ws.id };
          room.forEach((peer) => {
            if (peer !== ws) {
              peer.send(JSON.stringify(payload));
            }
          });
          break;
        }

        default:
          log('unknown message type', data.type);
      }
    } catch (error) {
      log('error parsing message', error);
    }
  });

  ws.on('close', () => {
    log(`client ${ws.id} disconnected`);
    if (ws.roomId && rooms.has(ws.roomId)) {
      const room = rooms.get(ws.roomId);
      room.delete(ws);
      room.forEach((peer) => {
        peer.send(JSON.stringify({ type: 'participant-left', id: ws.id }));
      });
      if (room.size === 0) {
        rooms.delete(ws.roomId);
      }
    }
  });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`Signaling server is running on http://localhost:${port}`);
});
