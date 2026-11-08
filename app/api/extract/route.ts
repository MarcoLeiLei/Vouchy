import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { CATEGORIES, todayISO } from "@/lib/vouchers";
import type { Extraction } from "@/lib/types";

export const maxDuration = 60;

// Reihenfolge: eigenes Modell (GEMINI_MODEL), sonst aktuelle kostenlose Flash-Modelle
const MODELS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"].filter(Boolean) as string[];

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

  let lastError = "";
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.status === 404) {
      lastError = `Modell ${model} nicht verfügbar`;
      continue; // nächstes Modell probieren
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("gemini error", model, res.status, JSON.stringify(json));
      const msg =
        res.status === 400 && /API key/i.test(JSON.stringify(json))
          ? "Der Gemini API Key ist ungültig."
          : res.status === 429
            ? "Das kostenlose Gemini-Kontingent ist gerade aufgebraucht. Versuch es in einer Minute nochmal oder trag die Daten von Hand ein."
            : "Das Foto konnte nicht ausgelesen werden. Trag die Daten einfach von Hand ein.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    try {
      const text: string = json.candidates[0].content.parts.map((p: { text?: string }) => p.text ?? "").join("");
      return NextResponse.json({ data: JSON.parse(text) as Extraction, model });
    } catch {
      lastError = "Antwort nicht lesbar";
      break;
    }
  }
  console.error("gemini failed", lastError);
  return NextResponse.json({ error: "Das Foto konnte nicht ausgelesen werden. Trag die Daten einfach von Hand ein." }, { status: 502 });
}
