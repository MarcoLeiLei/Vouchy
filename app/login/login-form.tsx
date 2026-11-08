"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = supabaseBrowser();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) setError(translate(error.message));
      else if (!data.session) setInfo("Fast geschafft: Bestätige kurz den Link in deiner E-Mail, dann geht's los.");
      else {
        router.replace(next);
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(translate(error.message));
      else {
        router.replace(next);
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <div className="grid grid-cols-2 rounded-2xl bg-white border-2 border-line p-1" role="tablist">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-xl py-2.5 font-bold ${mode === m ? "bg-ink text-white" : "text-ink-soft"}`}
          >
            {m === "login" ? "Anmelden" : "Konto erstellen"}
          </button>
        ))}
      </div>
      {mode === "signup" && (
        <label className="block">
          <span className="text-sm font-semibold">Dein Vorname</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="given-name" />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-semibold">E-Mail</span>
        <input className="field mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Passwort</span>
        <input
          className="field mt-1"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error && <p className="text-danger font-semibold text-sm" role="alert">{error}</p>}
      {info && <p className="rounded-xl bg-mint p-3 text-sm font-semibold" role="status">{info}</p>}
      <button disabled={busy} className="press w-full rounded-2xl bg-pink text-white font-bold py-4 text-lg shadow-[0_4px_0_#2b1b63] disabled:opacity-60">
        {busy ? "Einen Moment…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
      </button>
    </form>
  );
}

function translate(msg: string) {
  if (/invalid login/i.test(msg)) return "E-Mail oder Passwort stimmt nicht.";
  if (/already registered/i.test(msg)) return "Diese E-Mail hat schon ein Konto. Melde dich an.";
  if (/password/i.test(msg)) return "Das Passwort braucht mindestens 6 Zeichen.";
  if (/email not confirmed/i.test(msg)) return "Bitte bestätige zuerst den Link in deiner E-Mail.";
  if (/rate limit/i.test(msg)) return "Zu viele Versuche. Warte kurz und probier es dann nochmal.";
  return msg;
}
