"use server";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, isMember, registerUser, requireUser, verifyPassword } from "./auth";
import { BOX_COOKIE, getVoucher } from "./data";
import { one, query, tx } from "./db";
import { estimatedExpiry, todayISO, daysBetween } from "./vouchers";


type Result = { error?: string };
const YEAR = 60 * 60 * 24 * 365;

function safeNext(n: FormDataEntryValue | null) {
  const s = String(n ?? "/");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

/* ---------------- Login ---------------- */

export async function signup(_: Result, form: FormData): Promise<Result> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!email.includes("@")) return { error: "Bitte gib eine gültige E-Mail an." };
  if (password.length < 6) return { error: "Das Passwort braucht mindestens 6 Zeichen." };
  if (await one("select 1 from users where email = $1", [email])) return { error: "Diese E-Mail hat schon ein Konto. Melde dich an." };
  const id = await registerUser(email, password, name);
  await createSession(id);
  redirect(safeNext(form.get("next")));
}

export async function login(_: Result, form: FormData): Promise<Result> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await one<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) return { error: "E-Mail oder Passwort stimmt nicht." };
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* ---------------- Gutscheine ---------------- */

export type VoucherInput = {
  issuer: string;
  title: string | null;
  category: string;
  value: number | null;
  remaining_value: number | null;
  currency: string;
  code: string | null;
  pin: string | null;
  reference: string | null;
  expires_on: string | null;
  no_date: boolean;
  received_on: string | null;
  gifted_by: string | null;
  occasion: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  conditions: string | null;
  notes: string | null;
  reminder_days: number[];
};

export async function saveVoucher(form: FormData): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const data = JSON.parse(String(form.get("data"))) as VoucherInput;
  const id = form.get("id") ? String(form.get("id")) : null;
  const boxId = String(form.get("box_id") ?? "");
  const photo = form.get("photo");

  if (!data.issuer?.trim()) return { error: "Bitte gib an, wo der Gutschein gilt." };
  const expires = data.no_date ? estimatedExpiry(data.received_on) : data.expires_on;
  if (!expires) return { error: "Bitte gib ein Ablaufdatum an oder wähle „Kein Datum aufgedruckt“." };
  const reminders = (data.reminder_days ?? []).filter((n) => Number.isInteger(n) && n > 0 && n < 1000).sort((a, b) => b - a);

  const values = [
    data.issuer.trim(), data.title, data.category || "sonstiges", data.value, data.currency || "EUR",
    data.code, data.pin, data.reference, expires, data.no_date, data.received_on, data.gifted_by, data.occasion,
    data.website, data.address, data.phone, data.conditions, data.notes, reminders,
  ];

  let voucherId: string;
  if (id) {
    const existing = await getVoucher(id, user.id);
    if (!existing) return { error: "Gutschein nicht gefunden." };
    const remaining = data.remaining_value ?? data.value;
    await query(
      `update vouchers set issuer=$1, title=$2, category=$3, value=$4, currency=$5, code=$6, pin=$7, reference=$8,
         expires_on=$9, expiry_estimated=$10, received_on=$11, gifted_by=$12, occasion=$13, website=$14, address=$15,
         phone=$16, conditions=$17, notes=$18, reminder_days=$19, remaining_value=$20, updated_at=now()
       where id=$21`,
      [...values, remaining, id]
    );
    if (existing.expires_on !== expires || String(existing.reminder_days) !== String(reminders)) {
      await query("delete from reminder_log where voucher_id = $1", [id]);
    }
    voucherId = id;
  } else {
    if (!(await isMember(boxId, user.id))) return { error: "Kiste nicht gefunden." };
    const row = await one<{ id: string }>(
      `insert into vouchers (issuer, title, category, value, currency, code, pin, reference, expires_on, expiry_estimated,
         received_on, gifted_by, occasion, website, address, phone, conditions, notes, reminder_days, remaining_value, box_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$4,$20,$21) returning id`,
      [...values, boxId, user.id]
    );
    voucherId = row!.id;
  }

  if (photo instanceof Blob && photo.size > 0) {
    const buf = Buffer.from(await photo.arrayBuffer());
    await query(
      `insert into voucher_photos (voucher_id, mime, data) values ($1, $2, $3)
       on conflict (voucher_id) do update set mime = excluded.mime, data = excluded.data`,
      [voucherId, photo.type || "image/jpeg", buf]
    );
    await query("update vouchers set has_photo = true where id = $1", [voucherId]);
  }

  revalidatePath("/", "layout");
  return { id: voucherId };
}

export async function deleteVoucher(id: string): Promise<Result> {
  const user = await requireUser();
  const v = await getVoucher(id, user.id);
  if (!v) return { error: "Gutschein nicht gefunden." };
  await query("delete from vouchers where id = $1", [id]);
  revalidatePath("/", "layout");
  return {};
}

export async function redeemVoucher(id: string, amount: number | null): Promise<Result> {
  const user = await requireUser();
  const v = await getVoucher(id, user.id);
  if (!v) return { error: "Gutschein nicht gefunden." };
  if (v.status !== "open") return { error: "Der Gutschein ist schon eingelöst." };
  const daysLeft = v.expires_on ? daysBetween(todayISO(), v.expires_on) : null;

  await tx(async (q) => {
    const remaining = v.remaining_value;
    if (amount === null || remaining === null || amount >= remaining) {
      const amt = remaining ?? v.value ?? 0;
      await q("update vouchers set status='redeemed', remaining_value = case when remaining_value is null then null else 0 end, redeemed_at=now() where id=$1", [id]);
      await q("insert into voucher_events (voucher_id, box_id, user_id, type, amount, days_left) values ($1,$2,$3,'redeemed',$4,$5)", [id, v.box_id, user.id, amt, daysLeft]);
    } else {
      if (amount <= 0) throw new Error("Ungültiger Betrag");
      await q("update vouchers set remaining_value = remaining_value - $2 where id=$1", [id, amount]);
      await q("insert into voucher_events (voucher_id, box_id, user_id, type, amount, days_left) values ($1,$2,$3,'partial',$4,$5)", [id, v.box_id, user.id, amount, daysLeft]);
    }
  });
  revalidatePath("/", "layout");
  return {};
}

