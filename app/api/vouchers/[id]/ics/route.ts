import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { getVoucher } from "@/lib/data";
import { calendar, voucherEvent } from "@/lib/ics";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const v = await getVoucher(id, user.id);
  if (!v || !v.expires_on) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const body = calendar([voucherEvent(v, new URL(request.url).origin)], `Gutschein ${v.issuer}`);
  const slug = v.issuer.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="gutschein-${slug}.ics"`,
    },
  });
}
