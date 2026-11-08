import { Suspense } from "react";
import { Mascot } from "@/components/mascot";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(env(safe-area-inset-top),40px)] pb-12">
      <Mascot size={120} mood="happy" />
      <h1 className="display text-[56px] mt-6">Kein Gutschein verfällt mehr.</h1>
      <p className="mt-4 text-lg text-ink-soft">
        Fotografieren, Vouchy liest alles aus, und du bekommst eine Erinnerung, bevor das Geschenk deiner Liebsten im Müll landet.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
