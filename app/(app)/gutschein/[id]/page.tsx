import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, MapPin, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBoxData, getVoucher } from "@/lib/data";
import { computeBadges } from "@/lib/gamification";
import { category, countdownLabel, dateLabel, daysLeft, effectiveStatus, money, openValue, todayISO, urgency } from "@/lib/vouchers";
import { VoucherActions } from "./voucher-actions";
import { NewVoucherWelcome } from "./welcome";
import { BadgeWatcher } from "@/components/badge-watcher";

const URGENCY_PILL: Record<string, string> = {
  expired: "bg-ink/10 text-ink-soft",
  critical: "bg-danger text-white",
  soon: "bg-warn text-ink",
  ok: "bg-white/70 text-ink",
  none: "bg-white/70 text-ink",
  done: "bg-ok text-white",
};

export default async function VoucherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const [{ id }, { neu }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const voucher = await getVoucher(id, user.id);
  if (!voucher) notFound();
  const box = await getBoxData(voucher.box_id);
  const profile = user;
  const badges = computeBadges(box.vouchers, box.events, box.memberCount);

  const cat = category(voucher.category);
  const today = todayISO();
  const d = daysLeft(voucher, today);
  const u = urgency(voucher, today);
  const status = effectiveStatus(voucher, today);
  const partial = voucher.value !== null && voucher.remaining_value !== null && Number(voucher.remaining_value) < Number(voucher.value) && status !== "redeemed";
  const nextReminder = (() => {
    if (!voucher.expires_on || d === null) return null;
    const upcoming = [...voucher.reminder_days].sort((a, b) => b - a).find((r) => r < d);
    if (upcoming === undefined) return null;
    const dt = new Date(voucher.expires_on + "T12:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - upcoming);
    return dt.toISOString().slice(0, 10);
  })();

  return (
    <div>
      <BadgeWatcher boxId={voucher.box_id} earned={badges.filter((b) => b.earned).map((b) => ({ id: b.id, emoji: b.emoji, name: b.name }))} />
      {neu && <NewVoucherWelcome reminderDate={nextReminder} />}

      <Link href="/" className="press inline-flex items-center gap-1.5 font-semibold text-ink-soft py-2">
        <ArrowLeft size={18} /> Kiste
      </Link>

      <div className="ticket-shadow mt-3">
        <div className="ticket ticket-big" style={{ background: cat.color }}>
          <div className="p-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-5xl" aria-hidden>{cat.emoji}</span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${URGENCY_PILL[u]}`}>
                {status === "redeemed" ? "Eingelöst ✓" : countdownLabel(d)}
              </span>
            </div>
            <h1 className="display text-[40px] mt-4 break-words">{voucher.issuer}</h1>
            {voucher.title && <p className="text-lg font-semibold mt-1">{voucher.title}</p>}
            <p className="display text-[56px] mt-4">{voucher.value !== null ? money(status === "redeemed" ? voucher.value : openValue(voucher), voucher.currency) : "Wert offen"}</p>
            {partial && <p className="font-semibold text-ink-soft">übrig von {money(voucher.value, voucher.currency)}</p>}
          </div>
          <div className="mx-6 border-t-[2.5px] border-dashed border-ink/25" />
          <div className="p-6 pt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-ink-soft">Gültig bis</p>
              <p className="font-bold text-base">
                {dateLabel(voucher.expires_on)}
                {voucher.expiry_estimated && <span className="font-medium text-ink-soft"> (geschätzt)</span>}
              </p>
            </div>
            <div>
              <p className="text-ink-soft">{voucher.gifted_by ? "Geschenkt von" : "Erhalten am"}</p>
              <p className="font-bold text-base">{voucher.gifted_by ?? dateLabel(voucher.received_on)}</p>
              {voucher.occasion && <p className="text-ink-soft">zum Anlass: {voucher.occasion}</p>}
            </div>
          </div>
        </div>
      </div>

      <VoucherActions voucher={voucher} senderName={profile?.display_name ?? null} />

      {voucher.code && (
        <section className="mt-8">
          <h2 className="display text-2xl mb-3">Code</h2>
          <div className="rounded-2xl bg-white border-2 border-line p-4">
            <p className="text-2xl font-bold tracking-wider break-all select-all">{voucher.code}</p>
            {voucher.pin && <p className="mt-1 text-ink-soft">PIN: <span className="font-bold text-ink select-all">{voucher.pin}</span></p>}
            {voucher.reference && <p className="mt-1 text-ink-soft">Referenz: <span className="font-semibold text-ink select-all">{voucher.reference}</span></p>}
          </div>
        </section>
      )}

      {(voucher.conditions || voucher.notes) && (
        <section className="mt-8 space-y-3">
          {voucher.conditions && (
            <div className="rounded-2xl bg-butter p-4">
              <p className="font-bold">Gut zu wissen</p>
              <p className="mt-1">{voucher.conditions}</p>
            </div>
          )}
          {voucher.notes && (
            <div className="rounded-2xl bg-white border-2 border-line p-4">
              <p className="font-bold">Notiz</p>
              <p className="mt-1 whitespace-pre-line">{voucher.notes}</p>
            </div>
          )}
        </section>
      )}

      {(voucher.website || voucher.address || voucher.phone) && (
        <section className="mt-8">
          <h2 className="display text-2xl mb-3">Einlösen bei</h2>
          <div className="rounded-2xl bg-white border-2 border-line divide-y-2 divide-line">
            {voucher.website && (
              <a href={voucher.website.startsWith("http") ? voucher.website : `https://${voucher.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 font-semibold">
                <Globe size={20} className="shrink-0" /> <span className="truncate">{voucher.website.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {voucher.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(voucher.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 font-semibold">
                <MapPin size={20} className="shrink-0" /> <span>{voucher.address}</span>
              </a>
            )}
            {voucher.phone && (
              <a href={`tel:${voucher.phone.replace(/\s/g, "")}`} className="flex items-center gap-3 p-4 font-semibold">
                <Phone size={20} className="shrink-0" /> <span>{voucher.phone}</span>
              </a>
            )}
          </div>
        </section>
      )}

      {voucher.has_photo && (
        <section className="mt-8">
          <h2 className="display text-2xl mb-3">Original</h2>
          <a href={`/api/photo/${voucher.id}?v=${encodeURIComponent(voucher.updated_at)}`} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photo/${voucher.id}?v=${encodeURIComponent(voucher.updated_at)}`} alt={`Foto des Gutscheins von ${voucher.issuer}`} className="w-full rounded-2xl border-4 border-white shadow-[0_3px_0_#2b1b63]" />
          </a>
        </section>
      )}
    </div>
  );
}
