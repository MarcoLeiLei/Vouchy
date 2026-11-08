"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, PenLine, X } from "lucide-react";
import { saveVoucher, type VoucherInput } from "@/lib/actions";
import { compressImage } from "@/lib/image";
import { CATEGORIES, REMINDER_OPTIONS, dateLabel, estimatedExpiry, todayISO } from "@/lib/vouchers";
import type { Extraction, Voucher } from "@/lib/types";
import { Mascot } from "./mascot";

type FormState = {
  issuer: string;
  title: string;
  category: string;
  value: string;
  remaining_value: string;
  currency: string;
  code: string;
  pin: string;
  reference: string;
  expires_on: string;
  no_date: boolean;
  received_on: string;
  gifted_by: string;
  occasion: string;
  website: string;
  address: string;
  phone: string;
  conditions: string;
  notes: string;
  reminder_days: number[];
};

const OCCASIONS = ["Geburtstag", "Weihnachten", "Hochzeit", "Geburt", "Jubiläum", "Einfach so"];

function fromVoucher(v: Voucher | null, defaults: number[]): FormState {
  return {
    issuer: v?.issuer ?? "",
    title: v?.title ?? "",
    category: v?.category ?? "sonstiges",
    value: v?.value != null ? String(v.value) : "",
    remaining_value: v?.remaining_value != null ? String(v.remaining_value) : "",
    currency: v?.currency ?? "EUR",
    code: v?.code ?? "",
    pin: v?.pin ?? "",
    reference: v?.reference ?? "",
    expires_on: v && !v.expiry_estimated ? (v.expires_on ?? "") : "",
    no_date: v ? v.expiry_estimated || !v.expires_on : false,
    received_on: v?.received_on ?? todayISO(),
    gifted_by: v?.gifted_by ?? "",
    occasion: v?.occasion ?? "",
    website: v?.website ?? "",
    address: v?.address ?? "",
    phone: v?.phone ?? "",
    conditions: v?.conditions ?? "",
    notes: v?.notes ?? "",
    reminder_days: v?.reminder_days ?? defaults,
  };
}

