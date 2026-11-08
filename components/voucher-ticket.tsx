import Link from "next/link";
import type { Voucher } from "@/lib/types";
import { category, countdownLabel, daysLeft, effectiveStatus, money, openValue, urgency } from "@/lib/vouchers";

const URGENCY_STYLES: Record<string, { stub: string; text: string }> = {
  expired: { stub: "bg-ink/10", text: "text-ink-soft" },
  critical: { stub: "bg-danger", text: "text-white" },
  soon: { stub: "bg-warn", text: "text-ink" },
  ok: { stub: "bg-white/60", text: "text-ink" },
  none: { stub: "bg-white/60", text: "text-ink" },
  done: { stub: "bg-white/60", text: "text-ok" },
};

export function VoucherTicket({ voucher }: { voucher: Voucher }) {
  const cat = category(voucher.category);
  const d = daysLeft(voucher);
  const u = urgency(voucher);
  const status = effectiveStatus(voucher);
  const faded = status === "expired" || status === "redeemed";
  const style = URGENCY_STYLES[u];
  const partial = voucher.value !== null && voucher.remaining_value !== null && Number(voucher.remaining_value) < Number(voucher.value);

  return (
    <Link href={`/gutschein/${voucher.id}`} className={`press block ticket-shadow ${faded ? "opacity-60" : ""}`}>
      <div className="ticket min-h-[96px]" style={{ background: cat.color }}>
        <div className="flex items-center gap-3 p-4 pr-3 min-w-0">
          <span className="text-3xl shrink-0" aria-hidden>{cat.emoji}</span>
          <div className="min-w-0">
            <p className="font-bold text-[17px] leading-tight truncate">{voucher.issuer}</p>
            <p className="text-sm text-ink-soft truncate">
              {voucher.title || cat.label}
              {voucher.gifted_by ? `, von ${voucher.gifted_by}` : ""}
            </p>
            <p className="mt-1 text-[22px] display">
              {voucher.value !== null ? money(openValue(voucher), voucher.currency) : "Wert offen"}
              {partial && <span className="ml-1.5 text-sm font-semibold text-ink-soft" style={{ fontStretch: "100%" }}>von {money(voucher.value, voucher.currency)}</span>}
            </p>
          </div>
        </div>
        <div className={`ticket-stub rounded-r-[14px] ${style.stub} ${style.text}`} style={{ marginRight: 8 }}>
          {status === "redeemed" ? (
            <>
              <span className="text-2xl">✓</span>
              <span className="text-xs font-semibold">eingelöst</span>
            </>
          ) : d === null ? (
            <>
              <span className="text-2xl">∞</span>
              <span className="text-xs font-semibold leading-tight">ohne Datum</span>
            </>
          ) : d < 0 ? (
            <>
              <span className="text-xl">😴</span>
              <span className="text-xs font-semibold leading-tight">abgelaufen</span>
            </>
          ) : (
            <>
              <span className="display text-[30px]">{d > 999 ? "999+" : d}</span>
              <span className="text-xs font-semibold leading-tight">{d === 1 ? "Tag" : "Tage"}</span>
            </>
          )}
        </div>
      </div>
      <span className="sr-only">{countdownLabel(d)}</span>
    </Link>
  );
}
