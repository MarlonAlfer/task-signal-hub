import { createServerFn } from "@tanstack/react-start";

// Generates a short spoken alert using Lovable AI (OpenAI TTS) and returns
// base64-encoded MP3 so the client can cache and replay without re-billing.
export const generateAlertVoice = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; voice?: string }) => {
    if (!input?.text || typeof input.text !== "string") {
      throw new Error("text obrigatório");
    }
    return { text: input.text, voice: input.voice || "coral" };
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
          "Fale em português do Brasil com uma voz feminina muito suave, delicada, doce e acolhedora, como se fosse uma amiga próxima falando bem baixinho ao pé do ouvido pela manhã. Entonação bem humana, natural, calorosa, com respirações leves, ritmo tranquilo e pausado. Nada robótica, nada mecânica, sem soar como assistente virtual — apenas natural e gentil.",
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
