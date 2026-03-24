import { ref } from 'vue';
import { createObserver } from './observer';

export function useSignaling(wsUrl, roomId) {
  const status = ref('disconnected');
  const ready = ref(false);
  const userId = ref('');
  const observer = createObserver();

  let ws = null;
  let reconnectAttempts = 0;
  let shouldReconnect = false;

  function log(...args) {
    observer.notify('log', args.join(' '));
  }

  function send(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      log('WebSocket não pronto para enviar', message);
      return;
    }
    ws.send(JSON.stringify(message));
  }

  function connect() {
    if (!roomId.value) {
      throw new Error('Informe roomId');
    }

    status.value = 'connecting';
    ws = new WebSocket(wsUrl.value);

    ws.onopen = () => {
      status.value = 'connected';
      ready.value = true;
      reconnectAttempts = 0;
      shouldReconnect = true;
      log('WS aberto');
      send({ type: 'join', roomId: roomId.value });
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        log('Mensagem WS inválida', event.data);
        return;
      }
      switch (data.type) {
        case 'connected':
          userId.value = data.id;
          log('ID do usuário', data.id);
          observer.notify('connected', { id: data.id });
          break;
        case 'participants':
          observer.notify('participants', data.participants);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          observer.notify(data.type, data);
          break;
        case 'participant-left':
          observer.notify('participant-left', { id: data.id });
          break;
        default:
          log('Tipo WS desconhecido', data.type);
      }
    };

    ws.onclose = () => {
      log('WS fechado');
      ready.value = false;
      status.value = 'disconnected';
      if (shouldReconnect) {
        const delay = Math.min(5000, 500 * 2 ** reconnectAttempts);
        reconnectAttempts += 1;
        status.value = `reconnecting (${reconnectAttempts})`;
        setTimeout(connect, delay);
      }
    };

    ws.onerror = (e) => {
      log('Erro WS', e.message || e);
    };
  }

  function disconnect() {
    shouldReconnect = false;
    if (ws) {
      send({ type: 'leave' });
      ws.close();
      ws = null;
    }
    ready.value = false;
    status.value = 'disconnected';
  }

  return {
    status,
    ready,
    userId,
    connect,
    disconnect,
    send,
    on: observer.register,
  };
}
