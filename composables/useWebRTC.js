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
      onTrack(remoteStream.value);
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
    disconnect,
  };
}
