let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.08) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audio.destination);
  const now = audio.currentTime;
  osc.start(now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000);
}

export function playSuccess() {
  tone(880, 90);
  setTimeout(() => tone(1175, 120), 90);
}

export function playWarning() {
  tone(420, 160, 'square', 0.06);
  setTimeout(() => tone(360, 180, 'square', 0.06), 140);
}

export function playError() {
  tone(220, 220, 'sawtooth', 0.05);
}
