"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Share2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { REMINDER_OPTIONS } from "@/lib/vouchers";
import { createInvite, leaveBox, removeMember, switchBox, updateProfile } from "./actions";

export function NameField({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await updateProfile({ display_name: name.trim() });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        });
      }}
    >
      <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Dein Name" />
      <button disabled={pending} className="press rounded-xl bg-ink text-white px-4 font-bold min-w-[110px]">
        {saved ? "Gespeichert" : "Speichern"}
      </button>
    </form>
  );
}

export function BoxSwitcher({ boxes, activeId }: { boxes: { id: string; name: string; emoji: string }[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (boxes.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Aktive Kiste">
      {boxes.map((b) => (
        <button
          key={b.id}
          role="radio"
          aria-checked={b.id === activeId}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await switchBox(b.id);
              router.refresh();
            })
          }
          className={`press rounded-full px-4 py-2 font-bold border-2 ${b.id === activeId ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
        >
          {b.emoji} {b.name}
        </button>
      ))}
    </div>
  );
}

export function MemberRow({ boxId, userId, name, role, isMe, canRemove }: { boxId: string; userId: string; name: string; role: string; isMe: boolean; canRemove: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-lilac font-bold">{name.slice(0, 1).toUpperCase()}</span>
      <span className="flex-1 font-semibold">
        {name}
        {isMe && <span className="text-ink-soft font-medium"> (du)</span>}
        {role === "owner" && <span className="ml-2 text-xs rounded-full bg-butter px-2 py-0.5 font-bold">Besitzer</span>}
      </span>
      {canRemove && (
        <button disabled={pending} onClick={() => start(() => removeMember(boxId, userId))} className="text-sm font-bold text-danger">
          Entfernen
        </button>
      )}
    </li>
  );
}

export function InviteButton({ boxId, boxName }: { boxId: string; boxName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  async function share(link: string) {
    const text = `Komm mit in meine Vouchy-Gutscheinkiste „${boxName}“, damit wir keinen Gutschein mehr verfallen lassen:`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: link });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(`${text} ${link}`);
    setCopied(true);
  }

  if (!url) {
    return (
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const link = await createInvite(boxId);
            setUrl(link);
          })
        }
        className="press w-full rounded-2xl bg-pink text-white py-3.5 font-bold shadow-[0_3px_0_#2b1b63] flex items-center justify-center gap-2"
      >
        <Share2 size={18} /> {pending ? "Link wird erstellt…" : "Jemanden einladen"}
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-mint p-3">
      <p className="text-sm font-semibold">Einladungslink, 14 Tage gültig:</p>
      <p className="text-sm break-all mt-1 select-all">{url}</p>
      <button onClick={() => share(url)} className="press mt-2 rounded-xl bg-ink text-white px-4 py-2 font-bold text-sm inline-flex items-center gap-2">
        {copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? "Kopiert" : "Teilen"}
      </button>
    </div>
  );
}

export function LeaveBox({ boxId }: { boxId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        start(async () => {
          await leaveBox(boxId);
          router.push("/");
        });
      }}
      className="text-sm font-bold text-danger"
    >
      {confirm ? "Wirklich austreten? Nochmal tippen" : "Aus dieser Kiste austreten"}
    </button>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings({
  vapidKey,
  notifyPush,
  notifyEmail,
  emailAvailable,
  defaultDays,
}: {
  vapidKey: string;
  notifyPush: boolean;
  notifyEmail: boolean;
  emailAvailable: boolean;
  defaultDays: number[];
}) {
  const [state, setState] = useState<"checking" | "unsupported" | "ios-install" | "off" | "on" | "denied">("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState(notifyEmail);
  const [days, setDays] = useState(defaultDays);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(isIOS && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && notifyPush ? "on" : "off");
    })();
  }, [notifyPush]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      if (!vapidKey) throw new Error("Push ist auf dem Server noch nicht eingerichtet (VAPID-Schlüssel fehlen).");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert({ user_id: user!.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" });
      if (error) throw new Error(error.message);
      await updateProfile({ notify_push: true });
      setState("on");
      setMsg("Push ist an. Schick dir zum Ausprobieren eine Test-Nachricht.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Push konnte nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabaseBrowser().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    await updateProfile({ notify_push: false });
    setState("off");
    setBusy(false);
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = await res.json();
    setMsg(json.sent > 0 ? "Test-Nachricht ist unterwegs." : "Keine Nachricht zugestellt. Ist Push auf diesem Gerät aktiv?");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white border-2 border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Push-Nachrichten</p>
            <p className="text-sm text-ink-soft">
              {state === "on" && "Aktiv auf diesem Gerät"}
              {state === "off" && "Auf diesem Gerät aus"}
              {state === "denied" && "Im Browser blockiert. Erlaube Mitteilungen in den Systemeinstellungen."}
              {state === "unsupported" && "Dieser Browser kann keine Push-Nachrichten."}
              {state === "ios-install" && "Auf dem iPhone erst Vouchy zum Home-Bildschirm hinzufügen."}
              {state === "checking" && "Wird geprüft…"}
            </p>
          </div>
          {(state === "on" || state === "off") && (
            <Toggle on={state === "on"} disabled={busy} onChange={(v) => (v ? enable() : disable())} label="Push-Nachrichten" />
          )}
        </div>
        {state === "ios-install" && (
          <p className="mt-3 rounded-xl bg-lilac p-3 text-sm">
            In Safari unten auf <strong>Teilen</strong> tippen, dann <strong>Zum Home-Bildschirm</strong>. Vouchy vom Home-Bildschirm öffnen und hier Push einschalten.
          </p>
        )}
        {state === "on" && (
          <button onClick={test} className="mt-3 text-sm font-bold underline">
            Test-Nachricht schicken
          </button>
        )}
        {msg && <p className="mt-2 text-sm font-semibold">{msg}</p>}
      </div>

      <div className="rounded-2xl bg-white border-2 border-line p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">E-Mail</p>
          <p className="text-sm text-ink-soft">{emailAvailable ? "Erinnerung zusätzlich per Mail" : "E-Mail-Versand ist noch nicht eingerichtet"}</p>
        </div>
        <Toggle
          on={email}
          disabled={!emailAvailable}
          onChange={async (v) => {
            setEmail(v);
            await updateProfile({ notify_email: v });
          }}
          label="E-Mail-Erinnerungen"
        />
      </div>

      <div className="rounded-2xl bg-white border-2 border-line p-4">
        <p className="font-bold">Standard für neue Gutscheine</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                aria-pressed={on}
                onClick={async () => {
                  const next = on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => b - a);
                  setDays(next);
                  await updateProfile({ default_reminder_days: next });
                }}
                className={`press rounded-full px-3 py-1.5 text-sm font-bold border-2 ${on ? "bg-pink text-white border-pink" : "bg-white border-line text-ink-soft"}`}
              >
                {d === 1 ? "1 Tag" : `${d} Tage`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CalendarSubscribe({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <div className="rounded-2xl bg-white border-2 border-line p-4">
      <p className="font-bold">Kalender-Abo</p>
      <p className="text-sm text-ink-soft mt-0.5">
        Alle Ablaufdaten mit Erinnerung direkt in deinem iPhone-, Google- oder Outlook-Kalender. Aktualisiert sich von selbst.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={webcal} className="press rounded-xl bg-ink text-white px-4 py-2 font-bold text-sm">
          Kalender abonnieren
        </a>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className="press rounded-xl bg-white border-2 border-line px-4 py-2 font-bold text-sm inline-flex items-center gap-1.5"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Kopiert" : "Link kopieren"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Für Google Kalender: Link kopieren, dann „Weitere Kalender → Per URL“.</p>
    </div>
  );
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-14 h-8 rounded-full shrink-0 transition-colors disabled:opacity-40 ${on ? "bg-pink" : "bg-line"}`}
    >
      <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}
