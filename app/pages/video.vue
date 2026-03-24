<template>
  <div class="video-app">
    <h1>Vídeo + Áudio WebRTC</h1>

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

    <section class="video-section">
      <div class="media-controls">
        <button v-if="isConnected" @click="toggleScreenShare" :class="['btn', screenShareEnabled ? 'btn-warning' : 'btn-success']">
          {{ screenShareEnabled ? '🛑 Parar Compartilhamento' : '🖥️ Compartilhar Tela' }}
        </button>
        <button v-if="isConnected" @click="toggleWebcam" :class="['btn', webcamEnabled ? 'btn-warning' : 'btn-success']">
          {{ webcamEnabled ? '🛑 Parar Webcam' : '📹 Ativar Webcam' }}
        </button>
      </div>

      <div class="video-container">
        <div class="video-box">
          <h3>Sua Tela</h3>
          <video
            ref="screenVideoEl"
            autoplay
            muted
            playsinline
            class="video"
            :style="{ display: screenShareEnabled ? 'block' : 'none' }"
          ></video>
          <div v-if="!screenShareEnabled" class="no-video">Clique em "Compartilhar Tela"</div>
        </div>

        <div class="video-box">
          <h3>Sua Webcam</h3>
          <video
            ref="webcamVideoEl"
            autoplay
            muted
            playsinline
            class="video"
            :style="{ display: webcamEnabled ? 'block' : 'none' }"
          ></video>
          <div v-if="!webcamEnabled" class="no-video">Clique em "Ativar Webcam"</div>
        </div>
      </div>

      <div class="remote-video-container">
        <div class="remote-video-box">
          <h3>Tela Remota</h3>
          <video
            ref="remoteScreenEl"
            autoplay
            playsinline
            class="video remote"
            :style="{ display: remoteScreenEnabled ? 'block' : 'none' }"
          ></video>
          <div v-if="!remoteScreenEnabled" class="no-video">Aguardando tela remota...</div>
        </div>

        <div class="remote-video-box">
          <h3>Webcam Remota</h3>
          <video
            ref="remoteWebcamEl"
            autoplay
            playsinline
            class="video remote"
            :style="{ display: remoteWebcamEnabled ? 'block' : 'none' }"
          ></video>
          <div v-if="!remoteWebcamEnabled" class="no-video">Aguardando webcam remota...</div>
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
const screenShareEnabled = ref(false);
const webcamEnabled = ref(false);
const remoteScreenEnabled = ref(false);
const remoteWebcamEnabled = ref(false);
const localAudioEnabled = ref(true);

const screenVideoEl = ref(null);
const webcamVideoEl = ref(null);
const remoteScreenEl = ref(null);
const remoteWebcamEl = ref(null);
const localAudioEl = ref(null);
const remoteAudioEl = ref(null);

const screenStream = ref(null);
const webcamStream = ref(null);
const remoteScreenStream = ref(null);
const remoteWebcamStream = ref(null);

let callbacksSetup = false;
let localMeterCleaner = null;
let remoteMeterCleaner = null;

const signaling = useSignaling(wsUrl, roomId);
const webrtc = useWebRTC();
const audioMeter = useAudioMeter();

function addLog(message) {
  logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (logs.length > 100) logs.splice(100);
  nextTick(() => {
    const node = document.querySelector('.logs');
    if (node) node.scrollTop = 0;
  });
}

function syncMediaElements() {
  if (screenVideoEl.value && screenStream.value) {
    screenVideoEl.value.srcObject = screenStream.value;
  }

  if (webcamVideoEl.value && webcamStream.value) {
    webcamVideoEl.value.srcObject = webcamStream.value;
  }

  if (localAudioEl.value && webcamStream.value) {
    localAudioEl.value.srcObject = webcamStream.value;
  }

  if (remoteScreenEl.value && remoteScreenStream.value) {
    remoteScreenEl.value.srcObject = remoteScreenStream.value;
  }

  if (remoteWebcamEl.value && remoteWebcamStream.value) {
    remoteWebcamEl.value.srcObject = remoteWebcamStream.value;
  }

  if (remoteAudioEl.value && remoteWebcamStream.value) {
    remoteAudioEl.value.srcObject = remoteWebcamStream.value;
  }
}

function isScreenTrack(track) {
  const label = (track.label || '').toLowerCase();
  if (label.includes('screen') || label.includes('tela') || label.includes('desktop') || label.includes('monitor') || label.includes('display')) {
    return true;
  }

  if (track.getSettings) {
    try {
      const settings = track.getSettings();
      if (settings.displaySurface && ['monitor', 'window', 'application', 'browser'].includes((settings.displaySurface || '').toLowerCase())) {
        return true;
      }
    } catch (e) {
      // ignore
    }
  }

  return false;
}

