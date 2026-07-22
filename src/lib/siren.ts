// Ambulance-like two-tone siren using Web Audio API.
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  return _ctx;
}

export function playAmbulanceSiren(durationSec = 4) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    const start = ctx.currentTime;
    // Alternate 650Hz / 950Hz every 0.5s
    const step = 0.5;
    for (let t = 0; t < durationSec; t += step) {
      o.frequency.setValueAtTime(t % 1 === 0 ? 650 : 950, start + t);
    }
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.25, start + 0.05);
    g.gain.setValueAtTime(0.25, start + durationSec - 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
    o.connect(g).connect(ctx.destination);
    o.start(start);
    o.stop(start + durationSec);
  } catch {
    /* ignore */
  }
}
