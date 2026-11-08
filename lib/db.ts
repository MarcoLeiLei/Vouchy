import "server-only";
import pg from "pg";

// Typen so parsen, dass sie direkt in der App nutzbar sind
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric → number
pg.types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD"
pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())); // timestamptz → ISO
pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (count) → number

/**
 * Passende Verbindungs-URL wählen.
 * - Neon: direkte (ungepoolte) URL bevorzugen, damit Transaktionen sicher funktionieren.
 * - Supabase: Die direkte Adresse (db.<ref>.supabase.co) ist von Vercel aus oft nicht erreichbar (nur IPv6).
 *   Stattdessen den Supabase-Pooler im Session-Modus (Port 5432) nutzen – der unterstützt Transaktionen.
 */
function pickDatabaseUrl(): string {
  const env = process.env;
  const pooled = env.DATABASE_URL || env.POSTGRES_URL || "";
  const direct = env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || "";
  const isSupabase = /supabase\.(co|com)/.test(pooled + direct);

  if (isSupabase) {
    for (const candidate of [direct, pooled]) {
      if (!candidate) continue;
      const u = new URL(candidate);
      if (u.hostname.includes("pooler.supabase.com")) {
        u.port = "5432"; // Session-Modus statt Transaction-Modus (6543)
        return u.toString();
      }
    }
    return direct || pooled;
  }
  return direct || pooled;
}

export const databaseUrl = pickDatabaseUrl();

const globalForPg = globalThis as unknown as { vouchyPool?: pg.Pool; vouchySchema?: Promise<void> };

function pool(): pg.Pool {
  if (!databaseUrl) throw new Error("Keine Datenbank verbunden (DATABASE_URL fehlt).");
  if (!globalForPg.vouchyPool) {
    const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
    // SSL-Parameter aus der URL entfernen: pg würde "sslmode=require" sonst als strenge
    // Zertifikatsprüfung auslegen, die mit der Zertifikatskette von Neon fehlschlägt.
    // Die Verbindung bleibt verschlüsselt (ssl unten).
    const url = new URL(databaseUrl);
    ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "channel_binding"].forEach((p) => url.searchParams.delete(p));
    globalForPg.vouchyPool = new pg.Pool({
      connectionString: url.toString(),
      max: 3,
      ssl: local ? false : { rejectUnauthorized: false },
    });
    // Alle Vouchy-Tabellen liegen im eigenen Schema "vouchy" – so gibt es keine
    // Überschneidung mit Tabellen, die schon in der Datenbank existieren.
  }
  return globalForPg.vouchyPool;
}

/** Legt beim ersten Aufruf alle Tabellen an. Kein SQL-Editor nötig. */
function ensureSchema(): Promise<void> {
  if (!globalForPg.vouchySchema) {
    globalForPg.vouchySchema = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        globalForPg.vouchySchema = undefined;
        throw e;
      });
  }
  return globalForPg.vouchySchema;
}

type Prepared = pg.PoolClient & { vouchyReady?: boolean };

/** Verbindung holen und einmalig auf das Schema "vouchy" einstellen */
async function getClient(): Promise<Prepared> {
  const client = (await pool().connect()) as Prepared;
  if (!client.vouchyReady) {
    await client.query("set search_path to vouchy, public");
    client.vouchyReady = true;
  }
  return client;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const client = await getClient();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Mehrere Statements in einer Transaktion */
export async function tx<T>(fn: (q: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getClient();
  try {
    await client.query("begin");
    const result = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
begin;
select pg_advisory_xact_lock(771234);
create schema if not exists vouchy;
set local search_path to vouchy, public;
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  notify_push boolean not null default true,
  notify_email boolean not null default true,
  default_reminder_days int[] not null default '{90,30,7}',
  calendar_token text not null unique default md5(random()::text || clock_timestamp()::text),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null
);

create table if not exists boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Meine Kiste',
  emoji text not null default '🎁',
  owner_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists box_members (
  box_id uuid not null references boxes on delete cascade,
  user_id uuid not null references users on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (box_id, user_id)
);

create table if not exists box_invites (
  token text primary key,
  box_id uuid not null references boxes on delete cascade,
  created_by uuid references users on delete set null,
  expires_at timestamptz not null default now() + interval '14 days'
);

create table if not exists vouchers (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes on delete cascade,
  created_by uuid references users on delete set null,
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
  received_on date,
  gifted_by text,
  occasion text,
  website text,
  address text,
  phone text,
  conditions text,
  notes text,
  has_photo boolean not null default false,
  status text not null default 'open',
  redeemed_at timestamptz,
  reminder_days int[] not null default '{90,30,7}',
  thanked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vouchers_box_idx on vouchers (box_id);

create table if not exists voucher_photos (
  voucher_id uuid primary key references vouchers on delete cascade,
  mime text not null default 'image/jpeg',
  data bytea not null
);

create table if not exists voucher_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers on delete cascade,
  box_id uuid not null references boxes on delete cascade,
  user_id uuid references users on delete set null,
  type text not null,
  amount numeric(10, 2),
  days_left int,
  created_at timestamptz not null default now()
);
create index if not exists voucher_events_box_idx on voucher_events (box_id);

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists reminder_log (
  voucher_id uuid not null references vouchers on delete cascade,
  days int not null,
  sent_at timestamptz not null default now(),
  primary key (voucher_id, days)
);

create table if not exists app_settings (
  key text primary key,
  value text not null
);

-- Sperrt den Zugriff über öffentliche Datenschnittstellen (z. B. die Supabase-API).
-- Die App selbst verbindet sich als Eigentümer der Tabellen und ist davon nicht betroffen.
alter table users enable row level security;
alter table sessions enable row level security;
alter table boxes enable row level security;
alter table box_members enable row level security;
alter table box_invites enable row level security;
alter table vouchers enable row level security;
alter table voucher_photos enable row level security;
alter table voucher_events enable row level security;
alter table push_subscriptions enable row level security;
alter table reminder_log enable row level security;
alter table app_settings enable row level security;
commit;
`;