function handleRemoteTrack(event) {
  const track = event.track;
  addLog(`Track remoto recebido: tipo=${track.kind}, label=${track.label || 'vazio'}`);

  if (track.kind === 'video') {
    const stream = new MediaStream([track]);
    if (isScreenTrack(track)) {
      remoteScreenStream.value = stream;
      remoteScreenEnabled.value = true;
      addLog('Vídeo remoto classificado como Tela');
    } else {
      remoteWebcamStream.value = stream;
      remoteWebcamEnabled.value = true;
      addLog('Vídeo remoto classificado como Webcam');
    }
  }

  if (track.kind === 'audio') {
    const stream = new MediaStream([track]);
    remoteAudioEl.value && (remoteAudioEl.value.srcObject = stream);
  }

  syncMediaElements();
}

async function startMedia() {
  try {
    await captureWebcam();
    addLog('Você também pode compartilhador sua tela clicando em "Compartilhar Tela"');
  } catch (error) {
    addLog('Erro ao ativar webcam: ' + error.message);
  }
}

function toggleAudio() {
  if (!webcamStream.value) return;

  webcamStream.value.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  localAudioEnabled.value = !localAudioEnabled.value;
  addLog(localAudioEnabled.value ? 'Áudio ativado' : 'Áudio desativado');
}

async function captureScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
      },
      audio: false,
    });

    screenStream.value = stream;
    screenShareEnabled.value = true;
    syncMediaElements();
    addLog('Captura de tela iniciada');

    // Adicionar tracks ao peer connection se existir
    if (webrtc.pc.value && isConnected.value) {
      stream.getTracks().forEach((track) => {
        try {
          webrtc.addTrackToPeer(track, stream);
          addLog('Track de tela adicionado à conexão');
        } catch (e) {
          addLog('Erro ao adicionar track de tela: ' + e.message);
        }
      });
      // Renegociar
      const offer = await webrtc.renegotiate();
      signaling.send({ type: 'offer', sdp: offer });
    } else {
      addLog('Tela capturada, mas não conectado. Ative ao conectar.');
    }

    // Detectar quando o usuário parar de compartilhar
    stream.getTracks()[0].onended = () => {
      screenStream.value = null;
      screenShareEnabled.value = false;
      addLog('Compartilhamento de tela parado');
      
      // Se houver conexão, renegociar após remover os tracks
      if (webrtc.pc.value) {
        stream.getTracks().forEach((track) => {
          webrtc.removeTrackFromPeer(track);
        });
        webrtc.renegotiate().then((offer) => {
          signaling.send({ type: 'offer', sdp: offer });
        });
      }
    };

    return stream;
  } catch (error) {
    if (error.name !== 'NotAllowedError') {
      addLog('Erro ao compartilhar tela: ' + error.message);
    }
  }
}

async function captureWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    webcamStream.value = stream;
    webcamEnabled.value = true;
    syncMediaElements();

    localMeterCleaner = audioMeter.start(stream, (level) => {
      localSpeaking.value = level > 0.01;
    });

    localAudioEnabled.value = true;
    addLog('Webcam capturada com sucesso');
    return stream;
  } catch (error) {
    addLog('Erro ao capturar webcam: ' + error.message);
  }
}

function toggleScreenShare() {
  if (screenShareEnabled.value) {
    // Parar compartilhamento
    if (screenStream.value) {
      screenStream.value.getTracks().forEach((track) => {
        webrtc.removeTrackFromPeer(track);
        track.stop();
      });
      screenStream.value = null;
      screenShareEnabled.value = false;
      addLog('Compartilhamento de tela desativado');
      
      // Renegociar se houver conexão
      if (webrtc.pc.value) {
        webrtc.renegotiate().then((offer) => {
          signaling.send({ type: 'offer', sdp: offer });
        });
      }
    }
  } else {
    // Iniciar compartilhamento
    captureScreenShare();
  }
}

function toggleWebcam() {
  if (webcamEnabled.value) {
    // Parar webcam
    webcamStream.value?.getTracks().forEach((track) => track.stop());
    webcamStream.value = null;
    webcamEnabled.value = false;
    addLog('Webcam desativada');
  } else {
    // Iniciar webcam
    captureWebcam();
  }
}

