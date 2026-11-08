import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { CATEGORIES, todayISO } from "@/lib/vouchers";
import type { Extraction } from "@/lib/types";

export const maxDuration = 60;

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

const PER_MODEL_TIMEOUT = 15_000;
const TOTAL_BUDGET = 50_000;

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

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mediaType || "image/jpeg", data: image } },
          {
            text: `Lies diesen Gutschein aus (meist deutschsprachig). Heute ist der ${todayISO()}. Datumsangaben immer als YYYY-MM-DD. Ist die Gültigkeit relativ angegeben ("3 Jahre ab Ausstellung"), rechne sie mit dem Ausstellungsdatum aus. Erfinde nichts: Was nicht lesbar ist, ist null.`,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
  };

  const started = Date.now();
  let lastError = "";
  let quotaHit = false;
  for (const model of [...new Set(MODELS)]) {
    const remaining = TOTAL_BUDGET - (Date.now() - started);
    if (remaining < 4_000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(PER_MODEL_TIMEOUT, remaining));
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const raw = JSON.stringify(json ?? {});
        console.error("gemini error", model, res.status, raw.slice(0, 300));
        if (res.status === 400 && /API key/i.test(raw)) {
          return NextResponse.json({ error: "Der Gemini API Key ist ungültig. Bitte in Vercel prüfen." }, { status: 502 });
        }
        if (res.status === 429) quotaHit = true;
        lastError = `${model}: ${res.status}`;
        continue; // 404 (Modell gibt's nicht), 429 (Kontingent), 5xx (überlastet) → nächstes Modell
      }
      const text: string = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      const data = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Extraction;
      console.log("gemini ok", model, `${Date.now() - started}ms`);
      return NextResponse.json({ data, model });
    } catch (err) {
      lastError = `${model}: ${(err as Error).name === "AbortError" ? "Zeitüberschreitung" : (err as Error).message}`;
      console.error("gemini failed", lastError);
    } finally {
      clearTimeout(timer);
    }
  }
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
