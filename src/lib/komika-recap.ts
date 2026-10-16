export interface RecapOpenMic {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  location: string | null;
  status: string;
}

export interface RecapRegistration {
  id: string;
  open_mic_id: string;
  attendance_status: string;
  status: string;
}

export interface RecapHistorySubmission {
  id: string;
  activity_type: 'performance' | 'mc_internal' | 'mc_external' | null;
  internal_open_mic_id: string | null;
  title: string;
  event_date: string;
  venue: string | null;
  city: string | null;
  status: string;
}

export interface RecapOfficialLineup {
  id: string;
  event_id: string;
  role_category: string;
  role_title: string | null;
  event: {
    id: string;
    title: string;
    date: string;
    status: string;
    published: boolean;
    venue: string | null;
    location: string | null;
  } | null;
}

export interface RecapStageExperience {
  id: string;
  event_date: string;
  event_name: string;
  role: string;
  custom_role: string | null;
  city: string;
}

export interface RecapSources {
  registrations: RecapRegistration[];
  openMics: RecapOpenMic[];
  history: RecapHistorySubmission[];
  lineups: RecapOfficialLineup[];
  experiences: RecapStageExperience[];
}

export interface RecapStage {
  id: string;
  title: string;
  date: string;
  place: string;
  roles: string[];
}

export interface KomikaYearRecap {
  year: number;
  openMicTotal: number;
  openMicInternal: number;
  openMicExternal: number;
  journeyTotal: number;
  journeyInternal: number;
  journeyExternal: number;
  totalStages: number;
  recentStages: RecapStage[];
  missingOpenMicDetails: number;
}

export function normalizeRecapText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isEligibleDate(date: string, today: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
}

function isCompletedEvent(status: string, date: string, today: string) {
  return status !== 'cancelled' && isEligibleDate(date, today);
}

function eventKey(date: string, title: string, place: string | null | undefined) {
  return `${date}|${normalizeRecapText(title)}|${normalizeRecapText(place)}`;
}

function hasYear(date: string, year: number) {
  return date.slice(0, 4) === String(year);
}

function historyType(item: RecapHistorySubmission) {
  return item.activity_type ?? 'performance';
}

function getEligibleOpenMics(sources: RecapSources, today: string) {
  const openMicById = new Map(sources.openMics.map((item) => [item.id, item]));
  const registrations = sources.registrations.filter((item) => item.status === 'confirmed' && item.attendance_status === 'attended');
  const eligible = registrations.flatMap((registration) => {
    const openMic = openMicById.get(registration.open_mic_id);
    return openMic && isCompletedEvent(openMic.status, openMic.date, today) ? [{ registration, openMic }] : [];
  });
  return { eligible, missingDetails: registrations.filter((item) => !openMicById.has(item.open_mic_id)).length };
}

function eligibleHistory(sources: RecapSources, today: string) {
  return sources.history.filter((item) => item.status === 'approved' && isEligibleDate(item.event_date, today));
}

function eligibleOfficialLineups(sources: RecapSources, today: string) {
  return sources.lineups.filter((item) => item.event?.published
    && isCompletedEvent(item.event.status, item.event.date, today));
}

function eligibleExperiences(sources: RecapSources, today: string) {
  return sources.experiences.filter((item) => isEligibleDate(item.event_date, today));
}

export function getKomikaRecapYears(sources: RecapSources, currentYear: number, today: string) {
  const years = new Set<number>([currentYear]);
  const { eligible: openMics } = getEligibleOpenMics(sources, today);
  const history = eligibleHistory(sources, today);
  const lineups = eligibleOfficialLineups(sources, today);
  const experiences = eligibleExperiences(sources, today);

  for (const { openMic } of openMics) years.add(Number(openMic.date.slice(0, 4)));
  for (const item of history) years.add(Number(item.event_date.slice(0, 4)));
  for (const item of lineups) years.add(Number(item.event!.date.slice(0, 4)));
  for (const item of experiences) years.add(Number(item.event_date.slice(0, 4)));

  return [...years].filter((year) => year <= currentYear).sort((first, second) => second - first);
}

