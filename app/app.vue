<template>
  <div class="app-shell">
    <h1>Reactive Audio Connection (WebRTC + WebSocket)</h1>

    <section class="panel">
      <label>Signaling server URL</label>
      <input v-model="wsUrl" placeholder="ws://localhost:3001" />
      <label>Sala</label>
      <input v-model="roomId" placeholder="nome-da-sala" />
      <button :disabled="isConnected || !roomId" @click="joinRoom">Entrar na sala</button>
      <button :disabled="!isConnected" @click="leaveRoom">Sair</button>
      <p>
        Status: <strong>{{ status }}</strong> • Usuário: <code>{{ userId }}</code>
      </p>
      <p>
        Local: <span :class="{ active: localSpeaking }">{{ localSpeaking ? 'Falando' : 'Silencioso' }}</span>
        • Remoto: <span :class="{ active: remoteSpeaking }">{{ remoteSpeaking ? 'Ativo' : 'Inativo' }}</span>
      </p>
    </section>

    <section class="panel">
      <h2>Debug / Logs</h2>
      <div class="logs" ref="logsRoot">
        <div v-for="(line, index) in logs" :key="index">{{ line }}</div>
      </div>
    </section>

    <audio ref="localAudioEl" autoplay muted playsinline></audio>
    <audio ref="remoteAudioEl" autoplay playsinline></audio>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted, watch, nextTick } from 'vue';

const wsUrl = ref('ws://localhost:3001');
const roomId = ref('');
const userId = ref('');
const status = ref('disconnected');
const isConnected = ref(false);
const logs = reactive([]);
const localStream = ref(null);
const remoteStream = ref(null);
const localAudioEl = ref(null);
const remoteAudioEl = ref(null);
const localSpeaking = ref(false);
const remoteSpeaking = ref(false);

let ws = null;
let pc = null;
let reconnectAttempts = 0;
let shouldReconnect = false;
let isMakingOffer = false;
let receivedRemoteDescription = false;
let localAnalyzer = null;
let remoteAnalyzer = null;
let localMeter = null;
let remoteMeter = null;

function log(message, ...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.unshift(line);
  // limit to 200 lines
  if (logs.length > 200) logs.splice(200);
  console.log(line, ...args);
  nextTick(() => {
    const root = document.querySelector('.logs');
    if (root) root.scrollTop = 0;
  });
}

function addLocalStream(stream) {
  localStream.value = stream;
  if (localAudioEl.value) {
    localAudioEl.value.srcObject = stream;
  }
  updateAudioMeter(stream, (v) => (localSpeaking.value = v > 0.02), (instance) => (localAnalyzer = instance));
}

function attachRemoteStream(stream) {
  remoteStream.value = stream;
  if (remoteAudioEl.value) {
    remoteAudioEl.value.srcObject = stream;
  }
  updateAudioMeter(stream, (v) => (remoteSpeaking.value = v > 0.02), (instance) => (remoteAnalyzer = instance));
}

function updateAudioMeter(stream, onLevel, setAnalyzer) {
  try {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    setAnalyzer({ audioContext, analyser });

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((acc, v) => acc + v, 0);
      const avg = sum / data.length / 255;
      onLevel(avg);
    };

    const interval = setInterval(tick, 120);
    return () => {
      clearInterval(interval);
      audioContext.close();
    };
  } catch (error) {
    console.error('Audio meter failed', error);
  }
}

async function initLocalMedia() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    addLocalStream(stream);
    log('Microfone concedido e capturado.');
    return stream;
  } catch (error) {
    log('Falha ao acessar microfone: ' + (error.message || error));
    throw error;
  }
}

function createPeerConnection() {
  if (pc) return pc;

  log('Criando RTCPeerConnection');
  pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  });

  pc.oniceconnectionstatechange = () => {
    log('ICE connection state:', pc.iceConnectionState);
    if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
      status.value = 'reconnecting';
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      log('Enviando candidato ICE');
    }
  };

  pc.ontrack = (event) => {
    log('Recebeu stream remoto');
    attachRemoteStream(event.streams[0]);
  };

  if (localStream.value) {
    for (const track of localStream.value.getTracks()) {
      pc.addTrack(track, localStream.value);
    }
  }

  return pc;
}

async function makeOffer() {
  try {
    createPeerConnection();
    if (!pc) return;

    isMakingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: pc.localDescription });
    log('Offer enviado');
    isMakingOffer = false;
  } catch (error) {
    log('Erro ao criar offer: ' + error.message);
    isMakingOffer = false;
  }
}

async function handleOffer(message) {
  try {
    createPeerConnection();
    if (!pc) return;

    log('Offer recebido de', message.from);
    await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    receivedRemoteDescription = true;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: pc.localDescription });
    log('Answer enviado');
  } catch (error) {
    log('Erro ao processar offer: ' + error.message);
  }
}

