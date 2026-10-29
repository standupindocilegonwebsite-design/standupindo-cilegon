import { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowRight, History, Info, Plus, Search } from 'lucide-react';
import { useHistoryEntryState, useRestoreScrollPosition, type Router } from '@/lib/router';
import type { OpenMic } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { OpenMicCard } from '@/components/cards/OpenMicCard';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SlidingTabIndicator } from '@/components/ui/SlidingTabIndicator';
import { formatDate, getOpenMicNumbers, getOpenMicStatus } from '@/lib/format';
import { MemberPerformanceHistoryPage } from '@/pages/member/MemberPerformanceHistoryPage';
import { Modal } from '@/components/ui/Modal';
import { MemberModal } from '@/components/member/MemberModal';

type PerformerSummary = {
  id: string;
  slug: string | null;
  fullName: string;
  stageName: string;
  instagram: string | null;
  community: string | null;
  totalAppearances: number;
  appearances: Array<{
    id: string;
    title: string;
    openMicNumber: number | undefined;
    appearanceNumber: number;
    venue: string;
    location: string;
    date: string;
    stageName: string;
    community: string | null;
  }>;
};

type PerformerRegistration = {
  open_mic_id: string;
  komika_id: string | null;
  full_name?: string | null;
  stage_name: string;
  community: string | null;
  instagram: string | null;
  attendance_status: string;
};

type MemberOpenMicTab = 'upcoming' | 'history';

function normalizePerformerValue(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatInstagramHandle(value: string): string {
  const username = value.trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/, 1)[0]
    .trim();
  return username ? `@${username}` : value.trim();
}

