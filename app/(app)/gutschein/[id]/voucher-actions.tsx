"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import QRCode from "qrcode";
import { CalendarPlus, Heart, Pencil, ScanLine, Trash2, Undo2, X } from "lucide-react";
import { deleteVoucher, markThanked, redeemVoucher, reopenVoucher } from "@/lib/actions";
import { effectiveStatus, money, openValue, thankYouText } from "@/lib/vouchers";
import type { Voucher } from "@/lib/types";
import { Mascot } from "@/components/mascot";

export function VoucherActions({ voucher, senderName }: { voucher: Voucher; senderName: string | null }) {
  const router = useRouter();
  const status = effectiveStatus(voucher);
  const [sheet, setSheet] = useState<null | "redeem" | "checkout" | "celebrate">(null);
  const [celebrated, setCelebrated] = useState<number>(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem(amount: number | null) {
    setBusy(true);
    setError(null);
    const before = openValue(voucher);
    const { error } = await redeemVoucher(voucher.id, amount);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setCelebrated(amount ?? before);
    setSheet("celebrate");
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, colors: ["#ff4f8b", "#ffe58a", "#bdf2d5", "#c9deff", "#2b1b63"], disableForReducedMotion: true });
    router.refresh();
  }

  async function reopen() {
    setBusy(true);
    await reopenVoucher(voucher.id);
    setBusy(false);
    router.refresh();
  }

  async function thank() {
    const text = thankYouText(voucher, senderName);
    // Teilen zuerst aufrufen: iOS erlaubt das nur direkt nach dem Antippen
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
    if (!voucher.thanked_at) await markThanked(voucher.id);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { error } = await deleteVoucher(voucher.id);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className="mt-6 space-y-3">
        {status !== "redeemed" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSheet("checkout")}
              className="press rounded-2xl bg-white border-2 border-ink py-4 font-bold flex items-center justify-center gap-2"
            >
              <ScanLine size={20} /> An der Kasse
            </button>
            <button
              onClick={() => setSheet("redeem")}
              className="press rounded-2xl bg-pink text-white py-4 font-bold shadow-[0_4px_0_#2b1b63]"
            >
              Einlösen
            </button>
          </div>
        )}
        {status === "redeemed" && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={thank} className="press rounded-2xl bg-pink text-white py-4 font-bold shadow-[0_4px_0_#2b1b63] flex items-center justify-center gap-2">
              <Heart size={20} /> {voucher.thanked_at ? "Nochmal danken" : "Danke sagen"}
            </button>
            <button onClick={reopen} disabled={busy} className="press rounded-2xl bg-white border-2 border-line py-4 font-bold flex items-center justify-center gap-2">
              <Undo2 size={20} /> Rückgängig
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {voucher.expires_on && status === "open" && (
            <a href={`/api/vouchers/${voucher.id}/ics`} className="press inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-line px-3.5 py-2 text-sm font-bold">
              <CalendarPlus size={16} /> In den Kalender
            </a>
          )}
          <Link href={`/gutschein/${voucher.id}/bearbeiten`} className="press inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-line px-3.5 py-2 text-sm font-bold">
            <Pencil size={16} /> Bearbeiten
          </Link>
          {confirmDelete ? (
            <button onClick={remove} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-full bg-danger text-white px-3.5 py-2 text-sm font-bold">
              <Trash2 size={16} /> Wirklich löschen
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="press inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-line px-3.5 py-2 text-sm font-bold text-danger">
              <Trash2 size={16} /> Löschen
            </button>
          )}
        </div>
        {error && <p className="text-danger font-semibold text-sm" role="alert">{error}</p>}
      </div>

      {sheet === "redeem" && <RedeemSheet voucher={voucher} busy={busy} onClose={() => setSheet(null)} onRedeem={redeem} />}
      {sheet === "checkout" && <CheckoutMode voucher={voucher} onClose={() => setSheet(null)} onRedeem={() => setSheet("redeem")} />}
      {sheet === "celebrate" && (
        <Sheet onClose={() => setSheet(null)} label="Gerettet">
          <div className="text-center">
            <Mascot size={130} mood="party" className="mx-auto pop-in" />
            <p className="display text-5xl mt-4">+{money(celebrated, voucher.currency)}</p>
            <p className="text-lg font-semibold mt-1">gerettet statt Papierkorb.</p>
            {voucher.gifted_by && (
              <>
                <p className="mt-5 text-ink-soft">Mach {voucher.gifted_by} eine Freude und sag kurz Bescheid.</p>
                <button onClick={thank} className="press mt-3 w-full rounded-2xl bg-pink text-white py-4 font-bold shadow-[0_4px_0_#2b1b63] flex items-center justify-center gap-2">
                  <Heart size={20} /> Danke an {voucher.gifted_by} schicken
                </button>
              </>
            )}
            <button onClick={() => setSheet(null)} className="mt-3 w-full py-3 font-bold text-ink-soft">
              Fertig
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function Sheet({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div
        className="w-full max-w-[560px] rounded-t-[28px] bg-paper p-6 pb-[max(env(safe-area-inset-bottom),24px)] animate-[sheet_220ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      <style>{`@keyframes sheet { from { transform: translateY(40px); opacity: .4 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

function RedeemSheet({ voucher, busy, onClose, onRedeem }: { voucher: Voucher; busy: boolean; onClose: () => void; onRedeem: (amount: number | null) => void }) {
  const [partial, setPartial] = useState("");
  const remaining = voucher.remaining_value ?? voucher.value;
  return (
    <Sheet onClose={onClose} label="Gutschein einlösen">
      <div className="flex items-center justify-between">
        <h2 className="display text-3xl">Einlösen</h2>
        <button onClick={onClose} aria-label="Schließen"><X /></button>
      </div>
      <button
        disabled={busy}
        onClick={() => onRedeem(null)}
        className="press mt-5 w-full rounded-2xl bg-pink text-white py-4 font-bold text-lg shadow-[0_4px_0_#2b1b63] disabled:opacity-60"
      >
        {remaining != null ? `Komplett eingelöst (${money(remaining, voucher.currency)})` : "Komplett eingelöst"}
      </button>
      {remaining != null && (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(partial.replace(",", "."));
            if (n > 0) onRedeem(n);
          }}
        >
          <label className="text-sm font-semibold" htmlFor="partial">Nur einen Teil eingelöst?</label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <input id="partial" className="field pr-10" inputMode="decimal" placeholder="z. B. 18,50" value={partial} onChange={(e) => setPartial(e.target.value)} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-soft font-semibold">€</span>
            </div>
            <button disabled={busy || !partial} className="press rounded-2xl bg-ink text-white px-5 font-bold disabled:opacity-50">Abziehen</button>
          </div>
          <p className="mt-2 text-sm text-ink-soft">Der Rest bleibt in der Kiste und Vouchy erinnert dich weiter.</p>
        </form>
      )}
    </Sheet>
  );
}

function CheckoutMode({ voucher, onClose, onRedeem }: { voucher: Voucher; onClose: () => void; onRedeem: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (voucher.code) {
      QRCode.toDataURL(voucher.code, { margin: 1, width: 480, color: { dark: "#2b1b63", light: "#ffffff" } }).then(setQr).catch(() => {});
    }
    // Bildschirm anlassen, solange der Kassenmodus offen ist
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [voucher.code]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col p-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]" role="dialog" aria-modal="true" aria-label="Kassenmodus">
      <div className="flex justify-between items-center">
        <p className="font-bold text-ink-soft">Kassenmodus</p>
        <button onClick={onClose} className="press rounded-full bg-paper p-2" aria-label="Schließen"><X /></button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="display text-4xl">{voucher.issuer}</p>
        <p className="display text-6xl mt-2 text-pink-deep">{money(openValue(voucher), voucher.currency)}</p>
        {voucher.code ? (
          <>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR-Code mit dem Gutscheincode" className="mt-6 w-56 h-56" />
            )}
            <p className="mt-4 text-3xl font-bold tracking-widest break-all">{voucher.code}</p>
            {voucher.pin && <p className="mt-1 text-xl">PIN <strong>{voucher.pin}</strong></p>}
          </>
        ) : (
          <p className="mt-6 text-ink-soft max-w-[30ch]">Kein Code hinterlegt. Zeig an der Kasse einfach das Original oder das Foto vor.</p>
        )}
        {voucher.conditions && <p className="mt-5 text-sm text-ink-soft max-w-[36ch]">{voucher.conditions}</p>}
      </div>
      <button onClick={onRedeem} className="press w-full rounded-2xl bg-pink text-white py-4 font-bold text-lg shadow-[0_4px_0_#2b1b63]">
        Hat geklappt, als eingelöst markieren
      </button>
    </div>
  );
}
