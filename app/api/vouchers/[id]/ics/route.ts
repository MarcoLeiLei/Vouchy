import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { calendar, voucherEvent } from "@/lib/ics";
import type { Voucher } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: v } = await supabase.from("vouchers").select("*").eq("id", id).single<Voucher>();
  if (!v || !v.expires_on) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const body = calendar([voucherEvent(v, origin)], `Gutschein ${v.issuer}`);
  const slug = v.issuer.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="gutschein-${slug}.ics"`,
    },
  });
}
