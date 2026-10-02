import { useCallback, useEffect, useRef, useState } from 'react';
import { DoorOpen, Plus, Save, Trash2 } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { getEventStatus } from '@/lib/format';
import { supabase } from '@/lib/supabase';

interface EventCategory { id: string; name: string; }
interface GateDraft { id: string; name: string; category_ids: string[]; }
interface GateSettingsResponse {
  settings: { opens_at: string; closes_at: string; gates_enabled: boolean; time_restricted: boolean } | null;
  categories: EventCategory[];
  gates: Array<{ id: string; name: string; category_ids: string[] }>;
}

function toJakartaTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function jakartaDateTime(date: string, time: string, endOfMinute = false) {
  return new Date(`${date}T${time}:${endOfMinute ? '59.999' : '00'}+07:00`).toISOString();
}

async function gateAction<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body });
  if (!error) return { data: data as T, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const result = await context.json() as { error?: string };
      return { data: result as T, error: result.error ?? error.message };
    } catch {
      return { data: null as T, error: error.message };
    }
  }
  return { data: null as T, error: error.message };
}

export function TicketGateSettingsPage({ events, onBack }: { events: EventItem[]; onBack: () => void }) {
  const availableEvents = events.filter((event) => getEventStatus(event.status, event.date) !== 'completed');
  const [eventId, setEventId] = useState(availableEvents[0]?.id ?? '');
  const [opensTime, setOpensTime] = useState('00:00');
  const [closesTime, setClosesTime] = useState('23:59');
  const [timeRestricted, setTimeRestricted] = useState(false);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [gates, setGates] = useState<GateDraft[]>([]);
  const [gatesEnabled, setGatesEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadVersion = useRef(0);

  const loadSettings = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!eventId) {
      setLoading(false);
      setOpensTime('00:00');
      setClosesTime('23:59');
      setTimeRestricted(false);
      setCategories([]);
      setGates([]);
      setGatesEnabled(false);
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    setOpensTime('00:00');
    setClosesTime('23:59');
    setTimeRestricted(false);
    setCategories([]);
    setGates([]);
    setGatesEnabled(false);
    const { data, error: loadError } = await gateAction<GateSettingsResponse>({ action: 'gate-settings', event_id: eventId });
    if (version !== loadVersion.current) return;
    setLoading(false);
    if (loadError || !data) {
      setError(loadError ?? 'Pengaturan Gate gagal dimuat.');
      return;
    }
    setTimeRestricted(data.settings?.time_restricted ?? false);
    if (data.settings?.time_restricted) {
      setOpensTime(toJakartaTime(data.settings.opens_at));
      setClosesTime(toJakartaTime(data.settings.closes_at));
    }
    setGatesEnabled(data.settings?.gates_enabled ?? false);
    const availableCategories = data.categories ?? [];
    const availableCategoryIds = new Set(availableCategories.map((category) => category.id));
    setCategories(availableCategories);
    setGates((data.gates ?? []).map((gate) => ({
      ...gate,
      id: gate.id,
      category_ids: gate.category_ids.filter((id) => availableCategoryIds.has(id)),
    })));
  }, [eventId]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  function addGate() {
    setGates((current) => [...current, { id: crypto.randomUUID(), name: '', category_ids: [] }]);
  }

  function updateGate(id: string, update: Partial<GateDraft>) {
    setGates((current) => current.map((gate) => gate.id === id ? { ...gate, ...update } : gate));
  }

  function toggleCategory(gate: GateDraft, categoryId: string) {
    const categoryIds = gate.category_ids.includes(categoryId)
      ? gate.category_ids.filter((id) => id !== categoryId)
      : [...gate.category_ids, categoryId];
    updateGate(gate.id, { category_ids: categoryIds });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const gateNames = gates.map((gate) => gate.name.trim().toLocaleLowerCase('id-ID'));
    if (gatesEnabled && (!gates.length || gates.some((gate) => !gate.name.trim() || !gate.category_ids.length))) {
      setError('Tambahkan minimal satu Gate, lalu isi nama dan pilih kategori tiket yang diizinkan.');
      return;
    }
    if (gatesEnabled && new Set(gateNames).size !== gateNames.length) {
      setError('Nama Gate tidak boleh sama.');
      return;
    }
    if (timeRestricted && (!opensTime || !closesTime || closesTime < opensTime)) {
      setError('Waktu penutupan harus setelah waktu pembukaan check-in.');
      return;
    }

    const selectedEvent = availableEvents.find((item) => item.id === eventId);
    if (!selectedEvent) {
      setError('Event yang dipilih tidak tersedia.');
      return;
    }
    const eventDate = selectedEvent.date.slice(0, 10);
    const opensAt = timeRestricted ? jakartaDateTime(eventDate, opensTime) : jakartaDateTime(eventDate, '00:00');
    const closesAt = timeRestricted ? jakartaDateTime(eventDate, closesTime, true) : '';
    const endOfEventDay = new Date(`${eventDate}T00:00:00+07:00`);
    endOfEventDay.setUTCDate(endOfEventDay.getUTCDate() + 1);
    const allDayClosesAt = endOfEventDay.toISOString();

    setSaving(true);
    const { error: saveError } = await gateAction({
      action: 'save-gate-settings',
      event_id: eventId,
      opens_at: opensAt,
      closes_at: timeRestricted ? closesAt : allDayClosesAt,
      gates_enabled: gatesEnabled,
      time_restricted: timeRestricted,
      gates: gatesEnabled ? gates.map(({ id, name, category_ids }) => ({ id, name: name.trim(), category_ids })) : [],
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setNotice('Pengaturan Gate dan periode check-in berhasil disimpan.');
    await loadSettings();
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Pengaturan Gate"
        subtitle="Secara default, semua kategori bisa check-in kapan saja pada hari Event. Pembatasan jam dan Gate bersifat opsional."
        onBack={onBack}
      />
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="space-y-2">
          <label className="label-field">Event</label>
          <SearchableEventSelect
            options={availableEvents.map((event) => ({ id: event.id, title: event.title, subtitle: `${event.date} · ${event.venue}` }))}
            value={eventId || 'all'}
            onChange={(value) => setEventId(value === 'all' ? '' : value)}
            allLabel="Pilih Event"
            ariaLabel="Pilih Event untuk pengaturan Gate"
          />
        </div>
        {!eventId ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Belum ada Event yang dapat diatur.</p>
          : loading ? <div className="h-32 skeleton rounded-xl" />
            : <form onSubmit={(event) => void save(event)} className="space-y-5">
              <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                <label className="flex min-h-12 items-center gap-3 text-sm font-bold text-slate-800">
                  <input type="checkbox" checked={timeRestricted} onChange={(event) => setTimeRestricted(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
                  Batasi jam check-in pada hari Event
                </label>
                {timeRestricted ? <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Check-in dibuka pukul
                    <input type="time" required value={opensTime} onChange={(event) => setOpensTime(event.target.value)} className="input-field mt-1.5" />
                  </label>
                  <label className="block text-sm font-bold text-slate-700">
                    Check-in ditutup pukul
                    <input type="time" required value={closesTime} onChange={(event) => setClosesTime(event.target.value)} className="input-field mt-1.5" />
                  </label>
                  <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Jam menggunakan WIB dan hanya berlaku pada tanggal Event.</p>
                </div> : <p className="text-xs leading-5 text-slate-500">Check-in tersedia sepanjang hari Event (00.00–24.00 WIB). Tiket yang belum digunakan akan berstatus Expired setelah hari Event berakhir.</p>}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-extrabold text-slate-900">Daftar Gate</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Semua kategori dibuka secara default; pembatasan Gate bersifat opsional.</p>
                  </div>
                </div>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
                  <input type="checkbox" checked={gatesEnabled} onChange={(event) => setGatesEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
                  Batasi akses berdasarkan Gate dan kategori tiket
                </label>
                {!gatesEnabled && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-900">Mode semua kategori aktif. Admin Tiket dan QR Scanner dapat melayani seluruh kategori tanpa memilih Gate.</p>}
                {gatesEnabled && <>
                  <div className="flex justify-end">
                    <button type="button" onClick={addGate} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 transition hover:bg-blue-100">
                      <Plus className="h-4 w-4" /> Tambah Gate
                    </button>
                  </div>
                  {!categories.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Event ini belum memiliki kategori tiket aktif. Aktifkan kategori sebelum mengatur Gate.</p>}
                  {gates.map((gate, index) => <div key={gate.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start gap-2">
                    <label className="min-w-0 flex-1 text-sm font-bold text-slate-700">
                      Nama Gate {index + 1}
                      <input required maxLength={80} value={gate.name} onChange={(event) => updateGate(gate.id, { name: event.target.value })} className="input-field mt-1.5" placeholder="Contoh: Gate Utama" />
                    </label>
                    <button type="button" onClick={() => setGates((current) => current.filter((item) => item.id !== gate.id))} className="mt-6 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-600 transition hover:bg-red-50" aria-label={`Hapus Gate ${gate.name || index + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Kategori yang diizinkan</legend>
                    {categories.map((category) => <label key={category.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      <input type="checkbox" checked={gate.category_ids.includes(category.id)} onChange={() => toggleCategory(gate, category.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
                      {category.name}
                    </label>)}
                  </fieldset>
                  </div>)}
                  {!gates.length && <div className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500"><DoorOpen className="mb-2 h-6 w-6 text-slate-300" />Tambahkan Gate untuk mengatur akses tiket.</div>}
                </>}
              </div>

              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
              <button type="submit" disabled={saving || loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-55">
                {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-white" /> Menyimpan...</> : <><Save className="h-4 w-4" /> Simpan Pengaturan Gate</>}
              </button>
            </form>}
      </section>
    </div>
  );
}
