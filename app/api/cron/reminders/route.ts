import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { appOrigin, pushToUser, sendEmail, type Message } from "@/lib/notify";
import { daysBetween, money, todayISO } from "@/lib/vouchers";
import type { Voucher } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Läuft täglich (vercel.json). Für jeden offenen Gutschein wird geprüft, ob eine
 * Erinnerungsschwelle (z. B. 90/30/7 Tage) erreicht ist, die noch nicht verschickt wurde.
 * Wurden mehrere Schwellen gleichzeitig erreicht, geht nur eine Nachricht raus.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayISO();
  const origin = appOrigin(new URL(request.url).origin);
  const vouchers = await query<Voucher>("select * from vouchers where status = 'open' and expires_on is not null and expires_on >= $1::date", [today]);
  const logs = await query<{ voucher_id: string; days: number }>("select voucher_id, days from reminder_log");
  const done = new Set(logs.map((l) => `${l.voucher_id}:${l.days}`));

  const members = new Map<string, { id: string; email: string; notify_push: boolean; notify_email: boolean }[]>();
  let sent = 0;

  for (const v of vouchers) {
    const left = daysBetween(today, v.expires_on!);
    const due = (v.reminder_days ?? []).filter((d) => left <= d && !done.has(`${v.id}:${d}`));
    if (due.length === 0) continue;

    if (!members.has(v.box_id)) {
      members.set(
        v.box_id,
        await query("select u.id, u.email, u.notify_push, u.notify_email from box_members m join users u on u.id = m.user_id where m.box_id = $1", [v.box_id])
      );
    }

    const amount = v.value != null ? money(Number(v.remaining_value ?? v.value), v.currency) : null;
    const when = left === 0 ? "heute" : left === 1 ? "morgen" : `in ${left} Tagen`;
    const msg: Message = {
      title: left <= 7 ? `⏰ Letzte Chance: ${v.issuer}` : `🎟️ Gutschein läuft ${when} ab`,
      body: `${amount ? amount + " bei " : "Dein Gutschein für "}${v.issuer} läuft ${when} ab${v.gifted_by ? `, ein Geschenk von ${v.gifted_by}` : ""}. Jetzt einlösen!`,
      url: `${origin}/gutschein/${v.id}`,
      tag: `voucher-${v.id}`,
    };

    for (const p of members.get(v.box_id)!) {
      if (p.notify_push) sent += await pushToUser(p.id, msg);
      if (p.notify_email) sent += (await sendEmail(p.email, msg)) ? 1 : 0;
    }
    for (const d of due) {
      await query("insert into reminder_log (voucher_id, days) values ($1, $2) on conflict do nothing", [v.id, d]);
    }
  }

  return NextResponse.json({ ok: true, checked: vouchers.length, sent });
}
