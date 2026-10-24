import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, Pencil, Plus, Trash2 } from 'lucide-react';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCcsDate, formatCcsTime, getCcsOccurrenceDate, getCcsRecurrenceLabel, getNextCcsWednesdayDate } from '@/lib/ccs';
import type { CcsSchedule } from '@/lib/types';

function CcsTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [openPart, setOpenPart] = useState<'hour' | 'minute' | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [hour = '', minute = ''] = value.split(':');

  useEffect(() => {
    if (!openPart) return;
    function handleOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpenPart(null);
    }
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [openPart]);

  function selectPart(part: 'hour' | 'minute', selected: string) {
    const nextHour = part === 'hour' ? selected : hour || '19';
    const nextMinute = part === 'minute' ? selected : minute || '00';
    onChange(`${nextHour}:${nextMinute}`);
    setOpenPart(part === 'hour' ? 'minute' : null);
  }

  function renderTimePart(part: 'hour' | 'minute') {
    const options = part === 'hour' ? 24 : 60;
    const selectedValue = part === 'hour' ? hour : minute;

    return (
      <div key={part} className="relative min-w-0">
        <button
          type="button"
          aria-label={part === 'hour' ? 'Pilih jam' : 'Pilih menit'}
          aria-haspopup="listbox"
          aria-expanded={openPart === part}
          onClick={() => setOpenPart((current) => current === part ? null : part)}
          className={`flex h-10 w-full items-center justify-between gap-1 rounded-lg px-2.5 text-sm font-bold transition ${openPart === part ? 'bg-blue-100 text-blue-800' : 'bg-slate-50 text-slate-900 hover:bg-blue-50'}`}
        >
          <span className="min-w-0 truncate text-center">{selectedValue || '--'}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${openPart === part ? 'rotate-180' : ''}`} />
        </button>
        {openPart === part && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
            <p className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{part === 'hour' ? 'Pilih Jam' : 'Pilih Menit'}</p>
            <div role="listbox" aria-label={part === 'hour' ? 'Jam mulai' : 'Menit mulai'} className="max-h-36 overflow-y-auto overscroll-contain">
              {Array.from({ length: options }, (_, index) => String(index).padStart(2, '0')).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selectedValue === option}
                  onClick={() => selectPart(part, option)}
                  className={`flex min-h-9 w-full items-center justify-center rounded-lg text-sm font-bold tabular-nums transition ${selectedValue === option ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={pickerRef} className="relative">
      <div className={`flex min-h-14 w-full items-center gap-2 rounded-xl border bg-white px-3 shadow-sm transition focus-within:ring-2 focus-within:ring-blue-100 ${openPart ? 'border-blue-500' : 'border-slate-300 hover:border-blue-300'}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Clock3 className="h-4 w-4" />
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          {renderTimePart('hour')}
          <span className="text-base font-black text-slate-400">:</span>
          {renderTimePart('minute')}
        </div>
        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-extrabold text-slate-600">WIB</span>
      </div>
    </div>
  );
}

type ScheduleForm = {
  title: string;
  event_date: string;
  date_override: boolean;
  start_time: string;
  venue: string;
  maps_url: string;
  poster_url: string;
  is_published: boolean;
};

const EMPTY_FORM: ScheduleForm = {
  title: 'Cilegon Comedy Sharing (CCS)',
  event_date: getNextCcsWednesdayDate(),
  date_override: false,
  start_time: '',
  venue: '',
  maps_url: '',
  poster_url: '',
  is_published: false,
};

function scheduleToForm(schedule: CcsSchedule): ScheduleForm {
  return {
    title: schedule.title,
    event_date: getCcsOccurrenceDate(schedule),
    date_override: schedule.date_override,
    start_time: schedule.start_time?.slice(0, 5) ?? '',
    venue: schedule.venue ?? '',
    maps_url: schedule.maps_url ?? '',
    poster_url: schedule.poster_url ?? '',
    is_published: schedule.is_published,
  };
}

export function CcsScheduleAdminPage() {
  const { isAdmin, isOpenMicAdmin } = useAuth();
  const [schedules, setSchedules] = useState<CcsSchedule[]>([]);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPublication, setUpdatingPublication] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scheduleToDelete, setScheduleToDelete] = useState<CcsSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ccs_schedules')
      .select('id, title, event_date, date_override, start_time, venue, maps_url, poster_url, is_published, created_at, updated_at')
      .order('event_date', { ascending: false })
      .order('start_time', { ascending: false, nullsFirst: false });
    if (error) {
      console.error('Daftar jadwal CCS gagal dimuat.', error);
      setErrorMessage(`Jadwal gagal dimuat: ${error.message}`);
    } else {
      const nextSchedules = (data ?? []) as CcsSchedule[];
      setSchedules(nextSchedules);
      setErrorMessage('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin || isOpenMicAdmin) void loadSchedules();
  }, [isAdmin, isOpenMicAdmin, loadSchedules]);

  if (!isAdmin && !isOpenMicAdmin) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">Anda tidak memiliki akses untuk mengelola Jadwal CCS.</div>;
  }

  function updateForm<K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEditing(schedule: CcsSchedule) {
    setEditingId(schedule.id);
    setForm(scheduleToForm(schedule));
    setIsFormOpen(true);
    setMessage('');
    setErrorMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startCreating() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
    setMessage('');
    setErrorMessage('');
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    const mapsUrl = form.maps_url.trim();
    if (mapsUrl && !/^https:\/\//i.test(mapsUrl)) {
      setErrorMessage('Link Google Maps harus menggunakan HTTPS.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      event_date: form.event_date,
      date_override: form.date_override,
      start_time: form.start_time,
      venue: form.venue.trim() || null,
      maps_url: mapsUrl || null,
      poster_url: form.poster_url.trim() || null,
      is_published: form.is_published,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    const result = editingId
      ? await supabase.from('ccs_schedules').update(payload).eq('id', editingId)
      : await supabase.from('ccs_schedules').insert(payload);
    setSaving(false);
    if (result.error) {
      console.error('Jadwal CCS gagal disimpan.', result.error);
      setErrorMessage(`Jadwal gagal disimpan: ${result.error.message}`);
      return;
    }
    setMessage(editingId ? 'Jadwal CCS berhasil diperbarui.' : 'Jadwal CCS berhasil ditambahkan.');
    setIsFormOpen(false);
    setEditingId(null);
    await loadSchedules();
  }

  async function togglePublication(schedule: CcsSchedule) {
    setUpdatingPublication(true);
    const { error } = await supabase.from('ccs_schedules').update({
      is_published: !schedule.is_published,
      updated_at: new Date().toISOString(),
    }).eq('id', schedule.id);
    if (error) {
      setUpdatingPublication(false);
      console.error('Status publikasi Jadwal CCS gagal diperbarui.', error);
      setErrorMessage(`Status publikasi gagal diperbarui: ${error.message}`);
      return;
    }
    setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, is_published: !schedule.is_published } : item));
    setUpdatingPublication(false);
    setMessage(schedule.is_published ? 'Jadwal CCS dinonaktifkan.' : 'Jadwal CCS dipublikasikan.');
  }

  async function deleteSchedule(schedule: CcsSchedule) {
    setDeleting(true);
    const { error } = await supabase.from('ccs_schedules').delete().eq('id', schedule.id);
    setDeleting(false);
    if (error) {
      console.error('Jadwal CCS gagal dihapus.', error);
      setErrorMessage(`Jadwal gagal dihapus: ${error.message}`);
      setScheduleToDelete(null);
      return;
    }
    if (editingId === schedule.id) closeForm();
    setScheduleToDelete(null);
    setMessage('Jadwal CCS berhasil dihapus.');
    await loadSchedules();
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader eyebrow="Menu Lainnya" title="Jadwal Cilegon Comedy Sharing (CCS)" subtitle="Atur jadwal Cilegon Comedy Sharing yang ditampilkan di halaman Home." />

      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p>}
      {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{errorMessage}</p>}

      {loading && <div className="h-56 skeleton rounded-2xl" />}

      {!loading && schedules.length > 0 && !isFormOpen && (
        <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          {schedules.slice(0, 1).map((schedule) => (
            <article key={schedule.id}>
              {schedule.poster_url && (
                <div className="flex aspect-[4/3] max-h-[340px] items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 sm:aspect-[16/7] sm:p-6">
                  <img src={schedule.poster_url} alt={`Poster ${schedule.title}`} className="h-full w-full rounded-lg object-contain drop-shadow-[0_8px_14px_rgba(15,23,42,0.18)]" />
                </div>
              )}
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">{getCcsRecurrenceLabel(schedule)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${schedule.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{schedule.is_published ? 'Tampil di Home' : 'Disembunyikan'}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-black text-slate-950">{schedule.title}</h2>
                    <p className="mt-1 text-xs font-medium text-slate-500">Jadwal berikutnya · {formatCcsDate(getCcsOccurrenceDate(schedule))}{schedule.start_time ? ` · ${formatCcsTime(schedule.start_time)}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => startEditing(schedule)} aria-label="Edit pengaturan jadwal" title="Edit pengaturan" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setScheduleToDelete(schedule)} aria-label="Hapus jadwal CCS" title="Hapus jadwal" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 transition hover:bg-red-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <label className="ml-auto inline-flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 transition hover:bg-white">
                    <span className={`text-xs font-bold ${schedule.is_published ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {schedule.is_published ? 'Tampil di Home' : 'Disembunyikan'}
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={schedule.is_published ? 'Sembunyikan jadwal dari Home' : 'Tampilkan jadwal di Home'}
                      checked={schedule.is_published}
                      disabled={updatingPublication}
                      onChange={() => void togglePublication(schedule)}
                      className="peer sr-only"
                    />
                    <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-2 ${schedule.is_published ? 'bg-emerald-500 after:translate-x-5' : 'bg-slate-300'}`}>
                      <span className={`absolute inset-y-0 flex items-center text-white transition-opacity ${schedule.is_published ? 'left-1 opacity-100' : 'left-2 opacity-0'}`}><Check className="h-3 w-3" /></span>
                    </span>
                  </label>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && schedules.length === 0 && !isFormOpen && (
        <section className="rounded-2xl border border-dashed border-blue-200 bg-white p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto h-9 w-9 text-blue-500" />
          <h2 className="mt-3 text-base font-extrabold text-slate-900">Jadwal CCS belum dibuat</h2>
          <p className="mt-1 text-sm text-slate-500">Buat satu jadwal rutin. Nanti cukup edit poster atau tempat bila ada perubahan.</p>
          <button type="button" onClick={startCreating} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800">
            <Plus className="h-4 w-4" /> Buat Jadwal CCS
          </button>
        </section>
      )}

      {isFormOpen && (
      <form onSubmit={(event) => void saveSchedule(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{editingId ? 'Pengaturan Jadwal CCS' : 'Buat Jadwal CCS Mingguan'}</h2>
            <p className="mt-1 text-xs text-slate-500">Satu jadwal rutin untuk CCS. Poster, tempat, dan hari rutin bisa diperbarui di sini.</p>
          </div>
          {schedules.length > 0 && <button type="button" onClick={closeForm} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Batal</button>}
        </div>
        <ImageUpload label="Poster (opsional)" folder="ccs-schedules" value={form.poster_url} onChange={(value) => updateForm('poster_url', value)} aspect="auto" objectFit="contain" processingProfile="poster" onUploadingChange={setUploadingPoster} />
        <div className="grid gap-4 sm:grid-cols-2">
          {!editingId && (
            <fieldset className="space-y-1.5">
              <legend className="label-field">Waktu mulai <span className="font-semibold text-slate-500">(WIB)</span></legend>
              <CcsTimePicker value={form.start_time} onChange={(value) => updateForm('start_time', value)} />
              {!form.start_time && <p className="text-[11px] font-medium text-slate-500">Pilih jam dan menit mulai kegiatan.</p>}
            </fieldset>
          )}
          <label className="label-field">Tempat
            <input maxLength={180} value={form.venue} onChange={(event) => updateForm('venue', event.target.value)} className="input-field mt-1" placeholder="Nama venue atau lokasi" />
          </label>
          <label className="label-field sm:col-span-2">Link Google Maps (opsional)
            <input type="url" value={form.maps_url} onChange={(event) => updateForm('maps_url', event.target.value)} className="input-field mt-1" placeholder="https://maps.google.com/..." />
          </label>
        </div>
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Hari Rutin</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {form.date_override && form.event_date
                ? `Hari rutin saat ini: ${getCcsRecurrenceLabel({ date_override: true, event_date: form.event_date })}.`
                : 'Secara default CCS berlangsung setiap Rabu.'} Pilih tanggal untuk mengganti hari rutin ke depannya.
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            <input type="checkbox" checked={form.date_override} onChange={(event) => updateForm('date_override', event.target.checked)} className="h-4 w-4 accent-blue-700" />
            <span>{form.date_override ? 'Gunakan hari rutin pilihan' : 'Ubah hari rutin dari Rabu'}</span>
          </label>
          {form.date_override ? (
            <div className="rounded-xl border border-blue-100 bg-white p-3">
              <label className="label-field block">Pilih tanggal untuk menentukan hari rutin
                <input required type="date" value={form.event_date} onChange={(event) => updateForm('event_date', event.target.value)} className="input-field mt-1" />
              </label>
              {form.event_date && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold leading-5 text-blue-800">
                Setelah tanggal pertama, jadwal berulang setiap {getCcsRecurrenceLabel({ date_override: true, event_date: form.event_date }).replace(/^Setiap /i, '')}.
              </p>}
            </div>
          ) : (
            <p className="rounded-xl bg-white px-3 py-2.5 text-xs font-semibold leading-5 text-slate-600">
              Berikutnya: <span className="text-slate-900">Rabu, {formatCcsDate(getNextCcsWednesdayDate())}</span>. Tanggal akan maju otomatis setiap minggu.
            </p>
          )}
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-slate-800">
          <input type="checkbox" checked={form.is_published} onChange={(event) => updateForm('is_published', event.target.checked)} className="h-4 w-4 accent-blue-700" />
          Tampilkan jadwal ini di Home
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="submit" disabled={saving || uploadingPoster} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
            {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Menyimpan...' : uploadingPoster ? 'Menunggu upload poster...' : editingId ? 'Simpan Pengaturan' : 'Buat Jadwal Mingguan'}
          </button>
        </div>
      </form>
      )}
      <Modal open={Boolean(scheduleToDelete)} onClose={() => { if (!deleting) setScheduleToDelete(null); }} title="Hapus Jadwal CCS" titleEyebrow="Konfirmasi" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
              <Trash2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold leading-5 text-slate-900">Yakin ingin menghapus jadwal ini?</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Jadwal Cilegon Comedy Sharing (CCS){scheduleToDelete?.venue ? ` di ${scheduleToDelete.venue}` : ''} akan dihapus dan tidak lagi tampil di Home.
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={deleting} onClick={() => setScheduleToDelete(null)} className="btn-secondary">Batal</button>
            <button type="button" disabled={deleting || !scheduleToDelete} onClick={() => scheduleToDelete && void deleteSchedule(scheduleToDelete)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus...' : 'Ya, Hapus Jadwal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
