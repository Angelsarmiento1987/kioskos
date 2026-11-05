// Generated locally: no downloaded audio, media permission or extra service.
export function createOrderSound(Context = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context;
  const active = new Set();
  return {
    async unlock() {
      if (!Context) throw new Error("Este dispositivo no pudo habilitar el sonido. Los avisos visuales siguen activos.");
      if (!context || context.state === "closed") context = new Context();
      await context.resume();
      return context.state === "running";
    },
    play(volume = 0.55) {
      if (context?.state !== "running") return false;
      const level = Math.max(0, Math.min(1, Number(volume) || 0));
      [660, 880, 1100].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + index * 0.19;
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level * 0.22, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
        oscillator.connect(gain); gain.connect(context.destination);
        active.add(oscillator);
        oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + 0.34);
      });
      return true;
    },
    stop() {
      for (const oscillator of active) { try { oscillator.stop(); } catch {} }
      active.clear();
    },
    get ready() { return context?.state === "running"; },
    close() { this.stop(); context?.close().catch(() => {}); context = null; },
  };
}