export function OpenMicPage({ router }: { router: Router }) {
  const isMemberPage = router.path === '/member/open-mic';
  const [memberTab, setMemberTab] = useState<MemberOpenMicTab>('upcoming');
  const memberTabsRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [mics, setMics] = useState<OpenMic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lineups, setLineups] = useState<Record<string, Array<{ stageName: string; slug: string | null }>>>({});
  const [performerSummaries, setPerformerSummaries] = useState<PerformerSummary[]>([]);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const [upcomingSearch, setUpcomingSearch] = useHistoryEntryState('open-mic-upcoming-search', '');
  const [completedSearch, setCompletedSearch] = useHistoryEntryState('open-mic-completed-search', '');
  const [completedSearchInfoOpen, setCompletedSearchInfoOpen] = useState(false);
  const [memberOpenMicInfoOpen, setMemberOpenMicInfoOpen] = useState(false);
  const [notificationTargetError, setNotificationTargetError] = useState('');
  const handledNotificationRegistrationId = useRef<string | null>(null);
  const navigateRef = useRef(router.navigate);
  navigateRef.current = router.navigate;
  const openMicNumbers = useMemo(() => getOpenMicNumbers(mics), [mics]);
  const latestCompletedMic = useMemo(() => mics
    .filter((mic) => getOpenMicStatus(mic.status, mic.date) === 'completed')
    .sort((first, second) => second.date.localeCompare(first.date)
      || (second.time ?? '').localeCompare(first.time ?? '')
      || (second.created_at ?? '').localeCompare(first.created_at ?? '')
      || second.id.localeCompare(first.id))[0], [mics]);
  const notificationRegistrationId = router.query.get('notificationRegistrationId');
  useRestoreScrollPosition(router, !isMemberPage && !loading);

  useEffect(() => {
    if (!isMemberPage || !notificationRegistrationId || handledNotificationRegistrationId.current === notificationRegistrationId) return;
    handledNotificationRegistrationId.current = notificationRegistrationId;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('open_mic_registrations')
        .select('id, open_mics(slug)')
        .eq('id', notificationRegistrationId)
        .maybeSingle();
      if (!active) return;
      const micSlug = (data?.open_mics as { slug?: string } | null)?.slug;
      if (error || !micSlug) {
        if (error) console.error('Failed to resolve linked member Open Mic notification', error);
        setNotificationTargetError('Pendaftaran dari notifikasi sudah tidak tersedia atau tidak dapat diakses oleh akun ini.');
        return;
      }
      navigateRef.current(`/member/open-mic/${encodeURIComponent(micSlug)}?notificationRegistrationId=${encodeURIComponent(notificationRegistrationId)}`);
    })();
    return () => { active = false; };
  }, [isMemberPage, notificationRegistrationId]);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: komikaData }] = await Promise.all([
        supabase
          .from('open_mics')
          .select('*')
          .eq('published', true)
          .order('date', { ascending: true }),
        supabase
          .from('komika')
          .select('id, full_name, stage_name, slug, instagram_url, status, published')
          .eq('published', true)
          .eq('status', 'active'),
      ]);
      const list = (data as OpenMic[]) ?? [];
      setMics(list);
      const komikaList = (komikaData ?? []) as Array<{ id: string; full_name: string; stage_name: string; slug: string; instagram_url: string | null }>;

      if (list.length > 0) {
        const ids = list.map((m) => m.id);
        const { data: regs } = await supabase
          .from('open_mic_registrations')
          .select('open_mic_id, komika_id, stage_name, community, instagram, attendance_status')
          .in('open_mic_id', ids)
          .eq('status', 'confirmed')
          .neq('attendance_status', 'absent')
          .order('created_at', { ascending: true });
        const c: Record<string, number> = {};
        const names: Record<string, Array<{ stageName: string; slug: string | null }>> = {};
        const profileById = new Map(komikaList.map((profile) => [profile.id, profile]));
        const appearanceRows = ((regs ?? []) as PerformerRegistration[]).filter((r) => {
          const event = list.find((mic) => mic.id === r.open_mic_id);
          const isArchive = event && (event.status === 'completed' || event.date < new Date().toISOString().slice(0, 10));
          return Boolean(event && isArchive && r.attendance_status === 'attended');
        });
        (regs ?? []).forEach((r: PerformerRegistration) => {
          const event = list.find((mic) => mic.id === r.open_mic_id);
          const isArchive = event && (event.status === 'completed' || event.date < new Date().toISOString().slice(0, 10));
          if (isArchive ? r.attendance_status !== 'attended' : r.attendance_status === 'absent') return;
          c[r.open_mic_id] = (c[r.open_mic_id] ?? 0) + 1;
          const profile = r.komika_id ? profileById.get(r.komika_id) : undefined;
          names[r.open_mic_id] = [...(names[r.open_mic_id] ?? []), { stageName: r.stage_name, slug: profile?.slug ?? null }];
        });
        setCounts(c);
        setLineups(names);

        const openMicNumbersForHistory = getOpenMicNumbers(list);
        const summaryByIdentity = new Map<string, PerformerSummary & { latestDate: string }>();
        appearanceRows.forEach((row) => {
          const profile = row.komika_id ? profileById.get(row.komika_id) : undefined;
          const identityKey = profile
            ? `komika:${profile.id}`
            : `public:${normalizePerformerValue(row.stage_name)}|${normalizePerformerValue(row.instagram)}`;
          const event = list.find((mic) => mic.id === row.open_mic_id);
          const eventDate = event?.date ?? '';
          const current = summaryByIdentity.get(identityKey);
          if (current) {
            current.totalAppearances += 1;
            current.appearances.push({ id: row.open_mic_id, title: event?.title ?? 'Open Mic', openMicNumber: openMicNumbersForHistory.get(row.open_mic_id), appearanceNumber: 0, venue: event?.venue ?? 'Lokasi tidak tersedia', location: event?.location ?? '', date: eventDate, stageName: row.stage_name, community: row.community });
            if (eventDate > current.latestDate) {
              current.latestDate = eventDate;
              current.community = row.community;
              if (!profile) {
                  current.fullName = row.stage_name;
                  current.stageName = row.stage_name;
                  current.instagram = row.instagram;
              }
            }
            return;
          }
          summaryByIdentity.set(identityKey, {
            id: identityKey,
            slug: profile?.slug ?? null,
            fullName: profile?.full_name ?? row.stage_name,
            stageName: profile?.stage_name ?? row.stage_name,
            instagram: profile?.instagram_url ?? row.instagram,
            community: row.community,
            totalAppearances: 1,
            appearances: [{ id: row.open_mic_id, title: event?.title ?? 'Open Mic', openMicNumber: openMicNumbersForHistory.get(row.open_mic_id), appearanceNumber: 0, venue: event?.venue ?? 'Lokasi tidak tersedia', location: event?.location ?? '', date: eventDate, stageName: row.stage_name, community: row.community }],
            latestDate: eventDate,
          });
        });
        summaryByIdentity.forEach((summary) => {
          summary.appearances.sort((first, second) => first.date.localeCompare(second.date)
            || (list.find((mic) => mic.id === first.id)?.time ?? '').localeCompare(list.find((mic) => mic.id === second.id)?.time ?? '')
            || first.id.localeCompare(second.id));
          summary.appearances.forEach((appearance, index) => {
            appearance.appearanceNumber = index + 1;
          });
          summary.appearances.reverse();
        });
        setPerformerSummaries([...summaryByIdentity.values()]);
      }
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const matchesSearch = (mic: OpenMic, query: string) => !query.trim() || `${mic.title} ${mic.venue} ${mic.location} ${mic.date} ${formatDate(mic.date)}`.toLowerCase().includes(query.trim().toLowerCase());

  const upcoming = mics.filter((m) => (m.status === 'upcoming' && m.date >= today) && matchesSearch(m, upcomingSearch));
  const completed = mics
    .filter((m) => m.status === 'completed' || m.date < today)
    .filter((m) => matchesSearch(m, completedSearch))
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id);
    })
    .slice(0, completedSearch.trim() ? undefined : 5);
  const matchingPerformers = performerSummaries.filter((performer) => {
    const query = completedSearch.trim().toLowerCase();
    const identityMatches = `${performer.fullName} ${performer.stageName} ${performer.instagram ?? ''} ${performer.community ?? ''}`.toLowerCase().includes(query);
    const appearanceMatches = performer.appearances.some((appearance) => [
      appearance.title,
      appearance.venue,
      appearance.location,
      appearance.date,
      formatDate(appearance.date),
      appearance.stageName,
      appearance.community ?? '',
    ].join(' ').toLowerCase().includes(query));
    return query && (identityMatches || appearanceMatches);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        router={router}
        title="Open Mic"
        subtitle="Temukan panggungmu."
        headerAction={isMemberPage && <button type="button" onClick={() => setMemberOpenMicInfoOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700" aria-label="Informasi Open Mic Member" title="Informasi Open Mic Member"><Info className="h-4 w-4" /></button>}
      />
      {isMemberPage && <MemberModal open={memberOpenMicInfoOpen} onClose={() => setMemberOpenMicInfoOpen(false)} title="Panduan Open Mic Member" titleEyebrow="INFORMASI" size="lg">
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          <p>Gunakan halaman ini untuk mencari Open Mic mendatang, melihat acara yang telah selesai, dan membuka riwayat penampilan serta pengalaman sebagai MC.</p>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h4 className="font-extrabold text-slate-900">Open Mic Mendatang</h4>
            <p className="mt-0.5">Jelajahi acara yang akan datang, gunakan kolom pencarian untuk menemukan acara, lalu buka kartu Open Mic untuk melihat informasi, lineup, dan pilihan pendaftaran yang tersedia. Pendaftaran hanya dapat dilakukan jika masih dibuka.</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h4 className="font-extrabold text-slate-900">Open Mic Selesai</h4>
            <p className="mt-0.5">Lihat acara yang telah berlangsung dan gunakan pencarian untuk menemukan acara atau komika yang pernah tampil. Pilih hasil komika untuk melihat riwayat penampilannya. Saat kolom pencarian kosong, daftar menampilkan hingga lima acara terbaru.</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h4 className="font-extrabold text-slate-900">Riwayat Pengalamanku</h4>
            <p className="mt-0.5">Pilih tab ini untuk melihat pengalaman Open Mic dan MC. Penampilan Open Mic internal tercatat dari kehadiran yang dikonfirmasi, sedangkan pengajuan Open Mic eksternal dan pengalaman MC ditampilkan setelah disetujui Admin.</p>
            <ul className="mt-2 space-y-1.5">
              <li><strong className="text-slate-800">Open Mic Internal:</strong> penampilan di acara Standupindo Cilegon tercatat berdasarkan pendaftaran yang kehadirannya dikonfirmasi sebagai hadir.</li>
              <li><strong className="text-slate-800">Open Mic Eksternal:</strong> kirim riwayat acara komunitas atau penyelenggara lain beserta bukti penampilan. Setelah disetujui Admin, riwayat masuk ke kategori eksternal. Data ini tidak masuk ke Evaluator, skor, atau peringkat.</li>
              <li><strong className="text-slate-800">MC Internal:</strong> ajukan pengalaman MC dengan memilih Open Mic internal yang telah selesai. Riwayat MC dicatat terpisah dari penampilan sebagai komika.</li>
              <li><strong className="text-slate-800">MC Eksternal:</strong> isi detail acara dan unggah bukti dokumentasi untuk diajukan kepada Admin. Jika Anda juga tampil sebagai komika, centang pilihan tersebut agar riwayat penampilan diajukan secara terpisah.</li>
            </ul>
          </section>
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900">
            <h4 className="font-extrabold">Ringkasan dan Filter Riwayat</h4>
            <p className="mt-0.5">Di halaman Riwayat Pengalamanku, ringkasan Open Mic dan MC memisahkan jumlah pengalaman internal dan eksternal. Gunakan filter sumber dan pencarian untuk menemukan riwayat berdasarkan judul acara, tempat, atau kota.</p>
          </section>
        </div>
      </MemberModal>}

      {notificationRegistrationId && notificationTargetError && <div className="container-app pt-4"><p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{notificationTargetError}</p></div>}
      {isMemberPage && (
        <div className="container-app pt-5">
          <div className="flex items-center gap-3">
            <div ref={memberTabsRef} data-sliding-indicator-theme="blue-600" className="relative isolate grid min-w-0 flex-1 grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5" role="tablist" aria-label="Menu Open Mic Member">
              <SlidingTabIndicator trackRef={memberTabsRef} activeId={memberTab} className="rounded-xl border border-blue-600 bg-blue-600 shadow-md shadow-blue-600/20" />
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === 'upcoming'}
                onClick={() => setMemberTab('upcoming')}
                data-sliding-tab="upcoming"
                className={`relative z-10 rounded-xl border px-2 py-2.5 text-[10px] font-extrabold tracking-wide transition sm:text-xs ${memberTab === 'upcoming' ? '!border-transparent !bg-transparent !shadow-none text-white' : 'border-transparent bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900'}`}
              >
                MENDATANG
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === 'history'}
                onClick={() => setMemberTab('history')}
                data-sliding-tab="history"
                className={`relative z-10 flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-extrabold tracking-wide transition sm:text-xs ${memberTab === 'history' ? '!border-transparent !bg-transparent !shadow-none text-white' : 'border-transparent bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900'}`}
              >
                <History className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">RIWAYAT PENGALAMANKU</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => router.navigate('/member/open-mic-history?add=1')}
              aria-label="Tambahkan riwayat"
              title="Tambahkan riwayat"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)] transition hover:bg-blue-700 active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {isMemberPage && memberTab === 'history' ? (
        <MemberPerformanceHistoryPage router={router} embedded />
      ) : (
      <div className="container-app space-y-8 py-8">
        <section data-scroll-reveal className="scroll-reveal is-visible">
          <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-blue-400" /><h2 className={`text-xl font-extrabold ${isMemberPage ? 'text-slate-900' : 'text-white'}`}>Mendatang</h2><span aria-label={`${upcoming.length} Open Mic mendatang`} className={`inline-flex items-center justify-center rounded-full border border-blue-700 bg-white font-black leading-none tabular-nums text-blue-800 ${isMemberPage ? 'h-8 min-w-8 px-1.5 text-sm shadow-sm' : 'h-10 min-w-10 border-2 px-2 text-lg shadow-md'}`}>{upcoming.length}</span></div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={upcomingSearch} onChange={(event) => setUpcomingSearch(event.target.value)} placeholder="Cari Open Mic mendatang..." className="input-field !pl-11" aria-label="Cari Open Mic mendatang" /></div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><LoadingSkeleton count={3} /></div>
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="Belum ada Open Mic yang tersedia."
              description="Pantau terus untuk panggung berikutnya."
              noSmokeArea
              action={latestCompletedMic && (
                <button
                  type="button"
                  onClick={() => router.navigate(`/open-mic/${encodeURIComponent(latestCompletedMic.slug)}#lineup`)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  Lihat Lineup Open Mic Sebelumnya <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            />
          ) : (
            <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>

        <section data-scroll-reveal className={`scroll-reveal is-visible border-t ${isMemberPage ? 'border-slate-200' : 'border-white/20'} pt-6 sm:pt-8`}>
          <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-slate-400" /><h2 className={`text-xl font-extrabold uppercase ${isMemberPage ? 'text-slate-900' : 'text-white'}`}>Open Mic Selesai</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{completed.length}</span></div>
          <div className="relative mb-4 min-w-0">
            <button
              type="button"
              onClick={() => setCompletedSearchInfoOpen(true)}
              className="absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Informasi pencarian Open Mic selesai"
              title="Informasi pencarian"
            >
              <Info className="h-4 w-4" />
            </button>
            <Search className="pointer-events-none absolute left-11 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} placeholder="Cari judul, nama panggung, komunitas, tempat, tanggal/tahun, atau Instagram..." className="input-field !pl-16" aria-label="Cari Open Mic selesai dan riwayat komika" />
          </div>
          <Modal
            open={completedSearchInfoOpen}
            onClose={() => setCompletedSearchInfoOpen(false)}
            title="Apa yang Bisa Dicari?"
            titleEyebrow="Pencarian Open Mic Selesai"
            size="lg"
            headerClassName="!bg-gradient-to-br !from-blue-700 !via-blue-800 !to-blue-900 !px-4 !pb-3 !pt-3 sm:!px-6 sm:!pb-4 sm:!pt-4"
            titleClassName="!text-lg !font-black !text-white sm:!text-xl"
            titleEyebrowClassName="!mb-1 !text-blue-200"
            closeButtonClassName="!bg-white/15 !text-white hover:!bg-white/25 hover:!text-white"
            panelClassName="!max-w-xl"
          >
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">Satu pencarian akan memfilter kartu Open Mic selesai sekaligus mencari komika yang pernah tampil.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-3"><h3 className="text-sm font-extrabold text-slate-900">Kartu Open Mic</h3></div>
                  <div className="p-3.5"><p className="text-xs leading-5 text-slate-600">Cari berdasarkan:</p><ul className="mt-2 space-y-1.5 text-xs font-semibold text-slate-700"><li>• Judul Open Mic</li><li>• Venue atau lokasi</li><li>• Tanggal, termasuk format tanggal atau tahun</li></ul><p className="mt-2 text-xs leading-5 text-slate-500">Contoh: <span className="font-bold text-slate-700">Warkopmoto</span>, <span className="font-bold text-slate-700">September</span>, atau <span className="font-bold text-slate-700">2026</span>.</p></div>
                </section>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-3"><h3 className="text-sm font-extrabold text-slate-900">Komika yang Pernah Tampil</h3></div>
                  <div className="p-3.5"><p className="text-xs leading-5 text-slate-600">Cari berdasarkan:</p><ul className="mt-2 space-y-1.5 text-xs font-semibold text-slate-700"><li>• Nama lengkap atau nama panggung</li><li>• Instagram</li><li>• Komunitas</li><li>• Judul, tempat, atau tanggal penampilan</li></ul><p className="mt-2 text-xs leading-5 text-slate-500">Hasil komika dapat dibuka untuk melihat riwayat penampilannya.</p></div>
                </section>
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <h3 className="text-sm font-extrabold text-slate-900">Cara pencarian bekerja</h3>
                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600"><li>• Tidak membedakan huruf besar dan kecil.</li><li>• Cukup masukkan sebagian kata, tidak harus mengetik nama lengkap.</li><li>• Hapus kata pencarian untuk menampilkan kembali daftar awal.</li><li>• Saat kolom kosong, hanya lima Open Mic selesai terbaru yang ditampilkan. Setelah mencari, semua hasil Open Mic yang cocok ditampilkan.</li></ul>
              </section>
              <button type="button" onClick={() => setCompletedSearchInfoOpen(false)} className="btn-primary min-h-11 w-full justify-center">Mengerti</button>
            </div>
          </Modal>
          {matchingPerformers.length > 0 && <div className="mb-5 space-y-2.5">
              <div className="flex items-center justify-between gap-3"><h3 className={`text-sm font-extrabold uppercase tracking-[0.12em] ${isMemberPage ? 'text-slate-700' : 'text-slate-200'}`}>Komika yang pernah tampil</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-extrabold text-slate-700">{matchingPerformers.length} hasil</span></div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {matchingPerformers.map((performer) => <div key={performer.id} className="space-y-2">
                  <button type="button" onClick={() => setSelectedPerformerId((current) => current === performer.id ? null : performer.id)} aria-expanded={selectedPerformerId === performer.id} className={`w-full rounded-xl border px-3.5 py-3 text-left shadow-sm transition ${selectedPerformerId === performer.id ? 'border-blue-500 bg-[#EFF6FF] ring-2 ring-blue-200' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-extrabold leading-tight text-slate-950">{performer.fullName}</p><div className="mt-1 flex items-baseline gap-2"><span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Nama Panggung</span><span className="truncate text-sm font-bold text-slate-700">{performer.stageName}</span></div></div><span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.05em] text-white">{performer.totalAppearances} X TAMPIL</span></div>
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-600"><span>{performer.community ?? 'Komunitas belum dicatat'}</span>{performer.instagram && <><span className="text-slate-300">·</span><span>{formatInstagramHandle(performer.instagram)}</span></>}</div>
                </button>
                  {selectedPerformerId === performer.id && <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-600">Riwayat tampil</p><span className="text-xs font-black uppercase tracking-[0.08em] text-blue-700">{performer.totalAppearances} OPEN MIC</span></div>
                    <div className="space-y-1.5">{performer.appearances.map((appearance) => <div key={appearance.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-sm"><div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{appearance.openMicNumber ? `Open Mic #${appearance.openMicNumber} · ` : ''}{appearance.title}</p><p className="mt-0.5 truncate font-semibold text-slate-600">{appearance.stageName} · {appearance.community ?? 'Komunitas belum dicatat'}</p><p className="mt-1 text-[10px] font-bold text-blue-700">Open Mic ke-{appearance.appearanceNumber} di Standupindo Cilegon</p></div><span className="shrink-0 text-right font-bold leading-5 text-slate-600">{formatDate(appearance.date)}<br />{appearance.venue}</span></div>)}</div>
                </div>}
              </div>)}
            </div>
          </div>}
          {completed.length === 0 ? (
            <EmptyState title="Belum ada Open Mic yang selesai." description="Riwayat Open Mic akan muncul di sini setelah acaranya selesai." noSmokeArea />
          ) : (
            <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {completed.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
