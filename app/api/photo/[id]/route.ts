import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const photo = await one<{ mime: string; data: Buffer }>(
    `select p.mime, p.data from voucher_photos p
       join vouchers v on v.id = p.voucher_id
       join box_members m on m.box_id = v.box_id and m.user_id = $2
      where p.voucher_id = $1`,
    [id, user.id]
  );
  if (!photo) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600" },
  });
}
