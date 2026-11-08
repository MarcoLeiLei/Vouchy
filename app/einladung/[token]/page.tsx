import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { JoinButton } from "./join-button";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [info, user] = await Promise.all([
    one<{ box_name: string; box_emoji: string; inviter: string | null; valid: boolean }>(
      `select b.name as box_name, b.emoji as box_emoji, u.display_name as inviter, i.expires_at > now() as valid
         from box_invites i join boxes b on b.id = i.box_id left join users u on u.id = i.created_by
        where i.token = $1`,
      [token]
    ),
    currentUser(),
  ]);

  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(env(safe-area-inset-top),48px)] pb-12 text-center">
      <Mascot size={130} mood={info?.valid ? "party" : "sleepy"} className="mx-auto" />
      {!info || !info.valid ? (
        <>
          <h1 className="display text-4xl mt-6">Dieser Link ist abgelaufen</h1>
          <p className="mt-3 text-ink-soft">Bitte die Person, die dich eingeladen hat, um einen neuen Link.</p>
          <Link href="/" className="press mt-6 inline-flex rounded-2xl bg-ink text-white font-bold px-6 py-3">Zu Vouchy</Link>
        </>
      ) : (
        <>
          <p className="mt-6 font-semibold text-ink-soft">{info.inviter ?? "Jemand"} lädt dich ein in</p>
          <h1 className="display text-[48px] mt-1">
            {info.box_emoji} {info.box_name}
          </h1>
          <p className="mt-3 text-ink-soft">Ihr seht dann dieselben Gutscheine und bekommt beide die Erinnerungen.</p>
          {user ? (
            <JoinButton token={token} />
          ) : (
            <div className="mt-8 space-y-3">
              <Link href={`/login?mode=signup&next=/einladung/${token}`} className="press block rounded-2xl bg-pink text-white font-bold py-4 shadow-[0_4px_0_#2b1b63]">
                Konto erstellen und beitreten
              </Link>
              <Link href={`/login?next=/einladung/${token}`} className="press block rounded-2xl bg-white border-2 border-line font-bold py-4">
                Ich habe schon ein Konto
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
