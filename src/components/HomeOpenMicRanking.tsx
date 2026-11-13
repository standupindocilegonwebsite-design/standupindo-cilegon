import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Info, Medal, Minus, Send, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SlidingTabIndicator } from '@/components/ui/SlidingTabIndicator';
import { ShareHomeOpenMicRankingModal } from '@/components/ShareHomeOpenMicRankingModal';
import { Modal } from '@/components/ui/Modal';

type RankingCategory = 'member' | 'non-member';
type RankingEntry = {
  id: string;
  stageName: string;
  community: string | null;
  appearances: number;
  profileSlug?: string | null;
  instagram?: string | null;
};
type RegistrationRow = {
  open_mic_id: string;
  komika_id: string | null;
  stage_name: string;
  community: string | null;
  instagram: string | null;
  created_at: string;
};
type OpenMicRow = { id: string; date: string; status: string };
type PublicKomikaRow = { id: string; slug: string; instagram_url: string | null };
type RankingAccumulator = RankingEntry & {
  firstAppearanceDate: string;
  firstRegistrationDate: string;
  latestAppearanceDate: string;
};
type RankingSnapshot = Record<RankingCategory, Record<string, number>>;

interface HomeOpenMicRankingProps {
  adminPublished?: boolean;
  publishing?: boolean;
  onPublicationChange?: (published: boolean) => void;
}

function getJakartaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function normalize(value: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getInstagramProfile(value: string | null | undefined) {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  let username = raw.replace(/^@/, '');

  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(raw)) {
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1) return null;
      username = decodeURIComponent(segments[0]).replace(/^@/, '');
      if (url.search || url.hash) return null;
    } catch {
      return null;
    }
  }

  if (!/^(?!.*\.\.)[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/i.test(username)) return null;
  return {
    username,
    url: `https://www.instagram.com/${encodeURIComponent(username)}/`,
  };
}

function readRankingSnapshot(key: string): RankingSnapshot {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { member: {}, 'non-member': {} };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { member: {}, 'non-member': {} };
    const snapshot = parsed as Partial<RankingSnapshot>;
    return {
      member: snapshot.member && typeof snapshot.member === 'object' ? snapshot.member : {},
      'non-member': snapshot['non-member'] && typeof snapshot['non-member'] === 'object' ? snapshot['non-member'] : {},
    };
  } catch (snapshotError) {
    console.warn('Snapshot ranking Home tidak dapat dibaca.', snapshotError);
    return { member: {}, 'non-member': {} };
  }
}

