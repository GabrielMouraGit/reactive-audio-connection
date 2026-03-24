export function useAudioMeter() {
  let analyser = null;
  let intervalId = null;

  function start(stream, onLevel) {
    if (!stream || !onLevel) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    intervalId = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((acc, value) => acc + value, 0);
      const avg = sum / data.length / 255;
      onLevel(avg);
    }, 120);

    return () => stop(audioContext);
  }

  function stop(audioContext) {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (analyser && audioContext) {
      analyser.disconnect();
      audioContext.close();
      analyser = null;
    }
  }

  return { start, stop };
}
