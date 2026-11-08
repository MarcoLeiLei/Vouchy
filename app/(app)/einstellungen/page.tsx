import { headers } from "next/headers";
import { getContext } from "@/lib/data";
import { createBox, renameBox } from "./actions";
import { BoxSwitcher, InviteButton, LeaveBox, MemberRow, NameField, NotificationSettings, CalendarSubscribe } from "./client";

export default async function SettingsPage() {
  const { supabase, user, profile, boxes, activeBox } = await getContext();
  const { data: memberRows } = activeBox
    ? await supabase.from("box_members").select("user_id, role").eq("box_id", activeBox.id).order("joined_at")
    : { data: [] as { user_id: string; role: string }[] };
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name, email").in("id", memberIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
  const members = (memberRows ?? []).map((m) => ({ ...m, profile: (memberProfiles ?? []).find((p) => p.id === m.user_id) ?? null }));

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const isOwner = activeBox?.owner_id === user.id;

  return (
    <div className="space-y-10">
      <h1 className="display text-[44px]">Einstellungen</h1>

      <Section title="Du">
        <NameField initial={profile?.display_name ?? ""} />
        <p className="text-sm text-ink-soft">Angemeldet als {user.email}</p>
      </Section>

      <Section title="Deine Kisten" id="kisten">
        <p className="text-ink-soft text-sm -mt-2">Jede Kiste ist eine eigene Gutscheinsammlung. Teil sie mit deinem Haushalt, dann seht ihr alle dieselben Gutscheine.</p>
        <BoxSwitcher boxes={boxes.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji }))} activeId={activeBox?.id ?? null} />

        {activeBox && (
          <div className="rounded-2xl bg-white border-2 border-line p-4 space-y-4">
            <form action={renameBox} className="flex gap-2">
              <input type="hidden" name="id" value={activeBox.id} />
              <input name="emoji" defaultValue={activeBox.emoji} className="field w-16 text-center text-xl px-2" aria-label="Emoji der Kiste" maxLength={4} />
              <input name="name" defaultValue={activeBox.name} className="field flex-1" aria-label="Name der Kiste" />
              <button className="press rounded-xl bg-ink text-white px-4 font-bold">Speichern</button>
            </form>

            <div>
              <p className="font-bold mb-2">Wer ist mit drin?</p>
              <ul className="space-y-2">
                {members.map((m) => {
                  const p = m.profile;
                  return (
                    <MemberRow
                      key={m.user_id}
                      boxId={activeBox.id}
                      userId={m.user_id}
                      name={p?.display_name || p?.email || "Unbekannt"}
                      role={m.role}
                      isMe={m.user_id === user.id}
                      canRemove={isOwner && m.user_id !== user.id}
                    />
                  );
                })}
              </ul>
            </div>
            <InviteButton boxId={activeBox.id} boxName={activeBox.name} />
            {!isOwner && <LeaveBox boxId={activeBox.id} />}
          </div>
        )}

        <details className="rounded-2xl bg-white border-2 border-line p-4">
          <summary className="font-bold cursor-pointer">Neue Kiste anlegen</summary>
          <form action={createBox} className="mt-3 flex gap-2">
            <input name="emoji" defaultValue="🎁" className="field w-16 text-center text-xl px-2" aria-label="Emoji" maxLength={4} />
            <input name="name" placeholder="z. B. Familie Wolf" className="field flex-1" required aria-label="Name" />
            <button className="press rounded-xl bg-pink text-white px-4 font-bold">Anlegen</button>
          </form>
        </details>
      </Section>

      <Section title="Erinnerungen">
        <NotificationSettings
          vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
          notifyPush={profile?.notify_push ?? true}
          notifyEmail={profile?.notify_email ?? false}
          emailAvailable={Boolean(process.env.RESEND_API_KEY)}
          defaultDays={profile?.default_reminder_days ?? [90, 30, 7]}
        />
        {profile && <CalendarSubscribe url={`${origin}/api/calendar/${profile.calendar_token}.ics`} />}
      </Section>

      <form action="/auth/signout" method="post">
        <button className="press w-full rounded-2xl bg-white border-2 border-line py-4 font-bold">Abmelden</button>
      </form>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-6">
      <h2 className="display text-[28px]">{title}</h2>
      {children}
    </section>
  );
}
