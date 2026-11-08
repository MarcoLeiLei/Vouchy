import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pushToUser, sendEmail, type Message } from "@/lib/notify";
import { daysBetween, money, todayISO } from "@/lib/vouchers";
import type { Profile, Voucher } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Läuft täglich (vercel.json). Für jeden offenen Gutschein wird geprüft, ob eine
 * Erinnerungsschwelle (z. B. 90/30/7 Tage) erreicht ist, die noch nicht verschickt wurde.
 * Wurden mehrere Schwellen gleichzeitig erreicht (z. B. neu angelegt mit 20 Tagen Rest),
 * geht nur eine Nachricht raus und alle werden als erledigt markiert.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const today = todayISO();
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const { data: vouchers, error } = await admin
    .from("vouchers")
    .select("*")
    .eq("status", "open")
    .not("expires_on", "is", null)
    .gte("expires_on", today)
    .returns<Voucher[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (vouchers ?? []).map((v) => v.id);
  const { data: logs } = ids.length ? await admin.from("reminder_log").select("voucher_id, days").in("voucher_id", ids) : { data: [] };
  const done = new Set((logs ?? []).map((l) => `${l.voucher_id}:${l.days}`));

  const memberCache = new Map<string, Profile[]>();
  async function membersOf(boxId: string) {
    if (!memberCache.has(boxId)) {
      const { data: m } = await admin.from("box_members").select("user_id").eq("box_id", boxId);
      const userIds = (m ?? []).map((x) => x.user_id);
      const { data: profiles } = userIds.length ? await admin.from("profiles").select("*").in("id", userIds).returns<Profile[]>() : { data: [] as Profile[] };
      memberCache.set(boxId, profiles ?? []);
    }
    return memberCache.get(boxId)!;
  }

  let sent = 0;
  for (const v of vouchers ?? []) {
    const left = daysBetween(today, v.expires_on!);
    const due = (v.reminder_days ?? []).filter((d) => left <= d && !done.has(`${v.id}:${d}`));
    if (due.length === 0) continue;

    const amount = v.value != null ? money(Number(v.remaining_value ?? v.value), v.currency) : null;
    const when = left === 0 ? "heute" : left === 1 ? "morgen" : `in ${left} Tagen`;
    const msg: Message = {
      title: left <= 7 ? `⏰ Letzte Chance: ${v.issuer}` : `🎟️ Gutschein läuft ${when} ab`,
      body: `${amount ? amount + " bei " : "Dein Gutschein für "}${v.issuer} läuft ${when} ab${v.gifted_by ? `, ein Geschenk von ${v.gifted_by}` : ""}. Jetzt einlösen!`,
      url: `${origin}/gutschein/${v.id}`,
      tag: `voucher-${v.id}`,
    };

    for (const p of await membersOf(v.box_id)) {
      if (p.notify_push) sent += await pushToUser(admin, p.id, msg);
      if (p.notify_email && p.email) sent += (await sendEmail(p.email, msg)) ? 1 : 0;
    }
    await admin.from("reminder_log").upsert(due.map((d) => ({ voucher_id: v.id, days: d })));
  }

  return NextResponse.json({ ok: true, checked: vouchers?.length ?? 0, sent });
}
