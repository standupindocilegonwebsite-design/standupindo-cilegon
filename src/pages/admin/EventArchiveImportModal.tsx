import { useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, Upload } from 'lucide-react';
import type { EventLineupRole, Komika } from '@/lib/types';
import { getArchiveStageHistoryRole, matchArchivePerformers, parseEventArchive } from '@/lib/event-archive-import';
import { slugify } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

type MemberRow = Pick<Komika, 'id' | 'stage_name' | 'slug'>;
type ImportSummary = { events_created: number; lineups_created: number; experiences_created: number };

const ROLE_LABELS: Record<EventLineupRole, string> = {
  lineup: 'Lineup',
  opener: 'Opener',
  guest_star: 'Guest Star',
  mc_host: 'MC / Host',
  judge: 'Juri',
  special_show: 'Special Performance',
  other: 'Lainnya',
};

export function EventArchiveImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [sourceText, setSourceText] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parsed = useMemo(() => parseEventArchive(sourceText), [sourceText]);
  const previewEvents = useMemo(() => matchArchivePerformers(parsed.events, members), [parsed.events, members]);
  const linkedPerformers = previewEvents.flatMap((event) => event.performers).filter((performer) => performer.komikaId);
  const externalPerformers = previewEvents.flatMap((event) => event.performers).filter((performer) => !performer.komikaId);

  async function loadMembers() {
    if (membersLoaded || loadingMembers) return;
    setLoadingMembers(true);
    setError('');
    const { data, error: queryError } = await supabase.from('komika')
      .select('id, stage_name, slug')
      .eq('published', true)
      .eq('status', 'active')
      .order('stage_name', { ascending: true });
    setLoadingMembers(false);
    if (queryError) {
      console.error('Failed to load member profiles for archive import', queryError);
      setError('Daftar profil member gagal dimuat. Coba lagi sebelum mengimpor.');
      return;
    }
    setMembers((data ?? []) as MemberRow[]);
    setMembersLoaded(true);
  }

  async function importArchive() {
    if (importing || parsed.errors.length > 0 || previewEvents.length === 0) return;
    if (!membersLoaded) {
      await loadMembers();
      return;
    }
    setImporting(true);
    setError('');
    setSummary(null);

    const eventPayload = previewEvents.map((event) => ({
      title: event.title,
      slug: `${slugify(event.title)}-${event.date}-${event.sourceNumber}`,
      date: event.date,
      time: event.time,
      venue: event.venue,
      city: event.city,
      description: event.description,
    }));
    const lineupPayload = previewEvents.flatMap((event) => event.performers.map((performer, index) => ({
      event_title: event.title,
      event_date: event.date,
      venue: event.venue,
      performer_name: performer.memberStageName ?? performer.displayName,
      komika_id: performer.komikaId,
      role_category: performer.roles[0] ?? 'lineup',
      sort_order: index,
    })));
    const experiencesPayload = previewEvents.flatMap((event) => event.performers
      .filter((performer) => performer.komikaId)
      .flatMap((performer) => performer.roles.map((role) => {
        const historyRole = getArchiveStageHistoryRole(role);
        return {
          event_name: event.title,
          event_date: event.date,
          event_type: event.eventType,
          venue: event.venue,
          city: event.city,
          komika_id: performer.komikaId,
          role: historyRole.role,
          custom_role: historyRole.customRole,
        };
      })));

    const { data, error: rpcError } = await supabase.rpc('import_event_archive', {
      p_events: eventPayload,
      p_lineups: lineupPayload,
      p_experiences: experiencesPayload,
    });
    setImporting(false);
    if (rpcError) {
      console.error('Failed to import event archive', rpcError);
      setError(`Arsip gagal diimpor. Pastikan migration import arsip sudah diterapkan. ${rpcError.message}`);
      return;
    }
    if (!data || typeof data !== 'object'
      || !('events_created' in data) || typeof data.events_created !== 'number'
      || !('lineups_created' in data) || typeof data.lineups_created !== 'number'
      || !('experiences_created' in data) || typeof data.experiences_created !== 'number') {
      setError('Server menyelesaikan permintaan, tetapi ringkasan hasil impor tidak valid. Periksa daftar Event sebelum mencoba lagi.');
      return;
    }
    const result = data as ImportSummary;
    setSummary(result);
    onImported();
  }

  function close() {
    if (importing) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Impor Arsip Event" titleEyebrow="Event Workspace" size="xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">
          Tempel rekap teks Event. Sistem membuat arsip berstatus selesai, lineup, dan riwayat tampil member. Poster tetap kosong supaya bisa kamu tambahkan nanti dari Admin Event.
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-bold text-slate-800">Teks rekap</span>
          <textarea
            value={sourceText}
            onChange={(event) => { setSourceText(event.target.value); setSummary(null); setError(''); }}
            rows={10}
            className="input-field min-h-48 resize-y font-mono text-xs"
            placeholder={'Tempel data dengan format seperti:\n**1. Nama Event**\n- Lineup: Nama Komika\n- Tanggal: 25 Juli 2015\n- Jam: 19.30 WIB\n- Tempat: Venue'}
            aria-label="Teks rekap arsip Event"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500">Event terbaca</p>
            <p className="mt-1 text-xl font-black text-slate-900">{parsed.events.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-700">Terhubung ke member</p>
            <p className="mt-1 text-xl font-black text-emerald-900">{linkedPerformers.length}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">Pengisi eksternal</p>
            <p className="mt-1 text-xl font-black text-amber-900">{externalPerformers.length}</p>
          </div>
        </div>

        {!membersLoaded && parsed.events.length > 0 && (
          <button type="button" onClick={() => void loadMembers()} disabled={loadingMembers} className="btn-secondary flex w-full items-center justify-center gap-2">
            {loadingMembers ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {loadingMembers ? 'Memuat profil member...' : 'Cocokkan nama dengan profil member'}
          </button>
        )}

        {parsed.errors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-bold">Periksa format data:</p>
          <ul className="mt-1 list-inside list-disc">{parsed.errors.slice(0, 8).map((message) => <li key={message}>{message}</li>)}</ul>
        </div>}

        {previewEvents.length > 0 && (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {previewEvents.map((event) => {
              const linkedCount = event.performers.filter((performer) => performer.komikaId).length;
              const externalCount = event.performers.length - linkedCount;
              return <article key={`${event.date}:${event.title}`} className="rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{event.title}</h3>
                    <p className="text-xs text-slate-500">{event.date} · {event.venue} · {event.city} · tanpa poster</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{linkedCount} member · {externalCount} eksternal</span>
                </div>
                {event.performers.length > 0 && <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {event.performers.map((performer) => `${performer.displayName}${performer.komikaId ? ' (member)' : ' (eksternal)'} — ${performer.roles.map((role) => ROLE_LABELS[role]).join(' / ')}`).join('; ')}
                </p>}
              </article>;
            })}
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          <p><strong>Aturan pencocokan:</strong> nama harus cocok dengan nama panggung member; “Reza” tetap eksternal, “Devan” dipetakan ke Devan Yulio, “Robi Bojo” dan “Alfarobi” ke Mang Obi, “Diliana” ke Dili, serta “Masjol” ke Mas Jol. Nama yang tidak cocok disimpan sebagai pengisi eksternal pada lineup Event.</p>
          <p><strong>Catatan arsip:</strong> kota default Cilegon (judul yang jelas menyebut Serang memakai Serang), serta keterangan 27 peserta Audisi Recomic 6 masuk deskripsi Event.</p>
          <p><strong>Peran ganda:</strong> satu kartu lineup memakai peran utama; semua peran sumber dicatat dalam deskripsi Event dan riwayat member.</p>
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {summary && <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Impor selesai: {summary.events_created} Event baru, {summary.lineups_created} lineup baru, dan {summary.experiences_created} riwayat tampil member baru. Event yang sudah ada tidak dibuat ulang; poster yang ada tidak diubah.</p>}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={importing} className="btn-secondary">Tutup</button>
          <button
            type="button"
            onClick={() => void importArchive()}
            disabled={importing || parsed.events.length === 0 || parsed.errors.length > 0 || !membersLoaded}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Mengimpor arsip...' : 'Impor arsip yang ditinjau'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
