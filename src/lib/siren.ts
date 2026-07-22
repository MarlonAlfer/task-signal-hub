// Female voice alert using Web Speech API.
// Kept the exported name `playAmbulanceSiren` for backwards compatibility.
const MESSAGE = "Atenção! Você tem um compromisso ainda pendente.";

function pickFemalePtVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const pt = voices.filter((v) => /pt(-|_)?(BR|PT)?/i.test(v.lang));
  const femaleHints = /(female|mulher|feminina|Luciana|Joana|Ines|Inês|Helena|Maria|Fernanda|Camila|Vitoria|Vitória|Google.*Portugu)/i;
  return (
    pt.find((v) => femaleHints.test(v.name)) ||
    pt[0] ||
    voices.find((v) => femaleHints.test(v.name)) ||
    voices[0] ||
    null
  );
}

function speakOnce(times: number) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    const voices = synth.getVoices();
    const voice = pickFemalePtVoice(voices);
    for (let i = 0; i < times; i++) {
      const u = new SpeechSynthesisUtterance(MESSAGE);
      u.lang = voice?.lang || "pt-BR";
      if (voice) u.voice = voice;
      u.rate = 1;
      u.pitch = 1.15;
      u.volume = 1;
      synth.speak(u);
    }
  } catch {
    /* ignore */
  }
}

export function playAmbulanceSiren(repeats = 2) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (synth.getVoices().length === 0) {
    // Voices load async on some browsers.
    const onVoices = () => {
      synth.removeEventListener?.("voiceschanged", onVoices);
      speakOnce(repeats);
    };
    synth.addEventListener?.("voiceschanged", onVoices);
    // Fallback in case the event never fires.
    setTimeout(() => speakOnce(repeats), 300);
    return;
  }
  speakOnce(repeats);
}
