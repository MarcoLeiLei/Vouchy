# 🎟️ Vouchy

**Kein Gutschein verfällt mehr.** Gutschein fotografieren, Gemini liest alles aus, und Vouchy erinnert dich rechtzeitig per Push, Kalender oder E-Mail.

## Was das MVP kann

- **Accounts** mit E-Mail und Passwort. Jeder Account hat eine eigene **Gutscheinkiste**.
- **Kisten teilen** per Einladungslink, z. B. für einen ganzen Haushalt.
- **Foto → Gemini:** Aussteller, Wert, Code, PIN, Ablaufdatum, „Geschenkt von“, Adresse und Hinweise werden ausgelesen und bleiben vor dem Speichern editierbar.
- **Kein Datum aufgedruckt?** Vouchy schätzt die gesetzliche Frist (3 Jahre ab Jahresende).
- **Erinnerungen** frei wählbar (180/90/30/14/7/1 Tage vorher):
  - Push-Nachrichten
  - Kalender (einzeln als `.ics` oder als Kalender-Abo)
  - E-Mail über ein Gmail-Konto
- **Kassenmodus** mit QR-Code, Teil-Einlösung, Rückgängig.
- **Gamification:** Gerettet-Zähler, Level, Abzeichen, Konfetti, Danke-Button per WhatsApp.

**Technik:** Next.js 16, Tailwind 4, Postgres (Neon über Vercel), Gemini API, Web-Push, Vercel Cron. Die Tabellen legt die App beim ersten Start selbst an. Die Push-Schlüssel erzeugt sie ebenfalls selbst.

---

## Einrichtung (ca. 10 Minuten)

### 1. Gemini-Schlüssel holen (kostenlos)

1. [aistudio.google.com](https://aistudio.google.com) öffnen und mit einem Google-Konto anmelden.
2. **Get API key → Create API key**, den Schlüssel kopieren.

Keine Kreditkarte nötig. Das kostenlose Kontingent reicht für ein MVP locker.

### 2. Projekt in Vercel anlegen

1. [vercel.com](https://vercel.com) mit GitHub anmelden.
2. **Add New → Project** → dieses Repo importieren.
3. Unter **Environment Variables** eine Variable eintragen:
   - `GEMINI_API_KEY` = der Schlüssel aus Schritt 1
4. **Deploy** klicken.

### 3. Datenbank dazuklicken

1. Im Vercel-Projekt oben auf **Storage** → **Create Database** → **Neon** (Serverless Postgres) → **Continue**.
2. Den kostenlosen Plan und die Region Frankfurt wählen und bestätigen. Vercel verbindet die Datenbank automatisch.
3. **Deployments** → beim obersten Eintrag **⋯ → Redeploy**.

Fertig. Die App öffnen und ein Konto erstellen. Fehlt noch etwas, zeigt `/setup` eine Checkliste.

### Optional: E-Mail-Erinnerungen über Gmail

1. Im Google-Konto die 2-Faktor-Anmeldung aktivieren.
2. Auf [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) ein App-Passwort namens „Vouchy“ erstellen.
3. In Vercel zwei Variablen eintragen und neu deployen:
   - `GMAIL_USER` = deine Gmail-Adresse
   - `GMAIL_APP_PASSWORD` = das 16-stellige App-Passwort

### Optional: Cron absichern

`CRON_SECRET` mit einem beliebigen Zufallswert setzen. Dann kann nur Vercel den täglichen Erinnerungs-Job (7:00 UTC) auslösen.

---

## Aufs Handy

- **iPhone:** In Safari öffnen → Teilen → **Zum Home-Bildschirm**. Vouchy vom Home-Bildschirm starten und unter *Einstellungen* Push einschalten.
- **Android:** In Chrome öffnen → Menü → **App installieren**.

## Lokal entwickeln

```bash
cp .env.example .env.local   # DATABASE_URL + GEMINI_API_KEY eintragen
npm install
npm run dev
```

## Projektstruktur

```
app/(app)/           Kiste, Neu, Gutschein, Erfolge, Einstellungen
app/api/extract      Foto → Gemini → strukturierte Daten
app/api/cron         täglicher Erinnerungs-Job
app/api/calendar     Kalender-Abo pro Nutzer
lib/db.ts            Datenbank + automatisches Anlegen der Tabellen
lib/auth.ts          Login (Passwort-Hash + Session-Cookie)
lib/actions.ts       alle Server-Aktionen
lib/notify.ts        Push (Schlüssel automatisch) und Gmail
```

## Ideen für danach

- Standort-Hinweis, wenn man in der Nähe des Ladens ist
- Mehrere Fotos pro Gutschein
- Passwort vergessen
- Wallet-Pass für den Kassenmodus
