"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { switchBox } from "@/app/(app)/einstellungen/actions";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { data, error } = await supabaseBrowser().rpc("accept_invite", { p_token: token });
          if (error) {
            setError("Beitreten hat nicht geklappt. Ist der Link noch gültig?");
            setBusy(false);
            return;
          }
          await switchBox(data as string);
          router.push("/");
          router.refresh();
        }}
        className="press mt-8 w-full rounded-2xl bg-pink text-white font-bold py-4 text-lg shadow-[0_4px_0_#2b1b63] disabled:opacity-60"
      >
        {busy ? "Einen Moment…" : "Kiste beitreten"}
      </button>
      {error && <p className="mt-3 text-danger font-semibold">{error}</p>}
    </>
  );
}
