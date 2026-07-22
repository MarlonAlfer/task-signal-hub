import { createServerFn } from "@tanstack/react-start";

// Generates a short spoken alert using Lovable AI (OpenAI TTS) and returns
// base64-encoded MP3 so the client can cache and replay without re-billing.
export const generateAlertVoice = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; voice?: string }) => {
    if (!input?.text || typeof input.text !== "string") {
      throw new Error("text obrigatório");
    }
    return { text: input.text, voice: input.voice || "sage" };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

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
        instructions:
          "Fale em português do Brasil com uma voz feminina jovem, amigável e sensual ao mesmo tempo. Tom quente, aveludado, levemente sussurrado, com um sorriso na voz e uma pitada de charme. Ritmo tranquilo, pausas naturais, respiração leve. Estenda carinhosamente o cumprimento inicial (o 'Bom diaaaa' deve soar arrastado, doce e brincalhão). Nada robótica, nada formal — soe humana, próxima, cativante e envolvente.",
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`TTS falhou: ${res.status} ${err}`);
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audio: base64, mime: "audio/mpeg" };
  });
