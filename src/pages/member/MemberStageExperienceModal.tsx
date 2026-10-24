import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { MemberStageExperience, MemberStageRole } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { MemberModal } from '@/components/member/MemberModal';
import { formatDate, safeExternalUrl } from '@/lib/format';

const ROLE_OPTIONS: MemberStageRole[] = [
  'Special Show',
  'Guest Star',
  'Lineup / Penampil',
  'Juri',
  'Opener',
  'MC / Host',
  'Lainnya',
];

function getRoleLabel(role: MemberStageRole): string {
  return role === 'Lineup / Penampil' ? 'Lineup' : role;
}

const EMPTY_FORM = {
  event_date: '',
  event_name: '',
  event_type: '',
  role: 'Opener' as MemberStageRole,
  custom_role: '',
  organizer: '',
  city: '',
  external_url: '',
};

export function MemberStageExperienceModal({ komikaId, onClose }: { komikaId: string; onClose: () => void }) {
  const [rows, setRows] = useState<MemberStageExperience[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setRows([]);
    const { data, error: loadError } = await supabase.from('member_stage_experiences')
      .select('*')
      .eq('komika_id', komikaId)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error('Failed to load member stage experiences', loadError);
      setError('Daftar pengalaman gagal dimuat. Coba lagi beberapa saat.');
    } else {
      setRows((data ?? []) as MemberStageExperience[]);
    }
    setLoading(false);
  }, [komikaId]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setRoleDropdownOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function editRow(row: MemberStageExperience) {
    setRoleDropdownOpen(false);
    setEditingId(row.id);
    setForm({
      event_date: row.event_date,
      event_name: row.event_name,
      event_type: row.event_type ?? '',
      role: row.role,
      custom_role: row.custom_role ?? '',
      organizer: row.organizer ?? '',
      city: row.city,
      external_url: row.external_url ?? '',
    });
    setError('');
    setNotice('');
  }

  async function saveExperience(submit: React.FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (saving) return;
    const eventName = form.event_name.trim();
    const city = form.city.trim();
    let externalUrl: string | null = null;
    if (!eventName || eventName.length > 160 || !city || city.length > 100) {
      setError('Nama Event dan Kota wajib diisi. Pastikan nama maksimal 160 karakter dan kota maksimal 100 karakter.');
      return;
    }
    if (form.event_type.trim().length > 100 || form.organizer.trim().length > 160 || form.custom_role.trim().length > 100) {
      setError('Jenis Event/Peran maksimal 100 karakter dan Penyelenggara maksimal 160 karakter.');
      return;
    }
    if (form.role === 'Lainnya' && !form.custom_role.trim()) {
      setError('Isi nama peran khusus jika memilih Lainnya.');
      return;
    }
    if (form.external_url.trim()) {
      externalUrl = safeExternalUrl(form.external_url);
      if (!externalUrl || !externalUrl.startsWith('https://')) {
        setError('Tautan harus berupa URL HTTPS yang valid. Tautan boleh dikosongkan.');
        return;
      }
    }

    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      komika_id: komikaId,
      event_date: form.event_date,
      event_name: eventName,
      event_type: form.event_type.trim() || null,
      role: form.role,
      custom_role: form.role === 'Lainnya' ? form.custom_role.trim() : null,
      organizer: form.organizer.trim() || null,
      city,
      external_url: externalUrl,
      updated_at: new Date().toISOString(),
    };
    const result = editingId
      ? await supabase.from('member_stage_experiences').update(payload).eq('id', editingId).eq('komika_id', komikaId)
      : await supabase.from('member_stage_experiences').insert(payload);
    setSaving(false);
    if (result.error) {
      console.error('Failed to save member stage experience', result.error);
      setError('Pengalaman gagal disimpan. Periksa koneksi dan coba lagi.');
      return;
    }
    resetForm();
    setNotice(editingId ? 'Pengalaman berhasil diperbarui.' : 'Pengalaman berhasil ditambahkan.');
    await load();
  }

  async function deleteRow(row: MemberStageExperience) {
    if (!window.confirm(`Hapus pengalaman "${row.event_name}"?`)) return;
    setError('');
    const { error: deleteError } = await supabase.from('member_stage_experiences')
      .delete().eq('id', row.id).eq('komika_id', komikaId);
    if (deleteError) {
      console.error('Failed to delete member stage experience', deleteError);
      setError('Pengalaman gagal dihapus. Coba lagi.');
      return;
    }
    if (editingId === row.id) resetForm();
    setNotice('Pengalaman berhasil dihapus.');
    await load();
  }

  return (
    <MemberModal open onClose={onClose} title="Kelola Perjalanan Panggung" titleEyebrow="Perjalanan Lainnya" size="lg">
      <div className="space-y-5">
        <p className="text-sm leading-6 text-slate-600">Catat penampilan di luar Event resmi Standupindo Cilegon. Pengalaman yang disimpan akan tampil pada profil publikmu.</p>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p>}

        <form onSubmit={(submit) => void saveExperience(submit)} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <h4 className="font-extrabold text-slate-900">{editingId ? 'Edit Pengalaman' : 'Tambah Pengalaman'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field" htmlFor="stage-experience-name">Nama Event <span aria-hidden="true">*</span></label>
              <input id="stage-experience-name" value={form.event_name} onChange={(change) => setForm((current) => ({ ...current, event_name: change.target.value }))} maxLength={160} required className="input-field" placeholder="Nama Event" />
            </div>
            <div>
              <label className="label-field" htmlFor="stage-experience-type">Jenis Event (Opsional)</label>
              <input id="stage-experience-type" value={form.event_type} onChange={(change) => setForm((current) => ({ ...current, event_type: change.target.value }))} maxLength={100} className="input-field" placeholder="Standup Comedy" />
            </div>
            <div>
              <label className="label-field" htmlFor="stage-experience-date">Tanggal Event <span aria-hidden="true">*</span></label>
              <input id="stage-experience-date" type="date" value={form.event_date} onChange={(change) => setForm((current) => ({ ...current, event_date: change.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="label-field" id="stage-experience-role-label">Peran Saat Tampil <span aria-hidden="true">*</span></label>
              <div
                className="relative"
                onBlur={(blurEvent) => {
                  if (!(blurEvent.relatedTarget instanceof Node) || !blurEvent.currentTarget.contains(blurEvent.relatedTarget)) {
                    setRoleDropdownOpen(false);
                  }
                }}
              >
                <button
                  id="stage-experience-role"
                  type="button"
                  aria-labelledby="stage-experience-role-label"
                  aria-haspopup="listbox"
                  aria-expanded={roleDropdownOpen}
                  onClick={() => setRoleDropdownOpen((open) => !open)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Escape') setRoleDropdownOpen(false);
                  }}
                  className="input-field flex min-h-12 items-center justify-between gap-3 text-left"
                >
                  <span className="truncate font-semibold">{getRoleLabel(form.role)}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {roleDropdownOpen && <div role="listbox" aria-labelledby="stage-experience-role-label" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {ROLE_OPTIONS.map((role) => {
                    const isSelected = form.role === role;
                    return <button
                      key={role}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setForm((current) => ({ ...current, role }));
                        setRoleDropdownOpen(false);
                      }}
                      className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${isSelected ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold">{getRoleLabel(role)}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                    </button>;
                  })}
                </div>}
              </div>
            </div>
            {form.role === 'Lainnya' && <div>
              <label className="label-field" htmlFor="stage-experience-custom-role">Nama Peran Khusus <span aria-hidden="true">*</span></label>
              <input id="stage-experience-custom-role" value={form.custom_role} onChange={(change) => setForm((current) => ({ ...current, custom_role: change.target.value }))} maxLength={100} required className="input-field" placeholder="Nama Peran" />
            </div>}
            <div>
              <label className="label-field" htmlFor="stage-experience-organizer">Penyelenggara (Opsional)</label>
              <input id="stage-experience-organizer" value={form.organizer} onChange={(change) => setForm((current) => ({ ...current, organizer: change.target.value }))} maxLength={160} className="input-field" placeholder="Nama Penyelenggara" />
            </div>
            <div>
              <label className="label-field" htmlFor="stage-experience-city">Kota <span aria-hidden="true">*</span></label>
              <input id="stage-experience-city" value={form.city} onChange={(change) => setForm((current) => ({ ...current, city: change.target.value }))} maxLength={100} required className="input-field" placeholder="Kota Event" />
            </div>
            <div className="sm:col-span-2">
              <label className="label-field" htmlFor="stage-experience-url">Tautan Poster (Opsional)</label>
              <input id="stage-experience-url" type="url" value={form.external_url} onChange={(change) => setForm((current) => ({ ...current, external_url: change.target.value }))} className="input-field" placeholder="https://..." />
              <p className="mt-1 text-xs text-slate-500">Gunakan tautan HTTPS jika ingin menambahkan poster, dokumentasi, atau informasi acara.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 !py-2.5"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : <><Plus className="h-4 w-4" />Tambah Pengalaman</>}</button>
            {editingId && <button type="button" onClick={resetForm} className="btn-secondary !px-3" aria-label="Batal edit"><X className="h-4 w-4" /></button>}
          </div>
        </form>

        <section aria-label="Daftar perjalanan lainnya">
          <h4 className="mb-2 font-extrabold text-slate-900">Pengalaman Tersimpan</h4>
          {loading ? <p className="py-5 text-center text-sm text-slate-500">Memuat pengalaman...</p>
            : error ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Daftar pengalaman belum tersedia.</p>
              : rows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Belum ada perjalanan lain. Tambahkan pengalaman pertamamu.</p>
              : <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                {rows.map((row) => {
                  const url = safeExternalUrl(row.external_url);
                  return <li key={row.id} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-500">{formatDate(row.event_date)}</p>
                      <p className="font-bold text-slate-900">{row.event_name}</p>
                      {row.event_type && <p className="text-xs text-slate-500">{row.event_type}</p>}
                      <p className="text-sm text-slate-700">{row.role === 'Lainnya' ? row.custom_role : getRoleLabel(row.role)}</p>
                      <p className="text-xs text-slate-500">{[row.organizer, row.city].filter(Boolean).join(' · ')}</p>
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">Buka tautan <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <button type="button" onClick={() => editRow(row)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label={`Edit ${row.event_name}`} title={`Edit ${row.event_name}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void deleteRow(row)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Hapus ${row.event_name}`} title={`Hapus ${row.event_name}`}><Trash2 className="h-4 w-4" /></button>
                  </li>;
                })}
              </ul>}
        </section>
      </div>
    </MemberModal>
  );
}
