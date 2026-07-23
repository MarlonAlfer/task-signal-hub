import { createServerFn } from "@tanstack/react-start";

// Generates a short spoken alert using Lovable AI (OpenAI TTS) and returns
// base64-encoded MP3 so the client can cache and replay without re-billing.
const INSTRUCTIONS: Record<string, string> = {
  pt: "Fale em português de Portugal (europeu), como uma amiga conversando de perto. Tom feminino claro, leve e envolvente, com respiração natural e entonação calma. Nada robótica — humana e aconchegante.",
  en: "Speak in natural American English as a warm friend nearby. Clear feminine tone, easy pace, natural breathing. Not robotic — human and cozy.",
  es: "Habla en español neutro con voz femenina cálida y cercana, como una amiga. Tono claro, ritmo tranquilo, respiración natural. Nada robótica — humana y acogedora.",
};

export const generateAlertVoice = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; voice?: string; lang?: string }) => {
    if (!input?.text || typeof input.text !== "string") {
      throw new Error("text required");
    }
    const lang = (input.lang || "pt").slice(0, 2);
    return { text: input.text, voice: input.voice || "sage", lang };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const instructions = INSTRUCTIONS[data.lang] || INSTRUCTIONS.pt;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        instructions,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`TTS failed: ${res.status} ${err}`);
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audio: base64, mime: "audio/mpeg" };
  });
