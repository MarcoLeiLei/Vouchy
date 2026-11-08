import { getBoxData, getContext } from "@/lib/data";
import { LEVELS, computeBadges, computeStats, levelFor } from "@/lib/gamification";
import { money } from "@/lib/vouchers";
import { Mascot } from "@/components/mascot";

export default async function AchievementsPage() {
  const { activeBox } = await getContext();
  if (!activeBox) return null;
  const { vouchers, events, memberCount } = await getBoxData(activeBox.id);
  const stats = computeStats(vouchers, events, memberCount);
  const level = levelFor(stats.saved);
  const badges = computeBadges(vouchers, events, memberCount);
  const earned = badges.filter((b) => b.earned).length;

  return (
    <div>
      <h1 className="display text-[44px]">Erfolge</h1>

      <section className="mt-6 rounded-[28px] bg-ink text-white p-6 relative overflow-hidden">
        <Mascot size={110} mood={stats.saved > 0 ? "party" : "happy"} className="absolute -right-4 -top-2 rotate-12 opacity-95" />
        <p className="text-white/75 font-semibold">Dein Level</p>
        <p className="display text-[44px] mt-1 pr-24">
          {level.current.emoji} {level.current.name}
        </p>
        <div className="mt-5 h-3.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full rounded-full bg-pink" style={{ width: `${Math.max(4, level.progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm text-white/80">
          {level.next ? `${money(stats.saved)} gerettet. Noch ${money(level.next.min - stats.saved)} bis ${level.next.name}.` : `${money(stats.saved)} gerettet. Mehr geht nicht!`}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat value={money(stats.saved)} label="gerettet" tone="bg-mint" />
        <Stat value={String(stats.redeemedCount)} label="eingelöst" tone="bg-butter" />
        <Stat value={money(stats.expiredValue)} label="verfallen" tone="bg-white border-2 border-line" />
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-[28px]">Abzeichen</h2>
          <span className="font-bold text-ink-soft">
            {earned} von {badges.length}
          </span>
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-3">
          {badges.map((b) => (
            <li key={b.id} className={`rounded-2xl p-3 text-center ${b.earned ? "bg-white border-2 border-ink shadow-[0_3px_0_#2b1b63]" : "bg-white/50 border-2 border-dashed border-line"}`}>
              <span className={`block text-4xl ${b.earned ? "" : "grayscale opacity-30"}`} aria-hidden>
                {b.emoji}
              </span>
              <p className={`mt-1.5 text-sm font-bold leading-tight ${b.earned ? "" : "text-ink-soft"}`}>{b.name}</p>
              <p className="mt-1 text-[11px] leading-snug text-ink-soft">{b.hint}</p>
              <span className="sr-only">{b.earned ? "erreicht" : "noch nicht erreicht"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="display text-[28px]">Alle Level</h2>
        <ol className="mt-4 space-y-2">
          {LEVELS.map((l, i) => (
            <li key={l.name} className={`flex items-center gap-3 rounded-2xl p-3 ${i === level.index ? "bg-pink text-white" : i < level.index ? "bg-white" : "bg-white/50 text-ink-soft"}`}>
              <span className="text-2xl">{l.emoji}</span>
              <span className="font-bold flex-1">{l.name}</span>
              <span className="text-sm font-semibold">ab {money(l.min)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-3 ${tone}`}>
      <p className="display text-2xl">{value}</p>
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
    </div>
  );
}
