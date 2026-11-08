import "server-only";
import * as webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Message = { title: string; body: string; url: string; tag?: string };

let vapidReady = false;
function initVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hallo@vouchy.app", pub, priv);
  vapidReady = true;
  return true;
}

/** Schickt eine Push-Nachricht an alle Geräte eines Nutzers. Abgelaufene Abos werden entfernt. */
export async function pushToUser(admin: SupabaseClient, userId: string, msg: Message): Promise<number> {
  if (!initVapid()) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", code, err);
    }
  }
  return sent;
}

export async function sendEmail(to: string, msg: Message): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;background:#f4f1ff;border-radius:20px;color:#2b1b63">
      <p style="font-size:28px;margin:0">🎟️</p>
      <h1 style="font-size:24px;margin:8px 0">${escapeHtml(msg.title)}</h1>
      <p style="font-size:16px;line-height:1.5">${escapeHtml(msg.body)}</p>
      <a href="${msg.url}" style="display:inline-block;margin-top:12px;background:#ff4f8b;color:#fff;padding:12px 20px;border-radius:14px;font-weight:700;text-decoration:none">Gutschein ansehen</a>
      <p style="font-size:12px;color:#5d5288;margin-top:24px">Du bekommst diese Mail, weil du in Vouchy E-Mail-Erinnerungen aktiviert hast.</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Vouchy <onboarding@resend.dev>", to, subject: msg.title, html }),
  });
  if (!res.ok) console.error("email failed", res.status, await res.text());
  return res.ok;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
