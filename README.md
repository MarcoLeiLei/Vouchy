# 🎟️ Vouchy

**Kein Gutschein verfällt mehr.** Gutschein fotografieren, die KI liest alles aus, und Vouchy erinnert dich rechtzeitig per Push, Kalender oder E-Mail.

## Was das MVP kann

- **Accounts** mit E-Mail und Passwort. Jeder Account hat eine eigene **Gutscheinkiste**.
- **Kisten teilen** per Einladungslink. Ein Haushalt sieht dann dieselben Gutscheine, und alle bekommen die Erinnerungen.
- **Foto → KI:** Claude liest Aussteller, Wert, Code, PIN, Referenz, Ablaufdatum, „Geschenkt von“, Website, Adresse und Hinweise aus. Alles bleibt vor dem Speichern editierbar.
- **Kein Datum aufgedruckt?** Vouchy schätzt die gesetzliche Frist (3 Jahre ab Jahresende) und markiert das Datum als geschätzt.
- **Erinnerungen** frei wählbar (180/90/30/14/7/1 Tage vorher) über
  - Push-Nachrichten (Web-Push, auf dem iPhone ab iOS 16.4 nach „Zum Home-Bildschirm“),
  - Kalender: einzelner Gutschein als `.ics` oder **Kalender-Abo**, das sich selbst aktualisiert,
  - E-Mail (optional über Resend).
- **Kassenmodus:** Code groß, mit QR-Code. Der Bildschirm bleibt an.
- **Teil-Einlösung** mit Restwert, Einlösung rückgängig machen.
- **Gamification:** „Gerettet“-Zähler, 6 Level, 9 Abzeichen, Konfetti und ein Danke-Button, der dem Schenker per WhatsApp schreibt.

**Technik:** Next.js 16 (App Router), Tailwind 4, Supabase (Auth, Postgres mit Row Level Security, Storage), Claude API, Web-Push, Vercel Cron.

---

## Einrichtung (ca. 20 Minuten)

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren und **New project** anlegen. Region: Frankfurt (eu-central-1).
2. Links auf **SQL Editor** → **New query**, den kompletten Inhalt von [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) einfügen und **Run** klicken. Damit entstehen Tabellen, Sicherheitsregeln und der Foto-Speicher.
3. **Authentication → Sign In / Providers → Email:** Fürs MVP *Confirm email* ausschalten. Neue Nutzer können dann sofort loslegen. Alternativ eingeschaltet lassen: Dann bekommen sie eine Bestätigungsmail, aber der eingebaute Mailversand von Supabase schafft nur wenige Mails pro Stunde.
4. **Authentication → URL Configuration:** Bei *Site URL* deine Vercel-Adresse eintragen, z. B. `https://vouchy.vercel.app`.
5. **Project Settings → API Keys:** Die drei Werte notieren:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable/anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Secret/service_role key → `SUPABASE_SERVICE_ROLE_KEY` (**geheim halten!**)

### 2. Claude API Key

Das Claude-Abo (Pro/Max) und die API werden **getrennt** abgerechnet.

1. Auf [console.anthropic.com](https://console.anthropic.com) einloggen. Das geht mit derselben E-Mail.
2. **Billing:** 5–10 $ Guthaben aufladen. Ein ausgelesener Gutschein kostet mit dem Standardmodell weniger als einen Cent.
3. **API Keys → Create Key** → `ANTHROPIC_API_KEY`.

### 3. Push-Schlüssel erzeugen

Lokal im Projektordner:

```bash
npm install
npm run vapid
```

Die zwei ausgegebenen Zeilen sind `NEXT_PUBLIC_VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY`.

### 4. Bei Vercel deployen

1. Auf [vercel.com](https://vercel.com) **Add New → Project** → dieses GitHub-Repo importieren.
2. Unter **Environment Variables** alle Werte aus [`.env.example`](.env.example) eintragen:

| Variable | Pflicht | Woher |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase, Schritt 1.5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase, Schritt 1.5 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase, Schritt 1.5 |
| `ANTHROPIC_API_KEY` | ✅ | Schritt 2 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | für Push | Schritt 3 |
| `VAPID_PRIVATE_KEY` | für Push | Schritt 3 |
| `VAPID_SUBJECT` | für Push | `mailto:deine@mail.de` |
| `CRON_SECRET` | empfohlen | beliebiger langer Zufallswert, z. B. von `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | empfohlen | deine Vercel-Adresse, z. B. `https://vouchy.vercel.app` |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | [resend.com](https://resend.com), siehe unten |
| `ANTHROPIC_MODEL` | optional | Standard: `claude-haiku-5-5`. Für knifflige Fotos `claude-sonnet-5-5` |

3. **Deploy.** Fehlt noch etwas, zeigt die App unter `/setup` eine Checkliste.

Der tägliche Erinnerungs-Job ist in [`vercel.json`](vercel.json) eingetragen und läuft jeden Morgen um 7:00 UTC. Vercel richtet ihn automatisch ein.

### 5. Aufs Handy holen

- **iPhone:** Seite in Safari öffnen → Teilen → **Zum Home-Bildschirm**. Danach Vouchy vom Home-Bildschirm starten und unter *Einstellungen → Erinnerungen* Push einschalten.
- **Android:** In Chrome öffnen → Menü → **App installieren**.

### E-Mail (optional)

Mit einem kostenlosen [Resend](https://resend.com)-Konto bekommst du einen API-Key. Ohne eigene Domain darf der Absender `onboarding@resend.dev` nur an die eigene Resend-Adresse schicken. Für Freunde und Bekannte brauchst du eine verifizierte Domain bei Resend.

---

## Lokal entwickeln

```bash
cp .env.example .env.local   # Werte eintragen
npm install
npm run dev
```

## Projektstruktur

```
app/(app)/           Seiten mit Navigation: Kiste, Neu, Gutschein, Erfolge, Einstellungen
app/api/extract      Foto → Claude → strukturierte Daten
app/api/cron         täglicher Erinnerungs-Job
app/api/calendar     Kalender-Abo (.ics-Feed pro Nutzer)
lib/                 Datenlogik, Gamification, iCal, Push/Mail
supabase/migrations  Datenbankschema inkl. Row Level Security
public/sw.js         Service Worker für Push
```

## Ideen für danach

- Standort-Hinweis „Du bist gerade bei der Therme, da hast du noch 50 €“ (braucht native App oder Geofencing)
- Mehrere Fotos pro Gutschein (Vorder- und Rückseite)
- Passwort-vergessen-Flow und Login per Magic Link
- Wallet-Pass (Apple/Google) für den Kassenmodus
