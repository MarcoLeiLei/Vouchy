-- =====================================================================
-- Vouchy – Datenbankschema
-- Einmal komplett im Supabase SQL Editor ausführen.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  notify_push boolean not null default true,
  notify_email boolean not null default false,
  default_reminder_days int[] not null default '{90,30,7}',
  calendar_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Meine Kiste',
  emoji text not null default '🎁',
  owner_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.box_members (
  box_id uuid not null references public.boxes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (box_id, user_id)
);

create table if not exists public.box_invites (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  box_id uuid not null references public.boxes on delete cascade,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  uses int not null default 0
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes on delete cascade,
  created_by uuid references auth.users on delete set null,
  issuer text not null,
  title text,
  category text not null default 'sonstiges',
  value numeric(10, 2),
  remaining_value numeric(10, 2),
  currency text not null default 'EUR',
  code text,
  pin text,
  reference text,
  expires_on date,
  expiry_estimated boolean not null default false,
  received_on date default current_date,
  gifted_by text,
  occasion text,
  website text,
  address text,
  phone text,
  conditions text,
  notes text,
  photo_path text,
  status text not null default 'open' check (status in ('open', 'redeemed', 'archived')),
  redeemed_at timestamptz,
  reminder_days int[] not null default '{90,30,7}',
  thanked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vouchers_box_idx on public.vouchers (box_id);
create index if not exists vouchers_expiry_idx on public.vouchers (expires_on) where status = 'open';

create table if not exists public.voucher_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers on delete cascade,
  box_id uuid not null references public.boxes on delete cascade,
  user_id uuid references auth.users on delete set null,
  type text not null check (type in ('redeemed', 'partial', 'thanked')),
  amount numeric(10, 2),
  days_left int,
  created_at timestamptz not null default now()
);
create index if not exists voucher_events_box_idx on public.voucher_events (box_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.reminder_log (
  voucher_id uuid not null references public.vouchers on delete cascade,
  days int not null,
  sent_at timestamptz not null default now(),
  primary key (voucher_id, days)
);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------

create or replace function public.is_box_member(b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.box_members where box_id = b and user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vouchers_touch on public.vouchers;
create trigger vouchers_touch before update on public.vouchers
  for each row execute function public.touch_updated_at();

-- Ablaufdatum geändert → Erinnerungen neu planen
create or replace function public.reset_reminders()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.expires_on is distinct from old.expires_on or new.reminder_days is distinct from old.reminder_days then
    delete from public.reminder_log where voucher_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists vouchers_reset_reminders on public.vouchers;
create trigger vouchers_reset_reminders after update on public.vouchers
  for each row execute function public.reset_reminders();

-- Neuer Account → Profil + eigene Kiste
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_box uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.boxes (name, owner_id) values ('Meine Kiste', new.id) returning id into new_box;
  insert into public.box_members (box_id, user_id, role) values (new_box, new.id, 'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Neue Kiste anlegen
create or replace function public.create_box(p_name text, p_emoji text default '🎁')
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  new_box uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.boxes (name, emoji, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Neue Kiste'), coalesce(p_emoji, '🎁'), auth.uid())
  returning id into new_box;
  insert into public.box_members (box_id, user_id, role) values (new_box, auth.uid(), 'owner');
  return new_box;
end $$;

-- Einladung annehmen
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  inv public.box_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from public.box_invites where token = p_token;
  if not found or inv.expires_at < now() then
    raise exception 'invite_invalid';
  end if;
  insert into public.box_members (box_id, user_id, role)
  values (inv.box_id, auth.uid(), 'member')
  on conflict do nothing;
  update public.box_invites set uses = uses + 1 where token = p_token;
  return inv.box_id;
end $$;

-- Infos zu einer Einladung (für die Beitrittsseite, ohne Mitgliedschaft lesbar)
create or replace function public.invite_info(p_token text)
returns table (box_name text, box_emoji text, inviter text, valid boolean)
language sql stable security definer set search_path = public
as $$
  select b.name, b.emoji, p.display_name, i.expires_at > now()
  from public.box_invites i
  join public.boxes b on b.id = i.box_id
  left join public.profiles p on p.id = i.created_by
  where i.token = p_token;
$$;

-- Gutschein (teilweise) einlösen
create or replace function public.redeem_voucher(p_voucher uuid, p_amount numeric default null)
returns public.vouchers
language plpgsql security invoker set search_path = public
as $$
declare
  v public.vouchers;
  amt numeric;
  left_days int;
begin
  select * into v from public.vouchers where id = p_voucher for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status <> 'open' then raise exception 'voucher_not_open'; end if;

  left_days := case when v.expires_on is null then null else v.expires_on - current_date end;

  if p_amount is null or v.remaining_value is null or p_amount >= v.remaining_value then
    amt := coalesce(v.remaining_value, v.value, 0);
    update public.vouchers
      set status = 'redeemed',
          remaining_value = case when remaining_value is null then null else 0 end,
          redeemed_at = now()
      where id = p_voucher
      returning * into v;
    insert into public.voucher_events (voucher_id, box_id, user_id, type, amount, days_left)
    values (p_voucher, v.box_id, auth.uid(), 'redeemed', amt, left_days);
  else
    if p_amount <= 0 then raise exception 'invalid_amount'; end if;
    update public.vouchers
      set remaining_value = remaining_value - p_amount
      where id = p_voucher
      returning * into v;
    insert into public.voucher_events (voucher_id, box_id, user_id, type, amount, days_left)
    values (p_voucher, v.box_id, auth.uid(), 'partial', p_amount, left_days);
  end if;

  return v;
end $$;

-- Einlösung rückgängig machen (falls versehentlich getippt)
create or replace function public.reopen_voucher(p_voucher uuid)
returns public.vouchers
language plpgsql security invoker set search_path = public
as $$
declare
  v public.vouchers;
  last_ev public.voucher_events;
begin
  select * into v from public.vouchers where id = p_voucher for update;
  if not found then raise exception 'voucher_not_found'; end if;

  select * into last_ev from public.voucher_events
    where voucher_id = p_voucher and type in ('redeemed', 'partial')
    order by created_at desc limit 1;

  if found then
    update public.vouchers
      set status = 'open',
          redeemed_at = null,
          remaining_value = case when remaining_value is null then null
                                 else least(coalesce(value, remaining_value + coalesce(last_ev.amount, 0)),
                                            remaining_value + coalesce(last_ev.amount, 0)) end
      where id = p_voucher
      returning * into v;
    delete from public.voucher_events where id = last_ev.id;
  else
    update public.vouchers set status = 'open', redeemed_at = null where id = p_voucher returning * into v;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.boxes enable row level security;
alter table public.box_members enable row level security;
alter table public.box_invites enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;

-- profiles: eigenes Profil + Profile von Mitgliedern gemeinsamer Kisten
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.box_members m
    where m.user_id = profiles.id and public.is_box_member(m.box_id)
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- boxes
drop policy if exists boxes_select on public.boxes;
create policy boxes_select on public.boxes for select using (public.is_box_member(id));
drop policy if exists boxes_update on public.boxes;
create policy boxes_update on public.boxes for update using (public.is_box_member(id)) with check (public.is_box_member(id));
drop policy if exists boxes_delete on public.boxes;
create policy boxes_delete on public.boxes for delete using (owner_id = auth.uid());

-- box_members: sehen, wer mit drin ist; selbst austreten oder als Owner entfernen
drop policy if exists members_select on public.box_members;
create policy members_select on public.box_members for select using (public.is_box_member(box_id));
drop policy if exists members_delete on public.box_members;
create policy members_delete on public.box_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.boxes b where b.id = box_id and b.owner_id = auth.uid())
);

-- box_invites
drop policy if exists invites_all on public.box_invites;
create policy invites_all on public.box_invites for all
  using (public.is_box_member(box_id)) with check (public.is_box_member(box_id));

-- vouchers
drop policy if exists vouchers_all on public.vouchers;
create policy vouchers_all on public.vouchers for all
  using (public.is_box_member(box_id)) with check (public.is_box_member(box_id));

-- voucher_events
drop policy if exists events_select on public.voucher_events;
create policy events_select on public.voucher_events for select using (public.is_box_member(box_id));
drop policy if exists events_insert on public.voucher_events;
create policy events_insert on public.voucher_events for insert with check (public.is_box_member(box_id));
drop policy if exists events_delete on public.voucher_events;
create policy events_delete on public.voucher_events for delete using (public.is_box_member(box_id));

-- push_subscriptions: nur eigene
drop policy if exists push_all on public.push_subscriptions;
create policy push_all on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reminder_log: nur Server (Service Role) – keine Policies

-- ---------------------------------------------------------------------
-- Storage für Gutschein-Fotos (privat, Pfad: <box_id>/<voucher_id>.jpg)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('voucher-photos', 'voucher-photos', false)
on conflict (id) do nothing;

drop policy if exists "voucher photos select" on storage.objects;
create policy "voucher photos select" on storage.objects for select using (
  bucket_id = 'voucher-photos' and public.is_box_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "voucher photos insert" on storage.objects;
create policy "voucher photos insert" on storage.objects for insert with check (
  bucket_id = 'voucher-photos' and public.is_box_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "voucher photos update" on storage.objects;
create policy "voucher photos update" on storage.objects for update using (
  bucket_id = 'voucher-photos' and public.is_box_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "voucher photos delete" on storage.objects;
create policy "voucher photos delete" on storage.objects for delete using (
  bucket_id = 'voucher-photos' and public.is_box_member(((storage.foldername(name))[1])::uuid)
);
