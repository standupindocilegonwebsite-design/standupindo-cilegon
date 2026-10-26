import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Archive, Building2, Check, ChevronDown, CreditCard, ImagePlus, Pencil, Plus, Save, Search, Star, Trash2 } from 'lucide-react';
import type { TicketPaymentMethod } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { getImageFileExtension, processImageForUpload, validateImageFile } from '@/lib/image-processing';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { SlidingTabIndicator } from '@/components/ui/SlidingTabIndicator';

type TicketPaymentMode = 'manual' | 'midtrans' | 'both';
type PaymentSettingsTab = 'manual' | 'midtrans';
interface EventOption { id: string; title: string; date: string; status: string; poster?: string | null; ticket_payment_mode?: TicketPaymentMode; }
interface PaymentMethodView extends TicketPaymentMethod {
  is_default: boolean;
  events: Array<EventOption & { is_active: boolean }>;
  can_edit: boolean;
  can_delete: boolean;
}
type PaymentMethodResponse = TicketPaymentMethod & {
  is_default?: boolean;
  events?: Array<EventOption & { is_active: boolean }>;
  can_edit?: boolean;
  can_delete?: boolean;
};
type PaymentDraft = { id?: string; event_ids: string[]; recipient_name: string; qris_recipient_name: string; bank_name: string; account_number: string; qris_storage_path: string; note: string; make_default: boolean };

