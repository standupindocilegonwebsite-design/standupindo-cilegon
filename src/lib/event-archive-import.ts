import type { EventLineupRole, Komika } from '@/lib/types';

const MONTHS: Record<string, string> = {
  januari: '01',
  februari: '02',
  maret: '03',
  april: '04',
  mei: '05',
  juni: '06',
  juli: '07',
  agustus: '08',
  september: '09',
  oktober: '10',
  november: '11',
  desember: '12',
};

const ROLE_PRIORITY: Record<EventLineupRole, number> = {
  special_show: 0,
  guest_star: 1,
  lineup: 2,
  opener: 3,
  mc_host: 4,
  judge: 5,
  other: 6,
};

const ROLE_ALIASES: Record<string, EventLineupRole> = {
  'lineup': 'lineup',
  'lineup cilegon': 'lineup',
  'lineup serang': 'lineup',
  'mc host': 'mc_host',
  'guest star': 'guest_star',
  'opener': 'opener',
  'juri': 'judge',
  'special performance': 'special_show',
};

const MEMBER_ALIASES: Record<string, string> = {
  devan: 'Devan Yulio',
  'devan yukio': 'Devan Yulio',
  'juan hendrik': 'Juan Hendrick',
  'robi bojo': 'Mang Obi',
  alfarobi: 'Mang Obi',
  diliana: 'Dili',
  masjol: 'Mas Jol',
};

const FORCE_EXTERNAL_NAMES = new Set(['reza']);

export interface ArchivePerformer {
  sourceNames: string[];
  displayName: string;
  komikaId: string | null;
  memberStageName: string | null;
  roles: EventLineupRole[];
}

export interface ArchiveEvent {
  sourceNumber: number;
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  description: string;
  eventType: string;
  performers: ArchivePerformer[];
}

export interface ArchiveParseResult {
  events: ArchiveEvent[];
  errors: string[];
}

type EventCreditSection = { label: string; names: string[] };