async function handleAnswer(message) {
  try {
    if (!pc) {
      log('Answer recebido sem pc existente');
      return;
    }
    log('Answer recebido de', message.from);
    await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    receivedRemoteDescription = true;
  } catch (error) {
    log('Erro ao processar answer: ' + error.message);
  }
}

async function handleIceCandidate(message) {
  try {
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    log('Candidato ICE adicionado');
  } catch (error) {
    log('Erro add ICE candidate: ' + error.message);
  }
}

function sendSignal(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('WebSocket não conectado (não enviou):', data.type);
    return;
  }
  ws.send(JSON.stringify(data));
}

async function joinRoom() {
  try {
    if (!roomId.value) {
      log('Informe o nome da sala antes de entrar.');
      return;
    }

    status.value = 'connecting';
    await initLocalMedia();
    setupWebSocket();
  } catch (error) {
    status.value = 'error';
  }
}

function setupWebSocket() {
  if (ws) {
    ws.close();
  }

  log('Conectando ao servidor de sinalização:', wsUrl.value);
  ws = new WebSocket(wsUrl.value);

  ws.onopen = () => {
    status.value = 'connected';
    isConnected.value = true;
    reconnectAttempts = 0;
    shouldReconnect = true;
    log('WebSocket conectado');
    ws.send(JSON.stringify({ type: 'join', roomId: roomId.value }));
  };

  ws.onmessage = async (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      log('JSON inválido do servidor');
      return;
    }

    switch (data.type) {
      case 'connected':
        userId.value = data.id;
        log('Assigned user id', userId.value);
        break;
      case 'participants': {
        log('Participantes na sala:', data.participants.join(', '));
        const peers = data.participants.filter((id) => id !== userId.value);
        if (peers.length === 1 && userId.value && userId.value < peers[0] && !isMakingOffer) {
          await makeOffer();
        }
        break;
      }
      case 'offer':
        await handleOffer(data);
        break;
      case 'answer':
        await handleAnswer(data);
        break;
      case 'ice-candidate':
        await handleIceCandidate(data);
        break;
      case 'participant-left':
        log('Participante saiu:', data.id);
        cleanupPeerConnection();
        break;
      default:
        log('Mensagem desconhecida do servidor:', data.type);
    }
  };

  ws.onclose = () => {
    log('WebSocket fechado');
    isConnected.value = false;
    status.value = 'disconnected';
    if (shouldReconnect) {
      const timeout = Math.min(5000, 500 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      status.value = `reconnecting (tentativa ${reconnectAttempts})`;
      log(`Tentando reconectar em ${timeout}ms`);
      setTimeout(setupWebSocket, timeout);
    }
  };

  ws.onerror = (event) => {
    log('Erro no WebSocket', event);
  };
}

function cleanupPeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
  receivedRemoteDescription = false;
  localSpeaking.value = false;
  remoteSpeaking.value = false;
  if (localAnalyzer) {
    localAnalyzer.audioContext.close();
    localAnalyzer = null;
  }
  if (remoteAnalyzer) {
    remoteAnalyzer.audioContext.close();
    remoteAnalyzer = null;
  }
}

function leaveRoom() {
  shouldReconnect = false;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave', roomId: roomId.value }));
  }
  if (ws) {
    ws.close();
    ws = null;
  }

  if (localStream.value) {
    localStream.value.getTracks().forEach(track => track.stop());
    localStream.value = null;
  }

  if (remoteStream.value && remoteStream.value.getTracks) {
    remoteStream.value.getTracks().forEach(track => track.stop());
    remoteStream.value = null;
  }

  cleanupPeerConnection();
  status.value = 'disconnected';
  isConnected.value = false;
  log('Saiu da sala ' + roomId.value);
  roomId.value = '';
  userId.value = '';
}

onUnmounted(() => {
  shouldReconnect = false;
  if (ws) ws.close();
  cleanupPeerConnection();
  if (localStream.value) localStream.value.getTracks().forEach(track => track.stop());
  if (remoteStream.value) remoteStream.value.getTracks().forEach(track => track.stop());
});
</script>

<style scoped>
.app-shell {
  max-width: 900px;
  margin: 28px auto;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  color: #222;
}
.panel {
  border: 1px solid #ccc;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fefefe;
}
label {
  display: block;
  margin-top: 8px;
  font-weight: 600;
}
input {
  width: 100%;
  padding: 10px;
  margin-bottom: 6px;
  border: 1px solid #bbb;
  border-radius: 7px;
}
button {
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  margin-right: 8px;
  color: white;
  background: #0b6df1;
  cursor: pointer;
}
button:disabled {
  background: #888;
  cursor: not-allowed;
}
.logs {
  height: 240px;
  overflow-y: auto;
  background: #1b1b22;
  color: #d6d6d6;
  font-family: monospace;
  font-size: 12px;
  border-radius: 5px;
  padding: 10px;
}
.active {
  color: #0f8;
}
</style>
