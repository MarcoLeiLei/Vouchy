import { NextResponse, type NextRequest } from "next/server";
import { one, query } from "@/lib/db";
import { calendar, voucherEvent } from "@/lib/ics";
import type { Voucher } from "@/lib/types";

/** Kalender-Abo: alle offenen Gutscheine aller Kisten des Nutzers, aktualisiert sich automatisch. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await one<{ id: string }>("select id from users where calendar_token = $1", [token.replace(/\.ics$/, "")]);
  if (!user) return NextResponse.json({ error: "Unbekannter Kalender" }, { status: 404 });
  const vouchers = await query<Voucher>(
    `select v.* from vouchers v join box_members m on m.box_id = v.box_id
      where m.user_id = $1 and v.status = 'open' and v.expires_on is not null`,
    [user.id]
  );
  const body = calendar(vouchers.map((v) => voucherEvent(v, new URL(request.url).origin)));
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}
