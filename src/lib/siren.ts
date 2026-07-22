// Natural-sounding female voice alert powered by Lovable AI TTS.
// Falls back to the browser's Web Speech API when the backend call fails.
import { generateAlertVoice } from "./tts.functions";

const MESSAGE = "Bom dia!! Passando pra lembrar que hoje é o dia da conclusão do serviço.";

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
      console.error("TTS load failed, falling back to speechSynthesis", e);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function fallbackSpeak(times: number) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    const voices = synth.getVoices();
    const pt = voices.filter((v) => /pt(-|_)?(BR|PT)?/i.test(v.lang));
    const hint = /(female|mulher|feminina|Luciana|Joana|Ines|Inês|Helena|Maria|Fernanda|Camila|Google.*Portugu)/i;
    const voice = pt.find((v) => hint.test(v.name)) || pt[0] || voices[0] || null;
    for (let i = 0; i < times; i++) {
      const u = new SpeechSynthesisUtterance(MESSAGE);
      u.lang = voice?.lang || "pt-BR";
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.05;
      u.volume = 1;
      synth.speak(u);
    }
  } catch {
    /* ignore */
  }
}

async function playCached(times: number) {
  const url = await loadAudioUrl();
  if (!url) {
    fallbackSpeak(times);
    return;
  }
  let count = 0;
  const playNext = () => {
    if (count >= times) return;
    count++;
    const audio = new Audio(url);
    audio.volume = 1;
    audio.onended = () => {
      if (count < times) setTimeout(playNext, 400);
    };
    audio.play().catch(() => fallbackSpeak(times - count + 1));
  };
  playNext();
}

export function playAmbulanceSiren(repeats = 2) {
  void playCached(repeats);
}
