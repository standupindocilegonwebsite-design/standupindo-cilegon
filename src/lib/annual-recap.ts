import { supabase } from '@/lib/supabase';

export type AnnualRecapRecord = {
  id?: string;
  year: number;
  published: boolean;
  closing_narrative: string | null;
  music_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AnnualRecapStats = {
  openMicCount: number;
  eventCount: number;
  appearanceCount: number;
  totalPerformerCount: number;
  firstTimePerformerCount: number;
  newMemberCount: number;
  monthlyActivity: Array<{ month: string; count: number }>;
  topInternalPerformers: Array<{ id: string; name: string; count: number; photo: string | null }>;
  topCommunities: Array<{ name: string; count: number }>;
  independentAppearanceCount: number;
  topOpenMics: Array<{ id: string; title: string; date: string; venue: string; location: string; poster: string | null; appearanceCount: number }>;
  eventPosters: Array<{ id: string; title: string; date: string; poster: string }>;
  eventPhotos: Array<{ id: string; eventId: string; eventTitle: string; date: string; url: string }>;
  totalTicketsSold: number | null;
  spotlightEvent: { id: string; title: string; date: string; poster: string | null; photo: string | null; ticketsSold: number } | null;
};

type RecapOpenMic = { id: string; title: string; date: string; venue: string; location: string; poster: string | null };
type RecapEvent = { id: string; title: string; date: string; poster: string | null; documentation_photos: string[] | null };
type RecapEventLineup = { event_id: string; komika_id: string | null; performer_name: string; role_category: string };
type AttendedRegistration = {
  open_mic_id: string;
  komika_id: string | null;
  stage_name: string;
  community: string | null;
};
type KomikaProfile = { id: string; stage_name: string; photo: string | null; photo_card: string | null };
type PublicTicketSalesStats = { totalTicketsSold: number; events: Array<{ eventId: string; ticketsSold: number }> };
const EVENT_PERFORMER_ROLES = ['lineup', 'opener', 'guest_star', 'special_show'];

export const DEFAULT_RECAP_CLOSING = 'Untuk semua komika yang naik ke panggung, semua komunitas yang ikut meramaikan, dan semua orang yang datang, menonton, mendukung, serta membuat Standupindo Cilegon terus berjalan.';

function getJakartaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function chunkValues<T>(values: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export async function loadHistoricalArchiveYears(): Promise<number[]> {
  const years = new Set<number>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('events')
      .select('date')
      .eq('is_historical_archive', true)
      .eq('published', true)
      .neq('status', 'cancelled')
      .lte('date', getJakartaDate())
      .order('date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = data ?? [];
    page.forEach((event) => {
      const year = Number(event.date.slice(0, 4));
      if (Number.isInteger(year)) years.add(year);
    });
    if (page.length < pageSize) break;
  }

  return [...years].sort((first, second) => second - first);
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export async function loadAnnualRecapStats(year: number): Promise<AnnualRecapStats> {
  const fromDate = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const currentYear = Number(getJakartaDate().slice(0, 4));
  const untilDate = year === currentYear ? getJakartaDate() : yearEnd;

  const [openMicResult, eventResult, attendanceHistoryResult, newMemberResult] = await Promise.all([
    supabase.from('open_mics').select('id, title, date, venue, location, poster')
      .eq('published', true).neq('status', 'cancelled').gte('date', fromDate).lt('date', untilDate).order('date', { ascending: true }),
    supabase.from('events').select('id, title, date, poster, documentation_photos')
      .eq('published', true).neq('status', 'cancelled').gte('date', fromDate).lt('date', untilDate).order('date', { ascending: true }),
    supabase.from('open_mics').select('id, date')
      .eq('published', true).neq('status', 'cancelled').lt('date', untilDate),
    supabase.from('komika').select('id', { count: 'exact', head: true })
      .eq('published', true).eq('status', 'active').eq('joined_at', String(year)),
  ]);

  if (openMicResult.error) throw openMicResult.error;
  if (eventResult.error) throw eventResult.error;
  if (attendanceHistoryResult.error) throw attendanceHistoryResult.error;
  if (newMemberResult.error) throw newMemberResult.error;

  const openMics = (openMicResult.data ?? []) as RecapOpenMic[];
  const events = (eventResult.data ?? []) as RecapEvent[];
  const historicalOpenMics = attendanceHistoryResult.data ?? [];
  const historicalOpenMicIds = historicalOpenMics.map((openMic) => openMic.id);
  const dateByOpenMicId = new Map(historicalOpenMics.map((openMic) => [openMic.id, openMic.date]));
  const registrations: AttendedRegistration[] = [];

  for (const openMicIds of chunkValues(historicalOpenMicIds)) {
    const { data, error } = await supabase.from('open_mic_registrations')
      .select('open_mic_id, komika_id, stage_name, community')
      .in('open_mic_id', openMicIds)
      .eq('status', 'confirmed')
      .eq('attendance_status', 'attended');
    if (error) throw error;
    registrations.push(...((data ?? []) as AttendedRegistration[]));
  }

  const currentOpenMicIds = new Set(openMics.map((openMic) => openMic.id));
  const currentRegistrations = registrations.filter((registration) => currentOpenMicIds.has(registration.open_mic_id));
  const eventLineups: RecapEventLineup[] = [];
  for (const eventIds of chunkValues(events.map((event) => event.id))) {
    const { data, error } = await supabase.from('event_lineups')
      .select('event_id, komika_id, performer_name, role_category')
      .in('event_id', eventIds)
      .in('role_category', EVENT_PERFORMER_ROLES);
    if (error) throw error;
    eventLineups.push(...((data ?? []) as RecapEventLineup[]));
  }

  const profilesById = new Map<string, KomikaProfile>();
  const komikaIds = [...new Set([
    ...currentRegistrations.map((registration) => registration.komika_id),
    ...eventLineups.map((entry) => entry.komika_id),
  ].filter((id): id is string => Boolean(id)))];

  for (const profileIds of chunkValues(komikaIds)) {
    const { data, error } = await supabase.from('komika').select('id, stage_name, photo, photo_card')
      .in('id', profileIds).eq('published', true).eq('status', 'active');
    if (error) throw error;
    ((data ?? []) as KomikaProfile[]).forEach((profile) => profilesById.set(profile.id, profile));
  }

  const normalizePerformerName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  const komikaIdByName = new Map<string, string | null>();
  currentRegistrations.forEach((registration) => {
    if (!registration.komika_id) return;
    const profileName = profilesById.get(registration.komika_id)?.stage_name;
    [registration.stage_name, profileName ?? ''].forEach((name) => {
      const normalizedName = normalizePerformerName(name);
      if (!normalizedName) return;
      const existingId = komikaIdByName.get(normalizedName);
      if (komikaIdByName.has(normalizedName) && existingId !== registration.komika_id) {
        komikaIdByName.set(normalizedName, null);
      } else {
        komikaIdByName.set(normalizedName, registration.komika_id);
      }
    });
  });

  const performerIdentities = new Set<string>();
  const addPerformerIdentity = (komikaId: string | null, name: string) => {
    const normalizedName = normalizePerformerName(name);
    const linkedKomikaId = komikaId ?? (normalizedName ? komikaIdByName.get(normalizedName) : null);
    if (!linkedKomikaId && !normalizedName) return;
    performerIdentities.add(linkedKomikaId ? `komika:${linkedKomikaId}` : `name:${normalizedName}`);
  };
  currentRegistrations.forEach((registration) => addPerformerIdentity(registration.komika_id, registration.stage_name));
  eventLineups.forEach((entry) => addPerformerIdentity(entry.komika_id, entry.performer_name));

  const monthlyCounts = Array.from({ length: 12 }, () => 0);
  [...openMics, ...events].forEach(({ date }) => {
    const monthIndex = Number(date.slice(5, 7)) - 1;
    if (monthIndex >= 0 && monthIndex < monthlyCounts.length) monthlyCounts[monthIndex] += 1;
  });

  const performerCounts = new Map<string, { id: string; name: string; count: number; photo: string | null }>();
  const communityCounts = new Map<string, { name: string; count: number }>();
  const openMicAppearanceCounts = new Map<string, number>();
  const earliestPerformanceByKomika = new Map<string, string>();
  const independentLabels = new Set(['umum', 'independen', 'independent', 'tanpa komunitas']);
  const internalCommunityLabels = new Set(['standupindo cilegon', 'komunitas standupindo cilegon']);
  let independentAppearanceCount = 0;

  registrations.forEach((registration) => {
    const performanceDate = dateByOpenMicId.get(registration.open_mic_id);
    if (performanceDate && registration.komika_id) {
      const previousDate = earliestPerformanceByKomika.get(registration.komika_id);
      if (!previousDate || performanceDate < previousDate) earliestPerformanceByKomika.set(registration.komika_id, performanceDate);
    }

    if (!currentOpenMicIds.has(registration.open_mic_id)) return;
    openMicAppearanceCounts.set(registration.open_mic_id, (openMicAppearanceCounts.get(registration.open_mic_id) ?? 0) + 1);

    if (registration.komika_id) {
      const profile = profilesById.get(registration.komika_id);
      if (!profile) return;
      const performer = performerCounts.get(registration.komika_id) ?? {
        id: registration.komika_id,
        name: profile?.stage_name || registration.stage_name.trim(),
        count: 0,
        photo: profile.photo_card || profile.photo,
      };
      performer.count += 1;
      performerCounts.set(registration.komika_id, performer);
    }

    const communityName = registration.community?.trim().replace(/\s+/g, ' ');
    if (!communityName) return;
    const communityKey = communityName.toLocaleLowerCase('id-ID');
    if (independentLabels.has(communityKey)) {
      independentAppearanceCount += 1;
      return;
    }
    if (internalCommunityLabels.has(communityKey)) return;
    const canonicalCommunityKey = communityKey.replace(/^standupindo\s+/, '');
    const community = communityCounts.get(canonicalCommunityKey) ?? { name: communityName, count: 0 };
    if (communityName.toLocaleLowerCase('id-ID').startsWith('standupindo ') && !community.name.toLocaleLowerCase('id-ID').startsWith('standupindo ')) {
      community.name = communityName;
    }
    community.count += 1;
    communityCounts.set(canonicalCommunityKey, community);
  });

  eventLineups.forEach((entry) => {
    if (!entry.komika_id) return;
    const profile = profilesById.get(entry.komika_id);
    if (!profile) return;
    const performer = performerCounts.get(entry.komika_id) ?? {
      id: entry.komika_id,
      name: profile.stage_name || entry.performer_name.trim(),
      count: 0,
      photo: profile.photo_card || profile.photo,
    };
    performer.count += 1;
    performerCounts.set(entry.komika_id, performer);
  });

  const byCount = <T extends { count: number }>(first: T, second: T) => second.count - first.count;
  const photoCandidates = [...events].reverse().flatMap((event) => {
    const documentationPhotos = Array.isArray(event.documentation_photos) ? event.documentation_photos : [];
    return documentationPhotos.map((url, photoIndex) => ({ id: `${event.id}-${photoIndex}`, eventId: event.id, eventTitle: event.title, date: event.date, url }));
  }).filter((photo) => Boolean(photo.url?.trim())).slice(0, 36);
  const photoDimensions = await Promise.all(photoCandidates.map((photo) => loadImageDimensions(photo.url)));
  const suitablePhotos = photoCandidates.filter((_, index) => {
    const dimensions = photoDimensions[index];
    if (!dimensions) return false;
    const ratio = dimensions.width / dimensions.height;
    return dimensions.width >= 800 && dimensions.height >= 400 && ratio >= 1.2 && ratio <= 2.1;
  });
  const photoCandidatesByEvent = new Map<string, number>();
  suitablePhotos.forEach((photo) => photoCandidatesByEvent.set(photo.eventId, (photoCandidatesByEvent.get(photo.eventId) ?? 0) + 1));
  const eventsWithPhotoSet = new Set([...photoCandidatesByEvent.entries()].filter(([, count]) => count >= 3).map(([eventId]) => eventId));
  const posterCandidates = events.filter((event): event is RecapEvent & { poster: string } => Boolean(event.poster?.trim()) && !eventsWithPhotoSet.has(event.id)).slice(-12);
  const posterDimensions = await Promise.all(posterCandidates.map((event) => loadImageDimensions(event.poster)));
  const eventPosters = posterCandidates.filter((_, index) => {
    const dimensions = posterDimensions[index];
    if (!dimensions) return false;
    const ratio = dimensions.width / dimensions.height;
    return dimensions.width >= 500 && dimensions.height >= 700 && ratio >= 0.55 && ratio <= 0.92;
  }).slice(-4).reverse().map((event) => ({ id: event.id, title: event.title, date: event.date, poster: event.poster }));

  const photoCountByEvent = new Map<string, number>();
  const eventsWithPoster = new Set(eventPosters.map((event) => event.id));
  let totalEventPhotos = 0;
  const eventPhotos = suitablePhotos.filter((photo) => {
    const count = photoCountByEvent.get(photo.eventId) ?? 0;
    const maxPhotos = eventsWithPoster.has(photo.eventId) ? 2 : 3;
    if (count >= maxPhotos || totalEventPhotos >= 3) return false;
    photoCountByEvent.set(photo.eventId, count + 1);
    totalEventPhotos += 1;
    return true;
  });

  let totalTicketsSold: number | null = null;
  let ticketsSoldByEvent = new Map<string, number>();
  const { data: ticketStats, error: ticketStatsError } = await supabase.functions.invoke<PublicTicketSalesStats>('annual-recap-public-stats', { body: { year } });
  if (!ticketStatsError && ticketStats) {
    totalTicketsSold = ticketStats.totalTicketsSold;
    ticketsSoldByEvent = new Map(ticketStats.events.map((event) => [event.eventId, event.ticketsSold]));
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const spotlightEntry = [...ticketsSoldByEvent.entries()].sort((first, second) => second[1] - first[1])[0];
  const spotlightEventRow = spotlightEntry && spotlightEntry[1] > 0 ? eventById.get(spotlightEntry[0]) : null;
  const spotlightDocumentation = eventPhotos.find((photo) => photo.eventId === spotlightEventRow?.id)?.url ?? null;
  const firstTimePerformerCount = [...earliestPerformanceByKomika.values()]
    .filter((date) => date >= fromDate && date < untilDate).length;

  return {
    openMicCount: openMics.length,
    eventCount: events.length,
    appearanceCount: currentRegistrations.length + eventLineups.length,
    totalPerformerCount: performerIdentities.size,
    firstTimePerformerCount,
    newMemberCount: newMemberResult.count ?? 0,
    monthlyActivity: monthlyCounts.map((count, index) => ({
      month: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(2020, index, 1)),
      count,
    })),
    topInternalPerformers: [...performerCounts.values()]
      .sort((first, second) => byCount(first, second) || first.name.localeCompare(second.name, 'id', { sensitivity: 'base' }))
      .slice(0, 3),
    topCommunities: [...communityCounts.values()].sort(byCount).slice(0, 3),
    independentAppearanceCount,
    topOpenMics: openMics.map((openMic) => ({
      id: openMic.id,
      title: openMic.title,
      date: openMic.date,
      venue: openMic.venue,
      location: openMic.location,
      poster: openMic.poster,
      appearanceCount: openMicAppearanceCounts.get(openMic.id) ?? 0,
    })).filter((openMic) => openMic.appearanceCount > 0)
      .sort((first, second) => second.appearanceCount - first.appearanceCount)
      .slice(0, 3),
    eventPosters,
    eventPhotos,
    totalTicketsSold,
    spotlightEvent: spotlightEventRow ? {
      id: spotlightEventRow.id,
      title: spotlightEventRow.title,
      date: spotlightEventRow.date,
      poster: spotlightEventRow.poster,
      photo: spotlightDocumentation,
      ticketsSold: spotlightEntry?.[1] ?? 0,
    } : null,
  };
}