import Link from "next/link";
import { getBoxData, getContext } from "@/lib/data";
import { computeBadges, computeStats, levelFor } from "@/lib/gamification";
import { BadgeWatcher } from "@/components/badge-watcher";
import { effectiveStatus, money, sortByExpiry, todayISO, urgency } from "@/lib/vouchers";
import { VoucherTicket } from "@/components/voucher-ticket";
import { Mascot } from "@/components/mascot";

const FILTERS = [
  { id: "offen", label: "Offen" },
  { id: "eingeloest", label: "Eingelöst" },
  { id: "abgelaufen", label: "Abgelaufen" },
] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "offen" } = await searchParams;
  const { profile, activeBox, boxes } = await getContext();
  if (!activeBox) return <p className="py-20 text-center">Keine Kiste gefunden. Bitte neu anmelden.</p>;

  const { vouchers, events, memberCount } = await getBoxData(activeBox.id);
  const stats = computeStats(vouchers, events, memberCount);
  const level = levelFor(stats.saved);
  const today = todayISO();

  const open = vouchers.filter((v) => effectiveStatus(v, today) === "open").sort(sortByExpiry);
  const soon = open.filter((v) => ["critical", "soon"].includes(urgency(v, today)));
  const listed =
    f === "eingeloest"
      ? vouchers.filter((v) => v.status === "redeemed").sort((a, b) => (b.redeemed_at ?? "").localeCompare(a.redeemed_at ?? ""))
      : f === "abgelaufen"
        ? vouchers.filter((v) => effectiveStatus(v, today) === "expired").sort(sortByExpiry).reverse()
        : open.filter((v) => !soon.includes(v));

  const firstName = (profile?.display_name ?? "").split(" ")[0];

  const earned = computeBadges(vouchers, events, memberCount)
    .filter((b) => b.earned)
    .map((b) => ({ id: b.id, emoji: b.emoji, name: b.name }));

  return (
    <div>
      <BadgeWatcher boxId={activeBox.id} earned={earned} />
      <header className="flex items-center justify-between gap-3">
        <Link href="/einstellungen#kisten" className="press inline-flex items-center gap-2 rounded-full bg-white border-2 border-line pl-2 pr-3.5 py-1.5 text-sm font-semibold max-w-[70%]">
          <span className="text-lg">{activeBox.emoji}</span>
          <span className="truncate">{activeBox.name}</span>
          {boxes.length > 1 && <span className="text-ink-soft">▾</span>}
          {memberCount > 1 && <span className="text-ink-soft font-medium">({memberCount})</span>}
        </Link>
        <Link href="/erfolge" className="press inline-flex items-center gap-1.5 rounded-full bg-butter px-3 py-1.5 text-sm font-bold">
          <span>{level.current.emoji}</span>
          <span>{level.current.name}</span>
        </Link>
      </header>

      <section className="mt-7">
        <p className="text-ink-soft font-medium">{firstName ? `Hallo ${firstName}, in deiner Kiste liegen` : "In deiner Kiste liegen"}</p>
        <h1 className="display text-[64px] mt-1">{money(stats.openValue)}</h1>
        <p className="text-lg font-semibold mt-1">
          in {stats.openCount} {stats.openCount === 1 ? "Gutschein" : "Gutscheinen"}
          {soon.length > 0 && <span className="text-danger">, {soon.length} {soon.length === 1 ? "läuft" : "laufen"} bald ab</span>}
        </p>

        <Link href="/erfolge" className="press mt-5 block rounded-2xl bg-ink text-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">Schon gerettet</span>
            <span className="display text-3xl text-butter">{money(stats.saved)}</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={Math.round(level.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-pink" style={{ width: `${Math.max(4, level.progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/75">
            {level.next ? `Noch ${money(level.next.min - stats.saved)} bis ${level.next.emoji} ${level.next.name}` : "Höchstes Level erreicht. Respekt!"}
          </p>
        </Link>
      </section>

      {vouchers.length === 0 ? (
        <section className="mt-12 text-center">
          <Mascot size={140} mood="sleepy" className="mx-auto" />
          <h2 className="display text-3xl mt-5">Deine Kiste ist noch leer</h2>
          <p className="mt-2 text-ink-soft max-w-[32ch] mx-auto">
            Hol die Gutscheine aus der Schublade und fotografiere den ersten. Vouchy liest alles aus und erinnert dich rechtzeitig.
          </p>
          <Link href="/neu" className="press mt-6 inline-flex rounded-2xl bg-pink text-white font-bold px-6 py-4 shadow-[0_4px_0_#2b1b63]">
            Ersten Gutschein fotografieren
          </Link>
        </section>
      ) : (
        <>
          {soon.length > 0 && f === "offen" && (
            <section className="mt-10">
              <h2 className="display text-[28px]">Jetzt einlösen</h2>
              <p className="text-ink-soft text-sm mb-4">Diese laufen in den nächsten 90 Tagen ab.</p>
              <div className="space-y-3">
                {soon.map((v) => (
                  <VoucherTicket key={v.id} voucher={v} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-10">
            <div className="flex gap-2 mb-4 overflow-x-auto" role="tablist">
              {FILTERS.map((x) => (
                <Link
                  key={x.id}
                  href={x.id === "offen" ? "/" : `/?f=${x.id}`}
                  role="tab"
                  aria-selected={f === x.id}
                  className={`press rounded-full px-4 py-2 text-sm font-bold border-2 ${f === x.id ? "bg-ink text-white border-ink" : "bg-white border-line text-ink-soft"}`}
                >
                  {x.label}
                </Link>
              ))}
            </div>
            {f === "abgelaufen" && stats.expiredValue > 0 && (
              <p className="mb-4 rounded-xl bg-white border-2 border-line p-3 text-sm">
                {money(stats.expiredValue)} sind leider verfallen. Tipp: Frag beim Aussteller nach. Viele lösen kulant trotzdem ein, und ohne aufgedrucktes Datum gilt oft noch die gesetzliche Frist von 3 Jahren.
              </p>
            )}
            <div className="space-y-3">
              {listed.map((v) => (
                <VoucherTicket key={v.id} voucher={v} />
              ))}
              {listed.length === 0 && (
                <p className="text-center text-ink-soft py-8">
                  {f === "eingeloest" ? "Noch nichts eingelöst. Der erste Konfetti-Moment wartet!" : f === "abgelaufen" ? "Nichts verfallen. Genau so soll es sein." : "Alles Offene steht oben bei „Jetzt einlösen“."}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
