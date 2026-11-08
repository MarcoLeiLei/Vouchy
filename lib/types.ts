export type VoucherStatus = "open" | "redeemed" | "archived";

export type Voucher = {
  id: string;
  box_id: string;
  created_by: string | null;
  issuer: string;
  title: string | null;
  category: string;
  value: number | null;
  remaining_value: number | null;
  currency: string;
  code: string | null;
  pin: string | null;
  reference: string | null;
  expires_on: string | null;
  expiry_estimated: boolean;
  received_on: string | null;
  gifted_by: string | null;
  occasion: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  conditions: string | null;
  notes: string | null;
  photo_path: string | null;
  status: VoucherStatus;
  redeemed_at: string | null;
  reminder_days: number[];
  thanked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VoucherEvent = {
  id: string;
  voucher_id: string;
  box_id: string;
  user_id: string | null;
  type: "redeemed" | "partial" | "thanked";
  amount: number | null;
  days_left: number | null;
  created_at: string;
};

export type Box = {
  id: string;
  name: string;
  emoji: string;
  owner_id: string;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  notify_push: boolean;
  notify_email: boolean;
  default_reminder_days: number[];
  calendar_token: string;
};

/** Was die KI aus einem Foto ausliest */
export type Extraction = {
  issuer: string | null;
  title: string | null;
  category: string | null;
  value: number | null;
  currency: string | null;
  code: string | null;
  pin: string | null;
  reference: string | null;
  expires_on: string | null;
  issued_on: string | null;
  gifted_by: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  conditions: string | null;
  is_voucher: boolean;
};