async function loadRankings(year: number): Promise<Record<RankingCategory, RankingEntry[]>> {
  const today = getJakartaDate();
  const { data: openMics, error: openMicError } = await supabase
    .from('open_mics')
    .select('id, date, status')
    .eq('published', true)
    .neq('status', 'cancelled')
    .gte('date', `${year}-01-01`)
    .lt('date', `${year + 1}-01-01`)
    .lte('date', today);
  if (openMicError) throw openMicError;

  const micRows = ((openMics ?? []) as OpenMicRow[])
    .filter((mic) => mic.status === 'completed' || mic.date < today);
  if (micRows.length === 0) return { member: [], 'non-member': [] };
  const micDateById = new Map(micRows.map((mic) => [mic.id, mic.date]));
  const micIds = micRows.map((mic) => mic.id);
  const registrations: RegistrationRow[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('open_mic_registrations')
      .select('open_mic_id, komika_id, stage_name, community, instagram, created_at')
      .in('open_mic_id', micIds)
      .eq('status', 'confirmed')
      .eq('attendance_status', 'attended')
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const page = (data ?? []) as RegistrationRow[];
    registrations.push(...page);
    if (page.length < 1000) break;
  }

  const memberIds = [...new Set(registrations
    .map((registration) => registration.komika_id)
    .filter((id): id is string => Boolean(id)))];
  const publicKomikaById = new Map<string, PublicKomikaRow>();
  for (let offset = 0; offset < memberIds.length; offset += 1000) {
    const { data, error } = await supabase
      .from('komika')
      .select('id, slug, instagram_url')
      .in('id', memberIds.slice(offset, offset + 1000))
      .eq('published', true)
      .eq('status', 'active');
    if (error) throw error;
    (data as PublicKomikaRow[] | null)?.forEach((profile) => publicKomikaById.set(profile.id, profile));
  }

  const grouped: Record<RankingCategory, Map<string, RankingAccumulator>> = {
    member: new Map(),
    'non-member': new Map(),
  };
  const countedAppearances = new Set<string>();

  registrations.forEach((registration) => {
    const category: RankingCategory = registration.komika_id ? 'member' : 'non-member';
    const stageName = registration.stage_name.trim();
    const normalizedName = normalize(stageName);
    if (!normalizedName) return;
    const identity = registration.komika_id
      ? `member:${registration.komika_id}`
      : `public:${normalizedName}|${normalize(registration.instagram)}`;
    const appearanceKey = `${registration.open_mic_id}|${identity}`;
    if (countedAppearances.has(appearanceKey)) return;
    countedAppearances.add(appearanceKey);

    const appearanceDate = micDateById.get(registration.open_mic_id) ?? '';
    const entries = grouped[category];
    const current = entries.get(identity);
    if (current) {
      current.appearances += 1;
      if (!current.instagram && registration.instagram) current.instagram = registration.instagram;
      if (appearanceDate && appearanceDate < current.firstAppearanceDate) {
        current.firstAppearanceDate = appearanceDate;
      }
      if (registration.created_at < current.firstRegistrationDate) {
        current.firstRegistrationDate = registration.created_at;
      }
      if (appearanceDate > current.latestAppearanceDate && registration.community) {
        current.community = registration.community;
        current.latestAppearanceDate = appearanceDate;
      }
      return;
    }

    entries.set(identity, {
      id: identity,
      stageName,
      community: registration.community,
      appearances: 1,
      instagram: registration.instagram,
      firstAppearanceDate: appearanceDate,
      firstRegistrationDate: registration.created_at,
      latestAppearanceDate: appearanceDate,
    });
  });

  const rank = (entries: Map<string, RankingAccumulator>, category: RankingCategory) => [...entries.values()]
    .sort((first, second) => second.appearances - first.appearances
      || first.firstRegistrationDate.localeCompare(second.firstRegistrationDate)
      || first.firstAppearanceDate.localeCompare(second.firstAppearanceDate)
      || first.stageName.localeCompare(second.stageName, 'id'))
    .slice(0, 5)
    .map(({ id, stageName, community, appearances, instagram }) => {
      const profile = category === 'member' ? publicKomikaById.get(id.slice('member:'.length)) : undefined;
      return {
        id,
        stageName,
        community,
        appearances,
        profileSlug: profile?.slug.trim() || null,
        instagram: category === 'member' ? profile?.instagram_url ?? null : instagram ?? null,
      };
    });

  return { member: rank(grouped.member, 'member'), 'non-member': rank(grouped['non-member'], 'non-member') };
}

