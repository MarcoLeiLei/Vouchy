import type { Voucher } from "./types";

export const CATEGORIES = [
  { id: "essen", label: "Essen & Trinken", emoji: "🍝", color: "var(--c-peach)" },
  { id: "wellness", label: "Wellness & Sauna", emoji: "🧖", color: "var(--c-mint)" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", color: "var(--c-sky)" },
  { id: "erlebnis", label: "Erlebnis & Freizeit", emoji: "🎢", color: "var(--c-butter)" },
  { id: "kultur", label: "Kino, Kultur & Bücher", emoji: "🎭", color: "var(--c-lilac)" },
  { id: "reisen", label: "Reisen & Hotel", emoji: "🧳", color: "var(--c-sky)" },
  { id: "beauty", label: "Beauty & Friseur", emoji: "💅", color: "var(--c-peach)" },
  { id: "sonstiges", label: "Sonstiges", emoji: "🎁", color: "var(--c-lilac)" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function category(id: string | null | undefined) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const REMINDER_OPTIONS = [180, 90, 30, 14, 7, 1];

/** Heutiges Datum in Europe/Berlin als YYYY-MM-DD */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function daysLeft(v: Pick<Voucher, "expires_on">, today = todayISO()): number | null {
  return v.expires_on ? daysBetween(today, v.expires_on) : null;
}

/**
 * Gutscheine ohne aufgedrucktes Datum: regelmäßige Verjährung nach §§ 195, 199 BGB –
 * 3 Jahre, beginnend am Ende des Jahres, in dem der Gutschein gekauft/erhalten wurde.
 */
export function estimatedExpiry(receivedISO: string | null | undefined): string {
  const year = receivedISO ? +receivedISO.slice(0, 4) : +todayISO().slice(0, 4);
  return `${year + 3}-12-31`;
}

export type Urgency = "expired" | "critical" | "soon" | "ok" | "none" | "done";

export function urgency(v: Voucher, today = todayISO()): Urgency {
  if (v.status !== "open") return "done";
  const d = daysLeft(v, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 30) return "critical";
  if (d <= 90) return "soon";
  return "ok";
}

export function effectiveStatus(v: Voucher, today = todayISO()): "open" | "redeemed" | "expired" | "archived" {
  if (v.status === "redeemed") return "redeemed";
  if (v.status === "archived") return "archived";
  const d = daysLeft(v, today);
  return d !== null && d < 0 ? "expired" : "open";
}

export function money(n: number | null | undefined, currency = "EUR"): string {
  if (n === null || n === undefined) return "–";
  const whole = Number.isInteger(Number(n));
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function countdownLabel(d: number | null): string {
  if (d === null) return "ohne Ablauf";
  if (d < 0) return d === -1 ? "seit gestern abgelaufen" : `seit ${-d} Tagen abgelaufen`;
  if (d === 0) return "heute letzter Tag";
  if (d === 1) return "noch 1 Tag";
  if (d < 60) return `noch ${d} Tage`;
  const months = Math.round(d / 30.4);
  if (months < 24) return `noch ${months} Monate`;
  return `noch ${Math.round(d / 365)} Jahre`;
}

export function openValue(v: Voucher): number {
  return Number(v.remaining_value ?? v.value ?? 0);
}

export function sortByExpiry(a: Voucher, b: Voucher): number {
  if (a.expires_on && b.expires_on) return a.expires_on.localeCompare(b.expires_on);
  if (a.expires_on) return -1;
  if (b.expires_on) return 1;
  return b.created_at.localeCompare(a.created_at);
}

export function thankYouText(v: Voucher, senderName?: string | null): string {
  const was = v.title ? `den ${v.title}-Gutschein` : `deinen Gutschein für ${v.issuer}`;
  return `Hey${v.gifted_by ? " " + v.gifted_by.split(/[ ,&]/)[0] : ""}! 🎉 Wir haben gerade ${was} eingelöst – war richtig schön. Danke dir nochmal von Herzen!${senderName ? " " + senderName : ""}`;
}
