"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/app/components/AdminShell";
import { adminFetch } from "@/app/lib/adminFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type EventStatus = "draft" | "published" | "archived";
interface EventRecord {
  id: string;
  image_url: string;
  name: string;
  quote: string;
  details: string;
  registration_url: string;
  starts_at: string;
  ends_at: string | null;
  sort_order: number;
  status: EventStatus;
}
type EventForm = Omit<EventRecord, "id">;

const emptyForm: EventForm = {
  image_url: "",
  name: "",
  quote: "",
  details: "",
  registration_url: "",
  starts_at: "",
  ends_at: "",
  sort_order: 0,
  status: "draft",
};

function toInputDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toPayload(form: EventForm): EventForm {
  return {
    ...form,
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    sort_order: Number(form.sort_order) || 0,
  };
}

function EventCard({ event, selected, onSelect, now }: { event: EventRecord; selected: boolean; onSelect: () => void; now: number }) {
  const past = event.ends_at ? new Date(event.ends_at).getTime() < now : new Date(event.starts_at).getTime() < now;
  return (
    <button onClick={onSelect} className={`text-left w-full border p-4 transition-colors ${selected ? "border-[#2A1810] bg-white" : "border-[rgba(42,24,16,0.08)] bg-white/50 hover:bg-white/80"}`}>
      <div className="flex gap-3">
        {event.image_url && <img src={event.image_url} alt="" className="w-16 h-16 object-cover bg-[#E8DED0] flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] truncate">{event.name}</p>
            <span className={`text-[9px] uppercase tracking-[0.1em] ${event.status === "published" ? "text-[#2A7810]" : event.status === "archived" ? "text-[#8B7355]" : "text-[#7C1C0B]"}`}>{event.status}</span>
          </div>
          <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px] mt-1">{past ? "past" : "upcoming"} · {new Date(event.starts_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px] truncate mt-1">{event.quote}</p>
        </div>
      </div>
    </button>
  );
}

export default function EventsPage() {
  const { adminKey, logout } = useAdminAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/events`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) throw new Error("could not load events");
      const data = await res.json();
      setEvents(data.events || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load events");
    } finally {
      setLoading(false);
    }
  }, [adminKey, logout]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const selectEvent = (event: EventRecord) => {
    setSelectedId(event.id);
    setForm({ ...event, starts_at: toInputDate(event.starts_at), ends_at: toInputDate(event.ends_at) });
  };
  const newEvent = () => { setSelectedId(null); setForm(emptyForm); };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = toPayload(form);
      const res = await adminFetch(
        selectedId ? `${API_URL}/api/v1/admin/events/${selectedId}` : `${API_URL}/api/v1/admin/events`,
        { method: selectedId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        { key: adminKey },
      );
      if (res.status === 401) { logout(); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "could not save event");
      const saved = data.event as EventRecord;
      setEvents((current) => selectedId ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      selectEvent(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save event");
    } finally {
      setSaving(false);
    }
  };

  const upcoming = useMemo(() => events.filter((event) => !event.ends_at || new Date(event.ends_at).getTime() >= now), [events, now]);
  const past = useMemo(() => events.filter((event) => event.ends_at && new Date(event.ends_at).getTime() < now), [events, now]);
  const field = (key: keyof EventForm, label: string, type = "text") => (
    <label className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] text-[#8B7355] uppercase">{label}</span>
      {key === "details" ? (
        <textarea className="frinq-input min-h-28 text-[13px]" value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      ) : (
        <input className="frinq-input text-[13px]" type={type} value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      )}
    </label>
  );

  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><p className="font-[family-name:var(--font-things)] text-2xl text-[#2A1810]">events</p><p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355] mt-1">upcoming and past community events</p></div>
        <div className="flex gap-2"><button onClick={() => void load()} className="admin-button">refresh</button><button onClick={newEvent} className="admin-button admin-button-dark">new event</button></div>
      </div>
      {error && <p className="mb-4 font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6">
        <section className="flex flex-col gap-5">
          {loading ? <p className="text-sm text-[#8B7355]">loading events...</p> : events.length === 0 ? <p className="text-sm text-[#8B7355]">no events yet</p> : <>
            <div><p className="section-label mb-2">upcoming · {upcoming.length}</p><div className="flex flex-col gap-2">{upcoming.map((event) => <EventCard key={event.id} event={event} now={now} selected={selectedId === event.id} onSelect={() => selectEvent(event)} />)}</div></div>
            <div><p className="section-label mb-2">past · {past.length}</p><div className="flex flex-col gap-2">{past.map((event) => <EventCard key={event.id} event={event} now={now} selected={selectedId === event.id} onSelect={() => selectEvent(event)} />)}</div></div>
          </>}
        </section>
        <section className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5 h-fit flex flex-col gap-4">
          <div className="flex items-center justify-between"><p className="section-label">{selectedId ? "edit event" : "new event"}</p>{selectedId && <button onClick={newEvent} className="text-[10px] text-[#8B7355]">clear</button>}</div>
          {field("image_url", "main image URL", "url")}
          {form.image_url && <img src={form.image_url} alt="event preview" className="w-full aspect-[16/7] object-cover bg-[#E8DED0]" />}
          {field("name", "name")}
          {field("quote", "quote")}
          {field("details", "details")}
          {field("registration_url", "registration form link", "url")}
          <div className="grid grid-cols-2 gap-3">{field("starts_at", "starts", "datetime-local")}{field("ends_at", "ends", "datetime-local")}</div>
          <div className="grid grid-cols-2 gap-3">
            {field("sort_order", "order", "number")}
            <label className="flex flex-col gap-1"><span className="section-label">status</span><select className="frinq-input text-[13px]" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></label>
          </div>
          <button onClick={() => void save()} disabled={saving || !form.name || !form.starts_at || !form.registration_url} className="admin-button admin-button-dark w-full disabled:opacity-40">{saving ? "saving..." : "save event"}</button>
        </section>
      </div>
    </main>
  );
}
