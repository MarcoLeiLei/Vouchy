"use client";
import { useEffect, useState } from "react";

type B = { id: string; emoji: string; name: string };

/** Zeigt ein kleines Popup, wenn seit dem letzten Besuch ein neues Abzeichen dazugekommen ist. */
export function BadgeWatcher({ boxId, earned }: { boxId: string; earned: B[] }) {
  const [fresh, setFresh] = useState<B | null>(null);
  const key = `vouchy_badges_${boxId}`;
  const ids = earned.map((b) => b.id).join(",");

  useEffect(() => {
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      seen = raw ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    const current = earned.map((b) => b.id);
    if (seen) {
      const added = earned.find((b) => !seen!.includes(b.id));
      if (added) setFresh(added);
    }
    try {
      localStorage.setItem(key, JSON.stringify(current));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, key]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 5000);
    return () => clearTimeout(t);
  }, [fresh]);

  if (!fresh) return null;
  return (
    <div className="fixed inset-x-0 top-[max(env(safe-area-inset-top),16px)] z-50 flex justify-center px-4 pointer-events-none">
      <div className="pop-in pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink text-white px-5 py-3 shadow-[0_4px_0_#ff4f8b]" role="status">
        <span className="text-3xl">{fresh.emoji}</span>
        <div>
          <p className="text-xs text-butter font-bold">Neues Abzeichen</p>
          <p className="font-bold">{fresh.name}</p>
        </div>
      </div>
    </div>
  );
}
