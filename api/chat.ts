// api/chat.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * En slimmad chatt-endpoint.
 * - Korta, konkreta svar.
 * - När användaren ber om att skapa en uppgift:
 *   Svara med <ADD_TASK>{ "title":"...", "notes":"..." }</ADD_TASK> i svaret.
 * - Undvik hittepå-deadlines. Föreslå förtydligande när input är vag.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { messages = [] } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be array" });

  const system = `Du är Clerkr – exekutiv sekreterare. Rakt på sak, inga artigheter.
Policy:
- Svara kort. Max 4 meningar.
- Skapa INTE påhittade tider/deadlines.
- Om användaren säger något som låter som en uppgift ("lägg till...", "jag måste...", "påminn mig att..."):
  inkludera i DITT svar en markerad rad:
  <ADD_TASK>{"title":"...","notes":"..."}</ADD_TASK>
  Använd bara title + ev. notes (inga impact/estimate/blocking).
- Om input är vag: be om förtydligande i svaret (1 mening) och SKAPA INTE ADD_TASK.
- Om användaren frågar "vad nu" eller "prioritera": be dem trycka på knappen i UI eller skriv: "Tryck 'Kör prioritering'."`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        // Begränsa historiken för kostnad. Ta sista ~10 meddelandena.
        ...messages.slice(-10)
      ]
    });

    const reply = r.choices?.[0]?.message?.content ?? "Ok.";
    res.status(200).json({ reply });
  } catch (e: any) {
    console.error("CHAT_ERROR", e?.message);
    res.status(500).json({ error: "chat_failed" });
  }
}