import { getContext } from "@/lib/data";
import { VoucherForm } from "@/components/voucher-form";

export default async function NewVoucherPage() {
  const { activeBox, profile } = await getContext();
  if (!activeBox) return null;
  return <VoucherForm boxId={activeBox.id} defaultReminderDays={profile?.default_reminder_days ?? [90, 30, 7]} />;
}
