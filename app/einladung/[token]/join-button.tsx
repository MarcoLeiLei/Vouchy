"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "@/lib/actions";

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
          const { error } = await acceptInvite(token);
          if (error) {
            setError(error);
            setBusy(false);
            return;
          }
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