export function VoucherForm({
  boxId,
  voucher = null,
  defaultReminderDays = [90, 30, 7],
  photoUrl = null,
}: {
  boxId: string;
  voucher?: Voucher | null;
  defaultReminderDays?: number[];
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(voucher);
  const [step, setStep] = useState<"capture" | "reading" | "form">(isEdit ? "form" : "capture");
  const [form, setForm] = useState<FormState>(() => fromVoucher(voucher, defaultReminderDays));
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => setForm((f) => ({ ...f, [key]: val }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const img = await compressImage(file);
      setPhoto({ blob: img.blob, url: img.url });
      if (isEdit) return; // beim Bearbeiten nur Foto austauschen
      setStep("reading");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 58_000);
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: img.base64, mediaType: "image/jpeg" }),
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { data?: Extraction; error?: string };
        if (!res.ok || !json.data) {
          setAiNote(json.error ?? "Das Auslesen hat nicht geklappt. Trag die Daten einfach selbst ein. Das Foto wird trotzdem gespeichert.");
        } else {
          applyExtraction(json.data);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      setAiNote(
        e instanceof Error && e.name === "AbortError"
          ? "Das Auslesen dauert gerade zu lange. Trag die Daten einfach selbst ein. Das Foto wird trotzdem gespeichert."
          : "Das Foto konnte nicht gelesen werden. Trag die Daten einfach selbst ein."
      );
    }
    setStep("form");
  }

  function applyExtraction(x: Extraction) {
    const found = new Set<string>();
    setForm((f) => {
      const next = { ...f };
      const take = (key: keyof FormState, val: string | null | undefined) => {
        if (val !== null && val !== undefined && String(val).trim() !== "") {
          (next as Record<string, unknown>)[key] = String(val);
          found.add(key);
        }
      };
      take("issuer", x.issuer);
      take("title", x.title);
      if (x.category) take("category", x.category);
      if (x.value != null) take("value", String(x.value));
      take("currency", x.currency?.toUpperCase());
      take("code", x.code);
      take("pin", x.pin);
      take("reference", x.reference);
      take("gifted_by", x.gifted_by);
      take("website", x.website);
      take("address", x.address);
      take("phone", x.phone);
      take("conditions", x.conditions);
      if (x.issued_on) take("received_on", x.issued_on);
      if (x.expires_on) {
        take("expires_on", x.expires_on);
        next.no_date = false;
      } else {
        next.no_date = true;
      }
      return next;
    });
    setAiFields(found);
    if (!x.is_voucher) setAiNote("Hm, das sieht nicht nach einem Gutschein aus. Prüf die Felder lieber genau.");
    else setAiNote(found.size > 0 ? `Vouchy hat ${found.size} Felder erkannt. Kurz prüfen, dann speichern.` : "Vouchy konnte nichts lesen. Trag die Daten einfach selbst ein.");
  }

  const estimate = useMemo(() => estimatedExpiry(form.received_on), [form.received_on]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    const input: VoucherInput = {
      issuer: form.issuer.trim(),
      title: clean(form.title),
      category: form.category,
      value: num(form.value),
      remaining_value: isEdit ? num(form.remaining_value) : null,
      currency: form.currency || "EUR",
      code: clean(form.code),
      pin: clean(form.pin),
      reference: clean(form.reference),
      expires_on: form.no_date ? null : clean(form.expires_on),
      no_date: form.no_date,
      received_on: clean(form.received_on),
      gifted_by: clean(form.gifted_by),
      occasion: clean(form.occasion),
      website: clean(form.website),
      address: clean(form.address),
      phone: clean(form.phone),
      conditions: clean(form.conditions),
      notes: clean(form.notes),
      reminder_days: form.reminder_days,
    };
    const fd = new FormData();
    fd.set("data", JSON.stringify(input));
    fd.set("box_id", boxId);
    if (voucher) fd.set("id", voucher.id);
    if (photo) fd.set("photo", photo.blob, "gutschein.jpg");

    try {
      const res = await saveVoucher(fd);
      if (res.error || !res.id) {
        setError(res.error ?? "Speichern hat nicht geklappt.");
        setSaving(false);
        return;
      }
      router.push(`/gutschein/${res.id}${isEdit ? "" : "?neu=1"}`);
    } catch {
      setError("Speichern hat nicht geklappt. Ist das Foto vielleicht zu groß?");
      setSaving(false);
    }
  }

  if (step === "capture") {
    return (
      <div>
        <h1 className="display text-[44px]">Neuer Gutschein</h1>
        <p className="mt-2 text-ink-soft">Leg den Gutschein flach hin, gutes Licht, alles im Bild. Vouchy liest den Rest.</p>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button
          onClick={() => cameraRef.current?.click()}
          className="press mt-8 w-full ticket-shadow"
        >
          <span className="ticket ticket-big bg-pink text-white">
            <span className="flex flex-col items-center justify-center py-12">
              <Camera size={48} strokeWidth={2.2} />
              <span className="display text-3xl mt-3">Foto aufnehmen</span>
              <span className="text-white/85 mt-1">Vorder- oder Rückseite mit Code</span>
            </span>
          </span>
        </button>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={() => galleryRef.current?.click()} className="press rounded-2xl bg-white border-2 border-line py-5 font-bold flex flex-col items-center gap-2">
            <ImagePlus size={26} /> Aus Galerie
          </button>
          <button onClick={() => setStep("form")} className="press rounded-2xl bg-white border-2 border-line py-5 font-bold flex flex-col items-center gap-2">
            <PenLine size={26} /> Von Hand
          </button>
        </div>
        {error && <p className="mt-4 text-danger font-semibold">{error}</p>}
      </div>
    );
  }

  if (step === "reading") {
    return (
      <div className="text-center pt-6" role="status" aria-live="polite">
        {photo && (
          <div className="relative mx-auto w-64 h-64 rounded-3xl overflow-hidden border-4 border-white shadow-[0_4px_0_#2b1b63]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Dein Gutschein" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 h-1.5 bg-pink shadow-[0_0_24px_6px_#ff4f8b] animate-[scan_1.6s_ease-in-out_infinite]" />
          </div>
        )}
        <Mascot size={90} mood="wow" className="mx-auto mt-8 scan-wiggle" />
        <p className="display text-3xl mt-4">Vouchy liest…</p>
        <p className="text-ink-soft mt-1">Aussteller, Wert, Code, Gültigkeit</p>
        <style>{`@keyframes scan { 0%,100% { top: 4% } 50% { top: 92% } }`}</style>
      </div>
    );
  }

  const aiMark = (key: string) =>
    aiFields.has(key) ? <span className="ml-1.5 text-[11px] font-bold text-pink-deep align-middle">✨ erkannt</span> : null;

  return (
    <form onSubmit={save} className="pb-6">
      <h1 className="display text-[40px]">{isEdit ? "Gutschein bearbeiten" : "Fast fertig"}</h1>

      {(photo || photoUrl) && (
        <div className="mt-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo?.url ?? photoUrl ?? ""} alt="" className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-[0_2px_0_#2b1b63]" />
          {isEdit && (
            <label className="press cursor-pointer rounded-xl bg-white border-2 border-line px-3 py-2 text-sm font-bold">
              Foto ersetzen
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
      )}
      {isEdit && !photo && !photoUrl && (
        <label className="press mt-4 inline-flex cursor-pointer rounded-xl bg-white border-2 border-line px-3 py-2 text-sm font-bold">
          Foto hinzufügen
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}

      {aiNote && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-butter p-3">
          <Mascot size={44} mood="happy" className="shrink-0" />
          <p className="text-sm font-semibold pt-1">{aiNote}</p>
          <button type="button" onClick={() => setAiNote(null)} className="ml-auto shrink-0" aria-label="Hinweis schließen">
            <X size={18} />
          </button>
        </div>
      )}

      <Group title="Was ist es?">
        <Field label={<>Wo gilt der Gutschein?{aiMark("issuer")}</>}>
          <input className="field" value={form.issuer} onChange={(e) => set("issuer", e.target.value)} required placeholder="z. B. Therme Euskirchen" />
        </Field>
        <Field label={<>Was genau?{aiMark("title")}</>}>
          <input className="field" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. Saunatag für zwei" />
        </Field>
        <div>
          <span className="text-sm font-semibold">Kategorie{aiMark("category")}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => set("category", c.id)}
                aria-pressed={form.category === c.id}
                className={`press rounded-full px-3 py-1.5 text-sm font-semibold border-2 ${form.category === c.id ? "border-ink" : "border-transparent"}`}
                style={{ background: c.color }}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={<>Wert{aiMark("value")}</>}>
            <div className="relative">
              <input className="field pr-12" inputMode="decimal" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="50" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-soft font-semibold">{form.currency === "EUR" ? "€" : form.currency}</span>
            </div>
          </Field>
          {isEdit && (
            <Field label="Davon noch übrig">
              <input className="field" inputMode="decimal" value={form.remaining_value} onChange={(e) => set("remaining_value", e.target.value)} />
            </Field>
          )}
        </div>
      </Group>

      <Group title="Wie lange gültig?">
        {!form.no_date && (
          <Field label={<>Gültig bis{aiMark("expires_on")}</>}>
            <input className="field" type="date" value={form.expires_on} onChange={(e) => set("expires_on", e.target.value)} required={!form.no_date} />
          </Field>
        )}
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" className="w-5 h-5 accent-pink" checked={form.no_date} onChange={(e) => set("no_date", e.target.checked)} />
          Kein Datum aufgedruckt
        </label>
        <Field label={<>Erhalten am{aiMark("received_on")}</>}>
          <input className="field" type="date" value={form.received_on} onChange={(e) => set("received_on", e.target.value)} />
        </Field>
        {form.no_date && (
          <p className="rounded-xl bg-lilac p-3 text-sm">
            Ohne Datum gilt in Deutschland meist die gesetzliche Frist: 3 Jahre ab Ende des Jahres, in dem der Gutschein gekauft wurde. Vouchy rechnet deshalb mit dem <strong>{dateLabel(estimate)}</strong> und markiert das Datum als geschätzt.
          </p>
        )}
      </Group>

      <Group title="Zum Einlösen">
        <Field label={<>Gutscheincode{aiMark("code")}</>}>
          <input className="field font-semibold tracking-wide" value={form.code} onChange={(e) => set("code", e.target.value)} autoCapitalize="characters" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={<>PIN{aiMark("pin")}</>}>
            <input className="field" value={form.pin} onChange={(e) => set("pin", e.target.value)} />
          </Field>
          <Field label={<>Referenz-Nr.{aiMark("reference")}</>}>
            <input className="field" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>
        <Field label={<>Hinweise &amp; Bedingungen{aiMark("conditions")}</>}>
          <textarea className="field min-h-[72px]" value={form.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="z. B. nur Mo–Fr, vorher Termin buchen" />
        </Field>
      </Group>

      <Group title="Von wem?">
        <Field label={<>Geschenkt von{aiMark("gifted_by")}</>}>
          <input className="field" value={form.gifted_by} onChange={(e) => set("gifted_by", e.target.value)} placeholder="z. B. Oma Gerda" />
        </Field>
        <div>
          <span className="text-sm font-semibold">Anlass</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => set("occasion", form.occasion === o ? "" : o)}
                aria-pressed={form.occasion === o}
                className={`press rounded-full px-3 py-1.5 text-sm font-semibold border-2 ${form.occasion === o ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group title="Wo einlösen?">
        <Field label={<>Website{aiMark("website")}</>}>
          <input className="field" value={form.website} onChange={(e) => set("website", e.target.value)} inputMode="url" placeholder="www.…" />
        </Field>
        <Field label={<>Adresse{aiMark("address")}</>}>
          <input className="field" value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label={<>Telefon{aiMark("phone")}</>}>
          <input className="field" value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Eigene Notiz">
          <textarea className="field min-h-[72px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="z. B. Mit Sandra nach der Geburt einlösen" />
        </Field>
      </Group>

      <Group title="Wann erinnern?">
        <div className="flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map((d) => {
            const on = form.reminder_days.includes(d);
            return (
              <button
                type="button"
                key={d}
                aria-pressed={on}
                onClick={() => set("reminder_days", on ? form.reminder_days.filter((x) => x !== d) : [...form.reminder_days, d])}
                className={`press rounded-full px-3.5 py-2 text-sm font-bold border-2 ${on ? "bg-pink text-white border-pink" : "bg-white border-line text-ink-soft"}`}
              >
                {d === 1 ? "1 Tag" : `${d} Tage`} vorher
              </button>
            );
          })}
        </div>
      </Group>

      {error && <p className="mt-4 text-danger font-semibold" role="alert">{error}</p>}

      <div className="sticky bottom-24 mt-8">
        <button disabled={saving} className="press w-full rounded-2xl bg-pink text-white font-bold py-4 text-lg shadow-[0_4px_0_#2b1b63] disabled:opacity-60">
          {saving ? "Speichert…" : isEdit ? "Änderungen speichern" : "In die Kiste legen"}
        </button>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 space-y-4">
      <legend className="display text-2xl mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
