"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BOX_COOKIE } from "@/lib/data";

const YEAR = 60 * 60 * 24 * 365;

export async function switchBox(boxId: string) {
  (await cookies()).set(BOX_COOKIE, boxId, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function createBox(formData: FormData) {
  const supabase = await supabaseServer();
  const name = String(formData.get("name") ?? "");
  const emoji = String(formData.get("emoji") ?? "🎁") || "🎁";
  const { data, error } = await supabase.rpc("create_box", { p_name: name, p_emoji: emoji });
  if (error) throw new Error(error.message);
  await switchBox(data as string);
}

export async function renameBox(formData: FormData) {
  const supabase = await supabaseServer();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  if (!name) return;
  await supabase.from("boxes").update({ name, ...(emoji ? { emoji } : {}) }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function leaveBox(boxId: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("box_members").delete().eq("box_id", boxId).eq("user_id", user.id);
  (await cookies()).delete(BOX_COOKIE);
  revalidatePath("/", "layout");
}

export async function removeMember(boxId: string, userId: string) {
  const supabase = await supabaseServer();
  await supabase.from("box_members").delete().eq("box_id", boxId).eq("user_id", userId);
  revalidatePath("/einstellungen");
}

export async function createInvite(boxId: string): Promise<string> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("box_invites").insert({ box_id: boxId, created_by: user?.id }).select("token").single();
  if (error) throw new Error(error.message);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return `${origin}/einladung/${data.token}`;
}

export async function updateProfile(patch: { display_name?: string; notify_push?: boolean; notify_email?: boolean; default_reminder_days?: number[] }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update(patch).eq("id", user.id);
  revalidatePath("/einstellungen");
}