export function buildKomikaYearRecap(sources: RecapSources, year: number, today: string): KomikaYearRecap {
  const yearOpenMics = getEligibleOpenMics(sources, today).eligible
    .filter(({ openMic }) => hasYear(openMic.date, year));
  const yearHistory = eligibleHistory(sources, today).filter((item) => hasYear(item.event_date, year));
  const yearLineups = eligibleOfficialLineups(sources, today).filter((item) => hasYear(item.event!.date, year));
  const yearExperiences = eligibleExperiences(sources, today).filter((item) => hasYear(item.event_date, year));

  const internalOpenMicById = new Map(yearOpenMics.map(({ openMic }) => [openMic.id, openMic]));
  const internalOpenMicKeys = new Set([...internalOpenMicById.values()].map((item) => eventKey(item.date, item.title, item.location || item.venue)));
  const externalPerformanceKeys = new Set(yearHistory
    .filter((item) => historyType(item) === 'performance')
    .map((item) => eventKey(item.event_date, item.title, item.city || item.venue))
    .filter((key) => !internalOpenMicKeys.has(key)));
  const officialById = new Map(yearLineups.map((item) => [item.event_id, item.event! ]));
  const officialKeys = new Set([...officialById.values()].map((item) => eventKey(item.date, item.title, item.location || item.venue)));
  const externalExperienceByKey = new Map<string, RecapStageExperience>();
  for (const item of yearExperiences) {
    const key = eventKey(item.event_date, item.event_name, item.city);
    if (!officialKeys.has(key) && !internalOpenMicKeys.has(key) && !externalPerformanceKeys.has(key)) {
      externalExperienceByKey.set(key, item);
    }
  }

  const stages = new Set<RecapStage>();
  const stageByAlias = new Map<string, RecapStage>();
  const addStage = (stage: Omit<RecapStage, 'roles'> & { role: string }, aliases: string[]) => {
    const existingStages = [...new Set(aliases.map((alias) => stageByAlias.get(alias)).filter((item): item is RecapStage => Boolean(item)))];
    const primary = existingStages[0];
    const target = primary ?? { ...stage, roles: [] };
    if (!primary) stages.add(target);
    else {
      for (const duplicate of existingStages.slice(1)) {
        duplicate.roles.forEach((role) => { if (!target.roles.includes(role)) target.roles.push(role); });
        stages.delete(duplicate);
        for (const [alias, value] of stageByAlias) if (value === duplicate) stageByAlias.set(alias, target);
      }
      if (!target.title && stage.title) target.title = stage.title;
      if (!target.place && stage.place) target.place = stage.place;
    }
    if (stage.role && !target.roles.includes(stage.role)) target.roles.push(stage.role);
    for (const alias of aliases) stageByAlias.set(alias, target);
  };

  for (const { openMic } of yearOpenMics) {
    const identity = eventKey(openMic.date, openMic.title, openMic.location || openMic.venue);
    addStage({ id: `open-mic:${openMic.id}`, title: openMic.title, date: openMic.date, place: openMic.venue || openMic.location || '', role: 'Open Mic' }, [
      `open-mic:${openMic.id}`,
      identity,
    ]);
  }

  for (const item of yearHistory) {
    const type = historyType(item);
    const identity = eventKey(item.event_date, item.title, item.city || item.venue);
    const aliases = [identity];
    if (type === 'mc_internal' && item.internal_open_mic_id) aliases.push(`open-mic:${item.internal_open_mic_id}`);
    addStage({
      id: `${type}:${item.id}`,
      title: item.title,
      date: item.event_date,
      place: item.venue || item.city || '',
      role: type === 'performance' ? 'Open Mic' : 'MC',
    }, aliases);
  }

  for (const [eventId, event] of officialById) {
    const lineup = yearLineups.find((item) => item.event_id === eventId)!;
    const labels: Record<string, string> = {
      lineup: 'Lineup / Penampil',
      opener: 'Opener',
      guest_star: 'Guest Star',
      mc_host: 'MC / Host',
      judge: 'Juri',
      special_show: 'Special Show',
      other: lineup.role_title || 'Lainnya',
    };
    const role = lineup.role_category === 'other' && lineup.role_title
      ? lineup.role_title
      : labels[lineup.role_category] || lineup.role_title || 'Penampil';
    addStage({
      id: `event:${eventId}`,
      title: event.title,
      date: event.date,
      place: event.venue || event.location || '',
      role,
    }, [`event:${eventId}`, eventKey(event.date, event.title, event.location || event.venue)]);
  }

  for (const item of yearExperiences) {
    const identity = eventKey(item.event_date, item.event_name, item.city);
    addStage({
      id: `experience:${item.id}`,
      title: item.event_name,
      date: item.event_date,
      place: item.city,
      role: item.role === 'Lainnya' ? item.custom_role || 'Lainnya' : item.role,
    }, [identity]);
  }

  const recentStages = [...stages]
    .sort((first, second) => second.date.localeCompare(first.date) || first.title.localeCompare(second.title, 'id'))
    .slice(0, 5)
    .map((item) => ({ ...item, roles: [...item.roles] }));
  const journeyInternal = officialById.size;
  const journeyExternal = externalExperienceByKey.size;
  const openMicInternal = internalOpenMicById.size;
  const openMicExternal = externalPerformanceKeys.size;

  return {
    year,
    openMicTotal: openMicInternal + openMicExternal,
    openMicInternal,
    openMicExternal,
    journeyTotal: journeyInternal + journeyExternal,
    journeyInternal,
    journeyExternal,
    totalStages: stages.size,
    recentStages,
    missingOpenMicDetails: getEligibleOpenMics(sources, today).missingDetails,
  };
}
