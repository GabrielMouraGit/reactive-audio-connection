<template>
  <div class="audio-app">
    <h1>🎙️ Áudio + Chat</h1>

    <section class="panel control-panel">
      <div class="form-group">
        <label>URL do Servidor de Sinalização</label>
        <input v-model="wsUrl" placeholder="ws://localhost:3005" />
      </div>

      <div class="form-group">
        <label>Nome da Sala</label>
        <input v-model="roomId" placeholder="nome-da-sala" />
      </div>

      <div class="buttons">
        <button :disabled="isConnected || !roomId" @click="joinRoom" class="btn btn-primary">
          Entrar na Sala
        </button>
        <button :disabled="!isConnected" @click="leaveRoom" class="btn btn-danger">
          Sair
        </button>
        <button v-if="isConnected" @click="toggleAudio" :class="['btn', localAudioEnabled ? 'btn-warning' : 'btn-success']">
          {{ localAudioEnabled ? 'Desativar Áudio' : 'Ativar Áudio' }}
        </button>
      </div>

      <p class="status">
        <strong>Status:</strong> {{ status }}
      </p>
      <p class="user-id">
        <strong>Seu ID:</strong> <code>{{ userId }}</code>
      </p>
      <p class="indicators">
        <span class="indicator" :class="{ active: localSpeaking }">
          🎤 {{ localSpeaking ? 'Você está falando' : 'Silencioso' }}
        </span>
        <span class="indicator" :class="{ active: remoteSpeaking }">
          👥 {{ remoteSpeaking ? 'Outro está falando' : 'Inativo' }}
        </span>
      </p>
    </section>

    <section class="audio-section">
      <div class="audio-visualization">
        <div class="meter-box">
          <h3>Seu Áudio</h3>
          <div class="meter-container">
            <div class="meter" :style="{ width: localMeterLevel + '%' }"></div>
          </div>
        </div>

        <div class="meter-box">
          <h3>Áudio Remoto</h3>
          <div class="meter-container">
            <div class="meter remote" :style="{ width: remoteMeterLevel + '%' }"></div>
          </div>
        </div>
      </div>

      <audio ref="localAudioEl" autoplay muted playsinline></audio>
      <audio ref="remoteAudioEl" autoplay playsinline></audio>
    </section>

    <section class="panel logs-panel">
      <h3>Logs do Sistema</h3>
      <div class="logs">
        <div v-for="(line, index) in logs" :key="index" class="log-line">
          {{ line }}
        </div>
      </div>
    </section>

    <div class="home-link">
      <NuxtLink to="/">← Voltar</NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted, nextTick } from 'vue';
import { useSignaling } from '../../composables/useSignaling';
import { useWebRTC } from '../../composables/useWebRTC';
import { useAudioMeter } from '../../composables/useAudioMeter';

const wsUrl = ref('ws://localhost:3005');
const roomId = ref('');
const status = ref('desconectado');
const userId = ref('');
const isConnected = ref(false);
const logs = reactive([]);
const localSpeaking = ref(false);
const remoteSpeaking = ref(false);
const localAudioEnabled = ref(true);
const localMeterLevel = ref(0);
const remoteMeterLevel = ref(0);

const localAudioEl = ref(null);
const remoteAudioEl = ref(null);

const signaling = useSignaling(wsUrl, roomId);
const webrtc = useWebRTC();
const audioMeter = useAudioMeter();

let localMeterCleaner = null;
let remoteMeterCleaner = null;

function addLog(message) {
  logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (logs.length > 100) logs.splice(100);
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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    webrtc.localStream.value = stream;
    localAudioEnabled.value = true;
    syncPlayElements();

    localMeterCleaner = audioMeter.start(stream, (level) => {
      localSpeaking.value = level > 0.01;
      localMeterLevel.value = Math.round(level * 100);
    });

    addLog('Áudio capturado com sucesso');
    return stream;
  } catch (error) {
    addLog('Erro ao capturar áudio: ' + error.message);
    throw error;
  }
}

function toggleAudio() {
  if (!webrtc.localStream.value) return;

  webrtc.localStream.value.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  localAudioEnabled.value = !localAudioEnabled.value;
  addLog(localAudioEnabled.value ? 'Áudio ativado' : 'Áudio desativado');
}

