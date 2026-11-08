import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getVoucher } from "@/lib/data";
import { VoucherForm } from "@/components/voucher-form";

export default async function EditVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const voucher = await getVoucher(id, user.id);
  if (!voucher) notFound();
  const photoUrl = voucher.has_photo ? `/api/photo/${voucher.id}?v=${encodeURIComponent(voucher.updated_at)}` : null;
  return <VoucherForm boxId={voucher.box_id} voucher={voucher} photoUrl={photoUrl} />;
}
