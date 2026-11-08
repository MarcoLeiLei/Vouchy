import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { CATEGORIES, todayISO } from "@/lib/vouchers";
import type { Extraction } from "@/lib/types";

export const maxDuration = 120;

// Reihenfolge: eigenes Modell (GEMINI_MODEL), sonst kostenlose Flash-Modelle.
// Ist eins überlastet, langsam oder nicht verfügbar, wird automatisch das nächste probiert.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-lite-latest", // schnell und im Test zuverlässig
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter(Boolean) as string[];

const PER_MODEL_TIMEOUT = 45_000;
const TOTAL_BUDGET = 105_000;

const nullable = (type: string, description?: string) => ({ type, nullable: true, ...(description ? { description } : {}) });

const SCHEMA = {
  type: "object",
  properties: {
    is_voucher: { type: "boolean", description: "true, wenn auf dem Bild ein Gutschein oder eine Geschenkkarte zu sehen ist" },
    issuer: nullable("string", "Firma/Laden/Ort, bei dem der Gutschein gilt"),
    title: nullable("string", "Kurzbeschreibung der Leistung, z. B. 'Tageskarte Sauna' oder 'Wertgutschein'"),
    category: { type: "string", nullable: true, enum: CATEGORIES.map((c) => c.id) },
    value: nullable("number", "Geldwert als Zahl ohne Währung"),
    currency: nullable("string", "ISO-Währungscode, meist EUR"),
    code: nullable("string", "Gutscheincode oder Kartennummer"),
    pin: nullable("string", "PIN oder Sicherheitscode"),
    reference: nullable("string", "Referenz-, Beleg- oder Seriennummer"),
    expires_on: nullable("string", "Ablaufdatum YYYY-MM-DD. 'gültig bis Ende 2027' → 2027-12-31"),
    issued_on: nullable("string", "Ausstellungs-/Kaufdatum YYYY-MM-DD"),
    gifted_by: nullable("string", "Name der schenkenden Person, falls auf dem Gutschein steht (z. B. 'Von Oma Gerda')"),
    website: nullable("string"),
    address: nullable("string", "Adresse des Ausstellers"),
    phone: nullable("string"),
    conditions: nullable("string", "Wichtige Bedingungen in einem kurzen Satz, z. B. 'Nur Mo–Fr, Termin vorher buchen'"),
  },
  required: ["is_voucher"],
};

export async function POST(request: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Die Bilderkennung ist noch nicht eingerichtet (GEMINI_API_KEY fehlt). Trag die Daten einfach von Hand ein." }, { status: 503 });
  }

  const { image, mediaType } = (await request.json()) as { image?: string; mediaType?: string };
  if (!image) return NextResponse.json({ error: "Kein Bild erhalten" }, { status: 400 });

  const prompt = `Lies diesen Gutschein aus (meist deutschsprachig). Heute ist der ${todayISO()}. Datumsangaben immer als YYYY-MM-DD. Ist die Gültigkeit relativ angegeben ("3 Jahre ab Ausstellung"), rechne sie mit dem Ausstellungsdatum aus. Erfinde nichts: Was nicht lesbar ist, ist null.`;

  const makeBody = (withThinkingOff: boolean) => ({
    contents: [{ parts: [{ inline_data: { mime_type: mediaType || "image/jpeg", data: image } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 0,
      // Nachdenken abschalten: fürs Abtippen unnötig und macht die Antwort viel langsamer
      ...(withThinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });

  const started = Date.now();
  let lastError = "";
  let quotaHit = false;
  let badKey = false;

  /** Ein Modell fragen. Liefert Daten oder wirft einen Fehler. */
  async function ask(model: string, signal: AbortSignal): Promise<Extraction> {
    let thinkingOff = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
        body: JSON.stringify(makeBody(thinkingOff)),
        signal,
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        const text: string = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Extraction;
      }
      const raw = JSON.stringify(json ?? {});
      // Manche Modelle kennen die Denk-Einstellung nicht → einmal ohne probieren
      if (res.status === 400 && thinkingOff && /thinking/i.test(raw)) {
        thinkingOff = false;
        continue;
      }
      if (res.status === 400 && /API key/i.test(raw)) badKey = true;
      if (res.status === 429) quotaHit = true;
      throw new Error(`${model}: ${res.status} ${raw.slice(0, 160)}`);
    }
    throw new Error(`${model}: keine Antwort`);
  }

  // Immer zwei Modelle gleichzeitig fragen – die erste brauchbare Antwort gewinnt
  const models = [...new Set(MODELS)];
  for (let i = 0; i < models.length; i += 2) {
    const remaining = TOTAL_BUDGET - (Date.now() - started);
    if (remaining < 5_000 || badKey) break;
    const pair = models.slice(i, i + 2);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(PER_MODEL_TIMEOUT, remaining));
    try {
      const { data, model } = await Promise.any(pair.map((m) => ask(m, ctrl.signal).then((data) => ({ data, model: m }))));
      console.log("gemini ok", model, `${Date.now() - started}ms`);
      return NextResponse.json({ data, model });
    } catch (err) {
      const errors = err instanceof AggregateError ? err.errors : [err];
      lastError = errors.map((e) => ((e as Error).name === "AbortError" ? "Zeitüberschreitung" : (e as Error).message)).join(" | ");
      console.error("gemini failed", pair.join("+"), lastError);
    } finally {
      clearTimeout(timer);
      ctrl.abort(); // laufende Anfrage des langsameren Modells beenden
    }
  }
  if (badKey) return NextResponse.json({ error: "Der Gemini API Key ist ungültig. Bitte in Vercel prüfen." }, { status: 502 });
  console.error("gemini gave up", lastError);
  return NextResponse.json(
    {
      error: quotaHit
        ? "Das kostenlose Gemini-Kontingent ist gerade aufgebraucht. Trag die Daten von Hand ein oder versuch es später nochmal."
        : "Gemini ist gerade überlastet. Trag die Daten von Hand ein oder versuch es in ein paar Minuten nochmal.",
    },
    { status: 503 }
  );
}