function setupCallbacks() {
  signaling.on('log', (message) => addLog(message));

  signaling.on('connected', ({ id }) => {
    userId.value = id;
    addLog(`Conectado com ID: ${id}`);
  });

  signaling.on('participants', async (participants) => {
    addLog(`Participantes na sala: ${participants.join(', ')}`);
    if (participants.length > 1 && userId.value) {
      const otherId = participants.find((id) => id !== userId.value);
      if (otherId && userId.value < otherId) {
        addLog('Iniciando oferta para o outro participante');
        const pc = webrtc.createPeerConnection({
          onTrack: (event) => {
            const stream = event.streams[0];
            webrtc.remoteStream.value = stream;
            syncPlayElements();
            remoteMeterCleaner = audioMeter.start(stream, (lvl) => {
              remoteSpeaking.value = lvl > 0.01;
              remoteMeterLevel.value = Math.round(lvl * 100);
            });
            addLog('Stream remoto recebido');
          },
          onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
          onStateChange: (state) => addLog(`Estado ICE: ${state}`),
        });

        webrtc.attachStream(webrtc.localStream.value);
        const offer = await webrtc.makeOffer();
        signaling.send({ type: 'offer', sdp: offer });
      }
    }
  });

  signaling.on('offer', async (message) => {
    addLog('Oferta recebida');
    webrtc.createPeerConnection({
      onTrack: (event) => {
        const stream = event.streams[0];
        webrtc.remoteStream.value = stream;
        syncPlayElements();
        remoteMeterCleaner = audioMeter.start(stream, (lvl) => {
          remoteSpeaking.value = lvl > 0.01;
          remoteMeterLevel.value = Math.round(lvl * 100);
        });
        addLog('Stream remoto recebido');
      },
      onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
      onStateChange: (state) => addLog(`Estado ICE: ${state}`),
    });

    await webrtc.setRemoteDescription(message.sdp);
    webrtc.attachStream(webrtc.localStream.value);
    const answer = await webrtc.makeAnswer();
    signaling.send({ type: 'answer', sdp: answer });
  });

  signaling.on('answer', async (message) => {
    addLog('Resposta recebida');
    await webrtc.setRemoteDescription(message.sdp);
  });

  signaling.on('ice-candidate', async (message) => {
    await webrtc.addIceCandidate(message.candidate);
  });

  signaling.on('participant-left', () => {
    addLog('Participante desconectou');
    webrtc.disconnect();
    remoteSpeaking.value = false;
    remoteMeterLevel.value = 0;
    remoteMeterCleaner?.();
    remoteMeterCleaner = null;
  });
}

async function joinRoom() {
  try {
    status.value = 'conectando...';
    await startAudio();
    setupCallbacks();
    signaling.connect();
    isConnected.value = true;
    status.value = 'conectado';
    addLog('Entrou na sala com sucesso');
  } catch (error) {
    status.value = 'erro';
    addLog('Erro ao entrar: ' + (error.message || error));
  }
}

function leaveRoom() {
  signaling.disconnect();
  webrtc.disconnect();
  isConnected.value = false;
  status.value = 'desconectado';
  localAudioEnabled.value = true;
  localMeterLevel.value = 0;
  remoteMeterLevel.value = 0;

  if (webrtc.localStream.value) {
    webrtc.localStream.value.getTracks().forEach((track) => track.stop());
  }
  if (webrtc.remoteStream.value) {
    webrtc.remoteStream.value.getTracks().forEach((track) => track.stop());
  }

  localMeterCleaner?.();
  remoteMeterCleaner?.();
  localMeterCleaner = null;
  remoteMeterCleaner = null;

  addLog('Desconectado da sala');
}

onUnmounted(() => {
  leaveRoom();
});
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.audio-app {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

h1 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
}

h3 {
  margin: 0 0 10px 0;
  color: #555;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.control-panel {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.control-panel label {
  color: white;
  font-weight: 600;
  margin-top: 15px;
  display: block;
}

.control-panel input {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  margin-top: 5px;
  transition: all 0.3s;
}

.control-panel input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.control-panel input:focus {
  outline: none;
  border-color: white;
  background: rgba(255, 255, 255, 0.2);
}

.form-group {
  margin-bottom: 15px;
}

.buttons {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.btn {
  flex: 1;
  min-width: 150px;
  padding: 12px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: white;
  color: #667eea;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.btn-danger {
  background: #ff6b6b;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff5252;
  transform: translateY(-2px);
}

.btn-warning {
  background: #ffa94d;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #ff922b;
}

.btn-success {
  background: #51cf66;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #40c057;
}

.status,
.user-id,
.indicators {
  margin: 10px 0;
  font-size: 14px;
}

.user-id code {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}

.indicators {
  display: flex;
  gap: 20px;
}

.indicator {
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 13px;
  transition: all 0.3s;
}

.indicator.active {
  background: rgba(255, 255, 255, 0.8);
  color: #667eea;
  font-weight: 600;
}

.audio-section {
  margin-bottom: 20px;
}

.audio-visualization {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.meter-box {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.meter-container {
  width: 100%;
  height: 40px;
  background: #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}

.meter {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.1s ease;
  border-radius: 6px;
  box-shadow: 0 0 10px rgba(102, 126, 234, 0.4);
}

.meter.remote {
  background: linear-gradient(90deg, #51cf66 0%, #40c057 100%);
  box-shadow: 0 0 10px rgba(81, 207, 102, 0.4);
}

.logs-panel {
  background: white;
}

.logs-panel h3 {
  margin-top: 0;
  color: #333;
}

.logs {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.log-line {
  padding: 4px 0;
  color: #495057;
  border-bottom: 1px solid #e9ecef;
}

.log-line:last-child {
  border-bottom: none;
}

.home-link {
  text-align: center;
  margin-top: 20px;
}

.home-link a {
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s;
}

.home-link a:hover {
  color: #764ba2;
}

/* Responsivo */
@media (max-width: 768px) {
  .audio-visualization {
    grid-template-columns: 1fr;
  }

  .buttons {
    flex-direction: column;
  }

  .btn {
    min-width: unset;
  }

  .indicators {
    flex-direction: column;
  }
}
</style>
