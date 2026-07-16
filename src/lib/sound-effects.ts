// Simple Web Audio chime for task completion (double-click)
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  return _ctx;
}

export function playCompletionSound() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    // Pleasant ascending arpeggio: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  } catch {
    /* ignore */
  }
}