function setupCallbacks() {
  if (callbacksSetup) {
    addLog('Callbacks já foram configurados');
    return;
  }
  
  callbacksSetup = true;
  addLog('Configurando callbacks...');
  
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
            handleRemoteTrack(event);

            if (event.track.kind === 'audio') {
              remoteMeterCleaner?.();
              remoteMeterCleaner = audioMeter.start(new MediaStream([event.track]), (lvl) => {
                remoteSpeaking.value = lvl > 0.01;
              });
            }
          },
          onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
          onStateChange: (state) => addLog(`Estado ICE: ${state}`),
        });

        // Adicionar tracks de tela
        if (screenStream.value) {
          screenStream.value.getTracks().forEach((track) => {
            try {
              webrtc.addTrackToPeer(track, screenStream.value);
            } catch (e) {
              addLog('Erro ao adicionar track de tela: ' + e.message);
            }
          });
        }

        // Adicionar tracks de webcam
        if (webcamStream.value) {
          webcamStream.value.getTracks().forEach((track) => {
            try {
              webrtc.addTrackToPeer(track, webcamStream.value);
            } catch (e) {
              addLog('Erro ao adicionar track de webcam: ' + e.message);
            }
          });
        }

        const offer = await webrtc.makeOffer();
        signaling.send({ type: 'offer', sdp: offer });
      }
    }
  });

  signaling.on('offer', async (message) => {
    addLog('Oferta recebida');
    const pc = webrtc.createPeerConnection({
      onTrack: (event) => {
        handleRemoteTrack(event);

        if (event.track.kind === 'audio') {
          remoteMeterCleaner?.();
          remoteMeterCleaner = audioMeter.start(new MediaStream([event.track]), (lvl) => {
            remoteSpeaking.value = lvl > 0.01;
          });
        }
      },
      onIceCandidate: (candidate) => signaling.send({ type: 'ice-candidate', candidate }),
      onStateChange: (state) => addLog(`Estado ICE: ${state}`),
    });

    // Adicionar tracks ANTES de setRemoteDescription
    if (screenStream.value) {
      screenStream.value.getTracks().forEach((track) => {
        try {
          webrtc.addTrackToPeer(track, screenStream.value);
        } catch (e) {
          addLog('Erro ao adicionar track de tela: ' + e.message);
        }
      });
    }

    if (webcamStream.value) {
      webcamStream.value.getTracks().forEach((track) => {
        try {
          webrtc.addTrackToPeer(track, webcamStream.value);
        } catch (e) {
          addLog('Erro ao adicionar track de webcam: ' + e.message);
        }
      });
    }

    // Agora processar a oferta
    await webrtc.setRemoteDescription(message.sdp);

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
    remoteScreenEnabled.value = false;
    remoteWebcamEnabled.value = false;
    remoteMeterCleaner?.();
    remoteMeterCleaner = null;
  });
}

async function joinRoom() {
  try {
    status.value = 'conectando...';
    await startMedia();
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
  callbacksSetup = false;
  signaling.disconnect();
  webrtc.disconnect();
  isConnected.value = false;
  status.value = 'desconectado';
  screenShareEnabled.value = false;
  webcamEnabled.value = false;
  remoteScreenEnabled.value = false;
  remoteWebcamEnabled.value = false;

  if (screenStream.value) {
    screenStream.value.getTracks().forEach((track) => track.stop());
    screenStream.value = null;
  }
  
  if (webcamStream.value) {
    webcamStream.value.getTracks().forEach((track) => track.stop());
    webcamStream.value = null;
  }

  if (remoteScreenStream.value) {
    remoteScreenStream.value.getTracks().forEach((track) => track.stop());
  }
  
  if (remoteWebcamStream.value) {
    remoteWebcamStream.value.getTracks().forEach((track) => track.stop());
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

.video-app {
  max-width: 1200px;
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

.video-section {
  margin-bottom: 20px;
}

.media-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.media-controls .btn {
  flex: 1;
  min-width: 150px;
  padding: 10px 15px;
  font-size: 13px;
}

.video-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.remote-video-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
  border-top: 2px solid #e9ecef;
  padding-top: 20px;
}

.video-box {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.remote-video-box {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #51cf66;
}

.video-box h3,
.remote-video-box h3 {
  background: #f8f9fa;
  padding: 12px 15px;
  margin: 0;
}

.remote-video-box h3 {
  background: #e7f5e7;
  color: #2b8a3e;
}

.video {
  width: 100%;
  height: 360px;
  object-fit: cover;
  display: block;
  background: #000;
}

.video.remote {
  border: 2px solid #51cf66;
}

.no-video {
  width: 100%;
  height: 360px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
  font-weight: 500;
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

/* Responsivo */
@media (max-width: 768px) {
  .video-container {
    grid-template-columns: 1fr;
  }

  .remote-video-container {
    grid-template-columns: 1fr;
  }

  .buttons {
    flex-direction: column;
  }

  .media-controls {
    flex-direction: column;
  }

  .btn {
    min-width: unset;
  }

  .indicators {
    flex-direction: column;
  }

  .video {
    height: 300px;
  }

  .no-video {
    height: 300px;
  }
}
</style>
