import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Box, Profile, Voucher, VoucherEvent } from "./types";

export const BOX_COOKIE = "vouchy_box";

export async function getContext() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: boxes }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.from("boxes").select("*").order("created_at").returns<Box[]>(),
  ]);

  const cookieStore = await cookies();
  const wanted = cookieStore.get(BOX_COOKIE)?.value;
  const list = boxes ?? [];
  const activeBox = list.find((b) => b.id === wanted) ?? list.find((b) => b.owner_id === user.id) ?? list[0] ?? null;

  return { supabase, user, profile: profile ?? null, boxes: list, activeBox };
}

export async function getBoxData(boxId: string) {
  const supabase = await supabaseServer();
  const [{ data: vouchers }, { data: events }, { count }] = await Promise.all([
    supabase.from("vouchers").select("*").eq("box_id", boxId).returns<Voucher[]>(),
    supabase.from("voucher_events").select("*").eq("box_id", boxId).returns<VoucherEvent[]>(),
    supabase.from("box_members").select("*", { count: "exact", head: true }).eq("box_id", boxId),
  ]);
  return { vouchers: vouchers ?? [], events: events ?? [], memberCount: count ?? 1 };
}