export async function reopenVoucher(id: string): Promise<Result> {
  const user = await requireUser();
  const v = await getVoucher(id, user.id);
  if (!v) return { error: "Gutschein nicht gefunden." };
  await tx(async (q) => {
    const [last] = await q<{ id: string; amount: number | null }>(
      "select id, amount from voucher_events where voucher_id=$1 and type in ('redeemed','partial') order by created_at desc limit 1",
      [id]
    );
    const back = last?.amount ?? 0;
    await q(
      `update vouchers set status='open', redeemed_at=null,
         remaining_value = case when remaining_value is null then null else least(coalesce(value, remaining_value + $2), remaining_value + $2) end
       where id=$1`,
      [id, back]
    );
    if (last) await q("delete from voucher_events where id=$1", [last.id]);
  });
  revalidatePath("/", "layout");
  return {};
}

export async function markThanked(id: string): Promise<Result> {
  const user = await requireUser();
  const v = await getVoucher(id, user.id);
  if (!v) return { error: "Gutschein nicht gefunden." };
  if (!v.thanked_at) {
    await query("update vouchers set thanked_at = now() where id = $1", [id]);
    await query("insert into voucher_events (voucher_id, box_id, user_id, type) values ($1,$2,$3,'thanked')", [id, v.box_id, user.id]);
  }
  revalidatePath("/", "layout");
  return {};
}

/* ---------------- Kisten & Teilen ---------------- */

export async function switchBox(boxId: string) {
  const user = await requireUser();
  if (!(await isMember(boxId, user.id))) return;
  (await cookies()).set(BOX_COOKIE, boxId, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function createBox(form: FormData) {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim() || "Neue Kiste";
  const emoji = String(form.get("emoji") ?? "").trim() || "🎁";
  const row = await one<{ id: string }>(
    `with b as (insert into boxes (name, emoji, owner_id) values ($1,$2,$3) returning id, owner_id),
          m as (insert into box_members (box_id, user_id, role) select id, owner_id, 'owner' from b)
     select id from b`,
    [name, emoji, user.id]
  );
  await switchBox(row!.id);
}

export async function renameBox(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  const emoji = String(form.get("emoji") ?? "").trim();
  if (!name || !(await isMember(id, user.id))) return;
  await query("update boxes set name=$2, emoji=coalesce(nullif($3,''), emoji) where id=$1", [id, name, emoji]);
  revalidatePath("/", "layout");
}

export async function leaveBox(boxId: string) {
  const user = await requireUser();
  await query("delete from box_members where box_id=$1 and user_id=$2 and role <> 'owner'", [boxId, user.id]);
  (await cookies()).delete(BOX_COOKIE);
  revalidatePath("/", "layout");
}

export async function removeMember(boxId: string, userId: string) {
  const user = await requireUser();
  const box = await one<{ owner_id: string }>("select owner_id from boxes where id=$1", [boxId]);
  if (box?.owner_id !== user.id || userId === user.id) return;
  await query("delete from box_members where box_id=$1 and user_id=$2", [boxId, userId]);
  revalidatePath("/einstellungen");
}

export async function createInvite(boxId: string): Promise<string> {
  const user = await requireUser();
  if (!(await isMember(boxId, user.id))) throw new Error("Keine Berechtigung");
  const token = randomBytes(12).toString("hex");
  await query("insert into box_invites (token, box_id, created_by) values ($1,$2,$3)", [token, boxId, user.id]);
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/einladung/${token}`;
}

export async function acceptInvite(token: string): Promise<Result> {
  const user = await requireUser();
  const inv = await one<{ box_id: string }>("select box_id from box_invites where token=$1 and expires_at > now()", [token]);
  if (!inv) return { error: "Der Link ist abgelaufen." };
  await query("insert into box_members (box_id, user_id, role) values ($1,$2,'member') on conflict do nothing", [inv.box_id, user.id]);
  await switchBox(inv.box_id);
  return {};
}

/* ---------------- Profil & Benachrichtigungen ---------------- */

export async function updateProfile(patch: { display_name?: string; notify_push?: boolean; notify_email?: boolean; default_reminder_days?: number[] }) {
  const user = await requireUser();
  await query(
    `update users set
       display_name = coalesce($2, display_name),
       notify_push = coalesce($3, notify_push),
       notify_email = coalesce($4, notify_email),
       default_reminder_days = coalesce($5, default_reminder_days)
     where id = $1`,
    [user.id, patch.display_name ?? null, patch.notify_push ?? null, patch.notify_email ?? null, patch.default_reminder_days ?? null]
  );
  revalidatePath("/einstellungen");
}

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  const user = await requireUser();
  await query(
    `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ($1,$2,$3,$4)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [sub.endpoint, user.id, sub.p256dh, sub.auth]
  );
  await query("update users set notify_push = true where id = $1", [user.id]);
}

export async function deletePushSubscription(endpoint: string) {
  const user = await requireUser();
  await query("delete from push_subscriptions where endpoint=$1 and user_id=$2", [endpoint, user.id]);
}

