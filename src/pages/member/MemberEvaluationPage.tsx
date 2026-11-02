import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, ClipboardList, Eye, Info, MessageCircle, Mic } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { MemberModal } from '@/components/member/MemberModal';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Evaluation, EvaluationSeason, OpenMic, OpenMicRegistration } from '@/lib/types';

const SCORE_FIELDS: Array<keyof Pick<Evaluation, 'material_score' | 'punchline_score' | 'delivery_score' | 'timing_score' | 'stage_presence_score' | 'crowd_interaction_score'>> = [
  'material_score',
  'punchline_score',
  'delivery_score',
  'timing_score',
  'stage_presence_score',
  'crowd_interaction_score',
];

function getEvaluationSeason(dateValue: string): EvaluationSeason {
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00`);
  const year = date.getFullYear();
  const season = date.getMonth() < 6 ? 1 : 2;
  return {
    key: `${year}-S${season}`,
    label: `Season ${season} · ${season === 1 ? 'Januari–Juni' : 'Juli–Desember'} ${year}`,
    periodLabel: season === 1 ? 'Januari–Juni' : 'Juli–Desember',
    year,
    season,
  };
}

function getCurrentEvaluationSeason() {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return getEvaluationSeason(localDate);
}

function getEvaluationScore(evaluation: Evaluation) {
  return SCORE_FIELDS.reduce((sum, field) => sum + (evaluation[field] ?? 0), 0);
}

type EvaluationFollowUp = {
  id: string;
  openMicId: string;
  openMicTitle: string;
  openMicSlug: string;
  openMicDate: string;
  evaluatorName: string;
  whatsapp: string | null;
  submitted: boolean;
};

export function MemberEvaluationPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<Array<{
    evaluation: Evaluation;
    openMic: OpenMic | null;
    performerRegistration: OpenMicRegistration | null;
    evaluatorName: string;
  }>>([]);
  const [attendedOpenMics, setAttendedOpenMics] = useState<Array<{ id: string; date: string }>>([]);
  const [evaluationFollowUps, setEvaluationFollowUps] = useState<EvaluationFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedOpenMicId, setSelectedOpenMicId] = useState('');
  const [selectedSeasonKey, setSelectedSeasonKey] = useState('current');
  const [targetEvaluationUnavailable, setTargetEvaluationUnavailable] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const notificationEvaluationId = router.query.get('notificationEvaluationId');

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoadError('');
      const { data: komikaRow } = await supabase
        .from('komika')
        .select('id')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      const memberKomikaId = komikaRow?.id ?? null;
      if (!memberKomikaId) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const { data: registrations } = await supabase
        .from('open_mic_registrations')
        .select('*')
        .eq('komika_id', memberKomikaId)
        .order('created_at', { ascending: false });

      const registrationRows = (registrations as OpenMicRegistration[]) ?? [];
      const registrationIds = registrationRows.map((row) => row.id);
      const attendedOpenMicIds = [...new Set(registrationRows
        .filter((row) => row.status === 'confirmed' && row.attendance_status === 'attended')
        .map((row) => row.open_mic_id))];
      setAttendedOpenMics([]);

      const [{ data: directEvalRows, error: directEvalError }, { data: linkedEvalRows, error: linkedEvalError }] = await Promise.all([
        supabase.from('evaluations').select('*').eq('performer_komika_id', memberKomikaId).order('created_at', { ascending: false }),
        registrationIds.length > 0
          ? supabase.from('evaluations').select('*').in('performer_registration_id', registrationIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (directEvalError || linkedEvalError) {
        setLoadError('Evaluasi belum dapat dimuat. Silakan coba lagi atau hubungi admin.');
        setRecords([]);
        setLoading(false);
        return;
      }

      const evaluationMap = new Map<string, Evaluation>();
      ([...(directEvalRows ?? []), ...(linkedEvalRows ?? [])] as Evaluation[]).forEach((evaluation) => evaluationMap.set(evaluation.id, evaluation));
      const evaluations = Array.from(evaluationMap.values()).sort((first, second) => second.created_at.localeCompare(first.created_at));
      const openMicIds = [...new Set([...evaluations.map((item) => item.open_mic_id), ...attendedOpenMicIds])];
      const { data: assignmentRows } = await supabase
        .from('evaluator_assignments')
        .select('id, open_mic_id, evaluator_user_id')
        .eq('status', 'active');
      const relevantAssignments = (assignmentRows ?? []).filter((row) => row.open_mic_id === null || attendedOpenMicIds.includes(row.open_mic_id));
      const evaluatorIds = [...new Set([...evaluations.map((item) => item.evaluator_user_id), ...relevantAssignments.map((item) => item.evaluator_user_id)])];
      let openMics: OpenMic[] = [];
      let evaluatorProfiles = new Map<string, { name: string; whatsapp: string | null }>();
      if (openMicIds.length > 0) {
        const { data: micData } = await supabase
          .from('open_mics')
          .select('*')
          .in('id', openMicIds);
        openMics = (micData as OpenMic[]) ?? [];
      }
      setAttendedOpenMics(attendedOpenMicIds
        .map((id) => {
          const openMic = openMics.find((item) => item.id === id);
          return openMic ? { id, date: openMic.date } : null;
        })
        .filter((item): item is { id: string; date: string } => item !== null));
      if (evaluatorIds.length > 0) {
        const { data: profiles } = await supabase.from('komika').select('user_id, stage_name, full_name, whatsapp').in('user_id', evaluatorIds);
        evaluatorProfiles = new Map((profiles ?? []).map((profile) => [profile.user_id, { name: profile.stage_name || profile.full_name || 'Evaluator', whatsapp: profile.whatsapp ?? null }]));
      }

      const mapped = evaluations.map((evaluation) => {
        const performerRegistration = registrationRows.find((row) => row.id === evaluation.performer_registration_id) ?? null;
        const openMic = openMics.find((row) => row.id === evaluation.open_mic_id) ?? null;
        return { evaluation, performerRegistration, openMic, evaluatorName: evaluatorProfiles.get(evaluation.evaluator_user_id)?.name ?? 'Evaluator' };
      });

      setRecords(mapped);
      const openMicById = new Map(openMics.map((openMic) => [openMic.id, openMic]));
      const expandedAssignments = relevantAssignments.flatMap((assignment) => assignment.open_mic_id
        ? [{ ...assignment, resolvedOpenMicId: assignment.open_mic_id }]
        : attendedOpenMicIds.map((openMicId) => ({ ...assignment, resolvedOpenMicId: openMicId })));
      const uniqueFollowUps = new Map<string, EvaluationFollowUp>();
      expandedAssignments.forEach((assignment) => {
        const openMic = openMicById.get(assignment.resolvedOpenMicId);
        if (!openMic) return;
        const profile = evaluatorProfiles.get(assignment.evaluator_user_id);
        const submitted = evaluations.some((evaluation) => evaluation.open_mic_id === openMic.id && evaluation.evaluator_user_id === assignment.evaluator_user_id && evaluation.status === 'submitted');
        const key = `${openMic.id}:${assignment.evaluator_user_id}`;
        uniqueFollowUps.set(key, {
          id: key,
          openMicId: openMic.id,
          openMicTitle: openMic.title,
          openMicSlug: openMic.slug,
          openMicDate: openMic.date,
          evaluatorName: profile?.name ?? 'Evaluator',
          whatsapp: profile?.whatsapp ?? null,
          submitted,
        });
      });
      setEvaluationFollowUps([...uniqueFollowUps.values()]);
      setLoading(false);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!notificationEvaluationId || loading) return;
    const target = records.find((record) => record.evaluation.id === notificationEvaluationId);
    if (!target) {
      setTargetEvaluationUnavailable(true);
      return;
    }
    setTargetEvaluationUnavailable(false);
    setSelectedOpenMicId(target.evaluation.open_mic_id);
    setSelectedEvaluationId(target.evaluation.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`member-evaluation-${notificationEvaluationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [loading, notificationEvaluationId, records]);

  const currentSeason = useMemo(() => getCurrentEvaluationSeason(), []);
  const seasonByEvaluationId = useMemo(() => new Map(records.map((record) => [record.evaluation.id, getEvaluationSeason(record.openMic?.date ?? record.evaluation.created_at)])), [records]);
  const seasonOptions = useMemo(() => {
    const seasons = new Map<string, EvaluationSeason>();
    records.forEach((record) => {
      const season = seasonByEvaluationId.get(record.evaluation.id);
      if (season) seasons.set(season.key, season);
    });
    return [...seasons.values()].sort((first, second) => second.key.localeCompare(first.key));
  }, [records, seasonByEvaluationId]);
  const activeSeasonKey = selectedSeasonKey === 'current' ? currentSeason.key : selectedSeasonKey;
  const seasonRecords = useMemo(() => selectedSeasonKey === 'all' ? records : records.filter((record) => seasonByEvaluationId.get(record.evaluation.id)?.key === activeSeasonKey), [activeSeasonKey, records, seasonByEvaluationId, selectedSeasonKey]);
  const submittedSeasonRecords = useMemo(() => seasonRecords.filter((record) => record.evaluation.status === 'submitted'), [seasonRecords]);
  const totalScore = useMemo(() => submittedSeasonRecords.reduce((sum, item) => sum + getEvaluationScore(item.evaluation), 0), [submittedSeasonRecords]);
  const averageScore = submittedSeasonRecords.length > 0 ? totalScore / submittedSeasonRecords.length : 0;
  const averageScorePerAspect = averageScore / SCORE_FIELDS.length;
  const averageScorePercentage = (averageScore / (SCORE_FIELDS.length * 10)) * 100;
  const attendedOpenMicCount = useMemo(() => {
    if (selectedSeasonKey === 'all') return attendedOpenMics.length;
    return attendedOpenMics.filter((openMic) => getEvaluationSeason(openMic.date).key === activeSeasonKey).length;
  }, [activeSeasonKey, attendedOpenMics, selectedSeasonKey]);
  const openMicOptions = useMemo(() => seasonRecords
    .filter((item, index, all) => item.openMic && all.findIndex((candidate) => candidate.evaluation.open_mic_id === item.evaluation.open_mic_id) === index)
    .sort((first, second) => (second.openMic?.date ?? '').localeCompare(first.openMic?.date ?? '')), [seasonRecords]);
  const selectedOpenMic = openMicOptions.find((item) => item.evaluation.open_mic_id === selectedOpenMicId)?.openMic ?? null;
  const selectedOpenMicRecords = useMemo(() => selectedOpenMicId === 'all' ? [] : seasonRecords.filter((item) => item.evaluation.open_mic_id === selectedOpenMicId), [seasonRecords, selectedOpenMicId]);
  const allOpenMicGroups = useMemo(() => openMicOptions.map(({ evaluation, openMic }) => ({
    openMic,
    records: seasonRecords.filter((item) => item.evaluation.open_mic_id === evaluation.open_mic_id),
  })), [openMicOptions, seasonRecords]);
  const selectedEvaluation = records.find((record) => record.evaluation.id === selectedEvaluationId) ?? null;
  const visibleEvaluationFollowUps = useMemo(() => evaluationFollowUps
    .filter((item) => !item.submitted && (selectedSeasonKey === 'all' || getEvaluationSeason(item.openMicDate).key === activeSeasonKey))
    .sort((first, second) => second.openMicDate.localeCompare(first.openMicDate)), [activeSeasonKey, evaluationFollowUps, selectedSeasonKey]);
  const createWhatsAppUrl = (phone: string, evaluatorName: string, openMicTitle: string, openMicSlug: string, openMicDate: string) => {
    const normalized = phone.replace(/\D/g, '').replace(/^0/, '62');
    const detailUrl = `${window.location.origin}/open-mic/${encodeURIComponent(openMicSlug)}`;
    const formattedDate = new Date(openMicDate).toLocaleDateString('id-ID', { dateStyle: 'medium' });
    const message = `Halo Kak *${evaluatorName}*,\n\nMohon bantuannya untuk memberikan evaluasi dan masukan atas penampilan saya di Open Mic berikut:\n\n*${openMicTitle.toUpperCase()}*\n*Tanggal:* ${formattedDate}\n*Detail Open Mic:* [${detailUrl}](${detailUrl})\n\nMasukan dari Kak ${evaluatorName} akan sangat berarti untuk membantu saya mengevaluasi dan mengembangkan penampilan ke depannya.\n\nTerima kasih banyak atas waktu dan bantuannya!`;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        router={router}
        title="Evaluasi Saya"
        subtitle="Lihat evaluasi yang diberikan untuk performa kamu."
        headerAction={<button type="button" onClick={() => setInfoOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700" aria-label="Informasi Evaluasi Saya" title="Informasi Evaluasi Saya"><Info className="h-4 w-4" /></button>}
      />
      <MemberModal open={infoOpen} onClose={() => setInfoOpen(false)} title="Panduan Evaluasi Saya" titleEyebrow="INFORMASI" size="md">
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          <p>Halaman ini menyimpan evaluasi dari evaluator dan riwayat Open Mic internal yang sudah dikonfirmasi admin sebagai hadir.</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-extrabold text-slate-900">Ringkasan</h4><p className="mt-0.5">Jumlah Evaluasi menunjukkan evaluasi pada periode yang dipilih. Selesai menunjukkan evaluasi yang telah dikirim. Skor merupakan rata-rata evaluasi terkirim dalam periode tersebut; draft tidak ikut dihitung.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-extrabold text-slate-900">Periode Evaluasi</h4><p className="mt-0.5">Evaluasi dibagi menjadi dua season setiap tahun: Season 1 berlangsung Januari–Juni dan Season 2 berlangsung Juli–Desember. Pilih periode aktif, season sebelumnya, atau Semua Riwayat dari filter Periode.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-extrabold text-slate-900">Cara Membaca Rata-rata Skor</h4><p className="mt-0.5">Setiap evaluasi memiliki 6 aspek, masing-masing bernilai maksimal 10. Nilai yang ditampilkan adalah rata-rata per aspek dalam skala 10 agar lebih mudah dipahami. Contoh: skor evaluasi 45 dan 39 menghasilkan rata-rata 7/10 atau 70%. Draft tidak ikut dihitung.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-extrabold text-slate-900">Pilih Open Mic</h4><p className="mt-0.5">Pilih satu Open Mic terlebih dahulu untuk melihat daftar evaluator dan membuka detail penilaiannya.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="font-extrabold text-slate-900">Melihat Detail Evaluasi</h4><p className="mt-0.5">Pilih bagian nama evaluator untuk melihat skor materi, punchline, penyampaian, timing, penguasaan panggung, dan interaksi dengan penonton, serta masukan mengenai kekuatan dan aspek yang dapat ditingkatkan.</p></div>
        </div>
      </MemberModal>

      <div className="container-app py-6 sm:py-8">
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-violet-600"><Mic className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Open Mic</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{attendedOpenMicCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Hadir &amp; terkonfirmasi</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center justify-between gap-2 text-blue-600"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Evaluasi</span></div><button type="button" onClick={() => setFollowUpOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Lihat status evaluator" title="Lihat status evaluator"><Eye className="h-4 w-4" /></button></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{seasonRecords.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCheck className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Selesai</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{submittedSeasonRecords.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-amber-600"><Mic className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Skor</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{submittedSeasonRecords.length > 0 ? `${averageScorePerAspect.toFixed(1).replace('.', ',')}/10` : '—'}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{submittedSeasonRecords.length > 0 ? `${averageScorePercentage.toFixed(0)}% · 6 aspek` : 'Belum ada skor'}</p>
          </div>
        </div>

        <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 shadow-sm">
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-xs font-extrabold uppercase tracking-[0.1em] text-blue-800">Periode</span>
            <select value={selectedSeasonKey} onChange={(event) => { setSelectedSeasonKey(event.target.value); setSelectedOpenMicId(''); }} className="input-field !min-h-10 !border-blue-200 !bg-white !py-2 text-sm font-bold" aria-label="Filter evaluasi berdasarkan periode">
              <option value="current">{currentSeason.label} (Aktif)</option>
              <option value="all">Semua Riwayat</option>
              {seasonOptions.filter((season) => season.key !== currentSeason.key).map((season) => <option key={season.key} value={season.key}>{season.label}</option>)}
            </select>
          </label>
          <div className="mt-2 border-t border-blue-100/80 pt-2 text-sm text-slate-600">
            <p className="font-extrabold text-slate-900">{selectedSeasonKey === 'all' ? 'Semua Riwayat Evaluasi' : (seasonOptions.find((season) => season.key === activeSeasonKey) ?? currentSeason).label}</p>
            <p className="mt-1">Rata-rata skor {submittedSeasonRecords.length > 0 ? `${averageScorePerAspect.toFixed(1).replace('.', ',')}/10 (${averageScorePercentage.toFixed(0)}%)` : 'belum tersedia'} dari {submittedSeasonRecords.length} evaluasi terkirim. Draft tidak masuk skor.</p>
          </div>
        </div>

        <div className="mb-4">
          <SearchableEventSelect
            options={openMicOptions.map(({ evaluation, openMic }) => ({
              id: evaluation.open_mic_id,
              title: openMic?.title ?? 'Open Mic',
              subtitle: `${openMic ? new Date(openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'} · ${openMic?.venue ?? 'Lokasi tidak tersedia'}`,
              poster: openMic?.poster,
            }))}
            value={selectedOpenMicId}
            onChange={setSelectedOpenMicId}
            allLabel="Semua Open Mic"
            emptyLabel="Pilih Open Mic"
            searchPlaceholder="Ketik nama Open Mic..."
            noResultsLabel="Open Mic tidak ditemukan."
            ariaLabel="Pilih Open Mic"
          />
        </div>

        {notificationEvaluationId && targetEvaluationUnavailable && !loading && <p role="status" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Evaluasi dari notifikasi sudah tidak tersedia atau tidak dapat diakses oleh akun ini.</p>}

        <div className="space-y-3">
          {loading ? (
            <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
          ) : loadError ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">{loadError}</div>
          ) : records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada evaluasi untuk performa kamu.</div>
          ) : selectedOpenMicId === '' ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Pilih Open Mic pada kolom pencarian di atas untuk melihat evaluator.</div>
          ) : selectedOpenMicId === 'all' ? (
            <div className="space-y-3">
              {allOpenMicGroups.map(({ openMic, records: groupRecords }) => (
                <div key={openMic?.id ?? 'open-mic'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 p-3">
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{openMic?.poster ? <img src={openMic.poster} alt={`Poster ${openMic.title}`} className="h-full w-full object-cover" /> : <Mic className="h-5 w-5 text-slate-300" />}</div>
                    <div className="min-w-0"><h3 className="truncate text-base font-black text-slate-900">{openMic?.title ?? 'Open Mic'}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{openMic ? new Date(openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'} · {openMic?.venue ?? 'Lokasi tidak tersedia'}</p></div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500"><span>Evaluator</span><span>Lihat Detail</span></div>
                  {groupRecords.map(({ evaluation, evaluatorName }) => <div key={evaluation.id} id={`member-evaluation-${evaluation.id}`} className={`grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 ${evaluation.id === notificationEvaluationId ? 'bg-blue-50' : ''}`}>
                    <div><p className="text-sm font-extrabold text-slate-900">{evaluatorName}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${evaluation.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{evaluation.status}</span></div>
                    <button type="button" onClick={() => setSelectedEvaluationId(evaluation.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Lihat detail evaluasi dari ${evaluatorName}`}><Eye className="h-4 w-4" /> Lihat</button>
                  </div>)}
                </div>
              ))}
            </div>
          ) : selectedOpenMicRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada evaluasi untuk Open Mic ini.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 p-3">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{selectedOpenMic?.poster ? <img src={selectedOpenMic.poster} alt={`Poster ${selectedOpenMic.title}`} className="h-full w-full object-cover" /> : <Mic className="h-5 w-5 text-slate-300" />}</div>
                <div className="min-w-0"><h3 className="truncate text-base font-black text-slate-900">{selectedOpenMic?.title ?? 'Open Mic'}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{selectedOpenMic ? new Date(selectedOpenMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'} · {selectedOpenMic?.venue ?? 'Lokasi tidak tersedia'}</p></div>
              </div>
              <div className="grid grid-cols-[1fr_auto] border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500"><span>Evaluator</span><span>Lihat Detail</span></div>
              {selectedOpenMicRecords.map(({ evaluation, evaluatorName }) => <div key={evaluation.id} id={`member-evaluation-${evaluation.id}`} className={`grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 ${evaluation.id === notificationEvaluationId ? 'bg-blue-50' : ''}`}>
                <div><p className="text-sm font-extrabold text-slate-900">{evaluatorName}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${evaluation.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{evaluation.status}</span></div>
                <button type="button" onClick={() => setSelectedEvaluationId(evaluation.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Lihat detail evaluasi dari ${evaluatorName}`}><Eye className="h-4 w-4" /> Lihat</button>
              </div>)}
            </div>
          )}
        </div>
      </div>

      <MemberModal open={Boolean(selectedEvaluation)} onClose={() => setSelectedEvaluationId(null)} title={selectedEvaluation?.evaluatorName ?? 'Detail Evaluasi'} titleEyebrow={selectedEvaluation?.openMic?.title ?? 'EVALUASI'} size="lg">
        {selectedEvaluation && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <div><p className="text-xs font-bold text-slate-500">{selectedEvaluation.performerRegistration?.stage_name || selectedEvaluation.performerRegistration?.full_name || 'Performa kamu'}</p><p className="mt-0.5 text-xs text-slate-500">{selectedEvaluation.openMic ? new Date(selectedEvaluation.openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${selectedEvaluation.evaluation.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{selectedEvaluation.evaluation.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[['Materi', selectedEvaluation.evaluation.material_score], ['Punchline', selectedEvaluation.evaluation.punchline_score], ['Penyampaian', selectedEvaluation.evaluation.delivery_score], ['Timing', selectedEvaluation.evaluation.timing_score], ['Penguasaan Panggung', selectedEvaluation.evaluation.stage_presence_score], ['Interaksi Penonton', selectedEvaluation.evaluation.crowd_interaction_score]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200"><div className="text-[9px] font-extrabold uppercase leading-4 tracking-[0.08em] text-slate-600">{label}</div><div className="mt-1 text-lg font-black text-slate-950">{value ?? '-'}</div></div>)}
            </div>
            {(selectedEvaluation.evaluation.strengths || selectedEvaluation.evaluation.improvements || selectedEvaluation.evaluation.notes) && <div className="space-y-2.5">
              {selectedEvaluation.evaluation.strengths && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-800">Kekuatan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{selectedEvaluation.evaluation.strengths}</p></div>}
              {selectedEvaluation.evaluation.improvements && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-800">Pengembangan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{selectedEvaluation.evaluation.improvements}</p></div>}
              {selectedEvaluation.evaluation.notes && <div className="rounded-xl border border-slate-200 bg-slate-100 p-3"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-700">Catatan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{selectedEvaluation.evaluation.notes}</p></div>}
            </div>}
          </div>
        )}
      </MemberModal>

      <MemberModal open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="Status Evaluator" titleEyebrow="EVALUASI" size="md">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-600">Berikut evaluator yang belum mengirim evaluasi pada Open Mic internal di periode ini.</p>
          {visibleEvaluationFollowUps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">Belum ada data penugasan evaluator pada periode ini.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500"><span>Belum Mengirim</span><span>Japri</span></div>
              {visibleEvaluationFollowUps.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{item.evaluatorName}</p><p className="truncate text-xs font-medium text-slate-500">{item.openMicTitle} · {new Date(item.openMicDate).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</p></div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${item.submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.submitted ? 'Sudah Kirim' : 'Belum Kirim'}</span>
                    {!item.submitted && item.whatsapp && <a href={createWhatsAppUrl(item.whatsapp, item.evaluatorName, item.openMicTitle, item.openMicSlug, item.openMicDate)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label={`Japri ${item.evaluatorName}`} title="Japri"><MessageCircle className="h-4 w-4" /></a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </MemberModal>
    </div>
  );
}
