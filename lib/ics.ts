import type { Voucher } from "./types";
import { money } from "./vouchers";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Zeilen > 75 Oktette falten (RFC 5545) */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nextDay(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function voucherEvent(v: Voucher, appUrl: string): string[] {
  if (!v.expires_on) return [];
  const value = v.value != null ? ` (${money(Number(v.remaining_value ?? v.value), v.currency)})` : "";
  const desc = [
    `Dein Gutschein für ${v.issuer}${value} läuft heute ab.`,
    v.code ? `Code: ${v.code}` : null,
    v.gifted_by ? `Geschenkt von ${v.gifted_by}` : null,
    v.conditions ? `Hinweis: ${v.conditions}` : null,
    appUrl ? `${appUrl}/gutschein/${v.id}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:vouchy-${v.id}@vouchy.app`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${v.expires_on.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${nextDay(v.expires_on)}`,
    `SUMMARY:${esc(`🎟️ Gutschein läuft ab: ${v.issuer}${value}`)}`,
    `DESCRIPTION:${esc(desc)}`,
    v.address ? `LOCATION:${esc(v.address)}` : null,
    appUrl ? `URL:${appUrl}/gutschein/${v.id}` : null,
    "TRANSP:TRANSPARENT",
  ].filter(Boolean) as string[];

  for (const days of v.reminder_days ?? []) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Noch ${days} ${days === 1 ? "Tag" : "Tage"}: Gutschein ${v.issuer}${value} einlösen!`)}`,
      // 9 Uhr morgens an dem Tag: Event beginnt 00:00 → -P{d}DT-9H ist nicht erlaubt, daher -P{d-1}DT15H
      `TRIGGER:-P${days > 0 ? `${days - 1}DT15H` : "T0M"}`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function calendar(events: string[][], name = "Vouchy Gutscheine"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vouchy//Gutscheine//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
