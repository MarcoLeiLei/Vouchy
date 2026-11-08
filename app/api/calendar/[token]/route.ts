import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calendar, voucherEvent } from "@/lib/ics";
import type { Voucher } from "@/lib/types";

/** Kalender-Abo: alle offenen Gutscheine aller Kisten des Nutzers, aktualisiert sich automatisch. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("id").eq("calendar_token", clean).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Unbekannter Kalender" }, { status: 404 });

  const { data: memberships } = await admin.from("box_members").select("box_id").eq("user_id", profile.id);
  const boxIds = (memberships ?? []).map((m) => m.box_id);
  const { data: vouchers } = boxIds.length
    ? await admin.from("vouchers").select("*").in("box_id", boxIds).eq("status", "open").not("expires_on", "is", null).returns<Voucher[]>()
    : { data: [] as Voucher[] };

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const body = calendar((vouchers ?? []).map((v) => voucherEvent(v, origin)));
  return new NextResponse(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
