import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, CreditCard, ImagePlus, Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import type { TicketPaymentMethod } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { getImageFileExtension, processImageForUpload, validateImageFile } from '@/lib/image-processing';

interface EventOption { id: string; title: string; date: string; status: string; }
type PaymentDraft = { id?: string; event_id: string; recipient_name: string; bank_name: string; account_number: string; qris_storage_path: string; note: string };

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

const EMPTY_DRAFT: PaymentDraft = { event_id: '', recipient_name: '', bank_name: '', account_number: '', qris_storage_path: '', note: '' };

export function TicketPaymentMethodsPage({ events, onBack }: { events: EventOption[]; onBack: () => void }) {
  const [methods, setMethods] = useState<TicketPaymentMethod[]>([]);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await paymentAction<{ methods: TicketPaymentMethod[] }>({ action: 'payment-methods' });
    setLoading(false);
    if (loadError || !data) {
      setError(loadError ?? 'Informasi pembayaran gagal dimuat.');
      return;
    }
    setMethods(data.methods ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, event_id: events[0]?.id ?? '' });
    setQrisFile(null);
    setError('');
  }

  function openEdit(method: TicketPaymentMethod) {
    setDraft({ id: method.id, event_id: method.event_id, recipient_name: method.recipient_name, bank_name: method.bank_name ?? '', account_number: method.account_number ?? '', qris_storage_path: method.qris_storage_path ?? '', note: method.note ?? '' });
    setQrisFile(null);
    setError('');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
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
        event_id: draft.event_id,
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
    const { error: saveError } = await paymentAction({ action: 'save-payment-method', payment_method: { ...draft, qris_storage_path: qrisPath } });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setDraft(null);
    setQrisFile(null);
    await load();
  }

  async function toggleMethod(method: TicketPaymentMethod) {
    setSaving(true);
    setError('');
    const { error: actionError } = await paymentAction({ action: method.is_active ? 'deactivate-payment-method' : 'activate-payment-method', payment_method_id: method.id });
    setSaving(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    await load();
  }

  async function deleteMethod(method: TicketPaymentMethod) {
    if (!window.confirm(`Hapus informasi pembayaran untuk ${eventById.get(method.event_id)?.title ?? 'Event ini'}? Order yang sudah dibuat tetap memakai snapshot pembayaran.`)) return;
    setSaving(true);
    setError('');
    const { error: deleteError } = await paymentAction({ action: 'delete-payment-method', payment_method_id: method.id });
    setSaving(false);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    await load();
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const signedQrisUrl = (path: string) => supabase.storage.from('standupindo-media').getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Informasi Pembayaran" subtitle="Tujuan pembayaran aktif dipilih per Event." onBack={onBack} action={<button type="button" onClick={openNew} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50" aria-label="Tambah informasi pembayaran" title="Tambah informasi pembayaran"><Plus className="h-5 w-5" /></button>} />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {draft && <form onSubmit={save} className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-extrabold text-slate-900">{draft.id ? 'Edit Informasi' : 'Informasi Baru'}</h2><button type="button" onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Event</span><select required className="admin-ticket-select" value={draft.event_id} onChange={(event) => setDraft({ ...draft, event_id: event.target.value })}><option value="">Pilih Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nama penerima</span><input required className="input-field" value={draft.recipient_name} onChange={(event) => setDraft({ ...draft, recipient_name: event.target.value })} placeholder="Nama penerima" /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Bank</span><input className="input-field" value={draft.bank_name} onChange={(event) => setDraft({ ...draft, bank_name: event.target.value })} placeholder="Contoh: BCA" /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Nomor rekening</span><input className="input-field" inputMode="numeric" value={draft.account_number} onChange={(event) => setDraft({ ...draft, account_number: event.target.value })} placeholder="Nomor rekening" /></label>
        </div>
        <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>QRIS statis (opsional)</span><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setQrisFile(event.target.files?.[0] ?? null)} /><span className="block text-[11px] font-normal text-slate-500">{draft.qris_storage_path && !qrisFile ? 'QRIS tersimpan. Pilih file baru bila ingin mengganti.' : 'JPG, PNG, WEBP · Maks. 5 MB'}</span></label>
        <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>Catatan (opsional)</span><textarea className="input-field min-h-20" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        <button type="submit" disabled={saving} className="btn-primary w-full"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Informasi'}</button>
      </form>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !methods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada informasi pembayaran.</div> : <div className="space-y-3">{methods.map((method) => <article key={method.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{method.qris_storage_path ? <ImagePlus className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-xs font-semibold text-blue-700">{eventById.get(method.event_id)?.title ?? 'Event tidak tersedia'}</p><h2 className="mt-0.5 font-extrabold text-slate-900">{method.recipient_name}</h2>{method.bank_name && <p className="mt-1 text-sm text-slate-700">{method.bank_name} · {method.account_number}</p>}{method.note && <p className="mt-1 text-xs text-slate-500">{method.note}</p>}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${method.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{method.is_active ? 'Aktif' : 'Nonaktif'}</span></div>
        {method.qris_storage_path && <img src={signedQrisUrl(method.qris_storage_path)} alt={`QRIS ${eventById.get(method.event_id)?.title ?? 'Event'}`} className="mt-3 max-h-44 rounded-xl border border-slate-200 object-contain" />}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => openEdit(method)} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs"><Pencil className="h-4 w-4" /> Edit</button><button type="button" onClick={() => void toggleMethod(method)} disabled={saving} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${method.is_active ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}><Power className="h-4 w-4" />{method.is_active ? 'Nonaktifkan' : <><Check className="h-4 w-4" /> Aktifkan</>}</button><button type="button" onClick={() => void deleteMethod(method)} disabled={saving} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs text-red-700"><Trash2 className="h-4 w-4" /> Hapus</button></div>
      </article>)}</div>}
      <p className="flex items-center gap-2 text-xs text-slate-500"><CreditCard className="h-4 w-4" /> Order menyimpan snapshot tujuan pembayaran saat dibuat.</p>
    </div>
  );
}