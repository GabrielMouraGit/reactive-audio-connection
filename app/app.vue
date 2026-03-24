<template>
  <div class="app-shell">
    <h1>Reactive Audio Connection (WebRTC + WebSocket)</h1>

    <section class="panel">
      <label>Signaling server URL</label>
      <input v-model="wsUrl" placeholder="ws://localhost:3005" />

      <label>Sala</label>
      <input v-model="roomId" placeholder="nome-da-sala" />

      <div class="buttons">
        <button :disabled="isConnected || !roomId" @click="joinRoom">Entrar na sala</button>
        <button :disabled="!isConnected" @click="leaveRoom">Sair</button>
      </div>

      <p>Status: <strong>{{ status }}</strong> • Usuário: <code>{{ userId }}</code></p>
      <p>
        Local: <span :class="{ active: localSpeaking }">{{ localSpeaking ? 'Falando' : 'Silencioso' }}</span>
        • Remoto: <span :class="{ active: remoteSpeaking }">{{ remoteSpeaking ? 'Ativo' : 'Inativo' }}</span>
      </p>
    </section>

    <section class="panel">
      <h2>Debug / Logs</h2>
      <div class="logs">
        <div v-for="(line, index) in logs" :key="index">{{ line }}</div>
      </div>
    </section>

    <audio ref="localAudioEl" autoplay muted playsinline></audio>
    <audio ref="remoteAudioEl" autoplay playsinline></audio>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted, nextTick } from 'vue';
import { useSignaling } from '../composables/useSignaling';
import { useWebRTC } from '../composables/useWebRTC';
import { useAudioMeter } from '../composables/useAudioMeter';

const wsUrl = ref('ws://localhost:3005');
const roomId = ref('');
const status = ref('disconnected');
const userId = ref('');
const isConnected = ref(false);
const logs = reactive([]);
const localSpeaking = ref(false);
const remoteSpeaking = ref(false);
const localAudioEl = ref(null);
const remoteAudioEl = ref(null);

const signaling = useSignaling(wsUrl, roomId);
const webrtc = useWebRTC();
const audioMeter = useAudioMeter();

let localMeterCleaner = null;
let remoteMeterCleaner = null;

function addLog(message) {
  logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (logs.length > 200) logs.splice(200);
  nextTick(() => {
    const node = document.querySelector('.logs');
    if (node) node.scrollTop = 0;
  });
}

function syncPlayElements() {
  if (localAudioEl.value && webrtc.localStream.value) {
    localAudioEl.value.srcObject = webrtc.localStream.value;
  }

  if (remoteAudioEl.value && webrtc.remoteStream.value) {
    remoteAudioEl.value.srcObject = webrtc.remoteStream.value;
  }
}

async function startAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  webrtc.localStream.value = stream;
  syncPlayElements();

  localMeterCleaner = audioMeter.start(stream, (level) => {
    localSpeaking.value = level > 0.01;
  });

  return stream;
}

function setupCallbacks() {
  signaling.on('log', (message) => addLog(message));

  signaling.on('connected', ({ id }) => {
    userId.value = id;
    addLog(`Conectado ao signaller com id ${id}`);
  });

  signaling.on('participants', async (participants) => {
    addLog(`Participantes na sala: ${participants.join(', ')}`);
    if (participants.length > 1 && userId.value) {
      const otherId = participants.find((id) => id !== userId.value);
      if (otherId && userId.value < otherId) {
        addLog('Iniciando offer para participante', otherId);
        const pc = webrtc.createPeerConnection({
          onTrack: (stream) => {
            webrtc.remoteStream.value = stream;
            syncPlayElements();
            remoteMeterCleaner = audioMeter.start(stream, (lvl) => (remoteSpeaking.value = lvl > 0.01));
          },
          onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
          onStateChange: (state) => addLog(`ICE state ${state}`),
        });
        webrtc.attachStream(webrtc.localStream.value);
        const offer = await webrtc.makeOffer();
        signaling.send({ type: 'offer', sdp: offer });
      }
    }
  });

  signaling.on('offer', async (message) => {
    addLog('Offer recebido');
    webrtc.createPeerConnection({
      onTrack: (stream) => {
        webrtc.remoteStream.value = stream;
        syncPlayElements();
        remoteMeterCleaner = audioMeter.start(stream, (lvl) => (remoteSpeaking.value = lvl > 0.01));
      },
      onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
      onStateChange: (state) => addLog(`ICE state ${state}`),
    });

    await webrtc.setRemoteDescription(message.sdp);
    webrtc.attachStream(webrtc.localStream.value);
    const answer = await webrtc.makeAnswer();
    signaling.send({ type: 'answer', sdp: answer });
  });

  signaling.on('answer', async (message) => {
    addLog('Answer recebido');
    await webrtc.setRemoteDescription(message.sdp);
  });

  signaling.on('ice-candidate', async (message) => {
    addLog('Candidato ICE recebido');
    await webrtc.addIceCandidate(message.candidate);
  });

  signaling.on('participant-left', () => {
    addLog('Participante saiu');
    webrtc.disconnect();
    remoteSpeaking.value = false;
    remoteMeterCleaner?.();
    remoteMeterCleaner = null;
  });
}

async function joinRoom() {
  try {
    status.value = 'connecting';
    await startAudio();
    setupCallbacks();
    signaling.connect();
    isConnected.value = true;
    status.value = 'connected';
  } catch (error) {
    status.value = 'error';
    addLog('Falha ao entrar na sala: ' + (error.message || error));
  }
}

function leaveRoom() {
  signaling.disconnect();
  webrtc.disconnect();
  isConnected.value = false;
  status.value = 'disconnected';

  if (webrtc.localStream.value) {
    webrtc.localStream.value.getTracks().forEach((track) => track.stop());
  }
  if (webrtc.remoteStream.value) {
    webrtc.remoteStream.value.getTracks().forEach((track) => track.stop());
  }

  localMeterCleaner?.();
  remoteMeterCleaner?.();

  addLog('Desconectado.');
}

onUnmounted(() => {
  leaveRoom();
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
.buttons {
  margin-top: 12px;
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
