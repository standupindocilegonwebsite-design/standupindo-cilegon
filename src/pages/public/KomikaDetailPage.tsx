import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ShareButton } from '@/components/ui/ShareButton';
import { formatDate, formatStageName, getEventStatus, isStandupindoCilegonOrganizer, normalizeSpecialties, safeExternalUrl } from '@/lib/format';
import { seoDescription, setPageMetadata } from '@/lib/seo';

interface OfficialStageHistoryEntry {
  id: string;
  role_category: 'lineup' | 'opener' | 'guest_star' | 'mc_host' | 'judge' | 'special_show' | 'other';
  role_title: string | null;
  role_labels?: string[];
  event: { id: string; title: string; slug: string; date: string; venue: string; location: string; status: 'upcoming' | 'completed' | 'cancelled'; published: boolean };
}

interface ExternalStageHistoryEntry {
  id: string;
  event_date: string;
  event_name: string;
  event_type: string | null;
  role: string;
  custom_role: string | null;
  organizer: string | null;
  city: string;
  external_url: string | null;
}

interface Props {
  router: Router;
  slug: string;
}

function formatJourneyDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function KomikaDetailPage({ router, slug }: Props) {
  const [loading, setLoading] = useState(true);
  const [komika, setKomika] = useState<Komika | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [officialHistory, setOfficialHistory] = useState<OfficialStageHistoryEntry[]>([]);
  const [externalHistory, setExternalHistory] = useState<ExternalStageHistoryEntry[]>([]);
  const [journeyError, setJourneyError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: slugData } = await supabase
          .from('komika')
          .select('id, full_name, stage_name, slug, photo, photo_card, bio, karya_url, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at')
          .eq('slug', slug);

        let k = (slugData as Komika[] | null)?.find((item) => item.slug === slug) ?? null;

        if (!k) {
          const { data: fallbackData } = await supabase
            .from('komika')
            .select('id, full_name, stage_name, slug, photo, photo_card, bio, karya_url, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at')
            .limit(200);

          const rows = (fallbackData as Komika[] | null) ?? [];
          k = rows.find((item) => item.slug === slug && item.published && item.status === 'active') ?? null;
        }

        if (!k || k.published !== true || k.status !== 'active') {
          setKomika(null);
          setLoading(false);
          return;
        }

        setKomika(k);

        const [officialResult, externalResult] = await Promise.all([
          supabase.from('event_lineups')
            .select('id, role_category, role_title, event:events!inner(id, title, slug, date, venue, location, status, published)')
            .eq('komika_id', k.id)
            .eq('events.published', true),
          supabase.from('member_stage_experiences')
            .select('id, event_date, event_name, event_type, role, custom_role, organizer, city, external_url')
            .eq('komika_id', k.id)
            .order('event_date', { ascending: false })
            .order('created_at', { ascending: false }),
        ]);
        if (officialResult.error || externalResult.error) {
          console.error('Failed to load public stage journey', officialResult.error ?? externalResult.error);
          setJourneyError('Perjalanan panggung belum dapat dimuat. Coba segarkan halaman.');
        } else {
          const officialRoleLabels: Record<OfficialStageHistoryEntry['role_category'], string> = {
            lineup: 'Lineup / Penampil',
            opener: 'Opener',
            guest_star: 'Guest Star',
            mc_host: 'MC / Host',
            judge: 'Juri',
            special_show: 'Special Show',
            other: 'Lainnya',
          };
          const stageExperiences = (externalResult.data ?? []) as ExternalStageHistoryEntry[];
          const localRoleLabels = new Map<string, string[]>();
          stageExperiences.filter((entry) => isStandupindoCilegonOrganizer(entry.organizer)).forEach((entry) => {
            const key = `${entry.event_date}:${entry.event_name.trim().toLowerCase()}`;
            const roleLabel = entry.role === 'Lainnya' ? entry.custom_role || entry.role : entry.role;
            const roles = localRoleLabels.get(key) ?? [];
            if (!roles.includes(roleLabel)) roles.push(roleLabel);
            localRoleLabels.set(key, roles);
          });
          const completed = ((officialResult.data ?? []) as unknown as OfficialStageHistoryEntry[])
            .filter((entry) => entry.event.published && getEventStatus(entry.event.status, entry.event.date) === 'completed')
            .map((entry) => {
              const key = `${entry.event.date}:${entry.event.title.trim().toLowerCase()}`;
              const primaryRole = entry.role_category === 'other' && entry.role_title
                ? entry.role_title
                : officialRoleLabels[entry.role_category];
              const roles = [primaryRole, ...(localRoleLabels.get(key) ?? [])]
                .filter((role, index, allRoles) => allRoles.indexOf(role) === index);
              return { ...entry, role_labels: roles };
            })
            .sort((first, second) => second.event.date.localeCompare(first.event.date));
          setOfficialHistory(completed);
          setExternalHistory(stageExperiences.filter((entry) => !isStandupindoCilegonOrganizer(entry.organizer)));
          setJourneyError('');
        }

        const stageName = formatStageName(k.stage_name);
        setPageMetadata({
          path: `/komika/${encodeURIComponent(k.slug)}`,
          title: `${stageName} | Komika Cilegon | Standupindo Cilegon`,
          description: seoDescription(k.bio, `Kenali ${stageName}, komika dari Standupindo Cilegon di Cilegon, Banten.`),
          image: k.photo_card || k.photo,
        });
      } catch (error) {
        console.error('KomikaDetailPage query crashed', error);
        setKomika(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!komika) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Komika tidak ditemukan" />
        <div className="container-app py-8"><EmptyState title="Komika tidak ditemukan" /></div>
      </div>
    );
  }

  const pageUrl = `${window.location.origin}/komika/${komika.slug}`;
  const karyaUrl = safeExternalUrl(komika.karya_url);
  const specialties = normalizeSpecialties(komika.specialties);
  const profileCardPhoto = komika.photo_card || komika.photo;
  const stageName = formatStageName(komika.stage_name);
  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={stageName} />

      <div className="container-app py-6 sm:py-8">
        <div data-scroll-reveal className="scroll-reveal rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(11,60,93,0.05)] sm:p-6">
          <div className="grid grid-cols-[38%_minmax(0,1fr)] items-start gap-3 sm:gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
            <div className="aspect-[3/5] rounded-[18px] bg-gradient-to-br from-blue-800 via-blue-600 to-red-600 p-1 shadow-[0_10px_26px_rgba(11,60,93,0.2)] ring-1 ring-blue-900/10 sm:rounded-[22px]">
              <div className="h-full w-full overflow-hidden rounded-[14px] bg-slate-100 sm:rounded-[18px]">
                {profileCardPhoto ? (
                  <button onClick={() => setLightbox(true)} aria-label={`Lihat foto ${stageName}`} className="block h-full w-full">
                    <img src={profileCardPhoto} alt={stageName} className="h-full w-full object-cover object-top transition-transform duration-500 hover:scale-105" />
                  </button>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-50 text-5xl font-extrabold text-blue-600">
                    {stageName.charAt(0)}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-3 sm:space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Komika</p>
                  <h1 className="mt-1.5 break-words text-xl font-extrabold leading-tight tracking-[-0.04em] text-slate-900 sm:text-2xl md:mt-2 md:text-3xl">{stageName}</h1>
                </div>
                <ShareButton
                  title={`${stageName} — Standupindo Cilegon`}
                  text={`Kenali ${stageName}, komika dari Standupindo Cilegon.`}
                  url={pageUrl}
                  image={komika.photo}
                  className="!rounded-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <SocialIconButton instagram={komika.instagram_url} tiktok={komika.tiktok_url} youtube={komika.youtube_url} />
                {karyaUrl && (
                  <a
                    href={karyaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="komika-work-cta-light-leak group inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-700 px-3 text-xs font-extrabold text-white shadow-[0_0_12px_rgba(59,130,246,0.28),0_4px_10px_rgba(29,78,216,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-800 hover:shadow-[0_0_18px_rgba(96,165,250,0.42),0_7px_14px_rgba(29,78,216,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <Sparkles className="h-4 w-4 text-blue-100" />
                    Lihat Karyaku
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                )}
              </div>

              {specialties.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Profesi &amp; Keahlian</p>
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((s) => <span key={s} className="chip">{s}</span>)}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
        {komika.bio && (
          <section data-scroll-reveal className="scroll-reveal mt-4 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-slate-50 p-4 shadow-[0_10px_26px_rgba(30,64,175,0.06)] sm:mt-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-600 to-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Profil Komika</p>
                <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Tentang</h2>
                <p className="mt-3 max-w-4xl whitespace-pre-line text-sm leading-7 text-slate-700 sm:text-base sm:leading-8">{komika.bio}</p>
              </div>
            </div>
          </section>
        )}

        {(journeyError || officialHistory.length > 0 || externalHistory.length > 0) && (
          <section data-scroll-reveal className="scroll-reveal mt-6 rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 p-3.5 shadow-[0_10px_24px_rgba(30,64,175,0.06)] sm:p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-600 to-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Pengalaman Tampil</p>
                <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Perjalanan Panggung</h2>
              </div>
            </div>
            {journeyError && <p role="alert" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">{journeyError}</p>}
            <div className="mt-4 grid gap-3.5">
              {!journeyError && officialHistory.length > 0 && <div className="rounded-xl border border-blue-100 bg-white/90 p-3 shadow-sm sm:p-3.5">
                <div className="mb-3 flex items-start justify-between gap-3 border-b border-blue-100 pb-2.5">
                  <div>
                    <h3 className="text-sm font-extrabold tracking-tight text-slate-900 sm:text-base">Event Standupindo Cilegon</h3>
                    <p className="mt-0.5 text-xs font-medium leading-5 text-slate-700">Acara bersama komunitas</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{officialHistory.length}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left">
                    <thead>
                      <tr className="border-b border-blue-100 text-[10px] font-extrabold uppercase tracking-[0.06em] text-blue-800 sm:text-[11px]">
                        <th scope="col" className="w-[26%] px-2 py-2.5 sm:w-[24%]">Tanggal</th>
                        <th scope="col" className="w-[44%] px-2 py-2.5 sm:w-[48%]">Event</th>
                        <th scope="col" className="w-[30%] px-2 py-2.5 sm:w-[28%]">Peran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {officialHistory.map((entry) => (
                        <tr key={entry.id} className="group transition-colors hover:bg-blue-50/60">
                          <td className="px-2 py-3 align-top">
                            <span className="text-xs font-semibold leading-5 text-slate-800 sm:text-sm">
                              {formatJourneyDate(entry.event.date)}
                            </span>
                          </td>
                          <td className="px-2 py-3 align-top">
                            <button
                              type="button"
                              onClick={() => router.navigate(`/event/${encodeURIComponent(entry.event.slug)}`)}
                              aria-label={`Buka event ${entry.event.title}`}
                              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <span className="block break-words text-[13px] font-extrabold leading-5 text-slate-900 transition-colors group-hover:text-blue-800 sm:text-base">{entry.event.title}</span>
                            </button>
                            <span className="mt-0.5 block break-words text-[11px] font-medium leading-4 text-slate-700 sm:text-xs">{[entry.event.venue, entry.event.location].filter(Boolean).join(' · ') || 'Lokasi tidak tersedia'}</span>
                          </td>
                          <td className="px-2 py-3 align-top">
                            <span className="inline-flex max-w-full rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-bold leading-4 text-blue-900 sm:px-2 sm:text-xs sm:leading-5">
                              <span className="break-words">{entry.role_labels?.join(' / ') ?? (entry.role_category === 'other' && entry.role_title ? entry.role_title : entry.role_category)}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>}
              {!journeyError && externalHistory.length > 0 && <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm sm:p-3.5">
                <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="text-sm font-extrabold tracking-tight text-slate-900 sm:text-base">Event di Luar Standupindo Cilegon</h3>
                    <p className="mt-0.5 text-xs font-medium leading-5 text-slate-700">Acara bersama komunitas atau penyelenggara lain</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{externalHistory.length}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-[0.06em] text-blue-800 sm:text-[11px]">
                        <th scope="col" className="w-[26%] px-2 py-2.5 sm:w-[24%]">Tanggal</th>
                        <th scope="col" className="w-[44%] px-2 py-2.5 sm:w-[48%]">Event</th>
                        <th scope="col" className="w-[30%] px-2 py-2.5 sm:w-[28%]">Peran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {externalHistory.map((entry) => {
                        const url = safeExternalUrl(entry.external_url);
                        return (
                          <tr key={entry.id} className="transition-colors hover:bg-blue-50/60">
                            <td className="px-2 py-3 align-top">
                              <span className="text-xs font-semibold leading-5 text-slate-800 sm:text-sm">
                                {formatJourneyDate(entry.event_date)}
                              </span>
                            </td>
                            <td className="px-2 py-3 align-top">
                              {url
                                ? <a href={url} target="_blank" rel="noopener noreferrer" className="block break-words text-[13px] font-extrabold leading-5 text-slate-900 transition hover:text-blue-800 sm:text-base">{entry.event_name}</a>
                                : <span className="block break-words text-[13px] font-extrabold leading-5 text-slate-900 sm:text-base">{entry.event_name}</span>}
                              {(entry.organizer || entry.city) && <span className="mt-0.5 block break-words text-[11px] font-medium leading-4 text-slate-700 sm:text-xs">{[entry.organizer, entry.city].filter(Boolean).join(' · ')}</span>}
                            </td>
                            <td className="px-2 py-3 align-top">
                              <span className="inline-flex max-w-full rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-bold leading-4 text-blue-900 sm:px-2 sm:text-xs sm:leading-5">
                                <span className="break-words">{entry.role === 'Lainnya' ? entry.custom_role : entry.role}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>}
            </div>
          </section>
        )}
      </div>

      {profileCardPhoto && (
        <ImageLightbox src={komika.photo || profileCardPhoto} alt={stageName} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
