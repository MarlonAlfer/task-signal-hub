// Gentle siren tone + spoken alert.
import { generateAlertVoice } from "./tts.functions";

const MESSAGE = "Alerta de prazo.";

let cachedUrl: string | null = null;
let loading: Promise<string | null> | null = null;

async function loadAudioUrl(): Promise<string | null> {
  if (cachedUrl) return cachedUrl;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await generateAlertVoice({ data: { text: MESSAGE } });
      const bin = atob(res.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime });
      cachedUrl = URL.createObjectURL(blob);
      return cachedUrl;
    } catch (e) {
      console.error("TTS load failed, using speechSynthesis fallback", e);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// Soft two-tone siren using WebAudio: gentle sine sweep, low volume, ~1.6s.
function playSoftSiren(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return resolve();
    try {
      const ctx = new AC();
      const now = ctx.currentTime;
      const duration = 1.6;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      // Smooth sweep 520Hz -> 880Hz -> 520Hz -> 880Hz
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.4);
      osc.frequency.linearRampToValueAtTime(520, now + 0.8);
      osc.frequency.linearRampToValueAtTime(880, now + 1.2);
      osc.frequency.linearRampToValueAtTime(520, now + duration);

      const gain = ctx.createGain();
      // Soft envelope, max ~0.18 to keep it gentle
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.08);
      gain.gain.setValueAtTime(0.18, now + duration - 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
      osc.onended = () => {
        ctx.close().catch(() => {});
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

function fallbackSpeak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    const voices = synth.getVoices();
    const pt = voices.filter((v) => /pt(-|_)?(BR|PT)?/i.test(v.lang));
    const voice = pt[0] || voices[0] || null;
    const u = new SpeechSynthesisUtterance(MESSAGE);
    u.lang = voice?.lang || "pt-BR";
    if (voice) u.voice = voice;
    u.rate = 1;
    u.pitch = 1.1;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

async function playSpokenMessage() {
  const url = await loadAudioUrl();
  if (!url) {
    fallbackSpeak();
    return;
  }
  const audio = new Audio(url);
  audio.volume = 1;
  audio.play().catch(() => fallbackSpeak());
}

export function playAmbulanceSiren(_repeats = 1) {
  void (async () => {
    await playSoftSiren();
    await new Promise((r) => setTimeout(r, 180));
    await playSpokenMessage();
  })();
}
