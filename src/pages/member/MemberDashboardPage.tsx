import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, ClipboardList, Clock3, Crown, History, MapPin, Mic, MoreHorizontal, Receipt, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { MemberOpenMicHistorySubmission, MemberStageExperience, OpenMic } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate, getEventStatus, getOpenMicNumbers, getOpenMicStatus } from '@/lib/format';
import { CcsScheduleHighlights } from '@/components/CcsScheduleHighlights';

const MAIN_MENU = [
  { label: 'Open Mic', to: '/member/open-mic', icon: Mic },
  { label: 'Buku Materi', to: '/member/materials', icon: BookOpen },
  { label: 'Evaluasi', to: '/member/evaluations', icon: ClipboardList },
  { label: 'Profil Saya', to: '/member/profile', icon: UserRound },
  { label: 'Riwayat Pengalamanku', to: '/member/evaluations/history', icon: History },
  { label: 'More', to: '/member/more', icon: MoreHorizontal },
];

export function MemberDashboardPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [openMics, setOpenMics] = useState<OpenMic[]>([]);
  const [attendedOpenMicCount, setAttendedOpenMicCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Member');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [openMicHistory, setOpenMicHistory] = useState<MemberOpenMicHistorySubmission[]>([]);
  const [stageExperienceCount, setStageExperienceCount] = useState(0);
  const [officialEventCount, setOfficialEventCount] = useState(0);
  const [journeyLoadError, setJourneyLoadError] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const today = new Date().toISOString();
      const [{ data: micData }, { data: profileData }] = await Promise.all([
        supabase
          .from('open_mics')
          .select('*')
          .eq('published', true)
          .eq('status', 'upcoming')
          .gte('date', today.slice(0, 10))
          .order('date', { ascending: true }),
        supabase
          .from('komika')
          .select('id, stage_name, photo, photo_card')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle(),
      ]);

      const memberKomikaId = profileData?.id ?? null;
      const nextDisplayName = profileData?.stage_name?.trim() || user?.email?.split('@')[0] || 'Member';
      setDisplayName(nextDisplayName);
      setProfilePhoto(profileData?.photo_card?.trim() || profileData?.photo?.trim() || '');

      let historyData: MemberOpenMicHistorySubmission[] = [];
      if (memberKomikaId) {
        const [
          { data: registrations, error: registrationError },
          { data: history, error: openMicHistoryError },
          { data: lineup, error: lineupError },
          { data: experiences, error: experienceError },
        ] = await Promise.all([
          supabase.from('open_mic_registrations').select('attendance_status').eq('komika_id', memberKomikaId),
          supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', memberKomikaId).eq('status', 'approved').order('event_date', { ascending: false }),
          supabase.from('event_lineups')
            .select('event_id, event:events!inner(id, slug, date, status, published)')
            .eq('komika_id', memberKomikaId)
            .eq('events.published', true),
          supabase.from('member_stage_experiences').select('*').eq('komika_id', memberKomikaId),
        ]);
        if (registrationError || openMicHistoryError || lineupError || experienceError) {
          console.error('Failed to load member performance summary', registrationError ?? openMicHistoryError ?? lineupError ?? experienceError);
          setJourneyLoadError(true);
        } else {
          setJourneyLoadError(false);
        }
        setAttendedOpenMicCount((registrations ?? []).filter((item) => item.attendance_status === 'attended').length);
        historyData = (history as MemberOpenMicHistorySubmission[]) ?? [];
        setStageExperienceCount(((experiences as MemberStageExperience[]) ?? []).length);
        const completedEventIds = new Set(
          ((lineup ?? []) as unknown as { event: { id: string; date: string; status: 'upcoming' | 'completed' | 'cancelled'; published: boolean } }[])
            .filter((entry) => entry.event.published && getEventStatus(entry.event.status, entry.event.date) === 'completed')
            .map((entry) => entry.event.id),
        );
        setOfficialEventCount(completedEventIds.size);
      } else {
        setJourneyLoadError(false);
        setAttendedOpenMicCount(0);
        setStageExperienceCount(0);
        setOfficialEventCount(0);
      }

      setOpenMics((micData as OpenMic[]) ?? []);
      setOpenMicHistory(historyData);
      setLoading(false);
    })();
  }, [user?.email, user?.id]);

  const externalOpenMicCount = openMicHistory.filter((item) => !item.activity_type || item.activity_type === 'performance').length;
  const internalMcCount = openMicHistory.filter((item) => item.activity_type === 'mc_internal').length;
  const externalMcCount = openMicHistory.filter((item) => item.activity_type === 'mc_external').length;
  const totalMcCount = internalMcCount + externalMcCount;
  const totalOpenMicCount = attendedOpenMicCount + externalOpenMicCount;
  const totalJourneyCount = officialEventCount + stageExperienceCount;
  const upcomingMic = useMemo(() => openMics.find((mic) => getOpenMicStatus(mic.status, mic.date) === 'upcoming'), [openMics]);
  const openMicNumbers = useMemo(() => getOpenMicNumbers(openMics), [openMics]);

  return (
    <div className="animate-fade-in">
      <div className="container-app max-w-4xl space-y-3 py-3 sm:space-y-4 sm:py-5">
        <section className="relative isolate overflow-hidden rounded-2xl border border-[#5278bd] bg-gradient-to-r from-[#23447f] via-[#315b9b] to-[#477fc0] text-white shadow-[0_10px_26px_rgba(35,68,127,0.2)]">
          {profilePhoto && <img src={profilePhoto} alt={`Foto profil ${displayName}`} className="absolute right-0 top-[8%] h-[84%] w-[30%] object-cover object-top [mask-image:linear-gradient(90deg,transparent_0%,black_44%,black_100%),linear-gradient(180deg,transparent_0%,black_12%,black_88%,transparent_100%)] [mask-composite:intersect] [-webkit-mask-image:linear-gradient(90deg,transparent_0%,black_44%,black_100%),linear-gradient(180deg,transparent_0%,black_12%,black_88%,transparent_100%)] [-webkit-mask-composite:source-in] sm:inset-y-0 sm:top-0 sm:h-full sm:w-[40%] sm:[mask-image:linear-gradient(90deg,transparent_0%,black_28%,black_100%)] sm:[-webkit-mask-image:linear-gradient(90deg,transparent_0%,black_28%,black_100%)]" />}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#23447f_0%,rgba(49,91,155,0.97)_52%,rgba(49,91,155,0.78)_72%,rgba(49,91,155,0.24)_88%,transparent_100%)]" />
          {profilePhoto && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[30%] bg-[linear-gradient(180deg,rgba(35,68,127,0.52)_0%,rgba(35,68,127,0.12)_24%,transparent_50%,rgba(35,68,127,0.64)_100%)] sm:w-[40%]" />}
          <div className="relative z-10 p-3 sm:p-4">
            <div className="max-w-[78%]">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100">Member</p>
              <h1 className="mt-0.5 truncate text-xl font-black leading-tight sm:text-2xl">{displayName}</h1>
              <p className="mt-0.5 text-[10px] font-semibold text-blue-50">Komika | Standupindo Cilegon</p>
            </div>

            <div className="mt-3 grid max-w-[72%] grid-cols-2 gap-1.5 sm:max-w-[60%]">
              <div className="rounded-lg border border-white/30 bg-[#2c518d]/80 p-1.5">
                <div className="flex items-center justify-between gap-1"><span className="text-[9px] font-bold uppercase tracking-wide text-white">Open Mic</span><Mic className="h-3.5 w-3.5 text-sky-100" /></div>
                <div className="mt-0.5 flex items-baseline justify-between gap-1"><span className="text-[9px] font-semibold text-blue-50">Total Open Mic</span><strong className="text-base leading-none">{journeyLoadError ? '—' : totalOpenMicCount}</strong></div>
                <div className="mt-1 grid grid-cols-2 gap-x-1 text-[9px] font-semibold leading-tight text-white"><span>Internal <strong>{journeyLoadError ? '—' : attendedOpenMicCount}</strong></span><span>Eksternal <strong>{journeyLoadError ? '—' : externalOpenMicCount}</strong></span></div>
              </div>
              <div className="rounded-lg border border-white/30 bg-[#2c518d]/80 p-1.5">
                <div className="flex items-center justify-between gap-1"><span className="text-[9px] font-bold uppercase tracking-wide text-white">MC</span><Crown className="h-3.5 w-3.5 text-amber-200" /></div>
                <div className="mt-0.5 flex items-baseline justify-between gap-1"><span className="text-[9px] font-semibold text-blue-50">Total MC</span><strong className="text-base leading-none">{journeyLoadError ? '—' : totalMcCount}</strong></div>
                <div className="mt-1 grid grid-cols-2 gap-x-1 text-[9px] font-semibold leading-tight text-white"><span>Internal <strong>{journeyLoadError ? '—' : internalMcCount}</strong></span><span>Eksternal <strong>{journeyLoadError ? '—' : externalMcCount}</strong></span></div>
              </div>
            </div>

            <div className="mt-1.5 max-w-[72%] rounded-lg border border-white/30 bg-[#2c518d]/80 p-1.5 sm:max-w-[60%]">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white">Perjalanan Panggung</p>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'Total', value: totalJourneyCount },
                  { label: 'Internal', value: officialEventCount },
                  { label: 'Eksternal', value: stageExperienceCount },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0 border-l border-white/20 pl-1.5 first:border-0 first:pl-0">
                    <span className="block min-h-[20px] text-[9px] font-semibold leading-tight text-blue-50">{label}</span>
                    <strong className="block text-base leading-none">{journeyLoadError ? '—' : value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[9px] font-medium text-blue-50"><Crown className="h-3 w-3 shrink-0 text-amber-200" />PANGGUNG BERTAMBAH, KOMIKA BERTUMBUH</p>
          </div>
        </section>

        <section aria-labelledby="member-main-menu-title">
          <h2 id="member-main-menu-title" className="mb-1.5 text-sm font-extrabold text-slate-900">Menu Utama</h2>
          <div className="grid grid-cols-3 gap-2">
            {MAIN_MENU.map(({ label, to, icon: Icon }) => (
              <button key={to} type="button" onClick={() => router.navigate(to)} className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-white px-1.5 py-2 text-center text-slate-800 shadow-[0_4px_10px_rgba(37,99,235,0.07)] transition hover:border-blue-200 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-blue-700"><Icon className="h-5 w-5" /></span>
                <span className="max-w-full text-[10px] font-bold leading-tight sm:text-[11px]">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <button type="button" onClick={() => router.navigate('/member/komika-recap')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-left shadow-[0_4px_12px_rgba(37,99,235,0.07)] transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><Receipt className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">Komika Recap</span><span className="block text-[11px] font-medium text-slate-500">My Year on Stage</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-blue-700" />
        </button>

        <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_5px_16px_rgba(15,23,42,0.06)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">Open Mic Terdekat</h2>
            <button type="button" onClick={() => router.navigate('/member/open-mic')} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-blue-700">Lihat semua <ArrowRight className="h-3 w-3" /></button>
          </div>
          {loading ? (
            <div className="h-[92px] animate-pulse rounded-lg bg-slate-100" />
          ) : upcomingMic ? (
            <div className="grid min-h-[84px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
              <button type="button" onClick={() => router.navigate(`/member/open-mic/${upcomingMic.slug}`)} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-left">
                {upcomingMic.poster ? <img src={upcomingMic.poster} alt="" className="h-[78px] w-[88px] rounded-md object-cover" /> : <span className="flex h-[78px] w-[88px] items-center justify-center rounded-md bg-[#092455] text-white"><Mic className="h-6 w-6" /></span>}
                <span className="min-w-0">
                  <span className="block truncate text-base font-extrabold leading-tight text-slate-900">Open Mic #{openMicNumbers.get(upcomingMic.id) ?? '—'} · {upcomingMic.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium leading-tight text-slate-600"><span className="inline-flex items-center gap-0.5"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{formatDate(upcomingMic.date)}</span>{upcomingMic.time && <span className="inline-flex items-center gap-0.5"><Clock3 className="h-3.5 w-3.5 text-blue-600" />{upcomingMic.time}</span>}<span className="inline-flex min-w-0 items-center gap-0.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{upcomingMic.venue || upcomingMic.location || 'Lokasi menyusul'}</span></span></span>
                </span>
              </button>
              {upcomingMic.registration_status === 'open' ? (
                <button type="button" onClick={() => router.navigate(`/member/open-mic/${upcomingMic.slug}/daftar`)} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-blue-700 px-2.5 text-[11px] font-extrabold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Daftar <ArrowRight className="h-3 w-3" /></button>
              ) : (
                <span className="rounded-lg bg-slate-200 px-2 py-2 text-[10px] font-bold text-slate-500">Ditutup</span>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">Belum ada Open Mic mendatang.</div>
          )}
        </section>

        <CcsScheduleHighlights compact />
      </div>
    </div>
  );
}
