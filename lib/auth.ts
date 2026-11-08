import "server-only";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one, query, tx } from "./db";
import type { Profile } from "./types";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "vouchy_session";
const SESSION_DAYS = 180;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query("insert into sessions (token, user_id, expires_at) values ($1, $2, $3)", [token, userId, expires.toISOString()]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token = $1", [token]);
  jar.delete(SESSION_COOKIE);
}

/** Angemeldeter Nutzer oder null */
export async function currentUser(): Promise<Profile | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<Profile>(
    `select u.id, u.email, u.display_name, u.notify_push, u.notify_email, u.default_reminder_days, u.calendar_token
       from sessions s join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token]
  );
}

export async function requireUser(): Promise<Profile> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Neuer Account inkl. eigener Kiste */
export async function registerUser(email: string, password: string, name: string): Promise<string> {
  const hash = await hashPassword(password);
  return tx(async (q) => {
    const [u] = await q<{ id: string }>("insert into users (email, password_hash, display_name) values ($1, $2, $3) returning id", [email, hash, name || email.split("@")[0]]);
    const [b] = await q<{ id: string }>("insert into boxes (name, owner_id) values ('Meine Kiste', $1) returning id", [u.id]);
    await q("insert into box_members (box_id, user_id, role) values ($1, $2, 'owner')", [b.id, u.id]);
    return u.id;
  });
}

export async function isMember(boxId: string, userId: string): Promise<boolean> {
  const row = await one("select 1 from box_members where box_id = $1 and user_id = $2", [boxId, userId]);
  return Boolean(row);
}
