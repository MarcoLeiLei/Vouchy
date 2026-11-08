import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { CATEGORIES, todayISO } from "@/lib/vouchers";
import type { Extraction } from "@/lib/types";

export const maxDuration = 60;

const str = { type: ["string", "null"] } as const;

const TOOL = {
  name: "gutschein_speichern",
  description: "Speichert die aus dem Foto ausgelesenen Gutscheindaten. Unbekannte Felder auf null setzen, nichts erfinden.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_voucher: { type: "boolean", description: "true, wenn auf dem Bild ein Gutschein/Geschenkkarte zu sehen ist" },
      issuer: { ...str, description: "Firma/Laden/Ort, bei dem der Gutschein gilt, z. B. 'Thermen & Badewelt Euskirchen'" },
      title: { ...str, description: "Kurzbeschreibung der Leistung, z. B. 'Tageskarte Sauna' oder 'Wertgutschein'" },
      category: { type: ["string", "null"], enum: [...CATEGORIES.map((c) => c.id), null] },
      value: { type: ["number", "null"], description: "Geldwert als Zahl, ohne Währung" },
      currency: { ...str, description: "ISO-Währungscode, meist EUR" },
      code: { ...str, description: "Gutscheincode / Kartennummer" },
      pin: { ...str, description: "PIN oder Sicherheitscode, falls vorhanden" },
      reference: { ...str, description: "Referenz-, Beleg- oder Seriennummer" },
      expires_on: { ...str, description: "Ablaufdatum als YYYY-MM-DD. Bei 'gültig bis Ende 2027' → 2027-12-31." },
      issued_on: { ...str, description: "Ausstellungs-/Kaufdatum als YYYY-MM-DD" },
      gifted_by: { ...str, description: "Name der schenkenden Person, falls handschriftlich/aufgedruckt (z. B. 'Von Oma Gerda')" },
      website: { ...str },
      address: { ...str, description: "Adresse des Ausstellers" },
      phone: { ...str },
      conditions: {
        ...str,
        description: "Wichtige Hinweise/Bedingungen in einem kurzen Satz, z. B. 'Nur Mo–Fr, nicht mit Rabatten kombinierbar, Termin vorher buchen'",
      },
    },
    required: ["is_voucher", "issuer", "value", "expires_on"],
  },
};

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Die KI ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt). Du kannst die Daten von Hand eintragen." }, { status: 503 });
  }

  const { image, mediaType } = (await request.json()) as { image?: string; mediaType?: string };
  if (!image) return NextResponse.json({ error: "Kein Bild erhalten" }, { status: 400 });

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: (mediaType as "image/jpeg" | "image/png" | "image/webp") || "image/jpeg",
                data: image,
              },
            },
            {
              type: "text",
              text: `Lies diesen Gutschein aus (meist deutschsprachig). Heute ist der ${todayISO()}. Datumsangaben immer als YYYY-MM-DD. Wenn eine Gültigkeit relativ angegeben ist ("3 Jahre ab Ausstellung"), rechne sie mit dem Ausstellungsdatum aus. Erfinde nichts – was nicht lesbar ist, ist null.`,
            },
          ],
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("Keine Antwort der KI");
    return NextResponse.json({ data: block.input as Extraction });
  } catch (err) {
    console.error("extract failed", err);
    const message = err instanceof Anthropic.APIError && err.status === 401 ? "Der Claude API Key ist ungültig." : "Das Foto konnte nicht ausgelesen werden. Trag die Daten einfach von Hand ein.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
