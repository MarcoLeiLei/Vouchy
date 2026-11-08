import { Mascot } from "@/components/mascot";

const CHECKS = [
  { ok: () => Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL), label: "Datenbank verbunden", hint: "In Vercel: Storage → Neon hinzufügen", required: true },
  { ok: () => Boolean(process.env.GEMINI_API_KEY), label: "Bilderkennung (GEMINI_API_KEY)", hint: "Kostenloser Schlüssel aus aistudio.google.com", required: true },
  { ok: () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD), label: "E-Mail-Erinnerungen (optional)", hint: "GMAIL_USER und GMAIL_APP_PASSWORD", required: false },
];

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-[520px] px-5 py-12">
      <Mascot size={100} mood="wow" />
      <h1 className="display text-5xl mt-5">Vouchy ist fast startklar</h1>
      <p className="mt-3 text-ink-soft">
        Ergänze die fehlenden Punkte in Vercel und deploye danach neu. Die Anleitung steht in der README im Repository.
      </p>
      <ul className="mt-8 space-y-2">
        {CHECKS.map((c) => {
          const ok = c.ok();
          return (
            <li key={c.label} className="flex items-start gap-3 rounded-xl bg-white border-2 border-line p-3">
              <span className={`mt-0.5 grid place-items-center w-6 h-6 rounded-full text-sm font-bold shrink-0 ${ok ? "bg-ok text-white" : c.required ? "bg-danger text-white" : "bg-line text-ink-soft"}`}>
                {ok ? "✓" : c.required ? "!" : "–"}
              </span>
              <span>
                <span className="font-semibold block">{c.label}</span>
                <span className="text-sm text-ink-soft">{c.hint}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
