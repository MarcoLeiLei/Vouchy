import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { VoucherForm } from "@/components/voucher-form";
import type { Voucher } from "@/lib/types";

export default async function EditVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: voucher } = await supabase.from("vouchers").select("*").eq("id", id).single<Voucher>();
  if (!voucher) notFound();
  let photoUrl: string | null = null;
  if (voucher.photo_path) {
    const { data } = await supabase.storage.from("voucher-photos").createSignedUrl(voucher.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }
  return <VoucherForm boxId={voucher.box_id} voucher={voucher} photoUrl={photoUrl} />;
}