async function paymentAction<T>(body: Record<string, unknown>) {
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

const EMPTY_DRAFT: PaymentDraft = { event_ids: [], recipient_name: '', qris_recipient_name: '', bank_name: '', account_number: '', qris_storage_path: '', note: '', make_default: false };

function isArchivedEvent(event: EventOption) {
  if (event.status === 'completed' || event.status === 'cancelled') return true;
  const eventDate = new Date(`${event.date}T00:00:00`);
  if (Number.isNaN(eventDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

function paymentModeLabel(mode: TicketPaymentMode) {
  if (mode === 'manual') return 'Transfer Manual';
  if (mode === 'midtrans') return 'Midtrans';
  return 'Transfer Manual + Midtrans';
}

export function TicketPaymentMethodsPage({ events, onBack }: { events: EventOption[]; onBack: () => void }) {
  const [methods, setMethods] = useState<PaymentMethodView[]>([]);
  const [supportsMultiEvent, setSupportsMultiEvent] = useState(false);
  const [canManageDefault, setCanManageDefault] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [methodToDelete, setMethodToDelete] = useState<PaymentMethodView | null>(null);
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [methodSearch, setMethodSearch] = useState('');
  const [activeTab, setActiveTab] = useState<PaymentSettingsTab>('manual');
  const paymentTabsRef = useRef<HTMLDivElement>(null);
  const [expandedArchives, setExpandedArchives] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentModes, setPaymentModes] = useState<Record<string, TicketPaymentMode>>(() => Object.fromEntries(
    events.map((event) => [event.id, (event as EventOption & { ticket_payment_mode?: TicketPaymentMode }).ticket_payment_mode ?? 'manual']),
  ));
  const [selectedPaymentModeEventId, setSelectedPaymentModeEventId] = useState(events[0]?.id ?? 'all');
  const [savingPaymentModeEventId, setSavingPaymentModeEventId] = useState<string | null>(null);
  const [paymentModeDraft, setPaymentModeDraft] = useState<{ eventId: string; mode: TicketPaymentMode } | null>(null);
  const [confirmingPaymentMode, setConfirmingPaymentMode] = useState(false);
  const [paymentModeError, setPaymentModeError] = useState('');
  const [togglingEvents, setTogglingEvents] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await paymentAction<{ methods: PaymentMethodResponse[]; events?: EventOption[]; supports_multi_event?: boolean; can_manage_default?: boolean }>({ action: 'payment-methods' });
    setLoading(false);
    if (loadError || !data) {
      setError(loadError ?? 'Informasi pembayaran gagal dimuat.');
      return;
    }
    setSupportsMultiEvent(data.supports_multi_event === true || (data.methods ?? []).some((method) => Array.isArray(method.events)));
    setCanManageDefault(data.can_manage_default === true);
    const eventById = new Map([...(events ?? []), ...(data.events ?? [])].map((event) => [event.id, event]));
    setMethods((data.methods ?? []).map((method) => {
      const assignedEvents = Array.isArray(method.events)
        ? method.events
        : method.event_id && eventById.has(method.event_id)
          ? [{ ...eventById.get(method.event_id)!, is_active: method.is_active }]
          : [];
      return {
        ...method,
        is_default: method.is_default === true,
        events: assignedEvents,
        can_edit: method.can_edit ?? true,
        can_delete: method.can_delete ?? true,
      };
    }));
  }, [events]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPaymentModes((current) => Object.fromEntries(events.map((event) => [
      event.id,
      event.ticket_payment_mode ?? current[event.id] ?? 'manual',
    ])));
    setSelectedPaymentModeEventId((current) => events.some((event) => event.id === current) ? current : events[0]?.id ?? 'all');
  }, [events]);

  async function savePaymentMode(eventId: string, paymentMode: TicketPaymentMode) {
    setSavingPaymentModeEventId(eventId);
    setPaymentModeError('');
    try {
      const { error: saveError } = await paymentAction({
        action: 'set-ticket-payment-mode',
        event_id: eventId,
        payment_mode: paymentMode,
      });
      if (saveError) {
        setPaymentModeError(saveError);
        return false;
      }
      setPaymentModes((current) => ({ ...current, [eventId]: paymentMode }));
      return true;
    } catch (saveError) {
      setPaymentModeError(saveError instanceof Error ? saveError.message : 'Mode pembayaran gagal disimpan.');
      return false;
    } finally {
      setSavingPaymentModeEventId(null);
    }
  }

  function closePaymentModeDialog() {
    if (savingPaymentModeEventId) return;
    setPaymentModeDraft(null);
    setConfirmingPaymentMode(false);
    setPaymentModeError('');
  }

  async function confirmPaymentModeChange() {
    if (!paymentModeDraft) return;
    const saved = await savePaymentMode(paymentModeDraft.eventId, paymentModeDraft.mode);
    if (saved) closePaymentModeDialog();
  }

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, event_ids: events[0] ? [events[0].id] : [] });
    setEventSearch('');
    setQrisFile(null);
    setError('');
  }

  function openEdit(method: PaymentMethodView) {
    setDraft({ id: method.id, event_ids: method.events.map((event) => event.id), recipient_name: method.recipient_name, qris_recipient_name: method.qris_recipient_name ?? '', bank_name: method.bank_name ?? '', account_number: method.account_number ?? '', qris_storage_path: method.qris_storage_path ?? '', note: method.note ?? '', make_default: method.is_default });
    setEventSearch('');
    setQrisFile(null);
    setError('');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.event_ids.length) {
      setError('Pilih minimal satu Event.');
      return;
    }
    if (!supportsMultiEvent && draft.event_ids.length > 1) {
      setError('Backend Informasi Pembayaran belum mendukung beberapa Event. Perbarui/deploy Edge Function ticketing-admin sebelum mengubah penugasan Event.');
      return;
    }
    const isChangingDefault = draft.make_default || methods.some((method) => method.id === draft.id && method.is_default);
    setSaving(true);
    setError('');
    let qrisPath = draft.qris_storage_path;
    if (qrisFile) {
      const validationError = validateImageFile(qrisFile);
      if (validationError) {
        setSaving(false);
        setError(validationError);
        return;
      }
      let uploadFile: Blob;
      try {
        uploadFile = await processImageForUpload(qrisFile, 'qris');
      } catch (processingError) {
        console.error('QRIS gagal diproses.', processingError);
        setSaving(false);
        setError(processingError instanceof Error ? processingError.message : 'QRIS gagal diproses.');
        return;
      }
      const uploadName = `${qrisFile.name.replace(/\.[^.]+$/, '')}.${getImageFileExtension(uploadFile.type)}`;
      const { data: upload, error: uploadError } = await paymentAction<{ path: string; token: string }>({
        action: 'create-qris-upload',
        event_id: draft.event_ids[0],
        file_name: uploadName,
        file_type: uploadFile.type,
      });
      if (uploadError || !upload) {
        setSaving(false);
        setError(uploadError ?? 'Link upload QRIS gagal dibuat.');
        return;
      }
      const { error: storageError } = await supabase.storage.from('standupindo-media').uploadToSignedUrl(upload.path, upload.token, uploadFile, { contentType: uploadFile.type, upsert: false });
      if (storageError) {
        setSaving(false);
        setError('QRIS gagal diupload.');
        return;
      }
      qrisPath = upload.path;
    }
    const { data: savedPayment, error: saveError } = await paymentAction<{ method_id: string }>({
      action: 'save-payment-method',
      payment_method: {
        ...draft,
        event_id: draft.event_ids[0],
        qris_storage_path: qrisPath,
        is_default: draft.make_default,
      },
    });
    if (saveError) {
      setSaving(false);
      setError(saveError);
      return;
    }
    if (isChangingDefault) {
      const { data: refreshedMethods, error: refreshError } = await paymentAction<{ methods: PaymentMethodResponse[] }>({ action: 'payment-methods' });
      const savedMethod = refreshedMethods?.methods.find((method) => method.id === savedPayment?.method_id);
      const defaultStatusWasUpdated = draft.make_default
        ? savedMethod?.is_default === true
        : !refreshedMethods?.methods.some((method) => method.is_default === true);
      if (refreshError || !refreshedMethods || !savedPayment?.method_id || !defaultStatusWasUpdated) {
        setSaving(false);
        await load();
        setError('Informasi pembayaran tersimpan, tetapi status default belum berubah. Deploy Edge Function ticketing-admin versi terbaru lalu coba lagi.');
        return;
      }
    }
    setDraft(null);
    setSaving(false);
    setQrisFile(null);
    await load();
  }

  async function toggleMethod(method: PaymentMethodView, eventId: string, isActive: boolean) {
    const toggleKey = `${method.id}:${eventId}`;
    setTogglingEvents((current) => new Set(current).add(toggleKey));
    setError('');
    setMethods((current) => current.map((currentMethod) => currentMethod.id !== method.id
      ? currentMethod
      : {
        ...currentMethod,
        events: currentMethod.events.map((event) => event.id === eventId
          ? { ...event, is_active: !isActive }
          : event),
      }));
    try {
      const { error: actionError } = await paymentAction({
        action: isActive ? 'deactivate-payment-method' : 'activate-payment-method',
        payment_method_id: method.id,
        event_id: eventId,
      });
      if (actionError) {
        setMethods((current) => current.map((currentMethod) => currentMethod.id !== method.id
          ? currentMethod
          : {
            ...currentMethod,
            events: currentMethod.events.map((event) => event.id === eventId
              ? { ...event, is_active: isActive }
              : event),
          }));
        setError(actionError);
        return;
      }
    } catch (actionError) {
      setMethods((current) => current.map((currentMethod) => currentMethod.id !== method.id
        ? currentMethod
        : {
          ...currentMethod,
          events: currentMethod.events.map((event) => event.id === eventId
            ? { ...event, is_active: isActive }
            : event),
        }));
      setError(actionError instanceof Error ? `Status pembayaran gagal diperbarui: ${actionError.message}` : 'Status pembayaran gagal diperbarui.');
    } finally {
      setTogglingEvents((current) => {
        const next = new Set(current);
        next.delete(toggleKey);
        return next;
      });
    }
  }

  async function deleteMethod(method: PaymentMethodView) {
    if (!method.can_delete) {
      setError('Informasi pembayaran ini juga digunakan Event di luar scope akun Anda.');
      return;
    }
    setMethodToDelete(method);
  }

  async function confirmDeleteMethod() {
    if (!methodToDelete) return;
    setSaving(true);
    setError('');
    const { error: deleteError } = await paymentAction({ action: 'delete-payment-method', payment_method_id: methodToDelete.id });
    setSaving(false);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    setMethodToDelete(null);
    await load();
  }

  const signedQrisUrl = (path: string) => supabase.storage.from('standupindo-media').getPublicUrl(path).data.publicUrl;
  const filteredEvents = events.filter((event) => event.title.toLowerCase().includes(eventSearch.trim().toLowerCase()));
  const filteredMethods = methods.filter((method) => (
    `${method.recipient_name} ${method.qris_recipient_name ?? ''} ${method.bank_name ?? ''} ${method.account_number ?? ''} ${method.events.map((event) => event.title).join(' ')}`
      .toLowerCase().includes(methodSearch.trim().toLowerCase())
  ));
  const selectedPaymentModeEvent = events.find((event) => event.id === selectedPaymentModeEventId);
  const selectedPaymentMode = selectedPaymentModeEvent ? paymentModes[selectedPaymentModeEvent.id] ?? 'manual' : null;
  const paymentModeOptions = events.map((event) => ({
    id: event.id,
    title: event.title,
    subtitle: formatDate(event.date),
    poster: event.poster,
    statusLabel: isArchivedEvent(event) ? 'ARSIP' : undefined,
  }));
  const selectedEventNames = draft?.event_ids.map((id) => events.find((event) => event.id === id)?.title).filter((title): title is string => Boolean(title)) ?? [];
  const paymentForm = draft && (
    <form onSubmit={save} className="space-y-5">
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900 sm:text-sm">
        Informasi ini akan ditampilkan sebagai pilihan pembayaran untuk Event yang dipilih. Pengaktifan rekening diatur per Event.
      </p>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">1. Pilih Event</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Tentukan Event yang akan menampilkan informasi pembayaran ini.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{selectedEventNames.length} dipilih</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50/70 p-2">
            <span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Cari Event..." aria-label="Cari Event" /></span>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain p-2">
            {filteredEvents.map((event) => {
              const checked = draft.event_ids.includes(event.id);
              return <label key={event.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-blue-200 bg-blue-50/80' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checked} onChange={(change) => setDraft({ ...draft, event_ids: change.target.checked ? [...draft.event_ids, event.id] : draft.event_ids.filter((id) => id !== event.id) })} className="h-4 w-4 shrink-0 accent-blue-600" />
                <span className="min-w-0 flex-1"><span className={`block text-sm leading-5 ${checked ? 'font-bold text-blue-900' : 'font-medium text-slate-700'}`}>{event.title}</span><span className="mt-0.5 block text-xs text-slate-500">{event.date}</span></span>
                {checked && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </label>;
            })}
            {!filteredEvents.length && <p className="rounded-xl px-3 py-6 text-center text-sm text-slate-500">Event tidak ditemukan.</p>}
          </div>
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">2. Detail Rekening dan Penerima</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">Nama Penerima wajib diisi. Detail rekening dan QRIS dapat dilengkapi sesuai metode yang tersedia.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nama Penerima <span className="text-red-600">*</span></span><input required className="input-field" value={draft.recipient_name} onChange={(event) => setDraft({ ...draft, recipient_name: event.target.value })} placeholder="Nama pemilik rekening atau penerima" /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nama Penerima QRIS <span className="font-normal">(Opsional)</span></span><input className="input-field" value={draft.qris_recipient_name} onChange={(event) => setDraft({ ...draft, qris_recipient_name: event.target.value })} placeholder="Kosongkan jika sama dengan Nama Penerima" /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nama Bank <span className="font-normal">(Opsional)</span></span><input className="input-field" value={draft.bank_name} onChange={(event) => setDraft({ ...draft, bank_name: event.target.value })} placeholder="Contoh: BCA" /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nomor Rekening <span className="font-normal">(Opsional)</span></span><input className="input-field" inputMode="numeric" value={draft.account_number} onChange={(event) => setDraft({ ...draft, account_number: event.target.value })} placeholder="Masukkan nomor rekening" /></label>
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">3. QRIS Statis <span className="font-semibold text-slate-500">(Opsional)</span></h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">Unggah gambar QRIS agar pembeli dapat memindainya saat membayar.</p>
        </div>
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600"><span>Gambar QRIS</span><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setQrisFile(event.target.files?.[0] ?? null)} /><span className="block text-[11px] font-normal leading-5 text-slate-500">{draft.qris_storage_path && !qrisFile ? 'QRIS tersimpan. Pilih file baru jika ingin menggantinya.' : 'Format JPG, PNG, atau WEBP · Maksimal 5 MB'}</span></label>
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">4. Catatan untuk Pembeli <span className="font-semibold text-slate-500">(Opsional)</span></h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">Tambahkan instruksi khusus yang perlu diketahui pembeli saat melakukan pembayaran.</p>
        </div>
        <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>Isi Catatan</span><textarea className="input-field min-h-20" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Contoh: Cantumkan nomor order pada berita transfer" /></label>
      </section>
      {canManageDefault
        ? <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900"><input type="checkbox" checked={draft.make_default} onChange={(event) => setDraft({ ...draft, make_default: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" /><span><span className="block font-bold">Jadikan Informasi Pembayaran Default</span><span className="mt-0.5 block leading-5">Informasi ini otomatis dipasang pada Event baru saat dipublikasikan. Mengubah default tidak mengubah rekening aktif pada Event yang sudah terbit.</span></span></label>
        : <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Rekening default untuk Event baru hanya dapat diubah oleh Admin Utama. Pengaturan rekening per-Event tetap tersedia sesuai cakupan Admin Tiket.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setDraft(null)} disabled={saving} className="btn-secondary justify-center sm:min-w-28">Batal</button>
        <button type="submit" disabled={saving} className="btn-primary justify-center sm:min-w-44"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : draft.id ? 'Simpan Perubahan' : 'Simpan Informasi'}</button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Informasi Pembayaran" subtitle="Atur transfer manual dan Midtrans untuk setiap Event." onBack={onBack} action={activeTab === 'manual' ? <button type="button" onClick={openNew} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 text-blue-800 shadow-sm transition hover:bg-blue-50" aria-label="Tambah informasi pembayaran" title="Tambah informasi pembayaran"><Plus className="h-5 w-5" /><span className="hidden text-sm font-bold sm:inline">Tambah</span></button> : undefined} />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <div ref={paymentTabsRef} className="relative isolate grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:inline-grid sm:min-w-[24rem]" role="tablist" aria-label="Jenis pengaturan pembayaran">
        <SlidingTabIndicator trackRef={paymentTabsRef} activeId={activeTab} className="rounded-lg bg-blue-700 shadow-sm" />
        {([
          ['manual', 'Transfer Manual', methods.length],
          ['midtrans', 'Midtrans', events.filter((event) => (paymentModes[event.id] ?? 'manual') !== 'manual').length],
        ] as const).map(([tab, label, count]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`payment-panel-${tab}`}
            aria-label={`${label}, ${count} ${tab === 'manual' ? 'informasi pembayaran' : 'Event menggunakan Midtrans'}`}
            data-sliding-tab={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-extrabold transition sm:text-sm ${activeTab === tab ? 'bg-transparent text-white shadow-none' : 'text-slate-600 hover:bg-white/70'}`}
          >
            {label}
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
          </button>
        ))}
      </div>
      {activeTab === 'manual' && <section id="payment-panel-manual" role="tabpanel" aria-label="Transfer Manual" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div>
          <h2 className="font-extrabold text-slate-900">Rekening dan QRIS</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Kelola tujuan transfer dan QRIS. Pembayaran manual perlu diverifikasi oleh Admin.</p>
        </div>
      </section>}
      {activeTab === 'midtrans' && <section id="payment-panel-midtrans" role="tabpanel" aria-label="Midtrans" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-extrabold text-slate-900">Pengaturan Midtrans per Event</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Atur apakah Event menggunakan Midtrans saja atau bersama transfer manual. Perubahan hanya berlaku untuk order baru.</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">{events.length} Event dalam scope</span>
        </div>
        <SearchableEventSelect
          options={paymentModeOptions}
          value={selectedPaymentModeEventId}
          onChange={setSelectedPaymentModeEventId}
          allLabel="Pilih Event untuk mengatur mode"
          ariaLabel="Event untuk mode pembayaran"
        />
        {selectedPaymentModeEvent && selectedPaymentMode && <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-700">Event terpilih</p>
              <h3 className="mt-0.5 break-words font-extrabold text-slate-900">{selectedPaymentModeEvent.title}</h3>
              <p className="text-xs text-slate-600">{formatDate(selectedPaymentModeEvent.date)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2 sm:justify-start">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                <span>Mode Saat Ini:</span>
                <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-emerald-600 py-1 pl-3 pr-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                  {paymentModeLabel(selectedPaymentMode)}
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPaymentModeDraft({ eventId: selectedPaymentModeEvent.id, mode: selectedPaymentMode });
                  setConfirmingPaymentMode(false);
                  setPaymentModeError('');
                }}
                disabled={savingPaymentModeEventId === selectedPaymentModeEvent.id}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 text-blue-800 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
                aria-label={`Edit mode pembayaran ${selectedPaymentModeEvent.title}`}
                title="Edit mode pembayaran"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
            {selectedPaymentMode === 'manual'
              ? 'Pembeli membayar melalui rekening atau QRIS dan mengirim bukti pembayaran untuk diverifikasi Admin.'
              : selectedPaymentMode === 'midtrans'
                ? 'Pembeli membayar melalui checkout Midtrans Sandbox. Status pembayaran diperbarui otomatis setelah transaksi terkonfirmasi.'
                : 'Pembeli dapat memilih transfer/QRIS manual dengan verifikasi Admin atau checkout Midtrans Sandbox dengan pembaruan status otomatis.'}
          </p>
        </div>}
      </section>}
      {paymentModeDraft && <Modal
        open
        onClose={closePaymentModeDialog}
        title={confirmingPaymentMode ? 'Konfirmasi Perubahan Mode' : 'Edit Mode Pembayaran'}
        titleEyebrow={confirmingPaymentMode ? 'Konfirmasi' : 'Admin Tiket · Pembayaran'}
        titleLayout="stacked"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Event</p>
            <p className="mt-1 font-bold text-slate-900">{events.find((event) => event.id === paymentModeDraft.eventId)?.title ?? 'Event terpilih'}</p>
          </div>
          {!confirmingPaymentMode ? <>
            <div>
              <p className="mb-2 text-sm font-bold text-slate-800">Pilih mode pembayaran</p>
              <div className="grid gap-2">
                {([
                  ['manual', 'Transfer Manual', 'Pembayaran diverifikasi Admin melalui bukti transfer.'],
                  ['midtrans', 'Midtrans', 'Pembayaran online melalui checkout Midtrans Sandbox.'],
                  ['both', 'Keduanya', 'Pembeli dapat memilih transfer manual atau Midtrans.'],
                ] as const).map(([mode, label, description]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={paymentModeDraft.mode === mode}
                    onClick={() => {
                      setPaymentModeDraft({ ...paymentModeDraft, mode });
                      setPaymentModeError('');
                    }}
                    className={`flex min-h-14 items-start gap-3 rounded-xl border p-3 text-left transition ${paymentModeDraft.mode === mode ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${paymentModeDraft.mode === mode ? 'border-blue-700 bg-blue-700' : 'border-slate-300 bg-white'}`}>
                      {paymentModeDraft.mode === mode && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-900">{label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Mode ini hanya berlaku untuk order baru. Order yang sudah dibuat tidak berubah.</p>
            {paymentModeError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{paymentModeError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closePaymentModeDialog} className="btn-secondary justify-center sm:min-w-28">Batal</button>
              <button
                type="button"
                onClick={() => setConfirmingPaymentMode(true)}
                disabled={paymentModeDraft.mode === (paymentModes[paymentModeDraft.eventId] ?? 'manual')}
                className="btn-primary justify-center sm:min-w-40"
              >Lanjutkan</button>
            </div>
          </> : <>
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-bold text-amber-950">Pastikan perubahan mode sudah benar</p>
                <p className="mt-1 text-xs leading-5 text-amber-900">Mode pembayaran Event ini akan diubah. Perubahan hanya berlaku untuk order baru.</p>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center">
              <div><p className="text-[10px] font-bold uppercase text-slate-500">Mode saat ini</p><p className="mt-1 text-xs font-extrabold text-slate-700">{paymentModeLabel(paymentModes[paymentModeDraft.eventId] ?? 'manual')}</p></div>
              <span aria-hidden="true" className="text-slate-400">→</span>
              <div><p className="text-[10px] font-bold uppercase text-slate-500">Mode baru</p><p className="mt-1 text-xs font-extrabold text-blue-800">{paymentModeLabel(paymentModeDraft.mode)}</p></div>
            </div>
            {paymentModeError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{paymentModeError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setConfirmingPaymentMode(false); setPaymentModeError(''); }} disabled={savingPaymentModeEventId !== null} className="btn-secondary justify-center sm:min-w-28">Kembali</button>
              <button type="button" onClick={() => void confirmPaymentModeChange()} disabled={savingPaymentModeEventId !== null} className="btn-primary justify-center sm:min-w-40">
                {savingPaymentModeEventId ? 'Menyimpan...' : 'Ya, Simpan Mode'}
              </button>
            </div>
          </>}
        </div>
      </Modal>}
      {draft && <Modal open onClose={() => { if (!saving) setDraft(null); }} title={draft.id ? 'Edit Informasi Pembayaran' : 'Tambah Informasi Pembayaran'} titleEyebrow="Admin Tiket · Pembayaran" titleLayout="stacked" size="xl">{paymentForm}</Modal>}
      {methodToDelete && <Modal open onClose={() => !saving && setMethodToDelete(null)} title="Hapus Informasi Pembayaran" size="sm">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-bold text-slate-900">{methodToDelete.recipient_name}</p>
              {methodToDelete.bank_name && <p className="mt-0.5 text-sm text-slate-600">{methodToDelete.bank_name}{methodToDelete.account_number ? ` · ${methodToDelete.account_number}` : ''}</p>}
            </div>
          </div>
          <div>
            <p className="text-sm leading-6 text-slate-700">Informasi pembayaran ini akan dihapus dari Event berikut:</p>
            <ul className="mt-2 space-y-1.5">
              {methodToDelete.events.map((event) => <li key={event.id} className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{event.title}</li>)}
            </ul>
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">Order yang sudah dibuat tetap menggunakan snapshot pembayaran sebelumnya.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setMethodToDelete(null)} disabled={saving} className="btn-secondary justify-center">Batal</button>
            <button type="button" onClick={() => void confirmDeleteMethod()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" />{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
          </div>
        </div>
      </Modal>}
      {activeTab === 'manual' && <>
      {!loading && methods.length > 0 && <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-9" value={methodSearch} onChange={(event) => setMethodSearch(event.target.value)} placeholder="Cari nama Event, penerima, atau bank..." /></label>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !methods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada informasi transfer manual. Tambahkan rekening atau QRIS untuk Event.</div> : !filteredMethods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada informasi pembayaran yang cocok.</div> : <div className="space-y-3">{filteredMethods.map((method) => {
        const currentEvents = method.events.filter((event) => !isArchivedEvent(event))
          .sort((first, second) => first.date.localeCompare(second.date));
        const archivedEvents = method.events.filter(isArchivedEvent)
          .sort((first, second) => second.date.localeCompare(first.date));
        const searchQuery = methodSearch.trim().toLocaleLowerCase('id-ID');
        const archiveMatchesSearch = Boolean(searchQuery) && archivedEvents.some((event) => event.title.toLocaleLowerCase('id-ID').includes(searchQuery));
        const archiveExpanded = expandedArchives.has(method.id) || archiveMatchesSearch;
        const updateArchiveExpanded = () => setExpandedArchives((current) => {
          const next = new Set(current);
          if (next.has(method.id)) next.delete(method.id);
          else next.add(method.id);
          return next;
        });
        const renderEvent = (event: EventOption & { is_active: boolean }, archived: boolean) => {
          const toggleKey = `${method.id}:${event.id}`;
          const isToggling = togglingEvents.has(toggleKey);
          return <div key={event.id} className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-2.5 py-2 sm:px-3 ${archived ? 'bg-white/80' : 'bg-slate-50'}`}>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800">{event.title}</p>
              <p className="text-xs text-slate-500">{formatDate(event.date)}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={event.is_active}
              aria-label={`${event.is_active ? 'Nonaktifkan' : 'Aktifkan'} informasi pembayaran untuk ${event.title}`}
              onClick={() => void toggleMethod(method, event.id, event.is_active)}
              disabled={isToggling}
              className={`inline-flex h-8 w-[88px] shrink-0 items-center justify-between rounded-full px-1.5 text-[11px] font-extrabold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${event.is_active ? 'bg-emerald-600 text-white focus-visible:ring-emerald-500' : 'bg-slate-300 text-slate-700 focus-visible:ring-slate-400'}`}
            >
              {event.is_active
                ? <><span>Aktif</span><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-700"><Check className="h-3 w-3" /></span></>
                : <><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-white"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /></span><span>Nonaktif</span></>}
            </button>
          </div>;
        };
        return <article key={method.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{method.qris_storage_path ? <ImagePlus className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h2 className="font-extrabold text-slate-900">{method.recipient_name}</h2>
              {method.is_default && <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-white shadow-sm shadow-blue-200 ring-1 ring-blue-400/30"><Star className="h-3 w-3 fill-current" />Default Rekening Event</span>}
              {method.bank_name && <p className="w-full text-sm text-slate-700">{method.bank_name} · {method.account_number}</p>}
              {method.qris_storage_path && <p className="w-full text-sm text-slate-700">QRIS atas nama {method.qris_recipient_name?.trim() || method.recipient_name}</p>}
              {method.note && <p className="w-full text-xs text-slate-500">{method.note}</p>}
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Event yang menggunakan</p>
              <span className="text-[11px] font-semibold text-slate-500">{method.events.length} Event · {currentEvents.length} mendatang/berjalan · {archivedEvents.length} arsip</span>
            </div>
            {currentEvents.length
              ? <div className="space-y-2">{currentEvents.map((event) => renderEvent(event, false))}</div>
              : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">Tidak ada Event aktif atau mendatang.</p>}
            {archivedEvents.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <button
                type="button"
                onClick={updateArchiveExpanded}
                aria-expanded={archiveExpanded}
                className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs font-bold text-slate-700 transition hover:bg-white"
              >
                <span className="inline-flex items-center gap-2"><Archive className="h-4 w-4 text-slate-500" /> Arsip Event Selesai ({archivedEvents.length})</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${archiveExpanded ? 'rotate-180' : ''}`} />
              </button>
              {archiveExpanded && <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">{archivedEvents.map((event) => renderEvent(event, true))}</div>}
            </div>}
          </div>
          {method.qris_storage_path && <img src={signedQrisUrl(method.qris_storage_path)} alt={`QRIS ${method.qris_recipient_name?.trim() || method.recipient_name}`} className="mt-3 max-h-44 rounded-xl border border-slate-200 object-contain" />}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{method.can_edit && <button type="button" onClick={() => openEdit(method)} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs"><Pencil className="h-4 w-4" /> Edit</button>}{!method.can_edit && <p className="self-center text-xs text-slate-500">{method.is_default ? 'Informasi rekening default hanya dapat diedit Admin utama.' : 'Informasi ini juga digunakan Event di luar scope akun Anda.'}</p>}{method.can_delete && <button type="button" onClick={() => void deleteMethod(method)} disabled={saving} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs text-red-700"><Trash2 className="h-4 w-4" /> Hapus</button>}</div>
        </article>;
      })}</div>}
      <p className="flex items-center gap-2 text-xs text-slate-500"><CreditCard className="h-4 w-4" /> Informasi pembayaran otomatis nonaktif H+2 setelah tanggal Event (WIB). Order lama tetap menyimpan snapshot tujuan pembayaran.</p>
      </>}
    </div>
  );
}