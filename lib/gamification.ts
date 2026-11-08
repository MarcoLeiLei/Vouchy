import type { Voucher, VoucherEvent } from "./types";
import { effectiveStatus, openValue, todayISO } from "./vouchers";

export const LEVELS = [
  { min: 0, name: "Fundstück", emoji: "🪙" },
  { min: 25, name: "Schatzsucher", emoji: "🧭" },
  { min: 100, name: "Gutschein-Retter", emoji: "🛟" },
  { min: 250, name: "Einlöse-Profi", emoji: "🎯" },
  { min: 500, name: "Schatzmeister", emoji: "👑" },
  { min: 1000, name: "Vouchy-Legende", emoji: "🌟" },
] as const;

export type Stats = {
  saved: number;
  openValue: number;
  openCount: number;
  expiredValue: number;
  redeemedCount: number;
  totalCount: number;
  thanksCount: number;
  memberCount: number;
};

export function computeStats(vouchers: Voucher[], events: VoucherEvent[], memberCount = 1): Stats {
  const today = todayISO();
  let open = 0;
  let openCount = 0;
  let expired = 0;
  let redeemedCount = 0;
  for (const v of vouchers) {
    const s = effectiveStatus(v, today);
    if (s === "open") {
      open += openValue(v);
      openCount++;
    } else if (s === "expired") expired += openValue(v);
    else if (s === "redeemed") redeemedCount++;
  }
  const saved = events
    .filter((e) => e.type === "redeemed" || e.type === "partial")
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  return {
    saved,
    openValue: open,
    openCount,
    expiredValue: expired,
    redeemedCount,
    totalCount: vouchers.length,
    thanksCount: events.filter((e) => e.type === "thanked").length,
    memberCount,
  };
}

export function levelFor(saved: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (saved >= l.min) idx = i;
  });
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progress = next ? (saved - current.min) / (next.min - current.min) : 1;
  return { index: idx, current, next, progress: Math.max(0, Math.min(1, progress)) };
}

export type Badge = {
  id: string;
  emoji: string;
  name: string;
  hint: string;
  earned: boolean;
};

export function computeBadges(vouchers: Voucher[], events: VoucherEvent[], memberCount = 1): Badge[] {
  const redeems = events.filter((e) => e.type === "redeemed" || e.type === "partial");
  const s = computeStats(vouchers, events, memberCount);
  const list: (Omit<Badge, "earned"> & { test: boolean })[] = [];
  const add = (id: string, emoji: string, name: string, hint: string, test: boolean) =>
    list.push({ id, emoji, name, hint, test });

  add("first", "📸", "Erster Schatz", "Ersten Gutschein erfasst", vouchers.length >= 1);
  add("ten", "🧺", "Kistenfüller", "10 Gutscheine erfasst", vouchers.length >= 10);
  add("rescue", "🛟", "Erste Rettung", "Ersten Gutschein eingelöst", redeems.length >= 1);
  add(
    "lastminute",
    "⏱️",
    "Last-Minute-Retter",
    "Eingelöst, als nur noch 7 Tage übrig waren",
    redeems.some((e) => e.days_left !== null && e.days_left <= 7 && e.days_left >= 0)
  );
  add("partial", "🍰", "Stück für Stück", "Einen Gutschein in Teilen eingelöst", events.some((e) => e.type === "partial"));
  add("thanks", "💌", "Danke-Sager", "Dich beim Schenker bedankt", s.thanksCount >= 1);
  add("hundred", "💯", "Hunderter", "100 € gerettet", s.saved >= 100);
  add("team", "🤝", "Teamwork", "Kiste mit jemandem geteilt", memberCount >= 2);
  add("empty", "✨", "Kiste leer geräumt", "Alle offenen Gutscheine eingelöst (mind. 5)", s.totalCount >= 5 && s.openCount === 0 && s.redeemedCount >= 5);

  return list.map(({ test, ...b }) => ({ ...b, earned: test }));
}
