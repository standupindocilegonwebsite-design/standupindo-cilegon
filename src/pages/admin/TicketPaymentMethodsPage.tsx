import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, Check, CreditCard, ImagePlus, Pencil, Plus, Power, Save, Search, Trash2, X } from 'lucide-react';
import type { TicketPaymentMethod } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { Modal } from '@/components/ui/Modal';
import { getImageFileExtension, processImageForUpload, validateImageFile } from '@/lib/image-processing';

interface EventOption { id: string; title: string; date: string; status: string; }
interface PaymentMethodView extends TicketPaymentMethod {
  events: Array<EventOption & { is_active: boolean }>;
  can_delete: boolean;
}
type PaymentMethodResponse = TicketPaymentMethod & {
  events?: Array<EventOption & { is_active: boolean }>;
  can_delete?: boolean;
};
type PaymentDraft = { id?: string; event_ids: string[]; recipient_name: string; bank_name: string; account_number: string; qris_storage_path: string; note: string };

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

const EMPTY_DRAFT: PaymentDraft = { event_ids: [], recipient_name: '', bank_name: '', account_number: '', qris_storage_path: '', note: '' };

export function TicketPaymentMethodsPage({ events, onBack }: { events: EventOption[]; onBack: () => void }) {
  const [methods, setMethods] = useState<PaymentMethodView[]>([]);
  const [supportsMultiEvent, setSupportsMultiEvent] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [methodToDelete, setMethodToDelete] = useState<PaymentMethodView | null>(null);
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [methodSearch, setMethodSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await paymentAction<{ methods: PaymentMethodResponse[]; events?: EventOption[]; supports_multi_event?: boolean }>({ action: 'payment-methods' });
    setLoading(false);
    if (loadError || !data) {
      setError(loadError ?? 'Informasi pembayaran gagal dimuat.');
      return;
    }
    setSupportsMultiEvent(data.supports_multi_event === true || (data.methods ?? []).some((method) => Array.isArray(method.events)));
    const eventById = new Map([...(events ?? []), ...(data.events ?? [])].map((event) => [event.id, event]));
    setMethods((data.methods ?? []).map((method) => {
      const assignedEvents = Array.isArray(method.events)
        ? method.events
        : method.event_id && eventById.has(method.event_id)
          ? [{ ...eventById.get(method.event_id)!, is_active: method.is_active }]
          : [];
      return {
        ...method,
        events: assignedEvents,
        can_delete: method.can_delete ?? true,
      };
    }));
  }, [events]);

  useEffect(() => { void load(); }, [load]);

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, event_ids: events[0] ? [events[0].id] : [] });
    setEventSearch('');
    setQrisFile(null);
    setError('');
  }

  function openEdit(method: PaymentMethodView) {
    setDraft({ id: method.id, event_ids: method.events.map((event) => event.id), recipient_name: method.recipient_name, bank_name: method.bank_name ?? '', account_number: method.account_number ?? '', qris_storage_path: method.qris_storage_path ?? '', note: method.note ?? '' });
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
    const { error: saveError } = await paymentAction({
      action: 'save-payment-method',
      payment_method: {
        ...draft,
        event_id: draft.event_ids[0],
        qris_storage_path: qrisPath,
      },
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setDraft(null);
    setQrisFile(null);
    await load();
  }

  async function toggleMethod(method: PaymentMethodView, eventId: string, isActive: boolean) {
    setSaving(true);
    setError('');
    const { error: actionError } = await paymentAction({
      action: isActive ? 'deactivate-payment-method' : 'activate-payment-method',
      payment_method_id: method.id,
      event_id: eventId,
    });
    setSaving(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    await load();
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
    `${method.recipient_name} ${method.bank_name ?? ''} ${method.account_number ?? ''} ${method.events.map((event) => event.title).join(' ')}`
      .toLowerCase().includes(methodSearch.trim().toLowerCase())
  ));
  const selectedEventNames = draft?.event_ids.map((id) => events.find((event) => event.id === id)?.title).filter((title): title is string => Boolean(title)) ?? [];
  const paymentForm = draft && (
    <form onSubmit={save} className={draft.id ? 'space-y-4' : 'space-y-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5'}>
      {!draft.id && <div className="flex items-center justify-between gap-3"><h2 className="font-extrabold text-slate-900">Informasi Baru</h2><button type="button" onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="h-4 w-4" /></button></div>}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-semibold text-slate-600">Event yang menggunakan informasi ini</label>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{selectedEventNames.length} dipilih</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 p-2">
            <span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Cari Event..." /></span>
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
        <p className="text-[11px] text-slate-500">Status aktif diatur terpisah untuk setiap Event. Event baru akan tersimpan nonaktif.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nama penerima</span><input required className="input-field" value={draft.recipient_name} onChange={(event) => setDraft({ ...draft, recipient_name: event.target.value })} placeholder="Nama penerima" /></label>
        <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Bank</span><input className="input-field" value={draft.bank_name} onChange={(event) => setDraft({ ...draft, bank_name: event.target.value })} placeholder="Contoh: BCA" /></label>
        <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nomor rekening</span><input className="input-field" inputMode="numeric" value={draft.account_number} onChange={(event) => setDraft({ ...draft, account_number: event.target.value })} placeholder="Nomor rekening" /></label>
      </div>
      <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>QRIS statis (opsional)</span><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setQrisFile(event.target.files?.[0] ?? null)} /><span className="block text-[11px] font-normal text-slate-500">{draft.qris_storage_path && !qrisFile ? 'QRIS tersimpan. Pilih file baru bila ingin mengganti.' : 'JPG, PNG, WEBP · Maks. 5 MB'}</span></label>
      <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>Catatan (opsional)</span><textarea className="input-field min-h-20" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      <button type="submit" disabled={saving} className="btn-primary w-full"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Informasi'}</button>
    </form>
  );

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Informasi Pembayaran" subtitle="Tujuan pembayaran aktif dipilih per Event." onBack={onBack} action={<button type="button" onClick={openNew} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50" aria-label="Tambah informasi pembayaran" title="Tambah informasi pembayaran"><Plus className="h-5 w-5" /></button>} />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {draft?.id && <Modal open onClose={() => setDraft(null)} title="Edit Informasi Pembayaran" size="lg">{paymentForm}</Modal>}
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
      {draft && !draft.id && paymentForm}
      {!loading && methods.length > 0 && <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-9" value={methodSearch} onChange={(event) => setMethodSearch(event.target.value)} placeholder="Cari nama Event, penerima, atau bank..." /></label>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !methods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada informasi pembayaran.</div> : !filteredMethods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada informasi pembayaran yang cocok.</div> : <div className="space-y-3">{filteredMethods.map((method) => <article key={method.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{method.qris_storage_path ? <ImagePlus className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><h2 className="font-extrabold text-slate-900">{method.recipient_name}</h2>{method.bank_name && <p className="mt-1 text-sm text-slate-700">{method.bank_name} · {method.account_number}</p>}{method.note && <p className="mt-1 text-xs text-slate-500">{method.note}</p>}</div></div>
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Event yang menggunakan</p>{method.events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"><div><p className="text-sm font-semibold text-slate-800">{event.title}</p><p className="text-xs text-slate-500">{event.date}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${event.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{event.is_active ? 'Aktif' : 'Nonaktif'}</span><button type="button" onClick={() => void toggleMethod(method, event.id, event.is_active)} disabled={saving} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${event.is_active ? 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}><Power className="h-3.5 w-3.5" />{event.is_active ? 'Nonaktifkan' : <><Check className="h-3.5 w-3.5" /> Aktifkan</>}</button></div></div>)}</div>
        {method.qris_storage_path && <img src={signedQrisUrl(method.qris_storage_path)} alt={`QRIS ${method.recipient_name}`} className="mt-3 max-h-44 rounded-xl border border-slate-200 object-contain" />}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => openEdit(method)} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs"><Pencil className="h-4 w-4" /> Edit</button>{method.can_delete && <button type="button" onClick={() => void deleteMethod(method)} disabled={saving} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs text-red-700"><Trash2 className="h-4 w-4" /> Hapus</button>}</div>
      </article>)}</div>}
      <p className="flex items-center gap-2 text-xs text-slate-500"><CreditCard className="h-4 w-4" /> Order menyimpan snapshot tujuan pembayaran saat dibuat.</p>
    </div>
  );
}