export function HomeOpenMicRanking({ adminPublished, publishing = false, onPublicationChange }: HomeOpenMicRankingProps) {
  const [category, setCategory] = useState<RankingCategory>('member');
  const [rankings, setRankings] = useState<Record<RankingCategory, RankingEntry[]>>({ member: [], 'non-member': [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const year = Number(getJakartaDate().slice(0, 4));
  const rankingSnapshotKey = `standupindo-home-open-mic-ranking-snapshot-${year}`;
  const [previousRankings] = useState<RankingSnapshot>(() => readRankingSnapshot(rankingSnapshotKey));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadRankings(year).then((nextRankings) => {
      if (active) setRankings(nextRankings);
    }).catch((loadError: unknown) => {
      console.error('Gagal memuat ranking Open Mic di Home.', loadError);
      if (active) setError('Ranking Open Mic belum dapat dimuat. Silakan coba beberapa saat lagi.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [year]);

  const currentRankings = useMemo(() => ({
    member: Object.fromEntries(rankings.member.map((entry, index) => [entry.id, index + 1])),
    'non-member': Object.fromEntries(rankings['non-member'].map((entry, index) => [entry.id, index + 1])),
  }), [rankings]);

  useEffect(() => {
    if (loading || error) return;
    try {
      window.localStorage.setItem(rankingSnapshotKey, JSON.stringify(currentRankings));
    } catch (snapshotError) {
      console.warn('Snapshot ranking Home tidak dapat disimpan.', snapshotError);
    }
  }, [currentRankings, error, loading, rankingSnapshotKey]);

  const entries = rankings[category];
  return (
    <section data-home-reveal={adminPublished === undefined ? true : undefined} className={`home-reveal ${adminPublished === undefined ? '' : 'is-visible'}`}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative flex items-center gap-2 border-b border-white/20 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 px-3 py-2.5 text-white sm:gap-3 sm:px-5 sm:py-4 lg:justify-center lg:px-10 lg:py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-white sm:h-10 sm:w-10 lg:absolute lg:left-5">
            <Trophy aria-hidden="true" className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0 flex-1 lg:flex-none lg:text-center">
            <h2 className="truncate whitespace-nowrap text-[13px] font-extrabold leading-tight text-white sm:text-lg">Komika Terajin Open Mic</h2>
            <p className="mt-0.5 text-[10px] font-semibold leading-tight text-blue-200 sm:text-xs">Tahun {year}</p>
          </div>
          {adminPublished === undefined && (
            <div className="ml-auto flex shrink-0 items-center gap-0 sm:gap-1 lg:absolute lg:right-5 lg:ml-0">
              <button
                type="button"
                onClick={() => setShowInfo(true)}
                aria-label="Informasi ranking Komika Terajin Open Mic"
                title="Informasi ranking"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-9 sm:w-9"
              >
                <Info aria-hidden="true" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                disabled={loading || Boolean(error) || (rankings.member.length === 0 && rankings['non-member'].length === 0)}
                aria-label="Bagikan ringkasan ranking Komika Terajin Open Mic"
                title="Bagikan ringkasan ranking"
                className="inline-flex h-9 w-9 items-center justify-center text-white transition hover:text-blue-100 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
              >
                <Send aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>
          )}
        </div>
        <div className="p-3.5 sm:p-5">
          <div ref={categoryTabsRef} data-sliding-indicator-theme="blue-700" className="relative isolate grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Kategori ranking komika">
            <SlidingTabIndicator trackRef={categoryTabsRef} activeId={category} className="rounded-lg bg-blue-700 shadow-md shadow-blue-900/20" />
            {([
              ['member', 'Komika Member'],
              ['non-member', 'Komika Lainnya'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={category === value}
                data-sliding-tab={value}
                onClick={() => setCategory(value)}
                className={`relative z-10 min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors duration-200 sm:px-3 sm:text-sm ${category === value ? 'text-white' : 'text-slate-700 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-600" aria-live="polite">
            Ranking {category === 'member' ? 'Komika Member' : 'Komika Lainnya'}
          </p>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</p>
          ) : loading ? (
            <div className="mt-3 space-y-2" aria-label="Memuat ranking Open Mic">
              {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : entries.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-5 text-center text-sm font-medium text-slate-600">Belum ada kehadiran Open Mic yang tercatat untuk kategori ini pada tahun {year}.</p>
          ) : (
            <ol className="mt-3 space-y-2" role="tabpanel">
              {entries.map((entry, index) => {
                const instagramProfile = category === 'non-member' ? getInstagramProfile(entry.instagram) : null;
                const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                return (
                <li key={entry.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                      {index === 0 ? <Medal aria-hidden="true" className="h-4 w-4" /> : index + 1}
                    </span>
                    {(() => {
                      const previousRank = previousRankings[category][entry.id];
                      const currentRank = currentRankings[category][entry.id];
                      if (!previousRank) {
                        return <span className="rounded-full bg-slate-100 px-1 py-0.5 text-[7px] font-bold text-slate-500">BARU</span>;
                      }
                      if (currentRank < previousRank) {
                        return <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-green-600" aria-label={`Naik ${previousRank - currentRank} peringkat`}><ArrowUp className="h-3.5 w-3.5" />{previousRank - currentRank}</span>;
                      }
                      if (currentRank > previousRank) {
                        return <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-red-600" aria-label={`Turun ${currentRank - previousRank} peringkat`}><ArrowDown className="h-3.5 w-3.5" />{currentRank - previousRank}</span>;
                      }
                      return <Minus className="h-3.5 w-3.5 text-slate-400" aria-label="Peringkat tetap" />;
                    })()}
                  </span>
                  <span className="min-w-0 flex-1">
                    {category === 'member' && entry.profileSlug ? (
                      <a href={`/komika/${encodeURIComponent(entry.profileSlug)}`} className="block truncate rounded-sm text-sm font-bold text-slate-900 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:text-blue-800">
                        {entry.stageName}
                      </a>
                    ) : category === 'non-member' && instagramProfile ? (
                      <a
                        href={instagramProfile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          if (!isMobileDevice) return;
                          event.preventDefault();
                          const clearFallbackIfInstagramOpens = () => {
                            if (!document.hidden) return;
                            window.clearTimeout(fallbackTimer);
                            document.removeEventListener('visibilitychange', clearFallbackIfInstagramOpens);
                          };
                          const fallbackTimer = window.setTimeout(() => {
                            document.removeEventListener('visibilitychange', clearFallbackIfInstagramOpens);
                            if (!document.hidden) window.location.assign(instagramProfile.url);
                          }, 1200);
                          document.addEventListener('visibilitychange', clearFallbackIfInstagramOpens);
                          window.location.href = `instagram://user?username=${encodeURIComponent(instagramProfile.username)}`;
                        }}
                        className="block truncate rounded-sm text-sm font-bold text-slate-900 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:text-blue-800"
                      >
                        {entry.stageName}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-bold text-slate-900">{entry.stageName}</span>
                    )}
                    {entry.community && <span className="block truncate text-[11px] text-slate-500">{entry.community}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs font-extrabold tabular-nums text-blue-800">{entry.appearances}x tampil</span>
                </li>
                );
              })}
            </ol>
          )}
        </div>
        {onPublicationChange && adminPublished !== undefined && (
          <label className="flex cursor-pointer items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">Tampilkan ranking di Home publik</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {publishing ? 'Menyimpan perubahan...' : adminPublished ? 'Ranking saat ini terlihat oleh pengunjung.' : 'Ranking saat ini disembunyikan dari pengunjung.'}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Tampilkan ranking Komika Terajin Open Mic di Home publik"
              checked={adminPublished}
              disabled={publishing}
              onChange={(event) => onPublicationChange(event.target.checked)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 ${adminPublished ? 'bg-blue-700' : 'bg-slate-300'} ${publishing ? 'opacity-60' : ''}`}>
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${adminPublished ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </label>
        )}
      </div>
      {adminPublished === undefined && (
        <>
          <ShareHomeOpenMicRankingModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            rankings={rankings}
            year={year}
          />
          {showInfo && (
            <Modal
              open
              onClose={() => setShowInfo(false)}
              title="Tentang Ranking Open Mic"
              titleEyebrow="Komika Terajin"
              size="lg"
              headerClassName="!bg-gradient-to-br !from-blue-700 !via-blue-800 !to-blue-900 !px-4 !pb-3 !pt-3 sm:!px-6 sm:!pb-4 sm:!pt-4"
              titleClassName="!text-lg !font-black !text-white sm:!text-xl"
              titleEyebrowClassName="!mb-1 !text-blue-200"
              closeButtonClassName="!bg-white/15 !text-white hover:!bg-white/25 hover:!text-white"
              panelClassName="!max-w-xl"
            >
              <div className="space-y-2.5">
                {[
                  ['Apa yang dihitung?', 'Jumlah kehadiran Open Mic pada tahun berjalan. Setiap komika dihitung maksimal satu kali pada setiap acara.'],
                  ['Kehadiran mana yang masuk?', 'Pendaftaran harus berstatus confirmed dan kehadiran tercatat attended. Acara harus sudah berlangsung, dipublikasikan, dan tidak dibatalkan.'],
                  ['Apakah acara eksternal ikut dihitung?', 'Bisa, selama acara dan kehadiran komika tercatat di website ini dengan status yang memenuhi ketentuan.'],
                  ['Bagaimana pengelompokan komika?', 'Komika yang terhubung ke akun member masuk kategori Komika Member. Pendaftar tanpa akun member masuk kategori Komika Lainnya.'],
                ].map(([title, description], index) => (
                  <div key={title} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[10px] font-extrabold text-white">{index + 1}</span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-extrabold leading-snug text-slate-900 sm:text-sm">{title}</h4>
                        <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-600 sm:text-xs">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
