// Gentle siren tone + spoken alert.
import { generateAlertVoice } from "./tts.functions";
import i18n from "@/i18n";

const cache = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();

async function loadAudioUrl(lang: string, message: string): Promise<string | null> {
  const key = `${lang}::${message}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const inFlight = loading.get(key);
  if (inFlight) return inFlight;
  const p = (async () => {
    try {
      const res = await generateAlertVoice({ data: { text: message, lang } });
      const bin = atob(res.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime });
      const url = URL.createObjectURL(blob);
      cache.set(key, url);
      return url;
    } catch (e) {
      console.error("TTS load failed, using speechSynthesis fallback", e);
      return null;
    } finally {
      loading.delete(key);
    }
  })();
  loading.set(key, p);
  return p;
}

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
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.4);
      osc.frequency.linearRampToValueAtTime(520, now + 0.8);
      osc.frequency.linearRampToValueAtTime(880, now + 1.2);
      osc.frequency.linearRampToValueAtTime(520, now + duration);
      const gain = ctx.createGain();
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

function fallbackSpeak(lang: string, message: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    const voices = synth.getVoices();
    const target =
      lang === "en" ? /en/i : lang === "es" ? /es/i : /pt/i;
    const match = voices.find((v) => target.test(v.lang)) || voices[0] || null;
    const u = new SpeechSynthesisUtterance(message);
    u.lang = match?.lang || (lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-PT");
    if (match) u.voice = match;
    u.rate = 1;
    u.pitch = 1.1;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

async function playSpokenMessage() {
  const lang = (i18n.language || "pt").slice(0, 2);
  const message = i18n.t("deadlines.voiceAlert");
  const url = await loadAudioUrl(lang, message);
  if (!url) {
    fallbackSpeak(lang, message);
    return;
  }
  const audio = new Audio(url);
  audio.volume = 1;
  audio.play().catch(() => fallbackSpeak(lang, message));
}

export function playAmbulanceSiren(_repeats = 1) {
  void (async () => {
    await playSoftSiren();
    await new Promise((r) => setTimeout(r, 180));
    await playSpokenMessage();
  })();
}
