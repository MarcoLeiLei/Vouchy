"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/mascot";
import { dateLabel } from "@/lib/vouchers";

export function NewVoucherWelcome({ reminderDate }: { reminderDate: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // ?neu=1 aus der URL entfernen, damit es beim Neuladen nicht erneut erscheint
    const url = new URL(window.location.href);
    url.searchParams.delete("neu");
    window.history.replaceState(null, "", url.toString());
  }, [router]);
  if (!open) return null;
  return (
    <div className="pop-in mb-4 flex items-center gap-3 rounded-2xl bg-mint p-4" role="status">
      <Mascot size={64} mood="party" className="shrink-0" />
      <div className="flex-1">
        <p className="font-bold text-lg leading-tight">Liegt in der Kiste!</p>
        <p className="text-sm">{reminderDate ? `Erste Erinnerung am ${dateLabel(reminderDate)}.` : "Vouchy behält ihn für dich im Blick."}</p>
      </div>
      <button onClick={() => setOpen(false)} className="font-bold text-sm underline">OK</button>
    </div>
  );
}
