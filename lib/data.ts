import "server-only";
import { cookies } from "next/headers";
import { requireUser } from "./auth";
import { one, query } from "./db";
import type { Box, Voucher, VoucherEvent } from "./types";

export const BOX_COOKIE = "vouchy_box";

export async function getContext() {
  const user = await requireUser();
  const boxes = await query<Box>(
    "select b.* from boxes b join box_members m on m.box_id = b.id where m.user_id = $1 order by b.created_at",
    [user.id]
  );
  const wanted = (await cookies()).get(BOX_COOKIE)?.value;
  const activeBox = boxes.find((b) => b.id === wanted) ?? boxes.find((b) => b.owner_id === user.id) ?? boxes[0] ?? null;
  return { user, profile: user, boxes, activeBox };
}

export async function getBoxData(boxId: string) {
  const [vouchers, events, count] = await Promise.all([
    query<Voucher>("select * from vouchers where box_id = $1", [boxId]),
    query<VoucherEvent>("select * from voucher_events where box_id = $1", [boxId]),
    one<{ n: number }>("select count(*) as n from box_members where box_id = $1", [boxId]),
  ]);
  return { vouchers, events, memberCount: count?.n ?? 1 };
}

/** Gutschein laden – nur wenn der Nutzer Mitglied der Kiste ist */
export async function getVoucher(id: string, userId: string): Promise<Voucher | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<Voucher>(
    "select v.* from vouchers v join box_members m on m.box_id = v.box_id and m.user_id = $2 where v.id = $1",
    [id, userId]
  );
}
