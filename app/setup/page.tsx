import { Mascot } from "@/components/mascot";

const CHECKS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase-Adresse", required: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase Public Key", required: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Secret Key (Erinnerungen, Kalender)", required: true },
  { key: "ANTHROPIC_API_KEY", label: "Claude API Key (Fotos auslesen)", required: true },
  { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", label: "Push: öffentlicher Schlüssel", required: false },
  { key: "VAPID_PRIVATE_KEY", label: "Push: privater Schlüssel", required: false },
  { key: "CRON_SECRET", label: "Schutz für den täglichen Erinnerungs-Job", required: false },
  { key: "RESEND_API_KEY", label: "E-Mail-Versand (optional)", required: false },
];

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-[520px] px-5 py-12">
      <Mascot size={100} mood="wow" />
      <h1 className="display text-5xl mt-5">Vouchy ist fast startklar</h1>
      <p className="mt-3 text-ink-soft">
        Trag die fehlenden Werte in Vercel unter Settings → Environment Variables ein und deploye neu. Die Schritt-für-Schritt-Anleitung steht in der README im Repository.
      </p>
      <ul className="mt-8 space-y-2">
        {CHECKS.map((c) => {
          const ok = Boolean(process.env[c.key]);
          return (
            <li key={c.key} className="flex items-start gap-3 rounded-xl bg-white border-2 border-line p-3">
              <span className={`mt-0.5 grid place-items-center w-6 h-6 rounded-full text-sm font-bold shrink-0 ${ok ? "bg-ok text-white" : c.required ? "bg-danger text-white" : "bg-line text-ink-soft"}`}>
                {ok ? "✓" : c.required ? "!" : "–"}
              </span>
              <span>
                <span className="font-semibold block">{c.label}</span>
                <code className="text-xs text-ink-soft break-all">{c.key}</code>
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
