import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, CircleDashed, Mic, UserRound, Sparkles } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { OpenMic, OpenMicRegistration } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/lib/supabase';
import { formatDate, getOpenMicStatus } from '@/lib/format';

export function MemberDashboardPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [openMics, setOpenMics] = useState<OpenMic[]>([]);
  const [registrations, setRegistrations] = useState<OpenMicRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Member');

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
          .order('date', { ascending: true })
          .limit(5),
        supabase
          .from('komika')
          .select('id, stage_name')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle(),
      ]);

      const memberKomikaId = profileData?.id ?? null;
      const nextDisplayName = profileData?.stage_name?.trim() || user?.email?.split('@')[0] || 'Member';
      setDisplayName(nextDisplayName);

      let regData: OpenMicRegistration[] = [];
      if (memberKomikaId) {
        const { data } = await supabase
          .from('open_mic_registrations')
          .select('*')
          .eq('komika_id', memberKomikaId)
          .order('created_at', { ascending: false });
        regData = (data as OpenMicRegistration[]) ?? [];
      }

      setOpenMics((micData as OpenMic[]) ?? []);
      setRegistrations(regData);
      setLoading(false);
    })();
  }, [user?.id]);

  const latestRegistration = registrations[0];
  const attendedCount = registrations.filter((item) => item.attendance_status === 'attended').length;
  const nextOpenMicNumber = attendedCount + 1;
  const upcomingMic = useMemo(() => openMics.find((mic) => getOpenMicStatus(mic.status, mic.date) === 'upcoming'), [openMics]);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Member Dashboard" subtitle="Ringkasan profil, open mic, dan performa kamu." />

      <div className="container-app py-6 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 p-4 text-white shadow-[0_12px_30px_rgba(59,130,246,0.2)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">Member</p>
                  <h2 className="mt-2 text-2xl font-black leading-tight tracking-[-0.04em] sm:text-[2rem]">Halo, {displayName}</h2>
                  <p className="mt-2 inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/20">{upcomingMic ? `Open Mic kamu ke-${nextOpenMicNumber}` : attendedCount > 0 ? `Sudah tampil ${attendedCount} kali` : 'Siap untuk Open Mic pertama'}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                  <UserRound className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-blue-100">Open Mic</p>
                  <p className="mt-1 text-xl font-black">{registrations.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-blue-100">Status</p>
                  <p className="mt-1 text-xl font-black">{latestRegistration?.status ?? 'Belum'}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-blue-100">Tampil</p>
                  <p className="mt-1 text-xl font-black">{attendedCount}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-900">Open Mic terdekat</h3>
                <button onClick={() => router.navigate('/member/open-mic')} className="text-sm font-bold text-blue-700">Lihat semua</button>
              </div>

              {loading ? (
                <div className="mt-4 h-28 animate-pulse rounded-2xl bg-slate-100" />
              ) : upcomingMic ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Upcoming</p>
                      <h4 className="mt-1 text-lg font-black text-slate-900">{upcomingMic.title}</h4>
                    </div>
                    <div className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">{upcomingMic.registration_status}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <span>{formatDate(upcomingMic.date)}</span>
                  </div>
                  <button onClick={() => router.navigate(`/member/open-mic/${upcomingMic.slug}`)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-bold text-white">
                    Lihat Detail <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Belum ada open mic mendatang.</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <h3 className="text-lg font-extrabold text-slate-900">Status pendaftaran</h3>
              </div>
              <div className="mt-4 space-y-3">
                {registrations.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada pendaftaran Open Mic.</div>
                ) : registrations.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{item.registration_id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${item.status === 'confirmed' ? 'bg-green-100 text-green-700' : item.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <Mic className="h-3.5 w-3.5 text-slate-400" />
                      <span>{item.stage_name || item.full_name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>{item.attendance_status === 'attended' ? 'Hadir' : item.attendance_status === 'absent' ? 'Tidak Hadir' : 'Belum dicek'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="flex items-center gap-2">
                <CircleDashed className="h-4 w-4 text-blue-500" />
                <h3 className="text-lg font-extrabold text-slate-900">Quick access</h3>
              </div>
              <div className="mt-4 grid gap-2">
                <button onClick={() => router.navigate('/member/profile')} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100">Profil Member</button>
                <button onClick={() => router.navigate('/member/evaluations')} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100">Evaluasi Saya</button>
                <button onClick={() => router.navigate('/member/open-mic')} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100">Daftar Open Mic</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
