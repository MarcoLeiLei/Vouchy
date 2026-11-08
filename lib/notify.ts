import "server-only";
import * as webpush from "web-push";
import nodemailer from "nodemailer";
import { one, query } from "./db";

export type Message = { title: string; body: string; url: string; tag?: string };

/** VAPID-Schlüssel: aus Umgebungsvariablen oder beim ersten Mal automatisch erzeugt und gespeichert */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const envPub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };

  const stored = await one<{ value: string }>("select value from app_settings where key = 'vapid'");
  if (stored) return JSON.parse(stored.value);
  const keys = webpush.generateVAPIDKeys();
  await query("insert into app_settings (key, value) values ('vapid', $1) on conflict (key) do nothing", [JSON.stringify(keys)]);
  const winner = await one<{ value: string }>("select value from app_settings where key = 'vapid'");
  return JSON.parse(winner!.value);
}

/** Schickt eine Push-Nachricht an alle Geräte eines Nutzers. Abgelaufene Abos werden entfernt. */
export async function pushToUser(userId: string, msg: Message): Promise<number> {
  const subs = await query<{ endpoint: string; p256dh: string; auth: string }>("select * from push_subscriptions where user_id = $1", [userId]);
  if (subs.length === 0) return 0;
  const keys = await vapidKeys();
  const options = {
    TTL: 60 * 60 * 24,
    vapidDetails: { subject: process.env.VAPID_SUBJECT || "mailto:hallo@vouchy.app", publicKey: keys.publicKey, privateKey: keys.privateKey },
  };
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), options);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await query("delete from push_subscriptions where endpoint = $1", [s.endpoint]);
      else console.error("push failed", code, err);
    }
  }
  return sent;
}

export const emailEnabled = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

/** E-Mail über ein Gmail-Konto (App-Passwort). Ohne Konfiguration passiert einfach nichts. */
export async function sendEmail(to: string, msg: Message): Promise<boolean> {
  if (!emailEnabled()) return false;
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, "") },
  });
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;background:#f4f1ff;border-radius:20px;color:#2b1b63">
      <p style="font-size:28px;margin:0">🎟️</p>
      <h1 style="font-size:24px;margin:8px 0">${escapeHtml(msg.title)}</h1>
      <p style="font-size:16px;line-height:1.5">${escapeHtml(msg.body)}</p>
      <a href="${msg.url}" style="display:inline-block;margin-top:12px;background:#ff4f8b;color:#fff;padding:12px 20px;border-radius:14px;font-weight:700;text-decoration:none">Gutschein ansehen</a>
      <p style="font-size:12px;color:#5d5288;margin-top:24px">Du bekommst diese Mail, weil E-Mail-Erinnerungen in Vouchy aktiv sind. Abschalten unter Einstellungen.</p>
    </div>`;
  try {
    await transport.sendMail({ from: `Vouchy <${process.env.GMAIL_USER}>`, to, subject: msg.title, text: `${msg.body}\n\n${msg.url}`, html });
    return true;
  } catch (err) {
    console.error("email failed", err);
    return false;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Öffentliche Adresse der App, auch im Cron-Job ohne Request */
export function appOrigin(fallback?: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return fallback ?? "";
}