function normalizeName(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapStageHistoryRole(role: EventLineupRole): { role: string; customRole: string | null } {
  if (role === 'lineup') return { role: 'Lineup / Penampil', customRole: null };
  if (role === 'opener') return { role: 'Opener', customRole: null };
  if (role === 'guest_star') return { role: 'Guest Star', customRole: null };
  if (role === 'mc_host') return { role: 'MC / Host', customRole: null };
  if (role === 'special_show') return { role: 'Lainnya', customRole: 'Special Performance' };
  return { role: 'Lainnya', customRole: role === 'judge' ? 'Juri' : 'Lainnya' };
}

function createDescription(title: string, credits: EventCreditSection[], notes: string[]) {
  const sections = credits
    .filter((section) => section.names.length > 0)
    .map((section) => `${section.label}: ${section.names.map((name) => MEMBER_ALIASES[normalizeName(name)] ?? name).join(', ')}`);
  const description = [
    title,
    sections.length ? `\n\nPengisi acara:\n${sections.join('\n')}` : '',
    notes.length ? `\n\nCatatan arsip:\n${notes.join('\n')}` : '',
  ];
  return description.join('');
}

export function parseEventArchive(text: string): ArchiveParseResult {
  const events: ArchiveEvent[] = [];
  const errors: string[] = [];
  let current: {
    sourceNumber: number;
    title: string;
    date: string | null;
    time: string;
    venue: string;
    city: string | null;
    eventType: string;
    credits: Map<EventLineupRole, string[]>;
    creditSections: EventCreditSection[];
    notes: string[];
  } | null = null;

  const finishEvent = () => {
    if (!current) return;
    if (!current.date) errors.push(`${current.title}: tanggal tidak ditemukan atau formatnya tidak dikenali.`);
    if (!current.venue) errors.push(`${current.title}: tempat tidak ditemukan.`);
    if (current.date && current.venue) {
      const allNames = new Map<string, { displayName: string; roles: EventLineupRole[] }>();
      for (const [role, names] of current.credits) {
        for (const originalName of names) {
          const normalized = normalizeName(originalName);
          if (!normalized) continue;
          const displayName = MEMBER_ALIASES[normalized] ?? originalName;
          const key = normalizeName(displayName);
          const existing = allNames.get(key);
          if (existing) {
            if (!existing.roles.includes(role)) existing.roles.push(role);
          } else {
            allNames.set(key, { displayName, roles: [role] });
          }
        }
      }
      const performers: ArchivePerformer[] = [...allNames.values()].map(({ displayName, roles }) => ({
        sourceNames: [displayName],
        displayName,
        komikaId: null,
        memberStageName: null,
        roles: roles.sort((first, second) => ROLE_PRIORITY[first] - ROLE_PRIORITY[second]),
      }));
      const time = current.time || '19.30';
      const city = current.city || (/\broadshow\s+serang\b/i.test(current.title) ? 'Serang' : 'Cilegon');
      events.push({
        sourceNumber: current.sourceNumber,
        title: current.title,
        date: current.date,
        time,
        venue: current.venue,
        city,
        description: createDescription(current.title, current.creditSections, current.notes),
        eventType: current.eventType,
        performers,
      });
    }
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^\*\*(\d+)\.\s*(.+?)\*\*$/.exec(line);
    if (heading) {
      finishEvent();
      const title = heading[2].trim();
      current = {
        sourceNumber: Number(heading[1]),
        title,
        date: null,
        time: '19.30',
        venue: '',
        city: null,
        eventType: /\(special show\)/i.test(title) ? 'Special Show' : 'Event',
        credits: new Map(),
        creditSections: [],
        notes: [],
      };
      continue;
    }
    if (!current) continue;
    const bullet = /^-\s*([^:]+):\s*(.*)$/.exec(line);
    if (!bullet) continue;
    const label = bullet[1].trim();
    const value = bullet[2].trim();
    const normalizedLabel = normalizeName(label);
    if (normalizedLabel === 'tanggal') {
      const dateMatch = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
      const month = dateMatch ? MONTHS[dateMatch[2].toLowerCase()] : null;
      if (dateMatch && month) current.date = `${dateMatch[3]}-${month}-${dateMatch[1].padStart(2, '0')}`;
      continue;
    }
    if (normalizedLabel === 'jam') {
      const timeMatch = /^(\d{1,2})[.:](\d{2})/.exec(value);
      if (timeMatch) current.time = `${timeMatch[1].padStart(2, '0')}.${timeMatch[2]}`;
      continue;
    }
    if (normalizedLabel === 'tempat') {
      current.venue = value;
      continue;
    }
    if (normalizedLabel === 'kota') {
      current.city = value;
      continue;
    }
    const role = ROLE_ALIASES[normalizedLabel];
    if (role) {
      if (/^\d+\s+orang\b/i.test(value)) {
        current.notes.push(`${label}: ${value}`);
        continue;
      }
      if (value === '-' || !value) continue;
      const names = value.split(',').map((name) => name.trim()).filter(Boolean);
      current.credits.set(role, [...(current.credits.get(role) ?? []), ...names]);
      current.creditSections.push({ label, names });
    }
  }
  finishEvent();

  if (events.length === 0) errors.push('Tidak ada Event yang dikenali. Gunakan teks rekap dengan judul seperti **1. Nama Event**.');
  return { events, errors };
}

export function matchArchivePerformers(events: ArchiveEvent[], komika: Pick<Komika, 'id' | 'stage_name' | 'slug'>[]) {
  const memberByName = new Map<string, typeof komika>();
  komika.forEach((member) => {
    const key = normalizeName(member.stage_name);
    memberByName.set(key, [...(memberByName.get(key) ?? []), member]);
  });

  return events.map((event) => {
    const grouped = new Map<string, ArchivePerformer>();
    for (const sourcePerformer of event.performers) {
      const originalName = sourcePerformer.displayName;
      const normalized = normalizeName(originalName);
      const forcedExternal = FORCE_EXTERNAL_NAMES.has(normalized);
      const canonicalName = MEMBER_ALIASES[normalized] ?? originalName;
      const candidates = forcedExternal ? [] : memberByName.get(normalizeName(canonicalName)) ?? [];
      const member = candidates.length === 1 ? candidates[0] : null;
      const displayName = member?.stage_name ?? canonicalName;
      const key = member ? `member:${member.id}` : `external:${normalizeName(displayName)}`;
      const existing = grouped.get(key);
      if (existing) {
        sourcePerformer.roles.forEach((role) => {
          if (!existing.roles.includes(role)) existing.roles.push(role);
        });
      } else {
        grouped.set(key, {
          sourceNames: [originalName],
          displayName,
          komikaId: member?.id ?? null,
          memberStageName: member?.stage_name ?? null,
          roles: [...sourcePerformer.roles],
        });
      }
    }
    return {
      ...event,
      performers: [...grouped.values()].map((performer) => ({
        ...performer,
        roles: performer.roles.sort((first, second) => ROLE_PRIORITY[first] - ROLE_PRIORITY[second]),
      })),
    };
  });
}

export function getArchiveStageHistoryRole(role: EventLineupRole) {
  return mapStageHistoryRole(role);
}

export function normalizeArchiveName(value: string) {
  return normalizeName(value);
}
