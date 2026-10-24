import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ImageIcon, MapPin, Pencil, Save, Star, Trash2, UserRound, X } from 'lucide-react';
import type { EventItem, EventLineupEntry, EventLineupRole, Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { formatDate, safeExternalUrl } from '@/lib/format';

const ROLE_OPTIONS: { value: EventLineupRole; label: string }[] = [
  { value: 'special_show', label: 'Special Show' },
  { value: 'guest_star', label: 'Guest Star' },
  { value: 'lineup', label: 'Lineup' },
  { value: 'judge', label: 'Juri' },
  { value: 'opener', label: 'Opener' },
  { value: 'mc_host', label: 'MC / Host' },
  { value: 'other', label: 'Lainnya' },
];

const EMPTY_FORM = {
  performer_name: '',
  komika_id: '',
  role_category: 'lineup' as EventLineupRole,
  role_title: '',
  photo_url: '',
  external_url: '',
};

type LineupMember = Pick<Komika, 'stage_name' | 'photo' | 'photo_card'>;
type LineupRecord = Omit<EventLineupEntry, 'komika'> & {
  komika: LineupMember[] | null;
};

function getRoleLabel(role: EventLineupRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? 'Lainnya';
}

export function EventLineupManagementModal({ event, onClose }: { event: EventItem | null; onClose: () => void }) {
  const [entries, setEntries] = useState<LineupRecord[]>([]);
  const [members, setMembers] = useState<Pick<Komika, 'id' | 'stage_name' | 'photo' | 'photo_card'>[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState('');
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    setError('');
    setEntries([]);
    setMembers([]);
    const [lineupResult, membersResult] = await Promise.all([
      supabase.from('event_lineups')
        .select('id, event_id, komika_id, performer_name, role_category, role_title, photo_url, external_url, sort_order, created_at, updated_at, komika:komika_id(stage_name, photo, photo_card)')
        .eq('event_id', event.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('komika')
        .select('id, stage_name, photo, photo_card')
        .eq('published', true)
        .eq('status', 'active')
        .order('stage_name', { ascending: true }),
    ]);

    if (lineupResult.error || membersResult.error) {
      console.error('Failed to load event lineup management data', lineupResult.error ?? membersResult.error);
      setError('Data pengisi acara gagal dimuat. Coba tutup lalu buka modal lagi.');
    } else {
      setEntries((lineupResult.data ?? []) as unknown as LineupRecord[]);
      setMembers((membersResult.data ?? []) as Pick<Komika, 'id' | 'stage_name' | 'photo' | 'photo_card'>[]);
    }
    setLoading(false);
  }, [event]);

  useEffect(() => {
    if (!event) return;
    setForm(EMPTY_FORM);
    setUploadedPhotoUrl('');
    setEditingId(null);
    setNotice('');
    void load();
  }, [event, load]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selectedMember = form.komika_id ? memberById.get(form.komika_id) : null;
  const sortedEntries = useMemo(() => [...entries].sort((first, second) => {
    const firstOrder = ROLE_OPTIONS.findIndex((role) => role.value === first.role_category);
    const secondOrder = ROLE_OPTIONS.findIndex((role) => role.value === second.role_category);
    return firstOrder - secondOrder || first.sort_order - second.sort_order || first.created_at.localeCompare(second.created_at);
  }), [entries]);

  function selectMember(memberId: string) {
    const selected = memberById.get(memberId);
    if (selected) setUploadedPhotoUrl('');
    setForm((current) => ({
      ...current,
      komika_id: memberId,
      performer_name: selected?.stage_name ?? (current.komika_id ? '' : current.performer_name),
      photo_url: selected ? '' : current.photo_url,
    }));
    setMemberDropdownOpen(false);
  }

  function startEdit(entry: LineupRecord) {
    setMemberDropdownOpen(false);
    setRoleDropdownOpen(false);
    setEditingId(entry.id);
    setForm({
      performer_name: entry.performer_name,
      komika_id: entry.komika_id ?? '',
      role_category: entry.role_category,
      role_title: entry.role_title ?? '',
      photo_url: entry.photo_url ?? '',
      external_url: entry.external_url ?? '',
    });
    setUploadedPhotoUrl(entry.komika_id ? '' : entry.photo_url ?? '');
    setError('');
    setNotice('');
  }

  function resetForm() {
    setMemberDropdownOpen(false);
    setRoleDropdownOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUploadedPhotoUrl('');
    setError('');
  }

  async function saveEntry(eventSubmit: React.FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!event || saving) return;
    const name = form.performer_name.trim();
    const photoUrl = uploadedPhotoUrl || safeExternalUrl(form.photo_url);
    const externalUrl = form.komika_id ? null : safeExternalUrl(form.external_url);
    if (!name) {
      setError('Nama pengisi acara wajib diisi.');
      return;
    }
    if (!form.komika_id && form.external_url.trim() && (!externalUrl || !externalUrl.startsWith('https://'))) {
      setError('Link Pengisi Acara harus menggunakan URL HTTPS yang valid.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      event_id: event.id,
      komika_id: form.komika_id || null,
      performer_name: name,
      role_category: form.role_category,
      role_title: form.role_category === 'other' ? form.role_title.trim() || null : null,
      photo_url: photoUrl,
      external_url: externalUrl,
      updated_at: new Date().toISOString(),
    };
    const result = editingId
      ? await supabase.from('event_lineups').update(payload).eq('id', editingId)
      : await supabase.from('event_lineups').insert(payload);
    setSaving(false);
    if (result.error) {
      console.error('Failed to save event lineup entry', result.error);
      setError(result.error.code === '23505'
        ? 'Pengisi acara ini sudah tercatat pada Event tersebut.'
        : 'Pengisi acara gagal disimpan. Periksa izin Admin Event dan coba lagi.');
      return;
    }
    resetForm();
    setNotice(editingId ? 'Pengisi acara berhasil diperbarui.' : 'Pengisi acara berhasil ditambahkan.');
    await load();
  }

  async function deleteEntry(entry: LineupRecord) {
    if (!window.confirm(`Hapus ${entry.komika?.[0]?.stage_name ?? entry.performer_name} dari lineup Event ini?`)) return;
    setError('');
    const { error: deleteError } = await supabase.from('event_lineups').delete().eq('id', entry.id);
    if (deleteError) {
      console.error('Failed to delete event lineup entry', deleteError);
      setError('Pengisi acara gagal dihapus. Periksa izin Admin Event dan coba lagi.');
      return;
    }
    setNotice('Pengisi acara berhasil dihapus.');
    await load();
  }

  return (
    <Modal
      open={Boolean(event)}
      onClose={onClose}
      title="Pengisi Acara"
      titleEyebrow="LINEUP EVENT"
      headerContent={event && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-2.5">
          <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white bg-slate-100 shadow-sm">
            {event.poster
              ? <img src={event.poster} alt={`Poster ${event.title}`} className="h-full w-full object-cover" />
              : <ImageIcon className="h-5 w-5 text-slate-400" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Mengelola Lineup Untuk</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-extrabold leading-snug text-slate-900">{event.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{formatDate(event.date)}</span>
              {event.venue && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{event.venue}</span></span>}
            </div>
          </div>
        </div>
      )}
      size="lg"
    >
      <div className="space-y-5">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p>}

        <form onSubmit={(submit) => void saveEntry(submit)} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <h4 className="font-extrabold text-slate-900">{editingId ? 'Edit Pengisi Acara' : 'Tambah Pengisi Acara'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field" id="lineup-member-label">Profil Member (Opsional)</label>
              <div
                className="relative"
                onBlur={(blurEvent) => {
                  if (!(blurEvent.relatedTarget instanceof Node) || !blurEvent.currentTarget.contains(blurEvent.relatedTarget)) {
                    setMemberDropdownOpen(false);
                  }
                }}
              >
                <button
                  id="lineup-member"
                  type="button"
                  aria-labelledby="lineup-member-label"
                  aria-haspopup="listbox"
                  aria-expanded={memberDropdownOpen}
                  onClick={() => setMemberDropdownOpen((open) => !open)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Escape') setMemberDropdownOpen(false);
                  }}
                  className="input-field flex min-h-12 items-center justify-between gap-3 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {selectedMember ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-blue-700">
                        {selectedMember.photo_card || selectedMember.photo
                          ? <img src={selectedMember.photo_card || selectedMember.photo || ''} alt="" className="h-full w-full object-cover" />
                          : selectedMember.stage_name.charAt(0).toUpperCase()}
                      </span>
                    ) : <UserRound className="h-4 w-4 shrink-0 text-slate-500" />}
                    <span className="truncate">{selectedMember?.stage_name ?? 'Pengisi Acara Eksternal'}</span>
                    {selectedMember && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Dipilih</span>}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${memberDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {memberDropdownOpen && <div role="listbox" aria-labelledby="lineup-member-label" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!form.komika_id}
                    onClick={() => selectMember('')}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRound className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 font-semibold text-slate-800">Pengisi Acara Eksternal</span>
                    {!form.komika_id && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                  {members.map((member) => {
                    const savedEntry = entries.find((entry) => entry.komika_id === member.id);
                    const assignedElsewhere = savedEntry && savedEntry.id !== editingId;
                    const isCurrentSelection = form.komika_id === member.id;
                    const memberPhoto = member.photo_card || member.photo;
                    return <button
                      key={member.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrentSelection}
                      disabled={Boolean(assignedElsewhere)}
                      onClick={() => selectMember(member.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${assignedElsewhere ? 'cursor-not-allowed bg-slate-50 opacity-70' : 'hover:bg-blue-50'}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-blue-700">
                        {memberPhoto ? <img src={memberPhoto} alt="" className="h-full w-full object-cover" /> : member.stage_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{member.stage_name}</span>
                      {savedEntry && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${assignedElsewhere ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                        {assignedElsewhere ? `Sudah: ${getRoleLabel(savedEntry.role_category)}` : `Saat Ini: ${getRoleLabel(savedEntry.role_category)}`}
                      </span>}
                      {isCurrentSelection && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                    </button>;
                  })}
                </div>}
              </div>
            </div>
            <div>
              <label className="label-field" htmlFor="lineup-name">Nama Pengisi Acara</label>
              <input id="lineup-name" value={form.performer_name} onChange={(change) => setForm((current) => ({ ...current, performer_name: change.target.value }))} maxLength={160} required className="input-field" placeholder="Nama Panggung" />
            </div>
            <div>
              <label className="label-field" id="lineup-role-label">Kategori / Peran</label>
              <div
                className="relative"
                onBlur={(blurEvent) => {
                  if (!(blurEvent.relatedTarget instanceof Node) || !blurEvent.currentTarget.contains(blurEvent.relatedTarget)) {
                    setRoleDropdownOpen(false);
                  }
                }}
              >
                <button
                  id="lineup-role"
                  type="button"
                  aria-labelledby="lineup-role-label"
                  aria-haspopup="listbox"
                  aria-expanded={roleDropdownOpen}
                  onClick={() => setRoleDropdownOpen((open) => !open)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Escape') setRoleDropdownOpen(false);
                  }}
                  className="input-field flex min-h-12 items-center justify-between gap-3 text-left"
                >
                  <span className="truncate font-semibold">{getRoleLabel(form.role_category)}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {roleDropdownOpen && <div role="listbox" aria-labelledby="lineup-role-label" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {ROLE_OPTIONS.map((role) => {
                    const isSelected = form.role_category === role.value;
                    return <button
                      key={role.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setForm((current) => ({ ...current, role_category: role.value }));
                        setRoleDropdownOpen(false);
                      }}
                      className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${isSelected ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold">{role.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                    </button>;
                  })}
                </div>}
              </div>
            </div>
            {form.role_category === 'other' && <div>
              <label className="label-field" htmlFor="lineup-role-title">Nama Peran (Opsional)</label>
              <input id="lineup-role-title" value={form.role_title} onChange={(change) => setForm((current) => ({ ...current, role_title: change.target.value }))} maxLength={100} className="input-field" placeholder="Contoh: Penampil Utama" />
            </div>}
            {!form.komika_id && <div className="space-y-3 sm:col-span-2">
              <p className="label-field">Foto Pengisi Acara Eksternal (Opsional)</p>
              <ImageUpload
                label="Foto Pengisi Acara"
                folder="event-lineups"
                value={uploadedPhotoUrl}
                onChange={(url) => {
                  setUploadedPhotoUrl(url);
                  setForm((current) => ({ ...current, photo_url: url }));
                }}
                aspect="square"
                compact
                skipCrop
                processingProfile="avatar"
              />
              {uploadedPhotoUrl && <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5">
                <img src={uploadedPhotoUrl} alt={`Preview foto ${form.performer_name || 'pengisi acara'}`} className="h-28 w-20 shrink-0 rounded-lg bg-slate-100 object-cover object-top shadow-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">Preview Foto Lineup</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">Foto ini akan tampil pada kartu pengisi acara publik.</p>
                </div>
              </div>}
              {!form.photo_url && <p className="text-xs text-slate-500">Foto opsional. Upload foto jika ingin menampilkannya di lineup.</p>}
              <div>
                <label className="label-field" htmlFor="lineup-external-link">Link Pengisi Acara (Opsional)</label>
                <input id="lineup-external-link" type="url" value={form.external_url} onChange={(change) => setForm((current) => ({ ...current, external_url: change.target.value }))} className="input-field" placeholder="https://..." />
                <p className="mt-1 text-xs text-slate-500">Jika diisi, kartu pengisi acara akan membuka link ini saat diklik.</p>
              </div>
            </div>}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 !py-2.5"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Pengisi Acara'}</button>
            {editingId && <button type="button" onClick={resetForm} className="btn-secondary !px-3" aria-label="Batal edit"><X className="h-4 w-4" /></button>}
          </div>
        </form>

        <section aria-label="Daftar pengisi acara">
          <h4 className="mb-2 flex items-center gap-2 font-extrabold text-slate-900"><Star className="h-4 w-4 text-amber-500" />Lineup Event</h4>
          {loading ? <p className="py-5 text-center text-sm text-slate-500">Memuat pengisi acara...</p>
            : error ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Daftar pengisi acara belum tersedia.</p>
              : entries.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Belum ada pengisi acara pada Event ini.</p>
              : <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                {sortedEntries.map((entry) => {
                  const member = entry.komika?.[0] ?? (entry.komika_id ? memberById.get(entry.komika_id) : null);
                  const name = member?.stage_name ?? entry.performer_name;
                  const photo = member?.photo_card || member?.photo || entry.photo_url;
                  const role = getRoleLabel(entry.role_category);
                  return <li key={entry.id} className="flex items-center gap-3 p-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm font-extrabold text-blue-700">
                      {photo ? <img src={photo} alt="" className="h-full w-full object-contain" /> : <UserRound className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{role}</span>
                        {entry.role_category === 'other' && entry.role_title && <span className="text-[10px] text-slate-500">{entry.role_title}</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => startEdit(entry)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label={`Edit ${name}`} title={`Edit ${name}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void deleteEntry(entry)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Hapus ${name}`} title={`Hapus ${name}`}><Trash2 className="h-4 w-4" /></button>
                  </li>;
                })}
              </ul>}
        </section>
      </div>
    </Modal>
  );
}
