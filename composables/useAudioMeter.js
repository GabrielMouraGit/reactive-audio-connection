export function useAudioMeter() {
  let analyser = null;
  let intervalId = null;
  let isActive = false;

  function start(stream, onLevel) {
    if (!stream || !onLevel) return;

    // Stop any previous instance
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      isActive = false;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    isActive = true;
    const data = new Uint8Array(analyser.frequencyBinCount);
    intervalId = setInterval(() => {
      // Check if still active before accessing analyser
      if (!isActive || !analyser) {
        clearInterval(intervalId);
        intervalId = null;
        return;
      }
      try {
        analyser.getByteFrequencyData(data);
        const sum = data.reduce((acc, value) => acc + value, 0);
        const avg = sum / data.length / 255;
        onLevel(avg);
      } catch (e) {
        // Silently handle errors when context is closed
        clearInterval(intervalId);
        intervalId = null;
      }
    }, 120);

    return () => stop(audioContext);
  }

  function stop(audioContext) {
    isActive = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (analyser && audioContext) {
      try {
        analyser.disconnect();
        audioContext.close();
      } catch (e) {
        // Ignore errors if already closed
      }
      analyser = null;
    }
  }

  return { start, stop };
}
