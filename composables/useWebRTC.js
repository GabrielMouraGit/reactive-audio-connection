import { ref } from 'vue';

export function useWebRTC() {
  const pc = ref(null);
  const remoteStream = ref(null);
  const localStream = ref(null);
  const speaking = ref(false);

  let localSources = [];

  function createPeerConnection({ onTrack, onIceCandidate, onStateChange }) {
    if (pc.value) return pc.value;

    pc.value = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    });

    pc.value.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    pc.value.ontrack = (event) => {
      remoteStream.value = event.streams[0];
      onTrack(event);
    };

    pc.value.oniceconnectionstatechange = () => {
      onStateChange(pc.value.iceConnectionState);
    };

    return pc.value;
  }

  function attachStream(stream) {
    localStream.value = stream;
    localSources = stream.getTracks().map((track) => pc.value?.addTrack(track, stream));
  }

  async function makeOffer() {
    if (!pc.value) return;
    const offer = await pc.value.createOffer();
    await pc.value.setLocalDescription(offer);
    return offer;
  }

  async function makeAnswer() {
    if (!pc.value) return;
    const answer = await pc.value.createAnswer();
    await pc.value.setLocalDescription(answer);
    return answer;
  }

  async function setRemoteDescription(description) {
    if (!pc.value) return;
    await pc.value.setRemoteDescription(new RTCSessionDescription(description));
  }

  async function addIceCandidate(candidate) {
    if (!pc.value) return;
    await pc.value.addIceCandidate(new RTCIceCandidate(candidate));
  }

  function addTrackToPeer(track, stream) {
    if (!pc.value) return null;
    if (!track || track.readyState === 'ended') return null;

    // Verificar se este track exato já foi adicionado
    const senders = pc.value.getSenders();
    const existingSender = senders.find((sender) => sender.track === track);
    if (existingSender) {
      return existingSender;
    }

    // Determinar se o vídeo é tela (displaySurface, label ou resolução típica)
    let isScreen = false;
    if (track.kind === 'video') {
      const label = (track.label || '').toLowerCase();
      if (label.includes('screen') || label.includes('tela') || label.includes('desktop') || label.includes('monitor') || label.includes('display')) {
        isScreen = true;
      }
      if (!isScreen && track.getSettings) {
        try {
          const settings = track.getSettings();
          if (settings.displaySurface) {
            const ds = settings.displaySurface.toLowerCase();
            if (['monitor', 'window', 'application', 'browser'].includes(ds)) {
              isScreen = true;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (track.kind === 'video') {
      // Permitir ambos webcam + screen como streams separados
      // Se a track for webcam, evitar duplicação da mesmo tipo (não substituindo a webcam existente)
      if (!isScreen) {
        const cameraSender = senders.find((s) => s.track?.kind === 'video' && !((s.track.label || '').toLowerCase().includes('screen') || (s.track.getSettings && (s.track.getSettings().displaySurface || '').toLowerCase())));
        if (cameraSender) {
          return cameraSender;
        }
      }
    }

    try {
      return pc.value.addTrack(track, stream);
    } catch (e) {
      console.error('Erro ao adicionar track:', e);
      return null;
    }
  }

  function removeTrackFromPeer(track) {
    if (!pc.value) return;
    
    const senders = pc.value.getSenders();
    const sender = senders.find((s) => s.track === track);
    
    if (sender) {
      try {
        pc.value.removeTrack(sender);
      } catch (e) {
        console.error('Erro ao remover track:', e);
      }
    }
  }

  async function renegotiate() {
    if (!pc.value) return;
    const offer = await pc.value.createOffer({ iceRestart: false });
    await pc.value.setLocalDescription(offer);
    return offer;
  }

  function disconnect() {
    pc.value?.close();
    pc.value = null;
    remoteStream.value = null;
    localSources = [];
  }

  return {
    pc,
    localStream,
    remoteStream,
    speaking,
    createPeerConnection,
    attachStream,
    makeOffer,
    makeAnswer,
    setRemoteDescription,
    addIceCandidate,
    addTrackToPeer,
    removeTrackFromPeer,
    renegotiate,
    disconnect,
  };
}
