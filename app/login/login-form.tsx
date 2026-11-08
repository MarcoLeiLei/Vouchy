"use client";
import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { login, signup } from "@/lib/actions";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [loginState, loginAction, loginPending] = useActionState(login, {});
  const [signupState, signupAction, signupPending] = useActionState(signup, {});
  const error = mode === "login" ? loginState.error : signupState.error;
  const pending = loginPending || signupPending;

  return (
    <form action={mode === "login" ? loginAction : signupAction} className="mt-8 space-y-3">
      <input type="hidden" name="next" value={next} />
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
          <input name="name" className="field mt-1" required autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-semibold">E-Mail</span>
        <input name="email" className="field mt-1" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Passwort</span>
        <input
          name="password"
          className="field mt-1"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error && <p className="text-danger font-semibold text-sm" role="alert">{error}</p>}
      <button disabled={pending} className="press w-full rounded-2xl bg-pink text-white font-bold py-4 text-lg shadow-[0_4px_0_#2b1b63] disabled:opacity-60">
        {pending ? "Einen Moment…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
      </button>
    </form>
  );
}
