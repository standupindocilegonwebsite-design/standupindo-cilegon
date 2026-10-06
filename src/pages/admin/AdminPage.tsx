import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BarChart3, Bell, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, DoorOpen, Eye, EyeOff, FolderOpen, History, ImagePlus, LogOut, MapPin, MessageCircle, Mic, MoreHorizontal, Pencil, Plus, Power, Printer, RefreshCw, Search, Settings, ShieldPlus, Ticket as TicketIcon, Trash2, UserCheck, UserPlus, Users, X, ArrowLeft, ExternalLink } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { ApplicationStatus, AttendanceStatus, CommunityApplication, EventItem, EventPartnership, EventParticipant, EventTicket, EvaluatorAssignment, Komika, MemberOpenMicHistoryStatus, MemberOpenMicHistorySubmission, OpenMic, OpenMicRegistration, Partner, SiteSettings, TicketOrder, TicketOrderStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPrice, getEventStatus, getOpenMicNumbers, getOpenMicStatus, normalizeWhatsappNumber, slugify, waLink } from '@/lib/format';
import { generateTicketOrderWhatsAppUrl } from '@/lib/whatsapp';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { MultiImageUpload } from '@/components/ui/MultiImageUpload';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { LOGO_URL } from '@/lib/types';
import { useNotifications } from '@/lib/notification-context';
import type { NotificationRecord, NotificationSource } from '@/lib/notification-context';
import { MemberAccountsPage } from '@/pages/admin/MemberAccountsPage';
import { AdminAccountsPage } from '@/pages/admin/AdminAccountsPage';
import { AdminProfileSettingsPage } from '@/pages/admin/AdminProfileSettingsPage';
import { TicketAdminOrdersPage } from '@/pages/admin/TicketAdminOrdersPage';
import { TicketPaymentMethodsPage } from '@/pages/admin/TicketPaymentMethodsPage';
import { TicketQrScannerPage } from '@/pages/admin/TicketQrScannerPage';
import { TicketAudiencePage } from '@/pages/admin/TicketAudiencePage';
import { TicketMaintenancePage } from '@/pages/admin/TicketMaintenancePage';
import { TicketAdminTicketsPage } from '@/pages/admin/TicketAdminTicketsPage';
import { TicketSalesReportPage } from '@/pages/admin/TicketSalesReportPage';
import { TicketCheckInReportPage } from '@/pages/admin/TicketCheckInReportPage';
import { TicketGateSettingsPage } from '@/pages/admin/TicketGateSettingsPage';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { AppCredit } from '@/components/AppCredit';
import { MobileBottomNavPortal } from '@/components/nav/MobileBottomNavPortal';

interface Props { router: Router; settings: SiteSettings; }
type Section = 'dashboard' | 'open-mic' | 'registrants' | 'open-mic-list' | 'open-mic-performers' | 'open-mic-history' | 'event-participants' | 'events' | 'applications' | 'komika' | 'partners' | 'member-accounts' | 'admin-accounts' | 'evaluator' | 'settings' | 'profile-settings' | 'ticket-orders' | 'tickets' | 'scan' | 'payment-info' | 'ticket-report' | 'ticket-gates' | 'check-in-report' | 'maintenance' | 'more';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Kesalahan tidak diketahui.';
}

const NAV: { key: Section; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'open-mic', label: 'Open Mic', icon: Mic },
  { key: 'open-mic-history', label: 'Riwayat Member', icon: History },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'applications', label: 'Gabung Komunitas', icon: UserPlus },
  { key: 'komika', label: 'Komika', icon: Users },
  { key: 'member-accounts', label: 'Akun Member', icon: UserPlus },
  { key: 'admin-accounts', label: 'Akun Admin', icon: ShieldPlus },
  { key: 'partners', label: 'Partners', icon: Users },
  { key: 'evaluator', label: 'Evaluator', icon: Users },
  { key: 'ticket-orders', label: 'Data Penonton', icon: TicketIcon },
  { key: 'ticket-gates', label: 'Pengaturan Gate', icon: DoorOpen },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const BOTTOM_NAV: { key: Section; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: 'Home', icon: BarChart3 },
  { key: 'open-mic', label: 'Open Mic', icon: Mic },
  { key: 'events', label: 'Event', icon: CalendarDays },
  { key: 'komika', label: 'Komika', icon: Users },
  { key: 'partners', label: 'Partner', icon: Users },
  { key: 'more', label: 'More', icon: MoreHorizontal },
];

function getSection(path: string): Section {
  const parts = path.split('/').filter(Boolean);
  if (parts[1] === 'pendaftar' && parts[2]) return 'registrants';
  if (parts[1] === 'open-mic-list') return 'open-mic-list';
  if (parts[1] === 'open-mic-performers') return 'open-mic-performers';
  if (parts[1] === 'open-mic-history') return 'open-mic-history';
  if (parts[1] === 'event-pendaftar' && parts[2]) return 'event-participants';
  if (parts[1] === 'data-penonton' || parts[1] === 'ticket-orders') return 'ticket-orders';
  if (parts[1] === 'tickets') return 'tickets';
  if (parts[1] === 'scan') return 'scan';
  if (parts[1] === 'payment-info') return 'payment-info';
  if (parts[1] === 'ticket-report') return 'ticket-report';
  if (parts[1] === 'ticket-gates') return 'ticket-gates';
  if (parts[1] === 'check-in-report') return 'check-in-report';
  if (parts[1] === 'maintenance') return 'maintenance';
  if (parts[1] === 'profile-settings') return 'profile-settings';
  const part = parts[1] as Section | undefined;
  if (part === 'more') return 'more';
  if (NAV.some((n) => n.key === part)) return part as Section;
  return 'dashboard';
}

function canAccessSection(section: Section, isAdmin: boolean, isOpenMicAdmin: boolean, isEventAdmin: boolean, isTicketAdmin: boolean, isQrScanner: boolean): boolean {
  if (isAdmin) return true;
  if (isTicketAdmin) return section === 'dashboard' || section === 'ticket-orders' || section === 'tickets' || section === 'events' || section === 'payment-info' || section === 'ticket-report' || section === 'ticket-gates' || (isQrScanner && section === 'check-in-report') || section === 'profile-settings' || section === 'more';
  if (isQrScanner) return section === 'dashboard' || section === 'scan' || section === 'events' || section === 'check-in-report' || section === 'profile-settings' || section === 'more';
  if (section === 'maintenance') return isAdmin || isEventAdmin;
  if (isOpenMicAdmin) return section === 'dashboard' || section === 'open-mic' || section === 'registrants' || section === 'open-mic-list' || section === 'open-mic-performers' || section === 'open-mic-history' || section === 'member-accounts' || section === 'evaluator' || section === 'profile-settings' || section === 'more';
  if (isEventAdmin) return section === 'dashboard' || section === 'events' || section === 'event-participants' || section === 'ticket-orders' || section === 'partners' || section === 'admin-accounts' || section === 'profile-settings' || section === 'more';
  return false;
}

async function loadAllTicketOrders() {
  const orders: TicketOrder[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('ticket_orders').select('*')
      .neq('status', 'Draft Pembayaran')
      .order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const page = (data as TicketOrder[] | null) ?? [];
    orders.push(...page);
    if (page.length < pageSize) break;
  }

  return { data: orders, error: null };
}

function getWorkspaceNav(isAdmin: boolean, isOpenMicAdmin: boolean, isEventAdmin: boolean, isTicketAdmin: boolean, isQrScanner: boolean) {
  if (isTicketAdmin) return [
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'ticket-orders' as Section, label: 'Order', icon: TicketIcon },
    { key: 'tickets' as Section, label: 'Tiket', icon: TicketIcon },
    { key: 'events' as Section, label: 'Event', icon: CalendarDays },
    { key: 'ticket-gates' as Section, label: 'Gate', icon: DoorOpen },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  if (isQrScanner) return [
    { key: 'scan' as Section, label: 'Scan', icon: Camera },
    { key: 'events' as Section, label: 'Event', icon: CalendarDays },
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  if (isOpenMicAdmin) return NAV.filter((item) => ['dashboard', 'open-mic'].includes(item.key)).concat([
    { key: 'open-mic-list' as Section, label: 'Pendaftar', icon: UserPlus },
    { key: 'open-mic-performers' as Section, label: 'Performer', icon: UserCheck },
    { key: 'open-mic-history' as Section, label: 'Riwayat Member', icon: History },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ]);
  if (isEventAdmin) return NAV.filter((item) => ['dashboard', 'events', 'ticket-orders', 'partners'].includes(item.key)).map((item) => item.key === 'ticket-orders' ? { ...item, label: 'Penonton' } : item).concat([
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ]);
  return NAV.filter((item) => isAdmin || canAccessSection(item.key, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner));
}

function getWorkspaceBottomNav(isAdmin: boolean, isOpenMicAdmin: boolean, isEventAdmin: boolean, isTicketAdmin: boolean, isQrScanner: boolean) {
  if (isTicketAdmin) return [
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'ticket-orders' as Section, label: 'Order', icon: TicketIcon },
    { key: 'tickets' as Section, label: 'Tiket', icon: TicketIcon },
    { key: 'events' as Section, label: 'Event', icon: CalendarDays },
    { key: 'ticket-gates' as Section, label: 'Gate', icon: DoorOpen },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  if (isQrScanner) return [
    { key: 'events' as Section, label: 'Event', icon: CalendarDays },
    { key: 'scan' as Section, label: 'Scan', icon: Camera },
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  if (isOpenMicAdmin) return [
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'open-mic' as Section, label: 'Open Mic', icon: Mic },
    { key: 'open-mic-list' as Section, label: 'Pendaftar', icon: UserPlus },
    { key: 'open-mic-performers' as Section, label: 'Performer', icon: UserCheck },
    { key: 'open-mic-history' as Section, label: 'Riwayat', icon: History },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  if (isEventAdmin) return [
    { key: 'dashboard' as Section, label: 'Ringkasan', icon: BarChart3 },
    { key: 'events' as Section, label: 'Event', icon: CalendarDays },
    { key: 'ticket-orders' as Section, label: 'Penonton', icon: TicketIcon },
    { key: 'partners' as Section, label: 'Partner', icon: Users },
    { key: 'more' as Section, label: 'Lainnya', icon: MoreHorizontal },
  ];
  return isAdmin ? BOTTOM_NAV : [];
}

function isMoreNavigationActive(section: Section, isTicketAdmin: boolean, isQrScanner: boolean) {
  return section === 'more' || section === 'settings'
    || (isTicketAdmin && (section === 'payment-info' || section === 'ticket-report' || section === 'profile-settings'))
    || (isQrScanner && (section === 'check-in-report' || section === 'profile-settings'));
}

function StatCard({ label, value, icon: Icon, tone, onClick, loading }: { label: string; value: number; icon: typeof BarChart3; tone: string; onClick?: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.98] sm:p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4.5 w-4.5" /></span>
      <p className="mt-2.5 text-xs font-medium leading-tight text-slate-500 sm:text-[13px]">{label}</p>
      {loading ? <div className="mt-1 h-7 w-10 skeleton" /> : <p className="mt-0.5 text-2xl font-extrabold leading-none text-slate-900 sm:text-[26px]">{value}</p>}
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="h-7 w-40 skeleton" />
        <div className="h-4 w-56 skeleton" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">{[1,2,3,4].map((n) => <div key={n} className="h-[110px] skeleton rounded-2xl" />)}</div>
      <div className="space-y-2.5">{[1,2].map((n) => <div key={n} className="h-14 skeleton rounded-2xl" />)}</div>
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">{[1,2,3].map((n) => <div key={n} className="h-14 skeleton rounded-xl" />)}</div>
        <div className="space-y-2">{[1,2,3].map((n) => <div key={n} className="h-14 skeleton rounded-xl" />)}</div>
      </div>
    </div>
  );
}

function AdminEmptyState({ title }: { title: string }) {
  return <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 ring-1 ring-slate-200/70">{title}</div>;
}

function ticketOrderStatusTone(status: TicketOrderStatus) {
  if (status === 'Lunas' || status === 'Terverifikasi') return 'bg-emerald-50 text-emerald-700';
  if (status === 'Selesai') return 'bg-slate-100 text-slate-700';
  return 'bg-blue-50 text-blue-700';
}

function ScopedEventList({ events, loading, onManageTickets }: { events: EventItem[]; loading: boolean; onManageTickets?: (event: EventItem) => void }) {
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const eventOptions = useMemo(() => events.map((event) => ({
    id: event.id,
    title: event.title,
    subtitle: `${event.venue}${event.location ? ` · ${event.location}` : ''}`,
  })), [events]);
  const filteredEvents = useMemo(() => events.filter((event) => {
    if (eventFilter !== 'all') return event.id === eventFilter;
    const status = getEventStatus(event.status, event.date);
    return status === statusFilter;
  }).sort((first, second) => statusFilter === 'completed'
    ? second.date.localeCompare(first.date)
    : first.date.localeCompare(second.date)), [eventFilter, events, statusFilter]);
  const filters: Array<{ value: typeof statusFilter; label: string }> = [
    { value: 'upcoming', label: 'Mendatang' },
    { value: 'completed', label: 'Selesai' },
    { value: 'cancelled', label: 'Dibatalkan' },
  ];

  if (selectedEvent) {
    const eventStatus = getEventStatus(selectedEvent.status, selectedEvent.date);
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelectedEvent(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
          <ArrowLeft className="h-4 w-4" /> Daftar Event
        </button>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative aspect-[16/9] max-h-[360px] overflow-hidden bg-slate-100">
            <img src={selectedEvent.poster || LOGO_URL} alt={`Poster ${selectedEvent.title}`} className={`h-full w-full ${selectedEvent.poster ? 'object-cover' : 'object-contain p-8'}`} />
            <span className="absolute left-3 top-3"><StatusBadge status={eventStatus} /></span>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <header className="border-b border-slate-200 pb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Detail Ticketing Event</p>
              <h1 className="mt-1 text-xl font-black leading-tight text-slate-950 sm:text-2xl">{selectedEvent.title}</h1>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><span>{formatDate(selectedEvent.date)}</span></p>
                {selectedEvent.time && <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><span>{selectedEvent.time}</span></p>}
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><span>{selectedEvent.venue}{selectedEvent.location ? ` · ${selectedEvent.location}` : ''}</span></p>
              </div>
            </header>
            {selectedEvent.description && <section className="overflow-hidden rounded-xl border border-slate-200">
              <button type="button" aria-expanded={descriptionExpanded} onClick={() => setDescriptionExpanded((expanded) => !expanded)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                <span><span className="block text-sm font-extrabold text-slate-900">Tentang Event</span><span className="mt-0.5 block text-xs text-slate-500">{descriptionExpanded ? 'Sembunyikan deskripsi' : 'Ketuk untuk membaca deskripsi'}</span></span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-slate-600 transition-transform ${descriptionExpanded ? 'rotate-180' : ''}`} />
              </button>
              {descriptionExpanded && <p className="whitespace-pre-line border-t border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700">{selectedEvent.description}</p>}
            </section>}
            {selectedEvent.event_rules && <section className="overflow-hidden rounded-xl border border-slate-200">
              <button type="button" aria-expanded={rulesExpanded} onClick={() => setRulesExpanded((expanded) => !expanded)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                <span><span className="block text-sm font-extrabold text-slate-900">Informasi & Ketentuan</span><span className="mt-0.5 block text-xs text-slate-500">{rulesExpanded ? 'Sembunyikan ketentuan' : 'Ketuk untuk membaca ketentuan'}</span></span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-slate-600 transition-transform ${rulesExpanded ? 'rotate-180' : ''}`} />
              </button>
              {rulesExpanded && <p className="whitespace-pre-line border-t border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700">{selectedEvent.event_rules}</p>}
            </section>}
            {selectedEvent.maps_url && <a href={selectedEvent.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-blue-700 hover:text-blue-700"><MapPin className="h-4 w-4" /> Buka lokasi Event</a>}
            {onManageTickets && eventStatus !== 'completed' && <div className="border-t border-slate-200 pt-4"><button type="button" onClick={() => onManageTickets(selectedEvent)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800"><TicketIcon className="h-4 w-4" /> Kelola Tiket</button></div>}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkspacePageHeader title="Event" subtitle="Event yang berada dalam scope akun ini." eyebrow="Ticketing" />
      {!loading && events.length > 0 && <>
        <SearchableEventSelect options={eventOptions} value={eventFilter} onChange={setEventFilter} allLabel="Cari nama Event atau lokasi..." ariaLabel="Cari Event berdasarkan nama atau lokasi" />
        <div role="tablist" aria-label="Filter status Event" className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => {
            const count = events.filter((event) => getEventStatus(event.status, event.date) === filter.value).length;
            const active = statusFilter === filter.value && eventFilter === 'all';
            return <button key={filter.value} type="button" role="tab" aria-selected={active} onClick={() => { setStatusFilter(filter.value); setEventFilter('all'); }} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold uppercase transition ${active ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}`}>{filter.label} <span className={active ? 'ml-1 text-blue-100' : 'ml-1 text-slate-500'}>{count}</span></button>;
          })}
        </div>
      </>}
      {loading ? <div className="space-y-3"><div className="h-24 skeleton rounded-2xl" /><div className="h-24 skeleton rounded-2xl" /></div>
        : events.length === 0 ? <AdminEmptyState title="Belum ada Event dalam scope akun ini." />
          : filteredEvents.length === 0 ? <AdminEmptyState title="Event tidak ditemukan untuk filter ini." />
            : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredEvents.map((event) => {
              const eventStatus = getEventStatus(event.status, event.date);
              return <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                <div className="relative aspect-[16/8] overflow-hidden bg-slate-100">
                  <img src={event.poster || LOGO_URL} alt={`Poster ${event.title}`} className={`h-full w-full transition duration-300 group-hover:scale-[1.02] ${event.poster ? 'object-cover' : 'object-contain p-8'}`} loading="lazy" />
                  <span className="absolute left-3 top-3"><StatusBadge status={eventStatus} /></span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 min-h-10 font-extrabold text-slate-950">{event.title}</h2>
                    <p className="mt-1 text-xs font-medium text-slate-600">{formatDate(event.date)} <span className="mx-1 text-slate-400">·</span> {event.venue}</p>
                  </div>
                </div>
                <div className="px-4 pb-4">
                  <span className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition group-hover:bg-blue-800">
                    <Eye className="h-4 w-4" /> Lihat Detail
                  </span>
                </div>
              </button>;
            })}</div>}
    </div>
  );
}

function TicketAdminDashboard({ orders, events, loading, onNavigate }: { orders: TicketOrder[]; events: EventItem[]; loading: boolean; onNavigate: (section: Section) => void }) {
  const [ticketStats, setTicketStats] = useState<{ total_tickets: number; checked_in: number; not_checked_in: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const waitingPayment = orders.filter((order) => order.status === 'Menunggu Pembayaran').length;
  const waitingVerification = orders.filter((order) => order.status === 'Menunggu Verifikasi' || order.status === 'Sudah Bayar').length;
  const issuedOrders = orders.filter((order) => order.status === 'Lunas' || order.status === 'Terverifikasi' || order.status === 'Selesai');
  const paidOrders = issuedOrders.filter((order) => order.order_type !== 'free_pass');
  const soldTickets = paidOrders.reduce((total, order) => total + order.quantity, 0);
  const issuedTickets = issuedOrders.reduce((total, order) => total + order.quantity, 0);
  useEffect(() => {
    let active = true;
    void supabase.functions.invoke('ticketing-admin', { body: { action: 'scanner-summary', scope_role: 'admin_ticket' } }).then(({ data, error }) => {
      if (!active) return;
      setStatsLoading(false);
      if (error || data?.error) { setStatsError(error?.message ?? data?.error ?? 'Statistik check-in gagal dimuat.'); return; }
      setTicketStats({ total_tickets: data.total_tickets ?? 0, checked_in: data.checked_in ?? 0, not_checked_in: data.not_checked_in ?? 0 });
    });
    return () => { active = false; };
  }, []);
  return <div className="space-y-5"><WorkspacePageHeader title="Ringkasan Ticketing" subtitle="Statistik order sesuai Event dalam scope akun." eyebrow="Admin Tiket" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-3"><StatCard label="Total Order" value={orders.length} icon={TicketIcon} tone="bg-blue-50 text-blue-700" onClick={() => onNavigate('ticket-orders')} loading={loading} /><StatCard label="Menunggu Pembayaran" value={waitingPayment} icon={Clock3} tone="bg-amber-50 text-amber-700" onClick={() => onNavigate('ticket-orders')} loading={loading} /><StatCard label="Menunggu Verifikasi" value={waitingVerification} icon={Eye} tone="bg-orange-50 text-orange-700" onClick={() => onNavigate('ticket-orders')} loading={loading} /><StatCard label="Order Lunas (berbayar)" value={paidOrders.length} icon={Check} tone="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('ticket-orders')} loading={loading} /><StatCard label="Tiket Terjual" value={soldTickets} icon={TicketIcon} tone="bg-indigo-50 text-indigo-700" onClick={() => onNavigate('tickets')} loading={loading} /><StatCard label="Tiket Diterbitkan" value={ticketStats?.total_tickets ?? issuedTickets} icon={TicketIcon} tone="bg-blue-50 text-blue-700" onClick={() => onNavigate('tickets')} loading={loading || statsLoading} /><StatCard label="Tiket Check-in" value={ticketStats?.checked_in ?? 0} icon={UserCheck} tone="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('tickets')} loading={statsLoading} /><StatCard label="Belum Check-in" value={ticketStats?.not_checked_in ?? 0} icon={Clock3} tone="bg-sky-50 text-sky-700" onClick={() => onNavigate('tickets')} loading={statsLoading} /></div>{statsError && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{statsError}</p>}<p className="text-xs text-slate-500">Event dalam scope: {events.length}</p></div>;
}

interface QrScannerAttendee {
  full_name: string;
  order_number: string | null;
  sequence_no: number;
  checked_in_at: string | null;
}

interface QrScannerSummary {
  total_tickets: number;
  checked_in: number;
  not_checked_in: number;
  attendees: QrScannerAttendee[];
  error?: string;
}

function QrScannerDashboard({ events, onNavigate }: { events: EventItem[]; onNavigate: (section: Section) => void }) {
  const selectableEvents = useMemo(() => events
    .filter((event) => getEventStatus(event.status, event.date) !== 'completed')
    .map((event) => ({ id: event.id, title: event.title, subtitle: `${formatDate(event.date)} · ${event.venue}` })), [events]);
  const [stats, setStats] = useState<{ total_tickets: number; checked_in: number; not_checked_in: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [attendeesRefresh, setAttendeesRefresh] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState(() => selectableEvents[0]?.id ?? '');
  const [attendees, setAttendees] = useState<QrScannerAttendee[]>([]);
  const [attendeeFilter, setAttendeeFilter] = useState<'all' | 'checked-in' | 'not-checked-in'>('all');
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<QrScannerAttendee | null>(null);
  const [copiedOrderNumber, setCopiedOrderNumber] = useState('');

  useEffect(() => {
    if (!selectableEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(selectableEvents[0]?.id ?? '');
      setAttendees([]);
    }
  }, [selectableEvents, selectedEventId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error: requestError } = await supabase.functions.invoke<QrScannerSummary>('ticketing-admin', {
          body: { action: 'scanner-summary', scope_role: 'admin_qr' },
        });
        if (!active) return;
        if (requestError || !data || data.error) {
          setStatsError(requestError?.message ?? data?.error ?? 'Ringkasan check-in gagal dimuat.');
          return;
        }
        setStatsError('');
        setStats({
          total_tickets: data.total_tickets ?? 0,
          checked_in: data.checked_in ?? 0,
          not_checked_in: data.not_checked_in ?? 0,
        });
      } catch (requestError) {
        if (!active) return;
        setStatsError(requestError instanceof Error ? requestError.message : 'Ringkasan check-in gagal dimuat.');
      } finally {
        if (active) setStatsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [statsRefresh]);

  useEffect(() => {
    let active = true;
    if (!selectedEventId) {
      setAttendees([]);
      setLoading(false);
      setError('');
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: requestError } = await supabase.functions.invoke<QrScannerSummary>('ticketing-admin', {
          body: { action: 'scanner-summary', scope_role: 'admin_qr', event_id: selectedEventId, include_stats: false },
        });
        if (!active) return;
        if (requestError || !data || data.error) {
          setError(requestError?.message ?? data?.error ?? 'Daftar peserta gagal dimuat.');
          return;
        }
        setAttendees(data.attendees ?? []);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Daftar peserta gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedEventId, attendeesRefresh]);

  useEffect(() => {
    if (!selectedEventId) return;
    const channel = supabase.channel(`ticket-checkins-${selectedEventId}`)
      .on('broadcast', { event: 'check-in-updated' }, () => {
        setAttendeesRefresh((refresh) => refresh + 1);
        setStatsLoading(true);
        setStatsRefresh((refresh) => refresh + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedEventId]);

  const filteredAttendees = useMemo(() => {
    const query = attendeeSearch.trim().toLocaleLowerCase('id-ID');
    return attendees.filter((attendee) => {
      const isCheckedIn = Boolean(attendee.checked_in_at);
      const matchesStatus = attendeeFilter === 'all'
        || (attendeeFilter === 'checked-in' ? isCheckedIn : !isCheckedIn);
      const matchesQuery = !query
        || `${attendee.full_name} ${attendee.order_number ?? ''}`.toLocaleLowerCase('id-ID').includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [attendeeFilter, attendeeSearch, attendees]);

  async function copyOrderNumber(orderNumber: string) {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiedOrderNumber(orderNumber);
      window.setTimeout(() => setCopiedOrderNumber(''), 1800);
    } catch (copyError) {
      console.error('Kode order gagal disalin.', copyError);
      setError('Kode order tidak dapat disalin. Silakan salin secara manual.');
    }
  }

  return <div className="space-y-5">
    <WorkspacePageHeader title="Ringkasan Check-in" subtitle="Pantau tiket terjual dan progres check-in Event dalam scope scanner." eyebrow="Admin QR Scanner" />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      <StatCard label="Tiket Terjual" value={stats?.total_tickets ?? 0} icon={TicketIcon} tone="bg-blue-50 text-blue-700" onClick={() => onNavigate('scan')} loading={statsLoading} />
      <StatCard label="Sudah Check-in" value={stats?.checked_in ?? 0} icon={UserCheck} tone="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('scan')} loading={statsLoading} />
      <StatCard label="Belum Check-in" value={stats?.not_checked_in ?? 0} icon={Clock3} tone="bg-sky-50 text-sky-700" onClick={() => onNavigate('scan')} loading={statsLoading} />
    </div>
    {(error || statsError) && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error || statsError}</p>}
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-950">Daftar Check-in Event</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">Lihat siapa yang sudah hadir dan siapa yang belum check-in.</p>
      </div>
      <SearchableEventSelect
        options={selectableEvents}
        value={selectedEventId || 'all'}
        onChange={(value) => {
          setLoading(true);
          setSelectedEventId(value === 'all' ? '' : value);
          setAttendees([]);
        }}
        allLabel="Pilih Event"
        ariaLabel="Pilih Event untuk daftar check-in"
      />
      {(loading && selectedEventId)
        ? <div className="flex min-h-28 items-center justify-center text-sm font-medium text-slate-500"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />Memuat daftar peserta...</div>
        : !selectedEventId
            ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Belum ada Event tersedia untuk ditampilkan.</p>
            : <>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['all', 'Semua', attendees.length],
                  ['checked-in', 'Sudah hadir', attendees.filter((attendee) => attendee.checked_in_at).length],
                  ['not-checked-in', 'Belum hadir', attendees.filter((attendee) => !attendee.checked_in_at).length],
                ] as const).map(([value, label, count]) => <button
                  key={value}
                  type="button"
                  onClick={() => setAttendeeFilter(value)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition ${attendeeFilter === value ? 'border-blue-700 bg-blue-50 text-blue-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                >
                  <span className="block text-sm font-extrabold">{count}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold sm:text-xs">{label}</span>
                </button>)}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={attendeeSearch} onChange={(event) => setAttendeeSearch(event.target.value)} className="input-field pl-10" placeholder="Cari nama atau nomor order..." aria-label="Cari peserta check-in" />
              </div>
              {filteredAttendees.length
                ? <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,6.5rem)_1rem] items-center gap-2 bg-slate-100 px-2.5 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600 sm:grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,9rem)_1.25rem] sm:gap-3 sm:px-4">
                    <span className="text-center">No.</span>
                    <span>Nama</span>
                    <span>Kode</span>
                    <span className="sr-only">Detail</span>
                  </div>
                  <ul className="divide-y divide-slate-200">
                    {filteredAttendees.map((attendee, index) => <li
                      key={`${attendee.order_number ?? attendee.full_name}-${attendee.sequence_no}-${index}`}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50/60'}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAttendee(attendee)}
                        className="grid min-h-[3.75rem] w-full grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,6.5rem)_1rem] items-center gap-2 px-2.5 py-2.5 text-left transition hover:bg-blue-100/80 focus:outline-none focus-visible:bg-blue-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 sm:grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,9rem)_1.25rem] sm:gap-3 sm:px-4"
                        aria-label={`Lihat detail tiket nomor ${index + 1}, ${attendee.full_name}`}
                      >
                        <span className="mx-auto inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-1 text-xs font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-900">{attendee.full_name}</span>
                          <span className={`mt-0.5 block text-[10px] font-bold ${attendee.checked_in_at ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {attendee.checked_in_at ? 'Sudah hadir' : 'Belum hadir'}
                          </span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[9px] text-slate-600 sm:text-xs">
                          <span className="min-w-0 truncate">{attendee.order_number ?? '—'}</span>
                          {attendee.order_number && <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyOrderNumber(attendee.order_number!);
                            }}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-blue-100 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            aria-label={copiedOrderNumber === attendee.order_number ? 'Kode order berhasil disalin' : `Salin kode order ${attendee.order_number}`}
                            title={copiedOrderNumber === attendee.order_number ? 'Tersalin' : 'Salin kode order'}
                          >
                            {copiedOrderNumber === attendee.order_number
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </button>}
                        </span>
                        <ChevronRight className="h-4 w-4 justify-self-end text-slate-400" />
                      </button>
                    </li>)}
                  </ul>
                </div>
                : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{attendees.length ? 'Tidak ada peserta yang cocok dengan pencarian atau filter ini.' : 'Belum ada tiket lunas untuk Event ini.'}</p>}
            </>}
    </section>
    <Modal open={Boolean(selectedAttendee)} onClose={() => setSelectedAttendee(null)} title="Detail Tiket" size="sm">
      {selectedAttendee && <div className="space-y-3">
        <p className="text-sm text-slate-600">{selectedAttendee.full_name}</p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr><th className="w-12 px-3 py-2.5 text-right">No.</th><th className="px-3 py-2.5">Detail</th><th className="px-3 py-2.5">Informasi</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['Nama', selectedAttendee.full_name],
                ['Kode Order', selectedAttendee.order_number ?? '—'],
                ['Nomor Tiket', `Tiket ${selectedAttendee.sequence_no}`],
                ['Status', selectedAttendee.checked_in_at ? 'Sudah hadir' : 'Belum hadir'],
                ['Waktu Check-in', selectedAttendee.checked_in_at
                  ? new Date(selectedAttendee.checked_in_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
                  : '—'],
              ].map(([label, value], index) => <tr key={label}>
                <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-400">{index + 1}</td>
                <th scope="row" className="px-3 py-3 text-xs font-semibold text-slate-500">{label}</th>
                <td className="px-3 py-3 text-right text-xs font-bold text-slate-900">
                  {label === 'Kode Order' && selectedAttendee.order_number
                    ? <span className="inline-flex max-w-full items-center justify-end gap-1.5">
                      <span className="break-all">{value}</span>
                      <button
                        type="button"
                        onClick={() => void copyOrderNumber(selectedAttendee.order_number!)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        aria-label={copiedOrderNumber === selectedAttendee.order_number ? 'Kode order berhasil disalin' : 'Salin kode order'}
                        title={copiedOrderNumber === selectedAttendee.order_number ? 'Tersalin' : 'Salin kode order'}
                      >
                        {copiedOrderNumber === selectedAttendee.order_number
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <Copy className="h-4 w-4" />}
                      </button>
                    </span>
                    : value}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </Modal>
  </div>;
}

const NOTIFICATION_LABELS: Record<NotificationSource, string> = {
  'ticket-orders': 'Data Penonton',
  'open-mic': 'Pendaftar Open Mic',
  'event-participants': 'Pendaftar Event',
  applications: 'Gabung Komunitas',
};

const NOTIFICATION_ROUTES: Record<NotificationSource, Section> = {
  'ticket-orders': 'ticket-orders',
  'open-mic': 'open-mic-list',
  'event-participants': 'events',
  applications: 'applications',
};

function NotificationBell({
  notifications,
  unreadCount,
  onNavigate,
  onMarkAsRead,
  onMarkAllAsRead,
  inverse = false,
}: {
  notifications: NotificationRecord[];
  unreadCount: number;
  onNavigate: (section: Section) => void;
  onMarkAsRead: (source: NotificationSource, id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  inverse?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function openNotification(notification: NotificationRecord) {
    await onMarkAsRead(notification.source, notification.id);
    setOpen(false);
    onNavigate(NOTIFICATION_ROUTES[notification.source]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition ${inverse ? (open ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15') : (open ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700')}`}
        title="Notifikasi admin"
        aria-label={`Notifikasi admin${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifikasi admin" className="fixed left-2 right-2 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[min(22rem,calc(100vw-2rem))] sm:max-h-none">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Notifikasi</h3>
              <p className="mt-0.5 text-xs text-slate-500">Aktivitas yang perlu ditinjau</p>
            </div>
            {notifications.length > 0 && <button type="button" onClick={() => void onMarkAllAsRead()} className="text-xs font-bold text-blue-700 hover:text-blue-900">Tandai dibaca</button>}
          </div>

          {notifications.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Bell className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-600">Tidak ada notifikasi baru</p>
              <p className="mt-1 text-xs text-slate-400">Semua aktivitas sudah ditinjau.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-2">
              {notifications.map((notification) => (
                <button
                  key={`${notification.source}:${notification.id}`}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-blue-50"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">{NOTIFICATION_LABELS[notification.source]}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Status: {notification.status}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttendanceBadge({ status }: { status?: AttendanceStatus }) {
  const current = status ?? 'unmarked';
  const label = current === 'attended' ? 'Hadir' : current === 'absent' ? 'Tidak Hadir' : 'Belum Dicek';
  const style = current === 'attended' ? 'bg-green-50 text-green-700 ring-green-200' : current === 'absent' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-slate-100 text-slate-500 ring-slate-200';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${style}`}>{label}</span>;
}

export function AdminPage({ router, settings }: Props) {
  const { user, signOut, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner } = useAuth();
  const { unreadCount, notifications, counts: notificationCounts, revision, resync: resyncNotifications, markAsRead, markAllAsRead } = useNotifications();
  const requestedSection = getSection(router.path);
  const section = canAccessSection(requestedSection, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner)
    ? requestedSection
    : isOpenMicAdmin ? 'open-mic' : isEventAdmin ? 'events' : isQrScanner ? 'scan' : isTicketAdmin ? 'ticket-orders' : 'dashboard';
  const visibleNav = getWorkspaceNav(isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner);
  const visibleBottomNav = getWorkspaceBottomNav(isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner);
  const workspaceTitle = isOpenMicAdmin ? 'OPEN MIC WORKSPACE' : isEventAdmin ? 'EVENT WORKSPACE' : isTicketAdmin ? 'TICKET WORKSPACE' : isQrScanner ? 'SCANNER WORKSPACE' : 'ADMIN PANEL';
  const [openMics, setOpenMics] = useState<OpenMic[]>([]);
  const [registrations, setRegistrations] = useState<OpenMicRegistration[]>([]);
    const [events, setEvents] = useState<EventItem[]>([]); // This line is unchanged
  const [komika, setKomika] = useState<Komika[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [eventPartnerships, setEventPartnerships] = useState<EventPartnership[]>([]);
  const [communityApplications, setCommunityApplications] = useState<CommunityApplication[]>([]);
  const [ticketOrders, setTicketOrders] = useState<TicketOrder[]>([]);
  const [evaluatorAssignments, setEvaluatorAssignments] = useState<EvaluatorAssignment[]>([]);
  const [memberHistory, setMemberHistory] = useState<MemberOpenMicHistorySubmission[]>([]);
  const [eventPendingCounts, setEventPendingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'open-mic' | 'event' | 'komika' | 'partner' | null>(null);
  const [editing, setEditing] = useState<OpenMic | EventItem | Komika | Partner | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isErrorNotice = /gagal|tidak berhasil|tidak dapat/i.test(notice);
  const [deleteTarget, setDeleteTarget] = useState<{ table: 'open_mics' | 'events' | 'komika' | 'partners'; id: string } | null>(null);
  const [ticketDeleteTarget, setTicketDeleteTarget] = useState<string | null>(null);
  const [ticketEvent, setTicketEvent] = useState<EventItem | null>(null);
  const [partnershipEvent, setPartnershipEvent] = useState<EventItem | null>(null);
  const [documentationEvent, setDocumentationEvent] = useState<EventItem | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (isAdmin || isTicketAdmin) {
      await supabase.functions.invoke('ticketing-admin', { body: { action: 'expire-orders' } });
    }
    const ticketOrdersRequest = isAdmin || isEventAdmin || isTicketAdmin
      ? loadAllTicketOrders()
      : Promise.resolve({ data: [] as TicketOrder[], error: null });
    const [m, r, e, k, a, p, pt, ep, to, ea, mh] = await Promise.all([
      supabase.from('open_mics').select('*').order('date', { ascending: false }),
      supabase.from('open_mic_registrations').select('*').order('created_at', { ascending: false }),
        supabase.from('events').select('*').order('date', { ascending: false }), // This line is unchanged
      supabase.from('komika').select('*'),
      supabase.from('community_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('event_participants').select('event_id, status'),
      supabase.from('partners').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
      supabase.from('event_partnerships').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ticketOrdersRequest,
      supabase.from('evaluator_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('member_open_mic_history_submissions').select('*').order('created_at', { ascending: false }),
    ]);
    const komikaRows = ((k.data as Komika[]) ?? []).sort((a, b) => {
      const aOrder = a.featured_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.featured_order ?? Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.stage_name.localeCompare(b.stage_name, 'id', { sensitivity: 'base' });
    });

    setOpenMics((m.data as OpenMic[]) ?? []);
    setRegistrations((r.data as OpenMicRegistration[]) ?? []);
    setEvents((e.data as EventItem[]) ?? []);
    setKomika(komikaRows);
    setPartners((pt.data as Partner[]) ?? []);
    setEventPartnerships((ep.data as EventPartnership[]) ?? []);
    setCommunityApplications((a.data as CommunityApplication[]) ?? []);
    if (to.error) setNotice('Data order tiket gagal dimuat lengkap.');
    setTicketOrders(to.data ?? []);
    setEvaluatorAssignments((ea.data as EvaluatorAssignment[]) ?? []);
    setMemberHistory((mh.data as MemberOpenMicHistorySubmission[]) ?? []);
    const pendingByEvent: Record<string, number> = {};
    (p.data as { event_id: string; status: ApplicationStatus }[] ?? []).forEach((participant) => {
      if (participant.status === 'pending') pendingByEvent[participant.event_id] = (pendingByEvent[participant.event_id] ?? 0) + 1;
    });
    setEventPendingCounts(pendingByEvent);
    setLoading(false);
  }, [isAdmin, isEventAdmin, isTicketAdmin]);

  useEffect(() => { void load(); }, [load, revision]);

  async function togglePublish(table: 'open_mics' | 'events' | 'partners', id: string, current: boolean) {
    const payload = table === 'partners'
      ? { is_published: !current, updated_at: new Date().toISOString() }
      : { published: !current, updated_at: new Date().toISOString() };

    try {
      const { error } = await supabase.from(table).update(payload).eq('id', id);
      if (error) throw error;
      setNotice(!current ? 'Konten dipublikasikan.' : 'Konten disembunyikan.');
      await load();
    } catch (publishError) {
      const detail = getErrorMessage(publishError);
      console.error('Status publish gagal diperbarui.', publishError);
      setNotice(`Gagal mengubah status publish: ${detail}`);
    }
  }

  function deleteRow(table: 'open_mics' | 'events' | 'komika' | 'partners', id: string) {
    setDeleteTarget({ table, id });
  }

  async function confirmDeleteRow() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const { error } = await supabase.from(target.table).delete().eq('id', target.id);
    if (error) { setNotice('Gagal menghapus data.'); return; }
    setNotice('Data berhasil dihapus.');
    await load();
  }

  function navigateSection(next: Section, query = '') {
    router.navigate(`${next === 'dashboard' ? '/admin' : `/admin/${next}`}${query}`);
  }

  function returnToPreviousAdminMenu() {
    const previousPath = window.history.state?.appPreviousPath;
    if (typeof previousPath === 'string' && previousPath.startsWith('/admin/') && previousPath !== router.path) {
      window.history.back();
      return;
    }
    navigateSection('dashboard');
  }

  const sectionHasOwnBackButton = ['registrants', 'event-participants', 'payment-info', 'ticket-gates', 'ticket-report', 'check-in-report'].includes(section)
    || (section === 'profile-settings' && isTicketAdmin);

  async function markAllNotificationsAsRead() {
    await Promise.all((Object.keys(notificationCounts) as NotificationSource[]).map((source) => markAllAsRead(source)));
  }

  async function updateTicketOrderStatus(id: string, status: TicketOrderStatus) {
    const { error } = await supabase.from('ticket_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      setNotice('Status pemesanan gagal diperbarui.');
      return;
    }
    setNotice('Status pemesanan berhasil diperbarui.');
    await resyncNotifications();
    await load();
  }

  function deleteTicketOrder(id: string) {
    setTicketDeleteTarget(id);
  }

  async function confirmDeleteTicketOrder() {
    if (!ticketDeleteTarget) return;
    const id = ticketDeleteTarget;
    setTicketDeleteTarget(null);
    const { error } = await supabase.from('ticket_orders').delete().eq('id', id);
    if (error) {
      setNotice('Data pemesanan gagal dihapus.');
      return;
    }
    setNotice('Data pemesanan berhasil dihapus.');
    await resyncNotifications();
    await load();
  }

  const pendingRegistrationCount = notificationCounts['open-mic'];
  const pendingHistoryCount = memberHistory.filter((item) => item.status === 'pending').length;
  const komikaAttendanceCounts = useMemo(() => registrations.reduce<Record<string, number>>((counts, registration) => {
    if (registration.komika_id && registration.attendance_status === 'attended') counts[registration.komika_id] = (counts[registration.komika_id] ?? 0) + 1;
    return counts;
  }, {}), [registrations]);
  const registrantOpenMicId = section === 'registrants' ? router.path.split('/').filter(Boolean)[2] ?? '' : '';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Desktop Header */}
      <header className="sticky top-0 z-40 hidden border-b border-blue-800 bg-blue-700 text-white lg:block">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 rounded-lg bg-white p-1 object-contain" />
            <span className="text-sm font-extrabold text-white">{isAdmin ? <>ADMIN <span className="text-amber-300">PANEL</span></> : workspaceTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell inverse notifications={notifications} unreadCount={unreadCount} onNavigate={navigateSection} onMarkAsRead={markAsRead} onMarkAllAsRead={markAllNotificationsAsRead} />
            <span className="text-sm text-blue-100">{user?.email}</span>
            <button type="button" onClick={async () => { await signOut(); router.navigate('/admin/login'); }} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-red-700" title="Keluar dari Admin Panel">
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 border-b border-blue-800 bg-blue-700 text-white lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-7 w-7 shrink-0 rounded-lg bg-white p-1 object-contain" />
            <span className="truncate text-sm font-extrabold tracking-tight text-white">{isAdmin ? 'ADMIN PANEL' : workspaceTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell inverse notifications={notifications} unreadCount={unreadCount} onNavigate={navigateSection} onMarkAsRead={markAsRead} onMarkAllAsRead={markAllNotificationsAsRead} />
          </div>
        </div>
      </header>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={deleteTarget?.table === 'open_mics' ? 'Hapus Open Mic?' : deleteTarget?.table === 'events' ? 'Hapus Event?' : 'Hapus Data?'} size="sm">
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
            Data {deleteTarget?.table === 'open_mics' ? 'Open Mic' : deleteTarget?.table === 'events' ? 'Event' : 'ini'} akan dihapus permanen dan tidak dapat dikembalikan.
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Batal</button>
            <button type="button" onClick={() => void confirmDeleteRow()} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-red-700">Ya, Hapus {deleteTarget?.table === 'open_mics' ? 'Open Mic' : deleteTarget?.table === 'events' ? 'Event' : 'Data'}</button>
          </div>
        </div>
      </Modal>
      <Modal open={Boolean(ticketDeleteTarget)} onClose={() => setTicketDeleteTarget(null)} title="Hapus Pesanan Tiket?" size="sm">
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">Data pesanan tiket ini akan dihapus permanen dan tidak dapat dikembalikan.</div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setTicketDeleteTarget(null)} className="btn-secondary flex-1">Batal</button>
            <button type="button" onClick={() => void confirmDeleteTicketOrder()} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-red-700">Ya, Hapus Pesanan</button>
          </div>
        </div>
      </Modal>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:border-r lg:border-slate-200 lg:bg-white lg:p-3 ${sidebarCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-60'}`}>
          <div className={`mb-3 flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
            <button type="button" onClick={() => setSidebarCollapsed((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700" title={sidebarCollapsed ? 'Buka sidebar' : 'Kecilkan sidebar'} aria-label={sidebarCollapsed ? 'Buka sidebar' : 'Kecilkan sidebar'}><ChevronRight className={`h-4 w-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} /></button>
          </div>
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const pendingEventCount = notificationCounts['event-participants'];
              const communityPendingCount = notificationCounts.applications;
              const showPendingBadge = ((item.key === 'open-mic-list') && pendingRegistrationCount > 0) || (item.key === 'open-mic-history' && pendingHistoryCount > 0) || (item.key === 'events' && pendingEventCount > 0) || (item.key === 'applications' && communityPendingCount > 0);
              return (
                <button key={item.key} onClick={() => navigateSection(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${sidebarCollapsed ? 'justify-center px-2' : ''} ${(item.key === 'more' ? isMoreNavigationActive(section, isTicketAdmin, isQrScanner) : section === item.key) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`} title={sidebarCollapsed ? item.label : undefined}>
                  <Icon className="h-5 w-5" />
                  {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {showPendingBadge && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold leading-none text-white" aria-label="Data menunggu review">{item.key === 'open-mic-list' ? pendingRegistrationCount : item.key === 'open-mic-history' ? pendingHistoryCount : item.key === 'events' ? pendingEventCount : communityPendingCount}</span>}
                </button>
              );
            })}
          </nav>
          <div className="mt-8 border-t border-slate-100 pt-4">
            <button onClick={() => router.navigate('/')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-700 ${sidebarCollapsed ? 'justify-center px-2' : ''}`} title={sidebarCollapsed ? 'Lihat Website' : undefined}>
              <ExternalLink className="h-5 w-5" /> {!sidebarCollapsed && 'Lihat Website'}
            </button>
            <button onClick={async () => { await signOut(); router.navigate('/admin/login'); }} className={`mt-2 flex w-full items-center gap-3 rounded-xl bg-red-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-red-700 ${sidebarCollapsed ? 'justify-center px-2' : ''}`} title="Keluar" aria-label="Keluar dari Admin Panel">
              <LogOut className="h-5 w-5" /> {!sidebarCollapsed && 'Keluar'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1 p-4 pb-safe-nav md:pb-0 lg:p-8 lg:pb-8" style={{ paddingBottom: 'calc(7.5rem + var(--safe-bottom))' }}>
          {section !== 'dashboard' && !sectionHasOwnBackButton && <button type="button" onClick={returnToPreviousAdminMenu} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 transition hover:text-blue-700">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>}
          {notice && (
            <div className={`mb-5 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${isErrorNotice ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-green-50 text-green-700 ring-green-200'}`}>
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="Tutup pesan" className={isErrorNotice ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}><X className="h-4 w-4" /></button>
            </div>
          )}

          {section === 'dashboard' && (isAdmin ? <Dashboard openMics={openMics} registrations={registrations} events={events} komika={komika} loading={loading} onNavigate={navigateSection} /> : isTicketAdmin ? <TicketAdminDashboard orders={ticketOrders} events={events} loading={loading} onNavigate={navigateSection} /> : isQrScanner ? <QrScannerDashboard events={events} onNavigate={navigateSection} /> : <OperationalDashboard kind={isOpenMicAdmin ? 'open-mic' : 'event'} openMics={openMics} registrations={registrations} events={events} eventPendingCounts={eventPendingCounts} ticketOrders={ticketOrders} loading={loading} onNavigate={navigateSection} />)}
          {section === 'open-mic' && <OpenMicManagement rows={openMics} registrations={registrations} loading={loading} showRegistrants={isAdmin} onAdd={() => { setEditing(null); setModal('open-mic'); }} onEdit={(row) => { setEditing(row); setModal('open-mic'); }} onDelete={(id) => deleteRow('open_mics', id)} onTogglePublish={(id, val) => togglePublish('open_mics', id, val)} onViewRegistrants={(m) => router.navigate(`/admin/pendaftar/${m.id}`)} />}
          {section === 'open-mic-list' && <PolishedOpenMicRosterView mode="registrants" openMics={openMics} registrations={registrations} komika={komika} loading={loading} onReload={load} />}
          {section === 'open-mic-performers' && <PolishedOpenMicRosterView mode="performers" openMics={openMics} registrations={registrations} komika={komika} loading={loading} onReload={load} />}
          {section === 'registrants' && <RegistrantsView openMicId={registrantOpenMicId} komika={komika} onBack={() => router.navigate(isAdmin ? '/admin/open-mic' : '/admin/open-mic-list')} />}
          {section === 'event-participants' && <EventParticipantsView eventId={router.path.split('/').filter(Boolean)[2] ?? ''} onBack={() => router.navigate('/admin/events')} />}
          {section === 'events' && (isAdmin || isEventAdmin
            ? <EventManagement rows={events} loading={loading} pendingCounts={eventPendingCounts} canManageTickets={isAdmin} initialStatus={router.query.get('status') === 'completed' ? 'completed' : 'upcoming'} onAdd={() => { setEditing(null); setModal('event'); }} onEdit={(row) => { setEditing(row); setModal('event'); }} onManagePhotos={setDocumentationEvent} onDelete={(id) => deleteRow('events', id)} onTogglePublish={(id, val) => togglePublish('events', id, val)} onManageTickets={(row) => setTicketEvent(row)} onManagePartnerships={(row) => setPartnershipEvent(row)} onViewParticipants={(row) => router.navigate(`/admin/event-pendaftar/${row.id}`)} />
            : <ScopedEventList events={events} loading={loading} onManageTickets={isTicketAdmin ? setTicketEvent : undefined} />)}
          {section === 'applications' && <ApplicationsView community={communityApplications} onNotice={setNotice} onReload={load} />}
          {section === 'open-mic-history' && <MemberOpenMicHistoryReview rows={memberHistory} komika={komika} onNotice={setNotice} onReload={load} />}
          {section === 'komika' && <KomikaManagement rows={komika} registrations={registrations} openMics={openMics} attendanceCounts={komikaAttendanceCounts} loading={loading} onReload={load} onAdd={() => { setEditing(null); setModal('komika'); }} onEdit={(row) => { setEditing(row); setModal('komika'); }} onDelete={(id) => deleteRow('komika', id)} />}
          {section === 'member-accounts' && <MemberAccountsPage komika={komika} onNotice={setNotice} />}
          {section === 'admin-accounts' && (isAdmin || isEventAdmin) && <AdminAccountsPage onNotice={setNotice} creatorRole={isAdmin ? 'admin' : 'event_admin'} />}
          {section === 'profile-settings' && !isAdmin && <AdminProfileSettingsPage onNotice={setNotice} onBack={isTicketAdmin ? () => navigateSection('more') : undefined} />}
          {section === 'partners' && <PartnerManagement rows={partners} events={events} partnerships={eventPartnerships} loading={loading} onAdd={() => { setEditing(null); setModal('partner'); }} onEdit={(row) => { setEditing(row); setModal('partner'); }} onDelete={(id) => deleteRow('partners', id)} onTogglePublish={(id, current) => togglePublish('partners', id, current)} />}
          {section === 'evaluator' && <EvaluatorAssignmentView openMics={openMics} komika={komika} assignments={evaluatorAssignments} currentUserId={user?.id ?? null} onReload={load} onNotice={setNotice} />}
          {section === 'ticket-orders' && isEventAdmin && <TicketAudiencePage events={events} />}
          {section === 'ticket-orders' && (isAdmin || isTicketAdmin
            ? <TicketAdminOrdersPage orders={ticketOrders} events={events} loading={loading} onReload={load} />
            : !isEventAdmin && <TicketOrdersPage orders={ticketOrders} events={events} loading={loading} onStatusChange={updateTicketOrderStatus} onDelete={deleteTicketOrder} />)}
          {section === 'tickets' && isTicketAdmin && <TicketAdminTicketsPage />}
          {section === 'scan' && isQrScanner && <TicketQrScannerPage events={events} />}
          {section === 'payment-info' && isTicketAdmin && <TicketPaymentMethodsPage events={events} onBack={() => navigateSection('more')} />}
          {section === 'ticket-gates' && (isAdmin || isTicketAdmin) && <TicketGateSettingsPage events={events} onBack={() => navigateSection('more')} />}
          {section === 'ticket-report' && isTicketAdmin && <TicketSalesReportPage events={events} orders={ticketOrders} onBack={() => navigateSection('more')} />}
          {section === 'check-in-report' && isQrScanner && <TicketCheckInReportPage onBack={() => navigateSection('more')} />}
          {section === 'maintenance' && (isAdmin || isEventAdmin) && <TicketMaintenancePage events={events} />}
          {section === 'settings' && <SettingsPanel settings={settings} onSaved={load} onNotice={setNotice} />}
          {section === 'more' && <MorePage onNavigate={navigateSection} onSignOut={async () => { await signOut(); router.navigate('/admin/login'); }} ticketOrderUnreadCount={notificationCounts['ticket-orders']} isAdmin={isAdmin} isOpenMicAdmin={isOpenMicAdmin} isEventAdmin={isEventAdmin} isTicketAdmin={isTicketAdmin} isQrScanner={isQrScanner} />}
        </main>
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-2 pb-[calc(5rem+var(--safe-bottom))] lg:py-3 lg:pb-3">
        <AppCredit />
      </footer>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavPortal
        className="fixed inset-x-0 z-40 border-t border-blue-100 bg-white/90 shadow-[0_-8px_24px_rgba(11,60,93,0.08)] backdrop-blur-xl lg:hidden"
        ariaLabel="Navigasi admin mobile"
      >
        <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${visibleBottomNav.length}, minmax(0, 1fr))` }}>
          {visibleBottomNav.map((item) => {
            const Icon = item.icon;
            const pendingEventCount = notificationCounts['event-participants'];
            const communityPendingCount = notificationCounts.applications;
            const showPendingBadge = ((item.key === 'open-mic-list') && pendingRegistrationCount > 0) || (item.key === 'open-mic-history' && pendingHistoryCount > 0) || (item.key === 'events' && pendingEventCount > 0) || (item.key === 'applications' && communityPendingCount > 0);
            const isActive = item.key === 'dashboard'
              ? section === 'dashboard'
              : item.key === 'open-mic'
                ? section === 'open-mic' || section === 'registrants'
                : item.key === 'events'
                  ? section === 'events' || section === 'event-participants'
                  : item.key === 'komika'
                    ? section === 'komika'
                    : item.key === 'partners'
                      ? section === 'partners'
                      : item.key === 'more'
                        ? isMoreNavigationActive(section, isTicketAdmin, isQrScanner)
                        : section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigateSection(item.key)}
                className={`mobile-nav-item flex flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ${isActive ? 'mobile-nav-item-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={`mobile-nav-icon relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${isActive ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'text-slate-400'}`}>
                  <Icon className="h-5 w-5" />
                  {showPendingBadge && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white" aria-label="Data menunggu review">{item.key === 'open-mic-list' ? pendingRegistrationCount : item.key === 'open-mic-history' ? pendingHistoryCount : item.key === 'events' ? pendingEventCount : communityPendingCount}</span>}
                  {item.key === 'dashboard' && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white" aria-label={`Notifikasi admin, ${unreadCount} belum dibaca`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                  {item.key === 'more' && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white" aria-label={`Notifikasi admin, ${unreadCount} belum dibaca`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </span>
                <span className={`mobile-nav-label text-[10px] font-semibold ${isActive ? 'mobile-nav-label-active text-blue-700' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </MobileBottomNavPortal>

      {/* Ticket Management Modal */}
      <TicketManagementModal event={ticketEvent} onClose={() => setTicketEvent(null)} onNotice={setNotice} />
      <EventPartnershipManagementModal event={partnershipEvent} partners={partners} partnerships={eventPartnerships} onClose={() => setPartnershipEvent(null)} onNotice={setNotice} onReload={load} />

      {/* Form Modal */}
      <EventDocumentationPhotosModal event={documentationEvent} onClose={() => setDocumentationEvent(null)} onNotice={setNotice} onSaved={async () => { setDocumentationEvent(null); await load(); }} />
      <AdminFormModal kind={modal} editing={editing} venueHistory={openMics} saving={saving} onClose={() => setModal(null)} onSaving={setSaving} onNotice={setNotice} onSaved={async () => { setModal(null); await load(); setNotice('Perubahan berhasil disimpan.'); }} />

    </div>
  );
}

function MemberOpenMicHistoryReview({ rows, komika, onNotice, onReload }: { rows: MemberOpenMicHistorySubmission[]; komika: Komika[]; onNotice: (message: string) => void; onReload: () => Promise<void> }) {
  const [category, setCategory] = useState<'performance' | 'mc'>('performance');
  const [folder, setFolder] = useState<MemberOpenMicHistoryStatus>('pending');
  const [query, setQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedKomikaId, setSelectedKomikaId] = useState('');
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [selected, setSelected] = useState<MemberOpenMicHistorySubmission | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const komikaById = useMemo(() => new Map(komika.map((item) => [item.id, item])), [komika]);
  const categoryRows = useMemo(() => rows.filter((row) => category === 'mc'
    ? row.activity_type === 'mc_internal' || row.activity_type === 'mc_external'
    : !row.activity_type || row.activity_type === 'performance'), [category, rows]);
  const categoryCounts = {
    performance: rows.filter((row) => !row.activity_type || row.activity_type === 'performance').length,
    mc: rows.filter((row) => row.activity_type === 'mc_internal' || row.activity_type === 'mc_external').length,
  };
  const komikaSubmissionCounts = useMemo(() => categoryRows.reduce<Record<string, number>>((result, row) => {
    result[row.komika_id] = (result[row.komika_id] ?? 0) + 1;
    return result;
  }, {}), [categoryRows]);
  const memberOptions = useMemo(() => komika
    .filter((member) => komikaSubmissionCounts[member.id])
    .filter((member) => `${member.stage_name} ${member.full_name}`.toLowerCase().includes(memberQuery.trim().toLowerCase()))
    .sort((first, second) => first.stage_name.localeCompare(second.stage_name, 'id')), [komika, komikaSubmissionCounts, memberQuery]);
  const folders: { key: MemberOpenMicHistoryStatus; label: string }[] = [{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Disetujui' }, { key: 'rejected', label: 'Ditolak' }];
  const counts = folders.reduce<Record<string, number>>((result, item) => ({ ...result, [item.key]: categoryRows.filter((row) => row.status === item.key).length }), {});
  const filtered = categoryRows.filter((row) => {
    if (row.status !== folder) return false;
    if (selectedKomikaId && row.komika_id !== selectedKomikaId) return false;
    const member = komikaById.get(row.komika_id);
    const haystack = `${member?.stage_name ?? ''} ${member?.full_name ?? ''} ${row.title} ${row.organizer_name}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  function openDetail(row: MemberOpenMicHistorySubmission) {
    setSelected(row);
    setNote(row.admin_note ?? '');
  }

  async function updateStatus(status: MemberOpenMicHistoryStatus) {
    if (!selected || selected.status !== 'pending') return;
    setSaving(true);
    const { error } = await supabase.from('member_open_mic_history_submissions').update({
      status,
      admin_note: note.trim() || null,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);
    setSaving(false);
    if (error) { onNotice('Status riwayat gagal diperbarui.'); return; }
    setSelected(null);
    onNotice(status === 'approved' ? 'Riwayat disetujui.' : 'Riwayat ditolak.');
    await onReload();
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader title="Pengajuan Riwayat Member" subtitle="Pilih kategori pengajuan agar proses verifikasi lebih terorganisasi." />
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="Kategori pengajuan riwayat">
        <button type="button" role="tab" aria-selected={category === 'performance'} onClick={() => { setCategory('performance'); setSelectedKomikaId(''); setMemberQuery(''); }} className={`rounded-xl px-3 py-3 text-left transition ${category === 'performance' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><span className="block text-sm font-extrabold">Pengajuan Open Mic</span><span className={`mt-0.5 block text-xs ${category === 'performance' ? 'text-blue-100' : 'text-slate-500'}`}>{categoryCounts.performance} pengajuan</span></button>
        <button type="button" role="tab" aria-selected={category === 'mc'} onClick={() => { setCategory('mc'); setSelectedKomikaId(''); setMemberQuery(''); }} className={`rounded-xl px-3 py-3 text-left transition ${category === 'mc' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><span className="block text-sm font-extrabold">Pengajuan MC</span><span className={`mt-0.5 block text-xs ${category === 'mc' ? 'text-violet-100' : 'text-slate-500'}`}>{categoryCounts.mc} pengajuan</span></button>
      </div>
      <div className="grid grid-cols-3 gap-2">{folders.map((item) => <button key={item.key} onClick={() => setFolder(item.key)} className={`rounded-2xl border p-3 text-left transition ${folder === item.key ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100'}`}><span className="block text-xs font-semibold uppercase tracking-wide opacity-70">{item.label}</span><span className="mt-1 block text-2xl font-extrabold">{counts[item.key]}</span></button>)}</div>
      <div className="relative">
        <button type="button" onClick={() => setMemberPickerOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left shadow-sm transition ${memberPickerOpen ? 'border-blue-400 ring-4 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">{selectedKomikaId ? (komikaById.get(selectedKomikaId)?.stage_name?.charAt(0).toUpperCase() ?? 'K') : 'K'}</span>
          <span className="min-w-0 flex-1">{selectedKomikaId ? <><span className="block truncate text-sm font-bold text-slate-900">{komikaById.get(selectedKomikaId)?.stage_name}</span><span className="block text-xs text-slate-500">{komikaSubmissionCounts[selectedKomikaId]} pengajuan</span></> : <span className="text-sm font-semibold text-slate-500">Filter berdasarkan komika</span>}</span>
          {selectedKomikaId && <span onClick={(event) => { event.stopPropagation(); setSelectedKomikaId(''); setMemberQuery(''); }} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">Reset</span>}
          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${memberPickerOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>
        {memberPickerOpen && <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Cari nama komika..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <button type="button" onClick={() => { setSelectedKomikaId(''); setMemberPickerOpen(false); setMemberQuery(''); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-blue-50 ${!selectedKomikaId ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}><span className="font-semibold">Semua komika</span>{!selectedKomikaId && <Check className="h-4 w-4" />}</button>
            {memberOptions.map((member) => <button type="button" key={member.id} onClick={() => { setSelectedKomikaId(member.id); setMemberPickerOpen(false); setMemberQuery(''); }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50 ${selectedKomikaId === member.id ? 'bg-blue-50' : ''}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">{member.stage_name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{member.stage_name}</span><span className="block truncate text-xs text-slate-500">{member.full_name} · {komikaSubmissionCounts[member.id]} pengajuan {category === 'mc' ? 'MC' : 'Open Mic'}</span></span>{selectedKomikaId === member.id && <Check className="h-4 w-4 text-blue-600" />}</button>)}
            {memberOptions.length === 0 && <p className="px-3 py-5 text-center text-sm text-slate-500">Komika tidak ditemukan.</p>}
          </div>
        </div>}
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={category === 'mc' ? 'Cari member atau acara MC...' : 'Cari member, judul, atau penyelenggara...'} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
      <div className="space-y-3">
        {filtered.map((row) => {
          const member = komikaById.get(row.komika_id);
          const activityLabel = row.activity_type === 'mc_internal' ? 'MC Internal' : row.activity_type === 'mc_external' ? 'MC Eksternal' : 'Tampil Open Mic';
          return <button key={row.id} onClick={() => openDetail(row)} className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:ring-blue-200"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-slate-900">{row.title}</p><p className="mt-1 truncate text-sm text-slate-500">{member?.stage_name ?? 'Member'} · {row.organizer_name}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${row.activity_type === 'mc_internal' || row.activity_type === 'mc_external' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{activityLabel}</span></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{formatDate(row.event_date)}</span></div><p className="mt-3 line-clamp-2 text-sm text-slate-600">{row.venue}{row.city ? `, ${row.city}` : ''}{row.event_time ? ` · ${row.event_time}` : ''}</p></button>;
        })}
        {filtered.length === 0 && <AdminEmptyState title={`Belum ada pengajuan ${category === 'mc' ? 'MC' : 'Open Mic'} ${folders.find((item) => item.key === folder)?.label.toLowerCase()}.`} />}
      </div>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.activity_type === 'mc_internal' || selected?.activity_type === 'mc_external' ? 'Detail Riwayat MC' : 'Detail Riwayat Open Mic'} size="lg">
        {selected && <div className="space-y-4 text-sm">
          <div className={`rounded-2xl bg-gradient-to-br p-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] ${selected.status === 'rejected' ? 'from-red-700 via-red-600 to-rose-500' : 'from-blue-700 via-blue-600 to-sky-500'}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">{selected.activity_type === 'mc_internal' ? 'Review MC Internal' : selected.activity_type === 'mc_external' ? 'Review MC Eksternal' : 'Review jam terbang member'}</p>
            <div className="mt-1 flex items-start justify-between gap-3"><div><h4 className="text-lg font-black">{komikaById.get(selected.komika_id)?.stage_name ?? selected.komika_id}</h4><p className="mt-0.5 text-xs text-blue-100">{selected.title} · {selected.organizer_name}</p></div><span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase">{selected.status}</span></div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[['Tanggal', formatDate(selected.event_date)], ...(selected.event_time ? [['Waktu', selected.event_time]] : []), ['Venue', selected.venue], ['Kota/Lokasi', selected.city || '-'], ['Dikirim', selected.created_at ? new Date(selected.created_at).toLocaleString('id-ID') : '-']].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-xs font-semibold leading-5 text-slate-700">{value}</p></div>)}
          </div>
          {selected.proof_url && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><div className="flex items-center justify-between px-3 py-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{selected.activity_type === 'mc_external' ? 'Bukti Dokumentasi' : 'Bukti Penampilan'}</p><a href={selected.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Buka penuh <ExternalLink className="h-3.5 w-3.5" /></a></div><a href={selected.proof_url} target="_blank" rel="noreferrer" className="block max-h-64 bg-slate-100"><img src={selected.proof_url} alt={`Bukti ${selected.title}`} className="mx-auto max-h-64 w-full object-contain" /></a></div>}
          {selected.notes && <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Catatan Member</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{selected.notes}</p></div>}
          <div><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Catatan Admin <span className="font-normal normal-case text-slate-400">(opsional)</span></label><textarea value={note} onChange={(event) => setNote(event.target.value)} readOnly={selected.status !== 'pending'} rows={2} placeholder="Tambahkan catatan untuk member..." className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none read-only:bg-slate-50 read-only:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
          {selected.status === 'pending' && <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3"><button disabled={saving} onClick={() => void updateStatus('rejected')} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Tolak</button><button disabled={saving} onClick={() => void updateStatus('approved')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">Setujui</button></div>}
        </div>}
      </Modal>
    </div>
  );
}

function ApplicationsView({ community, onNotice, onReload }: { community: CommunityApplication[]; onNotice: (message: string) => void; onReload: () => Promise<void> }) {
  const [folder, setFolder] = useState<ApplicationStatus>('pending');
  const [viewApplication, setViewApplication] = useState<CommunityApplication | null>(null);

  async function updateStatus(id: string, status: ApplicationStatus) {
    const { error } = await supabase.from('community_applications').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { onNotice('Gagal mengubah status pendaftar.'); return; }
    setViewApplication((current) => current?.id === id ? { ...current, status } : current);
    onNotice('Status pendaftar diperbarui.');
    await onReload();
    setViewApplication((current) => current?.id === id ? { ...current, status } : current);
  }

  async function deleteApplication(application: CommunityApplication) {
    if (!window.confirm(`Hapus pendaftar ${application.full_name}? Data ini tidak dapat dikembalikan.`)) return;
    const { error } = await supabase.from('community_applications').delete().eq('id', application.id);
    if (error) { onNotice('Pendaftar gagal dihapus.'); return; }
    setViewApplication(null);
    setViewApplication(null);
    onNotice('Pendaftar berhasil dihapus.');
    await onReload();
  }

  const rows = community.filter((application) => application.status === folder);
  const counts = { pending: community.filter((application) => application.status === 'pending').length, approved: community.filter((application) => application.status === 'approved').length, rejected: community.filter((application) => application.status === 'rejected').length };
  const folders: { key: ApplicationStatus; label: string }[] = [{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Disetujui' }, { key: 'rejected', label: 'Ditolak' }];

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-extrabold text-slate-900">Gabung Komunitas</h1><p className="mt-1 text-sm text-slate-500">Kelola calon anggota komunitas.</p></div>
      <div className="grid grid-cols-3 gap-2">{folders.map((item) => <button key={item.key} onClick={() => setFolder(item.key)} className={`rounded-2xl border p-3 text-left transition ${folder === item.key ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100'}`}><span className="block text-xs font-semibold uppercase tracking-wide opacity-70">{item.label}</span><span className="mt-1 block text-2xl font-extrabold">{counts[item.key]}</span></button>)}</div>
      <div className="space-y-3">
        {rows.map((row) => <div key={row.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-slate-900">{row.full_name}</p><p className="mt-1 truncate text-sm text-slate-500">{row.city} · {row.whatsapp}</p><div className="mt-2 flex flex-wrap gap-1.5">{row.interests.map((interest) => <span key={interest} className="chip">{interest}</span>)}</div></div><StatusBadge status={row.status} /></div><div className="mt-4 flex gap-2"><button onClick={() => setViewApplication(row)} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-xs font-semibold text-slate-700">Detail</button><a href={buildCommunityWhatsAppLink(row)} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-50 py-2.5 text-xs font-semibold text-green-700"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a></div></div>)}
        {rows.length === 0 && <AdminEmptyState title={`Belum ada pendaftar ${folders.find((item) => item.key === folder)?.label.toLowerCase()}.`} />}
      </div>
      <Modal open={Boolean(viewApplication)} onClose={() => setViewApplication(null)} title="Detail Pendaftar Komunitas" size="md">{viewApplication && <div className="space-y-4"><div className="flex items-start justify-between rounded-2xl border border-slate-200 bg-slate-100 p-4"><div><p className="font-bold text-slate-900">{viewApplication.full_name}</p><p className="mt-1 text-sm font-medium text-slate-600">{viewApplication.city}</p></div><StatusBadge status={viewApplication.status} /></div><div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm"><span className="font-medium text-slate-600">WhatsApp</span><a href={buildCommunityContactWhatsAppLink(viewApplication)} target="_blank" rel="noopener noreferrer" className="text-right font-bold text-green-700 hover:text-green-800">{viewApplication.whatsapp}</a>{viewApplication.instagram && <><span className="font-medium text-slate-600">Instagram</span><a href={buildInstagramLink(viewApplication.instagram)} target="_blank" rel="noopener noreferrer" className="text-right font-medium text-blue-700 hover:text-blue-800">{viewApplication.instagram}</a></>}{viewApplication.notes && <><span className="font-medium text-slate-600">Catatan</span><span className="text-right font-medium text-slate-800">{viewApplication.notes}</span></>}<span className="font-medium text-slate-600">Minat</span><span className="text-right font-medium text-slate-800">{viewApplication.interests.join(', ')}</span></div><div className="space-y-2 border-t border-slate-200 pt-3"><a href={buildCommunityWhatsAppLink(viewApplication)} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-green-700"><MessageCircle className="h-4 w-4" /> Konfirmasi via WhatsApp</a><div className="flex gap-2">{viewApplication.status !== 'rejected' && <button onClick={() => void updateStatus(viewApplication.id, 'rejected')} className="flex-1 rounded-xl bg-red-100 py-3 text-sm font-bold text-red-700 hover:bg-red-200">Tolak</button>}{viewApplication.status !== 'approved' && <button onClick={() => void updateStatus(viewApplication.id, 'approved')} className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700">Setujui</button>}{viewApplication.status !== 'pending' && <button onClick={() => void updateStatus(viewApplication.id, 'pending')} className="flex-1 rounded-xl bg-slate-200 py-3 text-sm font-bold text-slate-800 hover:bg-slate-300">Pending</button>}</div><button onClick={() => void deleteApplication(viewApplication)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-100 py-3 text-sm font-bold text-red-700 hover:bg-red-200"><Trash2 className="h-4 w-4" /> Hapus Pendaftar</button></div></div>}</Modal>
    </div>
  );
}

function Dashboard({ openMics, registrations, events, komika, loading, onNavigate }: { openMics: OpenMic[]; registrations: OpenMicRegistration[]; events: EventItem[]; komika: Komika[]; loading: boolean; onNavigate: (s: Section) => void }) {
  const pending = registrations.filter((r) => r.status === 'pending');
  const confirmed = registrations.filter((r) => r.status === 'confirmed');
  const today = new Date().toISOString().slice(0,10);
  const upcomingMicCount = openMics.filter((m) => m.status === 'upcoming' && m.date >= today).length;
  const upcomingEventCount = events.filter((e) => e.status === 'upcoming' && e.date >= today).length;
  const micTitleMap = useMemo(() => Object.fromEntries(openMics.map((m) => [m.id, m.title])), [openMics]);
  const openMicNumbers = useMemo(() => getOpenMicNumbers(openMics.filter((m) => m.published)), [openMics]);
  const recentMics = openMics.slice(0, 3);
  const recentRegs = registrations.slice(0, 3);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-[28px]">Dashboard</h1>
        <p className="mt-1 text-[13px] text-slate-500 lg:text-sm">Ringkasan aktivitas komunitas kamu.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard label="Open Mic" value={upcomingMicCount} icon={Mic} tone="bg-blue-50 text-blue-600" onClick={() => onNavigate('open-mic')} />
        <StatCard label="Registrasi Pending" value={pending.length} icon={Clock3} tone="bg-amber-50 text-amber-600" onClick={() => onNavigate('open-mic')} />
        <StatCard label="Registrasi Dikonfirmasi" value={confirmed.length} icon={Check} tone="bg-green-50 text-green-600" onClick={() => onNavigate('open-mic')} />
        <StatCard label="Event Mendatang" value={upcomingEventCount} icon={CalendarDays} tone="bg-indigo-50 text-indigo-600" onClick={() => onNavigate('events')} />
      </div>

      <div className="space-y-2.5">
        <h2 className="text-[17px] font-bold text-slate-900 lg:text-lg">Menu Cepat</h2>
        <button onClick={() => onNavigate('open-mic')} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Mic className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">Kelola Open Mic</p><p className="text-xs text-slate-500">Tambah, edit, dan lihat pendaftar</p></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        <button onClick={() => onNavigate('events')} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarDays className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">Kelola Event</p><p className="text-xs text-slate-500">Tambah dan kelola event</p></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-slate-900 lg:text-lg">Open Mic Terbaru</h2>
            <button onClick={() => onNavigate('open-mic')} className="text-xs font-semibold text-blue-700 hover:text-blue-900 lg:text-sm">Lihat Semua</button>
          </div>
          <div className="space-y-2">
            {recentMics.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900"><span className="mr-1.5 text-blue-700">#{openMicNumbers.get(m.id)}</span>{m.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{formatDate(m.date)} · {m.venue}</p></div>
                  <StatusBadge status={m.published ? 'published' : 'draft'} />
                </div>
              </div>
            ))}
            {recentMics.length === 0 && <div className="rounded-xl border border-slate-200/60 bg-white p-6 text-center text-sm text-slate-400">Belum ada Open Mic.</div>}
          </div>
        </div>

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-slate-900 lg:text-lg">Registrasi Terbaru</h2>
            <button onClick={() => onNavigate('open-mic')} className="text-xs font-semibold text-blue-700 hover:text-blue-900 lg:text-sm">Lihat Semua</button>
          </div>
          <div className="space-y-2">
            {recentRegs.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{r.stage_name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{micTitleMap[r.open_mic_id] ?? 'Open Mic'}</p></div>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
            {recentRegs.length === 0 && <div className="rounded-xl border border-slate-200/60 bg-white p-6 text-center text-sm text-slate-400">Belum ada registrasi terbaru.</div>}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 lg:text-sm">Total komika aktif: <strong className="text-slate-700">{komika.filter((k) => k.status === 'active').length}</strong></p>
    </div>
  );
}

function OperationalDashboard({ kind, openMics, registrations, events, eventPendingCounts, ticketOrders, loading, onNavigate }: { kind: 'open-mic' | 'event'; openMics: OpenMic[]; registrations: OpenMicRegistration[]; events: EventItem[]; eventPendingCounts: Record<string, number>; ticketOrders: TicketOrder[]; loading: boolean; onNavigate: (s: Section, query?: string) => void }) {
  const isOpenMic = kind === 'open-mic';
  const today = new Date().toISOString().slice(0, 10);
  const upcomingOpenMics = openMics.filter((item) => item.status === 'upcoming' && item.date >= today).length;
  const upcomingEvents = events.filter((item) => item.status === 'upcoming' && item.date >= today).length;
  const completedEvents = events.filter((item) => getEventStatus(item.status, item.date) === 'completed').length;
  const soldTicketCount = ticketOrders
    .filter((order) => order.status === 'Lunas' && order.order_type !== 'free_pass')
    .reduce((total, order) => total + order.quantity, 0);
  const pendingRegistrations = registrations.filter((item) => item.status === 'pending').length;
  const pendingParticipants = Object.values(eventPendingCounts).reduce((total, count) => total + count, 0);
  const tone = isOpenMic ? 'amber' : 'indigo';

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <WorkspacePageHeader eyebrow={isOpenMic ? 'Open Mic Workspace' : 'Event Workspace'} title={isOpenMic ? 'Siapkan panggung berikutnya.' : 'Jaga setiap event tetap siap.'} subtitle={isOpenMic ? 'Kelola jadwal, pendaftar, dan kehadiran komika dari satu ruang kerja.' : 'Kelola event, tiket, dan peserta dengan alur kerja yang ringkas.'} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {isOpenMic ? <>
          <StatCard label="Total Open Mic" value={openMics.length} icon={Mic} tone="bg-blue-50 text-blue-700" onClick={() => onNavigate('open-mic')} />
          <StatCard label="Open Mic mendatang" value={upcomingOpenMics} icon={Mic} tone="bg-amber-50 text-amber-700" onClick={() => onNavigate('open-mic')} />
          <StatCard label="Menunggu konfirmasi" value={pendingRegistrations} icon={Clock3} tone="bg-orange-50 text-orange-700" onClick={() => onNavigate('open-mic')} />
          <StatCard label="Sudah terkonfirmasi" value={registrations.filter((item) => item.status === 'confirmed').length} icon={Check} tone="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('open-mic')} />
        </> : <>
          <StatCard label="Total Event" value={events.length} icon={CalendarDays} tone="bg-blue-50 text-blue-700" onClick={() => onNavigate('events')} />
          <StatCard label="Event mendatang" value={upcomingEvents} icon={CalendarDays} tone="bg-indigo-50 text-indigo-700" onClick={() => onNavigate('events')} />
          <StatCard label="Event selesai" value={completedEvents} icon={CalendarDays} tone="bg-slate-100 text-slate-700" onClick={() => onNavigate('events', '?status=completed')} />
          <StatCard label="Peserta menunggu" value={pendingParticipants} icon={Users} tone="bg-amber-50 text-amber-700" onClick={() => onNavigate('events')} />
          <StatCard label="Total Tiket Terjual" value={soldTicketCount} icon={TicketIcon} tone="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('ticket-orders')} />
        </>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => onNavigate(isOpenMic ? 'open-mic' : 'events')} className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone === 'amber' ? 'border-amber-100 hover:border-amber-300' : 'border-indigo-100 hover:border-indigo-300'}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{isOpenMic ? <Mic className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">{isOpenMic ? 'Kelola Open Mic' : 'Kelola Event'}</span><span className="mt-0.5 block text-xs text-slate-500">Buka ruang kerja utama</span></span><ChevronRight className="h-4 w-4 text-slate-400" />
        </button>
        <button onClick={() => onNavigate(isOpenMic ? 'open-mic-list' : 'ticket-orders')} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{isOpenMic ? <Users className="h-5 w-5" /> : <TicketIcon className="h-5 w-5" />}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">{isOpenMic ? 'Tinjau Pendaftar' : 'Kelola Penonton'}</span><span className="mt-0.5 block text-xs text-slate-500">{isOpenMic ? 'Pilih Open Mic untuk melihat detail' : 'Lihat data penonton Event'}</span></span><ChevronRight className="h-4 w-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}

function WorkspacePageHeader({ title, subtitle, eyebrow = 'Open Mic Workspace', action }: { title: string; subtitle: string; eyebrow?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 rounded-[22px] border border-blue-500 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)] sm:p-5"><div className="min-w-0"><p className="!text-blue-100 text-[10px] font-extrabold uppercase tracking-[0.16em] sm:text-[11px]">{eyebrow}</p><h1 className="!text-white mt-1.5 text-xl font-black tracking-tight sm:text-2xl">{title}</h1><p className="!text-blue-50 mt-1 text-xs font-medium leading-5 sm:text-sm">{subtitle}</p></div>{action}</div>;
}

function OpenMicRosterView({ mode, openMics, registrations, loading, onReload }: { mode: 'registrants' | 'performers'; openMics: OpenMic[]; registrations: OpenMicRegistration[]; loading: boolean; onReload: () => Promise<void> }) {
  const [selectedOpenMicId, setSelectedOpenMicId] = useState('all');
  const [search, setSearch] = useState('');
  const [createTarget, setCreateTarget] = useState<OpenMic | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ row: OpenMicRegistration; type: 'confirm' | 'reject' | 'attend' | 'delete'; payload?: { status?: 'confirmed' | 'rejected'; attendance_status?: AttendanceStatus } } | null>(null);
  const [form, setForm] = useState({ full_name: '', stage_name: '', community: '', whatsapp: '', notes: '' });
  const isPerformerView = mode === 'performers';
  const eligibleRows = registrations.filter((row) => isPerformerView
    ? row.status === 'confirmed' && row.attendance_status === 'attended'
    : row.attendance_status !== 'attended');
  const filteredRows = eligibleRows.filter((row) => {
    const matchesOpenMic = selectedOpenMicId === 'all' || row.open_mic_id === selectedOpenMicId;
    const query = search.trim().toLowerCase();
    return matchesOpenMic && (!query || `${row.full_name} ${row.stage_name} ${row.registration_id}`.toLowerCase().includes(query));
  });
  const groupedRows = openMics.map((openMic) => ({
    openMic,
    rows: filteredRows.filter((row) => row.open_mic_id === openMic.id),
  })).filter((group) => group.rows.length > 0 || !isPerformerView);

  async function executeRegistrationUpdate(id: string, payload: { status?: 'confirmed' | 'rejected'; attendance_status?: AttendanceStatus }) {
    const { error } = await supabase.from('open_mic_registrations').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { window.alert('Perubahan pendaftar gagal disimpan.'); return; }
    await onReload();
  }

  function updateRegistration(rowOrId: OpenMicRegistration | string, payload: { status?: 'confirmed' | 'rejected'; attendance_status?: AttendanceStatus }) {
    const row = typeof rowOrId === 'string' ? registrations.find((item) => item.id === rowOrId) : rowOrId;
    if (!row) return;
    const type = payload.attendance_status === 'attended' ? 'attend' : payload.status === 'confirmed' ? 'confirm' : 'reject';
    setPendingAction({ row, type, payload });
  }

  async function executeDeleteRegistration(row: OpenMicRegistration) {
    const { error } = await supabase.from('open_mic_registrations').delete().eq('id', row.id);
    if (error) { window.alert('Pendaftar gagal dihapus.'); return; }
    await onReload();
  }

  function deleteRegistration(row: OpenMicRegistration) {
    setPendingAction({ row, type: 'delete' });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.type === 'delete') await executeDeleteRegistration(action.row);
    else if (action.payload) await executeRegistrationUpdate(action.row.id, action.payload);
  }


  async function createRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (!createTarget || !form.full_name.trim() || !form.stage_name.trim()) return;
    if (!window.confirm(`Yakin ingin menambahkan ${form.full_name.trim()} ke ${createTarget.title}?`)) return;
    setSaving(true);
    const { data: sequence } = await supabase.rpc('next_open_mic_reg_seq');
    const openMicNumber = createTarget.title.match(/#?(\d+)/)?.[1] ?? '00';
    const registrationId = `OM${openMicNumber}-${String((sequence as number) ?? 1).padStart(4, '0')}`;
    const { error } = await supabase.from('open_mic_registrations').insert({ registration_id: registrationId, open_mic_id: createTarget.id, full_name: form.full_name.trim(), stage_name: form.stage_name.trim(), community: form.community.trim() || null, whatsapp: form.whatsapp.trim() || null, notes: form.notes.trim() || null, status: 'pending', attendance_status: 'unmarked' });
    setSaving(false);
    if (error) { window.alert('Pendaftar gagal ditambahkan.'); return; }
    setForm({ full_name: '', stage_name: '', community: '', whatsapp: '', notes: '' });
    setCreateTarget(null);
    await onReload();
  }

  return (
    <div className="space-y-5">
      <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Open Mic Workspace</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{isPerformerView ? 'Performer Open Mic' : 'Pendaftar Open Mic'}</h1><p className="mt-1 text-sm text-slate-500">{isPerformerView ? 'Shortcut peserta yang sudah hadir dan tampil.' : 'Pantau seluruh proses pendaftar, dari menunggu sampai hadir, per Open Mic.'}</p></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><select value={selectedOpenMicId} onChange={(event) => setSelectedOpenMicId(event.target.value)} className="input-field"><option value="all">Semua Open Mic</option>{openMics.map((openMic) => <option key={openMic.id} value={openMic.id}>{openMic.title} · {formatDate(openMic.date)} · {openMic.venue}</option>)}</select><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Cari nama performer..." /></div></div>
      {loading ? <div className="space-y-3">{[1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div> : groupedRows.length === 0 ? <AdminEmptyState title={isPerformerView ? 'Belum ada performer yang hadir.' : 'Belum ada data pendaftar.'} /> : <div className="space-y-4">{groupedRows.map(({ openMic, rows }) => { const allRows = registrations.filter((row) => row.open_mic_id === openMic.id); const pendingCount = rows.filter((row) => row.status === 'pending').length; const confirmedCount = rows.filter((row) => row.status === 'confirmed' && row.attendance_status !== 'attended').length; const attendedCount = allRows.filter((row) => row.attendance_status === 'attended').length; const rejectedCount = rows.filter((row) => row.status === 'rejected').length; return <section key={openMic.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-extrabold text-slate-900">{openMic.title}</h2><p className="mt-0.5 truncate text-xs text-slate-500">{formatDate(openMic.date)} · {openMic.venue}</p></div>{!isPerformerView && <button type="button" onClick={() => setCreateTarget(openMic)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white"><UserPlus className="h-3.5 w-3.5" /> Tambah</button>}</div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{rows.length} aktif</span>{pendingCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{pendingCount} menunggu</span>}{confirmedCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{confirmedCount} terkonfirmasi</span>}{attendedCount > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{attendedCount} performer</span>}{rejectedCount > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{rejectedCount} ditolak</span>}</div></div><div className="divide-y divide-slate-100">{rows.map((row) => { const isAttended = row.attendance_status === 'attended'; const statusLabel = isAttended ? 'Hadir' : row.status === 'pending' ? 'Menunggu' : row.status === 'rejected' ? 'Ditolak' : 'Terkonfirmasi'; const statusClass = isAttended ? 'bg-emerald-50 text-emerald-700' : row.status === 'pending' ? 'bg-amber-50 text-amber-700' : row.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'; return <div key={row.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isAttended ? 'bg-emerald-50 text-emerald-700' : row.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}><UserCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{row.stage_name || row.full_name}</p><p className="truncate text-xs text-slate-500">{row.full_name} · {row.registration_id}</p></div><span className={`self-start rounded-full px-2 py-1 text-[10px] font-bold sm:self-auto ${statusClass}`}>{statusLabel}</span>{!isPerformerView && <div className="flex gap-1.5 sm:ml-1"><button type="button" onClick={() => void updateRegistration(row.id, { status: row.status === 'confirmed' ? 'rejected' : 'confirmed' })} className={`rounded-lg px-2.5 py-2 text-[11px] font-bold ${row.status === 'confirmed' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{row.status === 'confirmed' ? 'Tolak' : 'Konfirmasi'}</button>{row.status === 'confirmed' && <button type="button" onClick={() => void updateRegistration(row.id, { attendance_status: 'attended' })} className="rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700">Hadir</button>}<button type="button" onClick={() => void deleteRegistration(row)} className="rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-bold text-red-700">Hapus</button></div>}</div>; })}</div></section>; })}</div>}
      {!isPerformerView && createTarget && <Modal open={Boolean(createTarget)} onClose={() => setCreateTarget(null)} title={`Tambah Pendaftar · ${createTarget.title}`} size="md"><form onSubmit={createRegistration} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><label className="label-field" htmlFor="roster-full-name">Nama lengkap</label><input id="roster-full-name" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="roster-stage-name">Nama panggung</label><input id="roster-stage-name" required value={form.stage_name} onChange={(event) => setForm({ ...form, stage_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="roster-community">Komunitas</label><input id="roster-community" value={form.community} onChange={(event) => setForm({ ...form, community: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="roster-whatsapp">WhatsApp</label><input id="roster-whatsapp" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} className="input-field" /></div></div><div><label className="label-field" htmlFor="roster-notes">Catatan</label><textarea id="roster-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="input-field min-h-24" /></div><div className="flex gap-3"><button type="button" onClick={() => setCreateTarget(null)} className="btn-secondary flex-1">Batal</button><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Menyimpan...' : 'Tambah Pendaftar'}</button></div></form></Modal>}
      {pendingAction && <Modal open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title="Konfirmasi Aksi" size="sm"><div className="space-y-4"><div className={`rounded-2xl border p-4 ${pendingAction.type === 'reject' ? 'border-red-200 bg-red-50' : pendingAction.type === 'attend' ? 'border-emerald-200 bg-emerald-50' : pendingAction.type === 'confirm' ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}><p className={`text-sm font-extrabold ${pendingAction.type === 'reject' || pendingAction.type === 'delete' ? 'text-red-800' : pendingAction.type === 'attend' ? 'text-emerald-800' : 'text-blue-800'}`}>{pendingAction.type === 'confirm' ? 'Konfirmasi Pendaftar' : pendingAction.type === 'reject' ? 'Pendaftar Tidak Hadir' : pendingAction.type === 'attend' ? 'Tandai Hadir' : 'Hapus Pendaftar'}</p><p className={`mt-1 text-xs leading-5 ${pendingAction.type === 'reject' || pendingAction.type === 'delete' ? 'text-red-700' : pendingAction.type === 'attend' ? 'text-emerald-700' : 'text-blue-700'}`}>Periksa kembali data sebelum melanjutkan aksi.</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid gap-3 text-sm"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Nama Lengkap</p><p className="mt-1 font-bold text-slate-900">{pendingAction.row.full_name || '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Nama Panggung</p><p className="mt-1 font-semibold text-slate-800">{pendingAction.row.stage_name || '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Komunitas</p><p className={`mt-1 ${pendingAction.row.community ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{pendingAction.row.community || 'Belum diisi'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Catatan</p><p className={`mt-1 whitespace-pre-line leading-6 ${pendingAction.row.notes ? 'text-slate-800' : 'text-slate-400'}`}>{pendingAction.row.notes || 'Tidak ada catatan.'}</p></div></div><div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-xs"><span className="text-slate-500">Registration ID</span><strong className="text-right font-mono text-slate-800">{pendingAction.row.registration_id}</strong><span className="text-slate-500">Status</span><strong className="text-right text-slate-800">{pendingAction.row.status === 'pending' ? 'Menunggu' : pendingAction.row.status === 'confirmed' ? 'Terkonfirmasi' : 'Ditolak'}</strong><span className="text-slate-500">Kehadiran</span><strong className="text-right text-slate-800">{pendingAction.row.attendance_status === 'attended' ? 'Hadir' : 'Belum hadir'}</strong></div></div>{pendingAction.row.whatsapp && <a href={waLink(pendingAction.row.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-extrabold text-green-700 ring-1 ring-green-200"><MessageCircle className="h-4 w-4" /> Hubungi via WhatsApp</a>}<p className="text-sm leading-5 text-slate-600">Yakin ingin {pendingAction.type === 'confirm' ? 'mengonfirmasi' : pendingAction.type === 'reject' ? 'menolak' : pendingAction.type === 'attend' ? 'menandai sebagai Hadir' : 'menghapus'} pendaftar ini?</p><div className="flex gap-3"><button type="button" onClick={() => setPendingAction(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => void confirmPendingAction()} className={`flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white ${pendingAction.type === 'reject' || pendingAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : pendingAction.type === 'attend' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>Ya, Lanjutkan</button></div></div></Modal>}
    </div>
  );
}

function RosterStatusCards({ active, incomingCount, confirmedCount, onChange }: { active: 'incoming' | 'confirmed'; incomingCount: number; confirmedCount: number; onChange: (value: 'incoming' | 'confirmed') => void }) {
  return <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onChange('incoming')} className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2 text-left transition sm:min-h-0 sm:py-2.5 ${active === 'incoming' ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${active === 'incoming' ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{incomingCount}</span><span className="min-w-0"><span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.04em]">Menunggu</span><span className="block truncate text-[10px] font-medium opacity-75">Perlu ditinjau</span></span></button><button type="button" onClick={() => onChange('confirmed')} className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2 text-left transition sm:min-h-0 sm:py-2.5 ${active === 'confirmed' ? 'border-blue-300 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${active === 'confirmed' ? 'bg-blue-200 text-blue-900' : 'bg-slate-100 text-slate-500'}`}>{confirmedCount}</span><span className="min-w-0"><span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.04em]">Dikonfirmasi</span><span className="block truncate text-[10px] font-medium opacity-75">Siap diproses</span></span></button></div>;
}

function OpenMicFilterDropdown({ openMics, value, onChange, allLabel }: { openMics: OpenMic[]; value: string; onChange: (value: string) => void; allLabel: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedLabel = openMics.find((openMic) => openMic.id === value)?.title ?? allLabel;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOpenMics = openMics.filter((openMic) => {
    if (!normalizedQuery) return true;
    const searchableDate = `${formatDate(openMic.date)} ${openMic.date} ${openMic.date.split('-').reverse().join('/')}`;
    return `${openMic.title} ${openMic.venue} ${searchableDate}`.toLowerCase().includes(normalizedQuery);
  });

  return <div className="relative">
    <button type="button" onClick={() => setOpen((current) => !current)} className={`input-field flex w-full items-center justify-between gap-2 text-left ${open ? 'border-blue-500 ring-2 ring-blue-100' : ''}`} aria-expanded={open} aria-haspopup="listbox">
      <span className="min-w-0 truncate text-sm font-medium text-slate-800">{selectedLabel}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180 text-blue-700' : ''}`} />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.16)]" role="listbox">
      <div className="relative mb-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="input-field h-10 pl-9 text-sm" placeholder="Cari Open Mic..." aria-label="Cari Open Mic" /></div>
      <button type="button" onClick={() => { onChange('all'); setQuery(''); setOpen(false); }} className={`flex w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${value === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>{allLabel}</button>
      {visibleOpenMics.map((openMic) => <button type="button" key={openMic.id} onClick={() => { onChange(openMic.id); setQuery(''); setOpen(false); }} className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${value === openMic.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} role="option" aria-selected={value === openMic.id}><span className="truncate text-sm font-semibold">{openMic.title}</span><span className="truncate text-[11px] text-slate-500">{formatDate(openMic.date)} · {openMic.venue}</span></button>)}
      {!visibleOpenMics.length && <p className="px-3 py-2.5 text-sm text-slate-500">Open Mic tidak ditemukan.</p>}
    </div>}
  </div>;
}

function getPerformerAppearanceNumber(row: OpenMicRegistration, completedOpenMic: OpenMic, registrations: OpenMicRegistration[], openMics: OpenMic[]): number {
  const relevantRows = registrations.filter((registration) => {
    if (registration.status !== 'confirmed' || registration.attendance_status !== 'attended') return false;
    if (row.komika_id) return registration.komika_id === row.komika_id;
    return !registration.komika_id
      && registration.stage_name.trim().toLowerCase() === row.stage_name.trim().toLowerCase()
      && (registration.instagram ?? '').trim().toLowerCase() === (row.instagram ?? '').trim().toLowerCase();
  });
  const uniqueOpenMicRows = [...new Map(relevantRows.map((registration) => [registration.open_mic_id, registration])).values()]
    .sort((first, second) => {
      const firstMic = openMics.find((mic) => mic.id === first.open_mic_id);
      const secondMic = openMics.find((mic) => mic.id === second.open_mic_id);
      return (firstMic?.date ?? '').localeCompare(secondMic?.date ?? '')
        || (firstMic?.time ?? '').localeCompare(secondMic?.time ?? '')
        || first.created_at.localeCompare(second.created_at)
        || first.open_mic_id.localeCompare(second.open_mic_id);
    });
  const appearanceIndex = uniqueOpenMicRows.findIndex((registration) => registration.open_mic_id === completedOpenMic.id);
  return appearanceIndex >= 0 ? appearanceIndex + 1 : uniqueOpenMicRows.length;
}

function buildPerformerThankYouMessage(row: OpenMicRegistration, completedOpenMic: OpenMic, nextOpenMic: OpenMic | null, appearanceNumber: number): string {
  const lines = [
    `Halo Kak *${row.stage_name || row.full_name}* 👋`,
    '',
    `Terima kasih sudah tampil di *${completedOpenMic.title}* pada *${formatDate(completedOpenMic.date)} pukul ${completedOpenMic.time} WIB* di *${completedOpenMic.venue}*. Ini adalah Open Mic Kak *${row.stage_name || row.full_name}* ke-*${appearanceNumber}* di Standupindo Cilegon. Senang bisa berbagi panggung dan tawa bersama Kakak! 🎤`,
    '',
  ];
  if (nextOpenMic) {
    lines.push(
      'Jangan lupa ikut Open Mic selanjutnya:',
      `*${nextOpenMic.title}* pada *${formatDate(nextOpenMic.date)} pukul ${nextOpenMic.time} WIB* di *${nextOpenMic.venue}*.`,
      'Yuk daftar dan sampai ketemu di panggung berikutnya! 🙌',
      `${window.location.origin}/open-mic/${nextOpenMic.slug}`,
    );
  } else {
    lines.push('Jangan lupa ikuti info Open Mic terbaru dan sampai ketemu di panggung berikutnya! 🙌');
  }
  lines.push('', 'Terima kasih,', 'Standupindo Cilegon');
  return lines.join('\n');
}

function PolishedOpenMicRosterView({ mode, openMics, registrations, komika, loading, onReload }: { mode: 'registrants' | 'performers'; openMics: OpenMic[]; registrations: OpenMicRegistration[]; komika: Komika[]; loading: boolean; onReload: () => Promise<void> }) {
  const [selectedOpenMicId, setSelectedOpenMicId] = useState('all');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'upcoming' | 'completed'>('upcoming');
  const [statusFolder, setStatusFolder] = useState<'incoming' | 'confirmed'>('incoming');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createTarget, setCreateTarget] = useState<OpenMic | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' });
  const [createMode, setCreateMode] = useState<'general' | 'member'>('general');
  const [komikaSearch, setKomikaSearch] = useState('');
  const [komikaSearchFocused, setKomikaSearchFocused] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<{ row: OpenMicRegistration; type: 'confirm' | 'reject' | 'attend' | 'delete' } | null>(null);
  const isPerformerView = mode === 'performers';
  const today = new Date().toISOString().slice(0, 10);
  const openMicNumbers = useMemo(() => getOpenMicNumbers(openMics.filter((m) => m.published)), [openMics]);
  const filterOpenMics = openMics.filter((openMic) => isPerformerView ? (folder === 'upcoming' ? openMic.date >= today : openMic.date < today) : openMic.date >= today);
  const nextOpenMic = openMics
    .filter((openMic) => openMic.published && openMic.status === 'upcoming' && openMic.date >= today)
    .sort((first, second) => first.date.localeCompare(second.date))[0] ?? null;
  useEffect(() => { setCollapsed(new Set()); }, [openMics]);
  const groups = openMics.map((openMic) => {
    const allRows = registrations.filter((row) => row.open_mic_id === openMic.id);
    const visibleRows = allRows.filter((row) => (isPerformerView ? row.status === 'confirmed' && row.attendance_status === 'attended' : row.attendance_status !== 'attended' && (statusFolder === 'incoming' ? row.status !== 'confirmed' : row.status === 'confirmed')))
      .filter((row) => selectedOpenMicId === 'all' || row.open_mic_id === selectedOpenMicId)
      .filter((row) => { const query = search.trim().toLowerCase(); return !query || `${row.full_name} ${row.stage_name} ${row.whatsapp ?? ''} ${row.community ?? ''} ${row.registration_id}`.toLowerCase().includes(query); });
    return { openMic, allRows, rows: visibleRows };
  }).filter((group) => (isPerformerView ? (folder === 'upcoming' ? group.openMic.date >= today : group.openMic.date < today) : group.openMic.date >= today) && (isPerformerView ? group.rows.length > 0 : selectedOpenMicId === 'all' ? group.rows.length > 0 || group.allRows.length === 0 : group.openMic.id === selectedOpenMicId));
  const pendingOpenMic = pendingAction ? openMics.find((openMic) => openMic.id === pendingAction.row.open_mic_id) : null;

  async function performAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    const actionOpenMic = openMics.find((openMic) => openMic.id === action.row.open_mic_id);
    if (action.type !== 'delete' && actionOpenMic && actionOpenMic.date < today) {
      window.alert('Open Mic sudah selesai. Hanya penghapusan data yang masih tersedia.');
      return;
    }
    if (action.type === 'delete') await supabase.from('open_mic_registrations').delete().eq('id', action.row.id);
    else await supabase.from('open_mic_registrations').update({ ...(action.type === 'attend' ? { attendance_status: 'attended' } : { status: action.type === 'confirm' ? 'confirmed' : 'rejected' }), updated_at: new Date().toISOString() }).eq('id', action.row.id);
    await onReload();
  }

  async function createManual(event: React.FormEvent) {
    event.preventDefault();
    if (!createTarget || !createForm.full_name.trim() || !createForm.stage_name.trim()) return;
    if (!window.confirm(`Yakin ingin menambahkan ${createForm.full_name.trim()}?`)) return;
    setSaving(true);
    const { data: sequence } = await supabase.rpc('next_open_mic_reg_seq');
    const number = createTarget.title.match(/#?(\d+)/)?.[1] ?? '00';
    const { error } = await supabase.from('open_mic_registrations').insert({ registration_id: `OM${number}-${String((sequence as number) ?? 1).padStart(4, '0')}`, open_mic_id: createTarget.id, komika_id: createForm.komika_id || null, full_name: createForm.full_name.trim(), stage_name: createForm.stage_name.trim(), community: createForm.community.trim() || null, instagram: createForm.instagram.trim() || null, whatsapp: createForm.whatsapp.trim() || null, notes: createForm.notes.trim() || null, status: createMode === 'member' ? 'confirmed' : 'pending', attendance_status: 'unmarked' });
    if (error) { setSaving(false); setNotice(error.message.includes('duplicate') ? 'Anggota tersebut sudah terdaftar di Open Mic ini.' : 'Pendaftar gagal ditambahkan.'); return; }
    setSaving(false);
    setCreateForm({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' });
    setCreateMode('general');
    setKomikaSearch('');
    setKomikaSearchFocused(false);
    setCreateTarget(null);
    await onReload();
  }

  return (
    <div className={`space-y-4 ${isPerformerView ? 'open-mic-roster-performers' : 'open-mic-roster-pendaftar'}`}>
      {!isPerformerView && <><RosterStatusCards active={statusFolder} incomingCount={registrations.filter((row) => row.status !== 'confirmed' && row.attendance_status !== 'attended').length} confirmedCount={registrations.filter((row) => row.status === 'confirmed' && row.attendance_status !== 'attended').length} onChange={setStatusFolder} /><p className="-mt-1 text-xs font-semibold text-slate-500">Menampilkan pendaftar yang {statusFolder === 'incoming' ? 'menunggu konfirmasi admin.' : 'sudah dikonfirmasi admin.'}</p></>}
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px]">Open Mic Workspace</p><h1 className="mt-1 text-xl font-extrabold text-slate-950 sm:text-2xl">{isPerformerView ? 'Performer Open Mic' : 'Pendaftar Open Mic'}</h1><p className="mt-1 text-xs text-slate-500 sm:text-sm">{isPerformerView ? 'Peserta yang sudah hadir dan tampil.' : 'Kelola pendaftar langsung per Open Mic.'}</p></div><button type="button" onClick={() => void onReload()} disabled={loading} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60" title="Refresh data pendaftar" aria-label="Refresh data pendaftar"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></button></div>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Langkah 2</p><h2 className="text-sm font-extrabold text-slate-900">{isPerformerView ? 'Pilih periode performer' : 'Pilih Open Mic mendatang'}</h2></div>{isPerformerView && <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setFolder('upcoming')} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${folder === 'upcoming' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Saat Ini</button><button type="button" onClick={() => setFolder('completed')} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${folder === 'completed' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Selesai</button></div>}<div><label className="mb-1.5 block text-xs font-bold text-slate-600" htmlFor="open-mic-filter">Open Mic</label><OpenMicFilterDropdown openMics={filterOpenMics} value={selectedOpenMicId} onChange={setSelectedOpenMicId} allLabel={isPerformerView ? 'Semua Open Mic' : 'Semua Open Mic Mendatang'} /></div><div><label className="mb-1.5 block text-xs font-bold text-slate-600" htmlFor="registrant-search">{isPerformerView ? 'Cari performer' : 'Cari pendaftar'}</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="registrant-search" value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder={isPerformerView ? 'Cari performer...' : 'Cari pendaftar...'} /></div></div></section>
      {loading ? <div className="space-y-2">{[1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : groups.length === 0 ? <AdminEmptyState title={isPerformerView ? 'Belum ada performer.' : 'Belum ada pendaftar.'} /> : <div className="space-y-3">{groups.map(({ openMic, allRows, rows }) => { const isCollapsed = collapsed.has(openMic.id); const canAdd = !isPerformerView && openMic.date >= today; const pendingCount = allRows.filter((row) => row.status === 'pending').length; const confirmedCount = allRows.filter((row) => row.status === 'confirmed' && row.attendance_status !== 'attended').length; const attendedCount = allRows.filter((row) => row.attendance_status === 'attended').length; return <section key={openMic.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 bg-slate-50/80 p-3.5 sm:p-4"><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(openMic.id)) next.delete(openMic.id); else next.add(openMic.id); return next; })} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-blue-700 ring-1 ring-slate-200">{openMic.poster ? <img src={openMic.poster} alt="" className="h-full w-full object-cover" /> : <Mic className="h-5 w-5" />}</span><span className="min-w-0"><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Open Mic #{openMicNumbers.get(openMic.id)}</span><span className="block truncate text-base font-extrabold text-slate-900">{openMic.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{formatDate(openMic.date)} · {openMic.venue}</span><span className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{rows.length} aktif</span>{pendingCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{pendingCount} menunggu</span>}{confirmedCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{confirmedCount} terkonfirmasi</span>}{attendedCount > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{attendedCount} performer</span>}</span></span><ChevronRight className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} /></button>{canAdd && <button type="button" onClick={() => setCreateTarget(openMic)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white" title="Tambah pendaftar" aria-label="Tambah pendaftar"><Plus className="h-4 w-4" /></button>}</div>{!isCollapsed && <div className="divide-y divide-slate-100">{rows.length === 0 ? <div className="p-5 text-center text-sm text-slate-500">Belum ada pendaftar aktif.</div> : rows.map((row) => { const isConfirmed = row.status === 'confirmed'; const appearanceNumber = isPerformerView && folder === 'completed' ? getPerformerAppearanceNumber(row, openMic, registrations, openMics) : null; return <div key={row.id} className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.attendance_status === 'attended' ? 'bg-emerald-50 text-emerald-700' : row.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}><UserCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{row.stage_name || row.full_name}</p>{isPerformerView && folder === 'completed' && row.community && <span className="mt-0.5 inline-flex max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold leading-4 text-slate-600 ring-1 ring-slate-200">{row.community}</span>}<p className="truncate text-xs text-slate-500">{row.full_name} · {row.registration_id}</p></div>{isPerformerView && folder === 'completed' && <span className="flex h-10 min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 px-2 text-emerald-800" title={`Penampilan ke-${appearanceNumber} di Standupindo Cilegon`}><span className="text-sm font-extrabold leading-none">{appearanceNumber}</span><span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide">Kali</span></span>}{isPerformerView && folder === 'completed' && row.whatsapp && <a href={waLink(row.whatsapp, buildPerformerThankYouMessage(row, openMic, nextOpenMic, appearanceNumber ?? getPerformerAppearanceNumber(row, openMic, registrations, openMics)))} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm transition hover:bg-[#20bd5a] active:scale-95" aria-label={`Kirim ucapan terima kasih kepada ${row.stage_name || row.full_name} via WhatsApp`} title="Kirim ucapan terima kasih via WhatsApp"><MessageCircle className="h-5 w-5" /></a>}{!isPerformerView && <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => setPendingAction({ row, type: isConfirmed ? 'reject' : 'confirm' })} className={`flex h-9 w-9 items-center justify-center rounded-lg ${isConfirmed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} title={isConfirmed ? 'Tolak pendaftar' : 'Konfirmasi pendaftar'} aria-label={isConfirmed ? 'Tolak pendaftar' : 'Konfirmasi pendaftar'}>{isConfirmed ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}</button>{isConfirmed && <button type="button" onClick={() => setPendingAction({ row, type: 'attend' })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700" title="Tandai hadir" aria-label="Tandai hadir"><UserCheck className="h-4 w-4" /></button>}<button type="button" onClick={() => setPendingAction({ row, type: 'delete' })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-700" title="Hapus pendaftar" aria-label="Hapus pendaftar"><Trash2 className="h-4 w-4" /></button></div>}</div>; })}</div>}</section>; })}</div>}
      {createTarget && <Modal open={Boolean(createTarget)} onClose={() => setCreateTarget(null)} title={`Tambah Pendaftar · ${createTarget.title}`} size="md"><form onSubmit={createManual} className="space-y-4"><p className="text-sm text-slate-500">Pilih anggota Komika bila pendaftar memiliki profil resmi. Pilih umum untuk pendaftar tanpa profil member.</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setCreateMode('general'); setCreateForm({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' }); setKomikaSearch(''); }} className={`rounded-xl border px-3 py-3 text-sm font-bold ${createMode === 'general' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 text-slate-600'}`}>Pendaftar Umum</button><button type="button" onClick={() => setCreateMode('member')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${createMode === 'member' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 text-slate-600'}`}>Anggota Komika</button></div>{createMode === 'member' && <div className="relative"><label className="label-field" htmlFor="p-komika-search">Cari Anggota Komika</label><Search className="absolute left-3 top-[2.65rem] h-4 w-4 text-slate-400" /><input id="p-komika-search" value={komikaSearch} onFocus={() => setKomikaSearchFocused(true)} onBlur={() => setTimeout(() => setKomikaSearchFocused(false), 150)} onChange={(event) => { setKomikaSearch(event.target.value); setCreateForm({ ...createForm, komika_id: '' }); }} className="input-field pl-10" placeholder="Ketik nama atau stage name" autoComplete="off" />{komikaSearchFocused && <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{komika.filter((item) => `${item.full_name} ${item.stage_name}`.toLowerCase().includes(komikaSearch.trim().toLowerCase())).map((item) => <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setCreateForm({ komika_id: item.id, full_name: item.full_name, stage_name: item.stage_name, community: 'Standupindo Cilegon', instagram: formatInstagramHandle(item.instagram_url ?? ''), whatsapp: item.whatsapp ?? '', notes: '' }); setKomikaSearch(''); setKomikaSearchFocused(false); }} className="flex min-h-12 w-full flex-col items-start justify-center rounded-lg px-3 py-2 text-left hover:bg-blue-50"><span className="text-sm font-bold text-slate-900">{item.full_name}</span><span className="text-xs text-slate-500">{item.stage_name}</span></button>)}</div>}{createForm.komika_id && <p className="mt-1 text-xs font-semibold text-green-700">Terpilih: {createForm.full_name} — {createForm.stage_name}</p>}</div>}<div className="grid gap-4 sm:grid-cols-2"><div><label className="label-field" htmlFor="p-full-name">Nama lengkap</label><input id="p-full-name" required value={createForm.full_name} onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="p-stage-name">Nama panggung</label><input id="p-stage-name" required value={createForm.stage_name} onChange={(event) => setCreateForm({ ...createForm, stage_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="p-community">Komunitas</label><input id="p-community" value={createForm.community} onChange={(event) => setCreateForm({ ...createForm, community: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="p-whatsapp">WhatsApp</label><input id="p-whatsapp" value={createForm.whatsapp} onChange={(event) => setCreateForm({ ...createForm, whatsapp: event.target.value })} className="input-field" /></div></div><div><label className="label-field" htmlFor="p-notes">Catatan</label><textarea id="p-notes" value={createForm.notes} onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })} className="input-field min-h-24" /></div><div className="flex gap-2"><button type="button" onClick={() => setCreateTarget(null)} className="btn-secondary flex-1">Batal</button><button type="submit" disabled={saving || (createMode === 'member' && !createForm.komika_id)} className="btn-primary flex-1">{saving ? 'Menyimpan...' : 'Simpan Pendaftar'}</button></div></form></Modal>}
      {notice && <Modal open={Boolean(notice)} onClose={() => setNotice('')} title="Pendaftar" size="sm"><div className="space-y-4"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">{notice}</div><button type="button" onClick={() => setNotice('')} className="btn-primary w-full">Mengerti</button></div></Modal>}
      {pendingAction && <Modal open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={pendingAction.type === 'delete' ? 'Hapus Pendaftar?' : 'Konfirmasi Aksi'} size="sm"><div className="space-y-4"><div className={`rounded-2xl border p-4 ${pendingAction.type === 'delete' ? 'border-red-200 bg-red-50' : pendingAction.type === 'reject' ? 'border-red-200 bg-red-50' : pendingAction.type === 'attend' ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}><p className={`font-extrabold ${pendingAction.type === 'delete' || pendingAction.type === 'reject' ? 'text-red-800' : pendingAction.type === 'attend' ? 'text-emerald-800' : 'text-blue-800'}`}>{pendingAction.type === 'delete' ? 'Hapus Pendaftar' : pendingAction.type === 'reject' ? 'Pendaftar Tidak Hadir' : pendingAction.type === 'attend' ? 'Tandai Hadir' : 'Konfirmasi Pendaftar'}</p><p className={`mt-1 text-xs ${pendingAction.type === 'delete' || pendingAction.type === 'reject' ? 'text-red-700' : pendingAction.type === 'attend' ? 'text-emerald-700' : 'text-blue-700'}`}>Periksa kembali data sebelum melanjutkan aksi.</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid gap-3 text-sm"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Nama Lengkap</p><p className="mt-1 font-bold text-slate-900">{pendingAction.row.full_name || '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Nama Panggung</p><p className="mt-1 font-semibold text-slate-800">{pendingAction.row.stage_name || '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Komunitas</p><p className={`mt-1 ${pendingAction.row.community ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{pendingAction.row.community || 'Belum diisi'}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Catatan</p><p className={`mt-1 whitespace-pre-line leading-6 ${pendingAction.row.notes ? 'text-slate-800' : 'text-slate-400'}`}>{pendingAction.row.notes || 'Tidak ada catatan.'}</p></div></div><div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-xs"><span className="text-slate-500">Registration ID</span><strong className="text-right font-mono text-slate-800">{pendingAction.row.registration_id}</strong><span className="text-slate-500">Status</span><strong className="text-right text-slate-800">{pendingAction.row.status === 'pending' ? 'Menunggu' : pendingAction.row.status === 'confirmed' ? 'Terkonfirmasi' : 'Ditolak'}</strong><span className="text-slate-500">Kehadiran</span><strong className="text-right text-slate-800">{pendingAction.row.attendance_status === 'attended' ? 'Hadir' : 'Belum hadir'}</strong></div></div>{pendingAction.type !== 'delete' && pendingAction.row.whatsapp && <a href={buildWhatsAppLink(pendingAction.row.whatsapp, pendingAction.row.full_name, pendingOpenMic?.title ?? '', pendingOpenMic?.venue ?? '')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 ring-1 ring-green-200"><MessageCircle className="h-4 w-4" /> Hubungi via WhatsApp</a>}<p className={`text-sm ${pendingAction.type === 'delete' || pendingAction.type === 'reject' ? 'font-semibold text-red-700' : pendingAction.type === 'attend' ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}>{pendingAction.type === 'delete' ? 'Data pendaftar akan dihapus dan tidak dapat dikembalikan.' : `Yakin ingin ${pendingAction.type === 'confirm' ? 'mengonfirmasi' : pendingAction.type === 'reject' ? 'menolak' : 'menandai hadir'} pendaftar ini?`}</p><div className="flex gap-2"><button type="button" onClick={() => setPendingAction(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => void performAction()} className={`flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white ${pendingAction.type === 'delete' || pendingAction.type === 'reject' ? 'bg-red-600 hover:bg-red-700' : pendingAction.type === 'attend' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{pendingAction.type === 'delete' ? 'Ya, Hapus Pendaftar' : 'Ya, lanjutkan'}</button></div></div></Modal>}
    </div>
  );
}

function CompactOpenMicRosterView({ mode, openMics, registrations, loading, onReload }: { mode: 'registrants' | 'performers'; openMics: OpenMic[]; registrations: OpenMicRegistration[]; loading: boolean; onReload: () => Promise<void> }) {
  const [selectedOpenMicId, setSelectedOpenMicId] = useState('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<{ row: OpenMicRegistration; type: 'confirm' | 'reject' | 'attend' | 'delete' } | null>(null);
  const [createTarget, setCreateTarget] = useState<OpenMic | null>(null);
  const [createForm, setCreateForm] = useState({ full_name: '', stage_name: '', whatsapp: '' });
  const isPerformerView = mode === 'performers';
  const today = new Date().toISOString().slice(0, 10);
  const rows = registrations.filter((row) => isPerformerView ? row.status === 'confirmed' && row.attendance_status === 'attended' : row.attendance_status !== 'attended').filter((row) => {
    const query = search.trim().toLowerCase();
    return (selectedOpenMicId === 'all' || row.open_mic_id === selectedOpenMicId) && (!query || `${row.full_name} ${row.stage_name} ${row.registration_id}`.toLowerCase().includes(query));
  });
  const groups = openMics.map((openMic) => ({ openMic, rows: rows.filter((row) => row.open_mic_id === openMic.id), allRows: registrations.filter((row) => row.open_mic_id === openMic.id) })).filter((group) => isPerformerView ? group.rows.length > 0 : selectedOpenMicId === 'all' || group.rows.length > 0 || group.allRows.length === 0);

  async function performAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.type === 'delete') await supabase.from('open_mic_registrations').delete().eq('id', action.row.id);
    else await supabase.from('open_mic_registrations').update({ ...(action.type === 'attend' ? { attendance_status: 'attended' } : { status: action.type === 'confirm' ? 'confirmed' : 'rejected' }), updated_at: new Date().toISOString() }).eq('id', action.row.id);
    await onReload();
  }

  async function createManualRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (!createTarget || !createForm.full_name.trim() || !createForm.stage_name.trim()) return;
    if (!window.confirm(`Yakin ingin menambahkan ${createForm.full_name.trim()} sebagai pendaftar?`)) return;
    const { data: sequence } = await supabase.rpc('next_open_mic_reg_seq');
    const number = createTarget.title.match(/#?(\d+)/)?.[1] ?? '00';
    const { error } = await supabase.from('open_mic_registrations').insert({ registration_id: `OM${number}-${String((sequence as number) ?? 1).padStart(4, '0')}`, open_mic_id: createTarget.id, full_name: createForm.full_name.trim(), stage_name: createForm.stage_name.trim(), whatsapp: createForm.whatsapp.trim() || null, status: 'pending', attendance_status: 'unmarked' });
    if (error) { window.alert('Pendaftar gagal ditambahkan.'); return; }
    setCreateForm({ full_name: '', stage_name: '', whatsapp: '' });
    setCreateTarget(null);
    await onReload();
  }

  return (
    <div className="space-y-4">
      <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Open Mic Workspace</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{isPerformerView ? 'Performer Open Mic' : 'Pendaftar Open Mic'}</h1><p className="mt-1 text-sm text-slate-500">{isPerformerView ? 'Daftar peserta yang sudah hadir.' : 'Kelola pendaftar langsung per Open Mic.'}</p></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select value={selectedOpenMicId} onChange={(event) => setSelectedOpenMicId(event.target.value)} className="input-field"><option value="all">Semua Open Mic</option>{openMics.map((openMic) => <option key={openMic.id} value={openMic.id}>{openMic.title} · {formatDate(openMic.date)} · {openMic.venue}</option>)}</select><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Cari pendaftar..." /></div>{!isPerformerView && selectedOpenMicId !== 'all' && <button type="button" onClick={() => setCreateTarget(openMics.find((openMic) => openMic.id === selectedOpenMicId) ?? null)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm" title="Tambah pendaftar" aria-label="Tambah pendaftar"><Plus className="h-5 w-5" /></button>}</div>
      {loading ? <div className="space-y-2">{[1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : groups.length === 0 ? <AdminEmptyState title={isPerformerView ? 'Belum ada performer.' : 'Belum ada pendaftar.'} /> : <div className="space-y-3">{groups.map(({ openMic, rows: groupRows, allRows }) => { const isCollapsed = collapsed.has(openMic.id); const pendingCount = allRows.filter((row) => row.status === 'pending').length; const confirmedCount = allRows.filter((row) => row.status === 'confirmed' && row.attendance_status !== 'attended').length; const attendedCount = allRows.filter((row) => row.attendance_status === 'attended').length; return <section key={openMic.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(openMic.id)) next.delete(openMic.id); else next.add(openMic.id); return next; })} className="flex w-full items-center justify-between gap-3 bg-slate-50/80 p-4 text-left"><div className="min-w-0"><h2 className="truncate text-base font-extrabold text-slate-900">{openMic.title}</h2><p className="mt-0.5 truncate text-xs text-slate-500">{formatDate(openMic.date)} · {openMic.venue}</p><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{groupRows.length} aktif</span>{pendingCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{pendingCount} menunggu</span>}{confirmedCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{confirmedCount} terkonfirmasi</span>}{attendedCount > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{attendedCount} performer</span>}</div></div><ChevronRight className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} /></button>{!isCollapsed && <div className="divide-y divide-slate-100">{groupRows.length === 0 ? <div className="p-5 text-center text-sm text-slate-500">Belum ada pendaftar. Gunakan tombol tambah pada menu Pendaftar sebelumnya.</div> : groupRows.map((row) => { const isPending = row.status === 'pending'; const isConfirmed = row.status === 'confirmed'; return <div key={row.id} className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.attendance_status === 'attended' ? 'bg-emerald-50 text-emerald-700' : isPending ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}><UserCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{row.stage_name || row.full_name}</p><p className="truncate text-xs text-slate-500">{row.full_name} · {row.registration_id}</p></div><span className={`hidden shrink-0 rounded-full px-2 py-1 text-[10px] font-bold sm:inline-flex ${row.attendance_status === 'attended' ? 'bg-emerald-50 text-emerald-700' : isPending ? 'bg-amber-50 text-amber-700' : row.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{row.attendance_status === 'attended' ? 'Hadir' : isPending ? 'Menunggu' : row.status === 'rejected' ? 'Ditolak' : 'Terkonfirmasi'}</span>{!isPerformerView && <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => setPendingAction({ row, type: isConfirmed ? 'reject' : 'confirm' })} className={`flex h-9 w-9 items-center justify-center rounded-lg ${isConfirmed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} title={isConfirmed ? 'Tolak pendaftar' : 'Konfirmasi pendaftar'} aria-label={isConfirmed ? 'Tolak pendaftar' : 'Konfirmasi pendaftar'}>{isConfirmed ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}</button>{isConfirmed && <button type="button" onClick={() => setPendingAction({ row, type: 'attend' })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700" title="Tandai hadir" aria-label="Tandai hadir"><UserCheck className="h-4 w-4" /></button>}<button type="button" onClick={() => setPendingAction({ row, type: 'delete' })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-700" title="Hapus pendaftar" aria-label="Hapus pendaftar"><Trash2 className="h-4 w-4" /></button></div>}</div>; })}</div>}</section>; })}</div>}
      {createTarget && <Modal open={Boolean(createTarget)} onClose={() => setCreateTarget(null)} title={`Tambah Pendaftar · ${createTarget.title}`} size="sm"><form onSubmit={createManualRegistration} className="space-y-4"><div><label className="label-field" htmlFor="compact-full-name">Nama lengkap</label><input id="compact-full-name" required value={createForm.full_name} onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="compact-stage-name">Nama panggung</label><input id="compact-stage-name" required value={createForm.stage_name} onChange={(event) => setCreateForm({ ...createForm, stage_name: event.target.value })} className="input-field" /></div><div><label className="label-field" htmlFor="compact-whatsapp">WhatsApp</label><input id="compact-whatsapp" value={createForm.whatsapp} onChange={(event) => setCreateForm({ ...createForm, whatsapp: event.target.value })} className="input-field" /></div><div className="flex gap-2"><button type="button" onClick={() => setCreateTarget(null)} className="btn-secondary flex-1">Batal</button><button type="submit" className="btn-primary flex-1">Tambah</button></div></form></Modal>}
      {pendingAction && <Modal open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title="Konfirmasi Aksi" size="sm"><div className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-extrabold text-slate-900">{pendingAction.row.full_name}</p><p className="mt-1 text-sm text-slate-600">{pendingAction.row.stage_name} · {pendingAction.row.registration_id}</p><p className="mt-1 text-xs text-slate-500">{pendingAction.row.community || 'Komunitas belum diisi'}</p></div>{pendingAction.row.whatsapp && <a href={waLink(pendingAction.row.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 ring-1 ring-green-200"><MessageCircle className="h-4 w-4" /> Hubungi via WhatsApp</a>}<p className="text-sm text-slate-600">Yakin ingin {pendingAction.type === 'confirm' ? 'mengonfirmasi' : pendingAction.type === 'reject' ? 'menolak' : pendingAction.type === 'attend' ? 'menandai hadir' : 'menghapus'} pendaftar ini?</p><div className="flex gap-2"><button type="button" onClick={() => setPendingAction(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => void performAction()} className="btn-primary flex-1">Ya, lanjutkan</button></div></div></Modal>}
    </div>
  );
}

function RegistrantsView({ openMicId, komika, onBack }: { openMicId: string; komika: Komika[]; onBack: () => void }) {
  const [openMic, setOpenMic] = useState<OpenMic | null>(null);
  const [rows, setRows] = useState<OpenMicRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' });
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [viewReg, setViewReg] = useState<OpenMicRegistration | null>(null);
  const [confirmReg, setConfirmReg] = useState<{ reg: OpenMicRegistration; action: 'confirmed' | 'rejected' } | null>(null);
  const [notice, setNotice] = useState('');
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [manualMode, setManualMode] = useState<'general' | 'member'>('general');
  const [komikaSearch, setKomikaSearch] = useState('');
  const [komikaSearchFocused, setKomikaSearchFocused] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r] = await Promise.all([
      supabase.from('open_mics').select('*').eq('id', openMicId).maybeSingle(),
      supabase.from('open_mic_registrations').select('*').eq('open_mic_id', openMicId).order('created_at', { ascending: false }),
    ]);
    setOpenMic((m.data as OpenMic) ?? null);
    setRows((r.data as OpenMicRegistration[]) ?? []);
    setLoading(false);
  }, [openMicId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel(`registrants-${openMicId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'open_mic_registrations', filter: `open_mic_id=eq.${openMicId}` }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'open_mic_registrations', filter: `open_mic_id=eq.${openMicId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [openMicId, load]);

  async function updateRegistration(id: string, status: 'confirmed' | 'rejected') {
    setNotice('');
    const { error } = await supabase.from('open_mic_registrations').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { setNotice('Perubahan gagal disimpan.'); return; }
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    setNotice(status === 'confirmed' ? 'Pendaftar dikonfirmasi.' : 'Pendaftar ditolak.');
  }

  async function updateAttendance(id: string, attendance_status: AttendanceStatus) {
    const { error } = await supabase.from('open_mic_registrations').update({ attendance_status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { setNotice('Status kehadiran gagal disimpan.'); return; }
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, attendance_status } : r));
    setViewReg((prev) => prev?.id === id ? { ...prev, attendance_status } : prev);
    setNotice(attendance_status === 'attended' ? 'Pendaftar ditandai hadir.' : 'Pendaftar ditandai tidak hadir.');
  }

  async function toggleAllAttendance() {
    const confirmedRows = rows.filter((row) => row.status === 'confirmed');
    if (confirmedRows.length === 0) return;
    const allAttended = confirmedRows.every((row) => row.attendance_status === 'attended');
    const attendance_status: AttendanceStatus = allAttended ? 'unmarked' : 'attended';
    setAttendanceSaving(true);
    const { error } = await supabase.from('open_mic_registrations').update({ attendance_status, updated_at: new Date().toISOString() }).eq('open_mic_id', openMicId).eq('status', 'confirmed');
    setAttendanceSaving(false);
    if (error) { setNotice('Status kehadiran gagal diperbarui.'); return; }
    setRows((prev) => prev.map((row) => row.status === 'confirmed' ? { ...row, attendance_status } : row));
    setViewReg((prev) => prev && prev.status === 'confirmed' ? { ...prev, attendance_status } : prev);
    setNotice(allAttended ? 'Tanda hadir semua dibatalkan.' : 'Semua pendaftar terkonfirmasi ditandai hadir.');
  }

  async function addManualRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (!openMic || !manualForm.full_name.trim() || !manualForm.stage_name.trim()) return;
    setManualSaving(true);
    const { data: seqData } = await supabase.rpc('next_open_mic_reg_seq');
    const seq = (seqData as number) ?? 1;
    const omNum = openMic.title.match(/#?(\d+)/)?.[1] ?? '00';
    const registrationId = `OM${omNum}-${String(seq).padStart(4, '0')}`;
    const { error } = await supabase.from('open_mic_registrations').insert({
      registration_id: registrationId,
      open_mic_id: openMic.id,
      komika_id: manualForm.komika_id || null,
      full_name: manualForm.full_name.trim(),
      stage_name: manualForm.stage_name.trim(),
      community: manualForm.community.trim() || null,
      instagram: manualForm.instagram.trim() || null,
      whatsapp: manualForm.whatsapp.trim() || null,
      notes: manualForm.notes.trim() || null,
      status: 'confirmed',
      attendance_status: 'unmarked',
    });
    setManualSaving(false);
    if (error) { setNotice('Pendaftar manual gagal ditambahkan.'); return; }
    setManualForm({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' });
    setManualMode('general');
    setKomikaSearch('');
    setKomikaSearchFocused(false);
    setManualOpen(false);
    setNotice('Pendaftar manual berhasil ditambahkan.');
    await load();
  }

  async function deleteRegistration(id: string) {
    if (!window.confirm('Hapus pendaftar ini? Data pendaftar akan dihapus.')) return;
    const { error } = await supabase.from('open_mic_registrations').delete().eq('id', id);
    if (error) { setNotice('Gagal menghapus pendaftar.'); return; }
    setNotice('Pendaftar dihapus.');
    setViewReg(null);
    await load();
  }

  const filtered = rows
    .filter((r) => filter === 'all' || r.status === filter)
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.full_name.toLowerCase().includes(q) || r.stage_name.toLowerCase().includes(q) || r.registration_id.toLowerCase().includes(q);
    });

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    confirmed: rows.filter((r) => r.status === 'confirmed').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  };

  const filterTabs: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'pending', label: 'Menunggu' },
    { key: 'confirmed', label: 'Terkonfirmasi' },
    { key: 'rejected', label: 'Ditolak' },
  ];

  const printRows = rows.filter((row) => row.status === 'confirmed');
  const matchingKomika = komika
    .filter((row) => row.status === 'active')
    .filter((row) => `${row.full_name} ${row.stage_name}`.toLowerCase().includes(komikaSearch.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-700">
        <ArrowLeft className="h-5 w-5" /> <span className="text-slate-900">Pendaftar</span>
      </button>

      {openMic && (
        <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {openMic.poster ? <img src={openMic.poster} alt={`Poster ${openMic.title}`} className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><Mic className="h-6 w-6" /></div>}
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold text-slate-900">{openMic.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{formatDate(openMic.date)} · {openMic.venue}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2"><button onClick={() => window.print()} className="btn-secondary !rounded-xl !px-3 !py-2.5 text-xs sm:text-sm"><Printer className="h-4 w-4" /><span className="hidden sm:inline">Print</span></button><button onClick={() => setManualOpen(true)} className="btn-primary !rounded-xl !px-3 !py-2.5 text-xs sm:text-sm"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Tambah Manual</span><span className="sm:hidden">Tambah</span></button></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="font-semibold text-slate-700">{counts.all} Pendaftar</span>
            {counts.pending > 0 && <span className="font-semibold text-amber-600">{counts.pending} Menunggu</span>}
            {counts.confirmed > 0 && <span className="font-semibold text-green-600">{counts.confirmed} Terkonfirmasi</span>}
            {counts.rejected > 0 && <span className="font-semibold text-red-600">{counts.rejected} Ditolak</span>}
          </div>
          <label className="mt-4 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-800 sm:w-fit">
            <input type="checkbox" checked={rows.filter((row) => row.status === 'confirmed').length > 0 && rows.filter((row) => row.status === 'confirmed').every((row) => row.attendance_status === 'attended')} onChange={() => void toggleAllAttendance()} disabled={attendanceSaving || rows.filter((row) => row.status === 'confirmed').length === 0} className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500" />
            <span>{attendanceSaving ? 'Menyimpan...' : 'Tandai hadir semua'}</span>
          </label>
        </div>
      )}

      {notice && (
        <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-green-200">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-600 hover:text-green-800"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau stage name..." className="input-field pl-10" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTabs.map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${filter === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
            {tab.label} <span className={`ml-1 ${filter === tab.key ? 'text-blue-100' : 'text-slate-400'}`}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {loading && <div className="space-y-3">{[1,2,3].map((n) => <div key={n} className="h-32 skeleton" />)}</div>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200/70">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-bold text-slate-700">Belum Ada Pendaftar</p>
          <p className="mt-1 text-sm text-slate-400">Belum ada komika yang mendaftar untuk Open Mic ini.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-4">Hadir</th><th className="px-5 py-4">Nama</th><th className="px-5 py-4">Stage Name</th><th className="px-5 py-4">Komunitas</th><th className="px-5 py-4">Reg. ID</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4"><input type="checkbox" checked={r.attendance_status === 'attended'} onChange={() => void updateAttendance(r.id, r.attendance_status === 'attended' ? 'unmarked' : 'attended')} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={`Tandai ${r.full_name} hadir`} /></td>
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{r.full_name}</span><AttendanceBadge status={r.attendance_status} /></div></td>
                    <td className="px-5 py-4 text-slate-700">{r.stage_name}</td>
                    <td className="px-5 py-4 text-slate-600">{r.community || '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-blue-700">{r.registration_id}</td>
                    <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewReg(r)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Lihat Detail"><Eye className="h-4 w-4" /></button>
                        {r.status === 'pending' && (
                          <>
                            <button onClick={() => setConfirmReg({ reg: r, action: 'confirmed' })} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Konfirmasi"><Check className="h-4 w-4" /></button>
                            <button onClick={() => setConfirmReg({ reg: r, action: 'rejected' })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Tolak"><X className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white p-3.5 shadow-soft ring-1 ring-slate-200/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2"><p className="truncate font-bold text-slate-900">{r.full_name}</p><AttendanceBadge status={r.attendance_status} /></div>
                  <p className="truncate text-sm text-slate-500">{r.stage_name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  <button onClick={() => setViewReg(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" title="Lihat Detail" aria-label={`Lihat detail ${r.full_name}`}><Eye className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                {r.community && <span className="max-w-[52%] truncate">{r.community}</span>}
                {r.community && <span className="text-slate-300">•</span>}
                <span className="font-mono text-blue-700">{r.registration_id}</span>
                <input type="checkbox" checked={r.attendance_status === 'attended'} onChange={() => void updateAttendance(r.id, r.attendance_status === 'attended' ? 'unmarked' : 'attended')} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={`Tandai ${r.full_name} hadir`} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="print-sheet thermal-registration-sheet">
        <div className="print-brand"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" /><div><h1>{openMic?.title ?? 'Open Mic'}</h1><p>{openMic ? `${openMic.venue} · ${formatDate(openMic.date)} · ${openMic.time} WIB` : ''}</p></div></div>
        <table>
          <thead><tr><th className="print-check">Cek</th><th>No.</th><th>Nama</th><th>Nama Panggung</th><th>Komunitas</th><th>Catatan</th></tr></thead>
          <tbody>{printRows.map((row, index) => <tr key={row.id}><td className="print-check">□</td><td>{index + 1}</td><td>{row.full_name}</td><td>{row.stage_name}</td><td>{row.community || 'Umum'}</td><td>{row.notes || ''}</td></tr>)}</tbody>
        </table>
      </div>

      <Modal open={Boolean(viewReg)} onClose={() => setViewReg(null)} title="Detail Pendaftar" size="md">
        {viewReg && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3.5">
              <p className="text-base font-bold text-slate-900">{viewReg.full_name}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-600">{viewReg.stage_name}</p>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <span className="font-medium text-slate-600">Komunitas</span><span className="text-right font-medium text-slate-800">{viewReg.community || '—'}</span>
              {viewReg.whatsapp && <><span className="font-medium text-slate-600">WhatsApp</span><a href={buildWhatsAppLink(viewReg.whatsapp, viewReg.full_name, openMic?.title ?? '', openMic?.venue ?? '')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-1 font-bold text-green-700 hover:text-green-900">{viewReg.whatsapp} <ExternalLink className="h-3.5 w-3.5" /></a></>}
              {!viewReg.whatsapp && <><span className="font-medium text-slate-600">WhatsApp</span><span className="text-right font-medium text-slate-500">Tidak tersedia</span></>}
              {viewReg.instagram && <><span className="font-medium text-slate-600">Instagram</span><a href={buildInstagramLink(viewReg.instagram)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-1 font-medium text-blue-700 hover:text-blue-800">{viewReg.instagram} <ExternalLink className="h-3.5 w-3.5" /></a></>}
              {viewReg.notes && <><span className="font-medium text-slate-600">Catatan</span><span className="text-right font-medium text-slate-800">{viewReg.notes}</span></>}
              {openMic && <><span className="font-medium text-slate-600">Open Mic</span><span className="text-right font-medium text-slate-800">{openMic.title}</span><span className="font-medium text-slate-600">Tanggal</span><span className="text-right font-medium text-slate-800">{formatDate(openMic.date)}</span></>}
              <span className="font-medium text-slate-600">Reg. ID</span><span className="text-right font-mono text-xs font-bold text-blue-700">{viewReg.registration_id}</span>
              <span className="font-medium text-slate-600">Status</span><span className="flex justify-end"><StatusBadge status={viewReg.status} /></span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-bold text-slate-900">Kehadiran</p><p className="mt-0.5 text-xs font-medium text-slate-600">Catatan internal admin</p></div>
                <span className={`text-xs font-bold ${viewReg.attendance_status === 'attended' ? 'text-green-600' : viewReg.attendance_status === 'absent' ? 'text-red-600' : 'text-slate-500'}`}>{viewReg.attendance_status === 'attended' ? 'Hadir' : viewReg.attendance_status === 'absent' ? 'Tidak Hadir' : 'Belum Dicek'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => { void updateAttendance(viewReg.id, 'attended'); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${viewReg.attendance_status === 'attended' ? 'bg-green-600 text-white' : 'bg-white text-green-700 ring-1 ring-green-200 hover:bg-green-50'}`}>Hadir</button>
                <button onClick={() => { void updateAttendance(viewReg.id, 'absent'); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${viewReg.attendance_status === 'absent' ? 'bg-red-600 text-white' : 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50'}`}>Tidak Hadir</button>
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {viewReg.whatsapp && (
                <a href={buildWhatsAppLink(viewReg.whatsapp, viewReg.full_name, openMic?.title ?? '', openMic?.venue ?? '')} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700">
                  <MessageCircle className="h-4 w-4" /> Hubungi via WhatsApp
                </a>
              )}
              {viewReg.status === 'pending' ? (
                <div className="flex gap-3">
                  <button onClick={() => { setConfirmReg({ reg: viewReg, action: 'rejected' }); setViewReg(null); }} className="flex-1 rounded-xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100">Tolak</button>
                  <button onClick={() => { setConfirmReg({ reg: viewReg, action: 'confirmed' }); setViewReg(null); }} className="flex-1 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700">Konfirmasi</button>
                </div>
              ) : (
                <button onClick={() => deleteRegistration(viewReg.id)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100">
                  <Trash2 className="h-4 w-4" /> Hapus Pendaftar
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Tambah Pendaftar Manual" size="md">
        <form onSubmit={addManualRegistration} className="space-y-3">
          <p className="mb-4 text-sm text-slate-500">Pilih Komika anggota bila pendaftar memiliki profil resmi. Kosongkan untuk pendaftar umum.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label-field">Jenis Pendaftar</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setManualMode('general'); setManualForm({ komika_id: '', full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' }); setKomikaSearch(''); setKomikaSearchFocused(false); }} className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${manualMode === 'general' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}>Pendaftar Umum</button>
                <button type="button" onClick={() => setManualMode('member')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${manualMode === 'member' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}>Anggota Komika</button>
              </div>
            </div>
            {manualMode === 'member' && <div className="relative sm:col-span-2"><label className="label-field" htmlFor="manual-komika-search">Cari Anggota Komika</label><Search className="absolute left-3 top-[2.65rem] h-4 w-4 text-slate-400" /><input id="manual-komika-search" value={komikaSearch} onFocus={() => setKomikaSearchFocused(true)} onBlur={() => setTimeout(() => setKomikaSearchFocused(false), 150)} onChange={(e) => { setKomikaSearch(e.target.value); setManualForm({ ...manualForm, komika_id: '' }); }} className="input-field pl-10" placeholder="Ketik nama atau stage name" autoComplete="off" />{komikaSearchFocused && <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{matchingKomika.length > 0 ? matchingKomika.map((selected) => <button key={selected.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setManualForm({ ...manualForm, komika_id: selected.id, full_name: selected.full_name, stage_name: selected.stage_name, community: 'Standupindo Cilegon', instagram: formatInstagramHandle(selected.instagram_url ?? ''), whatsapp: selected.whatsapp ?? '' }); setKomikaSearch(''); setKomikaSearchFocused(false); }} className="flex min-h-12 w-full flex-col items-start justify-center rounded-lg px-3 py-2.5 text-left transition hover:bg-blue-50"><span className="text-sm font-bold text-slate-900">{selected.full_name}</span><span className="text-xs text-slate-500">{selected.stage_name}</span></button>) : <p className="px-3 py-3 text-sm text-slate-500">Anggota tidak ditemukan.</p>}</div>}{manualForm.komika_id && <p className="mt-1.5 text-xs font-semibold text-green-700">Terpilih: {manualForm.full_name} — {manualForm.stage_name}</p>}</div>}
            <div><label className="label-field" htmlFor="manual-full-name">Nama Lengkap</label><input id="manual-full-name" required value={manualForm.full_name} onChange={(e) => setManualForm({ ...manualForm, full_name: e.target.value })} className="input-field" placeholder="Nama lengkap" /></div>
            <div><label className="label-field" htmlFor="manual-stage-name">Stage Name</label><input id="manual-stage-name" required value={manualForm.stage_name} onChange={(e) => setManualForm({ ...manualForm, stage_name: e.target.value })} className="input-field" placeholder="Nama panggung" /></div>
            <div><label className="label-field" htmlFor="manual-community">Komunitas</label><input id="manual-community" value={manualForm.community} onChange={(e) => setManualForm({ ...manualForm, community: e.target.value })} className="input-field" placeholder="Opsional" /></div>
            <div><label className="label-field" htmlFor="manual-instagram">Instagram</label><input id="manual-instagram" value={manualForm.instagram} onChange={(e) => setManualForm({ ...manualForm, instagram: formatInstagramHandle(e.target.value) })} className="input-field" placeholder="@username" /></div>
            <div><label className="label-field" htmlFor="manual-whatsapp">WhatsApp</label><input id="manual-whatsapp" value={manualForm.whatsapp} onChange={(e) => setManualForm({ ...manualForm, whatsapp: e.target.value })} className="input-field" placeholder="Opsional" /></div>
            <div><label className="label-field" htmlFor="manual-notes">Catatan</label><input id="manual-notes" value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} className="input-field" placeholder="Opsional" /></div>
          </div>
          <button type="submit" disabled={manualSaving} className="btn-primary mt-3 w-full">{manualSaving ? 'Menyimpan...' : 'Simpan Pendaftar'}</button>
        </form>
      </Modal>

      <Modal open={Boolean(confirmReg)} onClose={() => setConfirmReg(null)} title={confirmReg?.action === 'confirmed' ? 'Konfirmasi Pendaftar?' : 'Pendaftar Tidak Hadir?'} size="sm">
        {confirmReg && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {confirmReg.action === 'confirmed'
                ? `Peserta ${confirmReg.reg.stage_name} akan dikonfirmasi sebagai peserta${openMic ? ` ${openMic.title}` : ''}.`
                : `Apakah Anda yakin ingin menandai pendaftar tidak hadir ${confirmReg.reg.stage_name}?`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReg(null)} className="btn-secondary flex-1">Batal</button>
              <button
                onClick={() => { void updateRegistration(confirmReg.reg.id, confirmReg.action); setConfirmReg(null); }}
                className={`flex-1 rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${confirmReg.action === 'confirmed' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {confirmReg.action === 'confirmed' ? 'Ya, Konfirmasi' : 'Ya, Tolak'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function buildWhatsAppLink(whatsapp: string, name: string, micTitle: string, venue: string): string {
  const digits = whatsapp.replace(/[^\d]/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('62') ? digits : '62' + digits;
  const message = `Halo, ${name} 👋\n\nPengajuan Open Mic kamu untuk ${micTitle} di ${venue} telah dikonfirmasi.\n\nMohon konfirmasi kembali kehadiran kamu dengan membalas pesan ini.\n\nTerima kasih dan sampai ketemu di Open Mic! 🎤`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildInstagramLink(instagram: string): string {
  const username = instagram.replace(/^@/, '').trim();
  return `https://www.instagram.com/${username}/`;
}

function buildEventParticipantWhatsAppLink(whatsapp: string, participant: EventParticipant, eventTitle: string, status: ApplicationStatus): string {
  const digits = whatsapp.replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('62') ? digits : '62' + digits;
  const statusText = status === 'approved' ? 'disetujui' : status === 'rejected' ? 'belum dapat disetujui' : 'sedang ditinjau';
  const message = `Halo ${participant.full_name}, pendaftaran kamu untuk event ${eventTitle} dengan nomor ${participant.registration_id} ${statusText}.\n\n${status === 'approved' ? 'Selamat, kamu resmi terdaftar sebagai peserta. Mohon simpan nomor pendaftaran ini dan tunggu informasi berikutnya dari panitia.' : status === 'rejected' ? 'Terima kasih sudah mendaftar. Untuk informasi lebih lanjut, silakan balas pesan ini.' : 'Admin akan menghubungi kamu kembali setelah proses peninjauan selesai.'}\n\nTerima kasih.\nStandupindo Cilegon`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildCommunityWhatsAppLink(application: CommunityApplication, status?: ApplicationStatus): string {
  void status;
  const digits = application.whatsapp.replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('62') ? digits : '62' + digits;
  const message = `Halo ${application.full_name}, pendaftaran kamu untuk bergabung ke Komunitas Standupindo Cilegon telah disetujui admin.\n\nSilakan bergabung ke grup WhatsApp komunitas melalui link berikut:\nhttps://chat.whatsapp.com/JYGvaeBo8nc1x7kn3SRc40?mode=gi_t\n\nAdmin akan mengonfirmasi kembali setelah kamu bergabung ke grup.\n\nTerima kasih.\nStandupindo Cilegon`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildCommunityContactWhatsAppLink(application: CommunityApplication): string {
  const digits = application.whatsapp.replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('62') ? digits : '62' + digits;
  const message = `Halo ${application.full_name}, saya admin Standupindo Cilegon. Kami menghubungi terkait pendaftaran Gabung Komunitas kamu. Terima kasih.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function formatInstagramHandle(value: string): string {
  const username = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/\/.*$/, '');
  return username ? `@${username}` : '';
}

function instagramProfileUrl(value: string): string | null {
  const handle = formatInstagramHandle(value);
  return handle ? `https://instagram.com/${handle.slice(1)}` : null;
}

function formatTikTokHandle(value: string): string {
  const username = value.trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '').replace(/^@+/, '').replace(/\s+/g, '').replace(/[/?#].*$/, '');
  return username ? `@${username}` : '';
}

function tiktokProfileUrl(value: string): string | null {
  const handle = formatTikTokHandle(value);
  return handle ? `https://tiktok.com/${handle}` : null;
}

function getAdminFieldPlaceholder(key: string): string | undefined {
  const placeholders: Record<string, string> = {
    full_name: 'Contoh: Budi Santoso', stage_name: 'Contoh: Budi Ngakak', whatsapp: 'Contoh: 082212345678', joined_at: 'Contoh: September 2026',
    instagram_url: 'Contoh: @budi.ngakak', tiktok_url: 'Contoh: @budingakak', youtube_url: 'Contoh: https://youtube.com/@budingakak',
    bio: 'Contoh: Komika dengan materi observasi sehari-hari.', specialties: 'Contoh: Observasi, kehidupan kerja', title: 'Contoh: Comedy Night #02',
    venue: 'Contoh: Aula Serbaguna Cilegon', location: 'Contoh: Cilegon, Banten', maps_url: 'Contoh: https://maps.google.com/...', capacity: 'Contoh: 10', time: 'Contoh: 19.00',
  };
  return placeholders[key];
}

function OpenMicManagement({ rows, registrations, loading, showRegistrants = true, onAdd, onEdit, onDelete, onTogglePublish, onViewRegistrants }: { rows: OpenMic[]; registrations: OpenMicRegistration[]; loading: boolean; showRegistrants?: boolean; onAdd: () => void; onEdit: (row: OpenMic) => void; onDelete: (id: string) => void; onTogglePublish: (id: string, current: boolean) => void; onViewRegistrants: (m: OpenMic) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const searchedRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.title.toLowerCase().includes(query) || row.venue.toLowerCase().includes(query);
  });
  const filteredRows = search.trim() ? searchedRows : searchedRows.filter((row) => getOpenMicStatus(row.status, row.date) === statusFilter);
  const openMicNumbers = useMemo(() => getOpenMicNumbers(rows.filter((m) => m.published)), [rows]);
  const statusFolders = [
    ['upcoming', 'Mendatang'],
    ['completed', 'Selesai'],
    ['cancelled', 'Dibatalkan'],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <WorkspacePageHeader title="Open Mic" subtitle="Kelola Open Mic yang tampil di website." />
        <button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Tambah</span></button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Open Mic atau venue..." className="input-field pl-10" aria-label="Cari Open Mic" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {statusFolders.map(([value, label]) => (
          <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-2xl border p-3 text-left transition ${statusFilter === value && !search.trim() ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100'}`}>
            <span className="block text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
            <span className="mt-1 block text-2xl font-extrabold">{searchedRows.filter((row) => getOpenMicStatus(row.status, row.date) === value).length}</span>
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-4">Title</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Venue</th><th className="px-5 py-4">Capacity</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Publish</th><th className="px-5 py-4 text-right">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Memuat data...</td></tr> : filteredRows.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {m.poster ? <img src={m.poster} alt={`Poster ${m.title}`} className="h-11 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100"><Mic className="h-5 w-5" /></div>}
                      <span><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Open Mic #{openMicNumbers.get(m.id)}</span><span className="font-semibold text-slate-800">{m.title}</span></span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500">{formatDate(m.date)}</td>
                  <td className="px-5 py-4 text-slate-600">{m.venue}</td>
                  <td className="px-5 py-4 text-slate-500">{m.capacity}</td>
                  <td className="px-5 py-4"><StatusBadge status={getOpenMicStatus(m.status, m.date)} /></td>
                  <td className="px-5 py-4">
                    <button onClick={() => onTogglePublish(m.id, m.published)} className={`rounded-lg p-2 transition ${m.published ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`} title={m.published ? 'Unpublish' : 'Publish'}>
                      {m.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      {showRegistrants && <button onClick={() => onViewRegistrants(m)} className="relative rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Lihat Pendaftar"><Users className="h-4 w-4" />{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white">{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length}</span>}</button>}
                      <button onClick={() => onEdit(m)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => onDelete(m.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">{search ? 'Open Mic tidak ditemukan.' : 'Belum ada data.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map((n) => <div key={n} className="h-36 skeleton" />)}</div>
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title={search ? 'Open Mic tidak ditemukan.' : 'Belum ada Open Mic.'} />
        ) : filteredRows.map((m) => (
          <div key={m.id} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-200/70">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {m.poster ? <img src={m.poster} alt={`Poster ${m.title}`} className="h-16 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><Mic className="h-6 w-6" /></div>}
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900"><span className="mr-1.5 text-blue-700">#{openMicNumbers.get(m.id)}</span>{m.title}</p>
                  <p className="truncate text-xs text-slate-500">{formatDate(m.date)} · {m.venue}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-1.5"><StatusBadge status={getOpenMicStatus(m.status, m.date)} /><button type="button" onClick={() => setExpandedRows((current) => { const next = new Set(current); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next; })} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={expandedRows.has(m.id) ? `Sembunyikan aksi ${m.title}` : `Tampilkan aksi ${m.title}`} aria-expanded={expandedRows.has(m.id)} title={expandedRows.has(m.id) ? 'Sembunyikan aksi' : 'Tampilkan aksi'}><ChevronDown className={`h-4 w-4 transition-transform ${expandedRows.has(m.id) ? 'rotate-180' : ''}`} /></button></div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span>Kapasitas: <strong className="text-slate-700">{m.capacity}</strong></span>
              <span className="text-slate-300">|</span>
              <button onClick={() => onTogglePublish(m.id, m.published)} className={`flex items-center gap-1 font-semibold ${m.published ? 'text-green-600' : 'text-slate-400'}`}>
                {m.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {m.published ? 'Published' : 'Draft'}
              </button>
            </div>
            {expandedRows.has(m.id) && <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              {showRegistrants && <button onClick={() => onViewRegistrants(m)} className="relative flex-1 rounded-lg bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">Pendaftar{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white">{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length}</span>}</button>}
              <button type="button" onClick={() => onEdit(m)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100" title="Edit Open Mic" aria-label={`Edit ${m.title}`}><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => onDelete(m.id)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-700 transition hover:bg-red-100" title="Hapus Open Mic" aria-label={`Hapus ${m.title}`}><Trash2 className="h-4 w-4" /></button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventParticipantsView({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [rows, setRows] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ApplicationStatus>('all');
  const [search, setSearch] = useState('');
  const [viewParticipant, setViewParticipant] = useState<EventParticipant | null>(null);
  const [notice, setNotice] = useState('');
  const [presented, setPresented] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [eventResult, participantResult] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('event_participants').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
    ]);
    setEvent((eventResult.data as EventItem) ?? null);
    setRows((participantResult.data as EventParticipant[]) ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: ApplicationStatus) {
    const { error } = await supabase.from('event_participants').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { setNotice('Status pendaftar gagal diperbarui.'); return; }
    setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row));
    setViewParticipant((current) => current?.id === id ? { ...current, status } : current);
    setNotice(status === 'approved' ? 'Pendaftar disetujui.' : status === 'rejected' ? 'Pendaftar ditolak.' : 'Status dikembalikan ke pending.');
  }

  async function deleteParticipant(participant: EventParticipant) {
    if (!window.confirm(`Hapus pendaftar ${participant.full_name}? Data ini tidak dapat dikembalikan.`)) return;
    const { error } = await supabase.from('event_participants').delete().eq('id', participant.id);
    if (error) { setNotice('Pendaftar gagal dihapus.'); return; }
    setRows((current) => current.filter((row) => row.id !== participant.id));
    setViewParticipant(null);
    setNotice('Pendaftar berhasil dihapus.');
  }

  const filtered = rows.filter((row) => filter === 'all' || row.status === filter).filter((row) => {
    const query = search.toLowerCase().trim();
    return !query || row.full_name.toLowerCase().includes(query) || (row.stage_name ?? '').toLowerCase().includes(query);
  });
  const counts = { all: rows.length, pending: rows.filter((row) => row.status === 'pending').length, approved: rows.filter((row) => row.status === 'approved').length, rejected: rows.filter((row) => row.status === 'rejected').length };
  const tabs: { key: 'all' | ApplicationStatus; label: string }[] = [{ key: 'all', label: 'Semua' }, { key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Disetujui' }, { key: 'rejected', label: 'Ditolak' }];
  const printRows = rows.filter((row) => row.status === 'approved');

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-5 w-5" /> <span className="text-slate-900">Events</span></button>
      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/70">
        <div className="flex items-center gap-3">
          {event?.poster ? <img src={event.poster} alt={`Poster ${event.title}`} className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><CalendarDays className="h-6 w-6" /></div>}
          <div className="min-w-0"><h1 className="truncate text-xl font-extrabold text-slate-900">{event?.title ?? 'Pendaftar Event'}</h1>{event && <p className="mt-1 text-sm text-slate-500">{formatDate(event.date)} · {event.venue}</p>}</div>
        </div>
        <div className="mt-4 flex justify-end"><button onClick={() => window.print()} className="btn-secondary !rounded-xl !px-3 !py-2.5 text-xs sm:text-sm"><Printer className="h-4 w-4" /> Print</button></div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm"><span className="font-semibold text-slate-700">{counts.all} Peserta</span>{counts.pending > 0 && <span className="font-semibold text-amber-600">{counts.pending} Menunggu</span>}{counts.approved > 0 && <span className="font-semibold text-green-600">{counts.approved} Disetujui</span>}{counts.rejected > 0 && <span className="font-semibold text-red-600">{counts.rejected} Ditolak</span>}</div>
      </div>
      {notice && <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-green-200"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Tutup pesan"><X className="h-4 w-4" /></button></div>}
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" placeholder="Cari nama atau nama panggung..." /></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab.key} onClick={() => setFilter(tab.key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${filter === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{tab.label} <span className="ml-1 opacity-70">{counts[tab.key]}</span></button>)}</div>
      {loading && <div className="space-y-3">{[1, 2].map((item) => <div key={item} className="h-24 skeleton" />)}</div>}
      {!loading && filtered.length === 0 && <AdminEmptyState title="Belum ada peserta event." />}
      {!loading && filtered.length > 0 && <>
        <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Hadir</th><th className="px-5 py-4">No. Pendaftaran</th><th className="px-5 py-4">Nama</th><th className="px-5 py-4">Nama Panggung / Tim</th><th className="px-5 py-4">Komunitas</th><th className="px-5 py-4">WhatsApp</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><input type="checkbox" checked={Boolean(presented[row.id])} onChange={(event) => setPresented((current) => ({ ...current, [row.id]: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={`Tandai ${row.full_name} tampil`} /></td><td className="px-5 py-4 font-mono text-xs font-semibold text-blue-700">{row.registration_id}</td><td className="px-5 py-4 font-semibold text-slate-800">{row.full_name}</td><td className="px-5 py-4 text-slate-700">{row.stage_name}</td><td className="px-5 py-4 text-slate-600">{row.community || 'Umum'}</td><td className="px-5 py-4 text-slate-600">{row.whatsapp}</td><td className="px-5 py-4"><StatusBadge status={row.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={() => setViewParticipant(row)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Lihat Detail"><Eye className="h-4 w-4" /></button>{row.status === 'pending' && <><button onClick={() => void updateStatus(row.id, 'approved')} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Setujui"><Check className="h-4 w-4" /></button><button onClick={() => void updateStatus(row.id, 'rejected')} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Tolak"><X className="h-4 w-4" /></button></>}<button onClick={() => void deleteParticipant(row)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700" title="Hapus"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>
        <div className="space-y-3 lg:hidden">{filtered.map((row) => <div key={row.id} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-200/70"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-blue-700">{row.registration_id}</p><p className="truncate font-bold text-slate-900">{row.full_name}</p><p className="truncate text-sm text-slate-500">{row.stage_name}</p><p className="mt-1 truncate text-xs text-slate-500">{row.community || 'Umum'} · {row.whatsapp}</p></div><div className="flex items-center gap-2"><StatusBadge status={row.status} /><button onClick={() => setViewParticipant(row)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Lihat Detail"><Eye className="h-4 w-4" /></button></div></div></div>)}</div>
      </>}
      <div className="print-sheet thermal-event-sheet">
        <div className="print-brand"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" /><div><h1>{event?.title ?? 'Event'}</h1><p>{event ? `${event.venue} · ${formatDate(event.date)} · ${event.time} WIB` : ''}</p></div></div>
        <table>
          <thead><tr><th className="print-check">Cek</th><th>No.</th><th>Nama</th><th>Nama Panggung / Tim</th><th>Komunitas</th><th>Catatan</th></tr></thead>
          <tbody>{printRows.map((row, index) => <tr key={row.id}><td className="print-check">□</td><td>{index + 1}</td><td>{row.full_name}</td><td>{row.stage_name}</td><td>{row.community || 'Umum'}</td><td>{row.notes || ''}</td></tr>)}</tbody>
        </table>
      </div>
      <Modal open={Boolean(viewParticipant)} onClose={() => setViewParticipant(null)} title="Detail Peserta Event" size="md">
        {viewParticipant && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{viewParticipant.full_name}</p>
              <p className="mt-1 text-sm font-medium text-slate-600">{viewParticipant.stage_name}</p>
              </div><StatusBadge status={viewParticipant.status} /></div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <span className="font-medium text-slate-600">No. Pendaftaran</span>
              <span className="text-right font-mono text-xs font-bold text-blue-700">{viewParticipant.registration_id}</span>
              <span className="font-medium text-slate-600">Event</span>
              <span className="text-right font-medium text-slate-800">{event?.title ?? 'Event'}</span>
              <span className="font-medium text-slate-600">Komunitas</span>
              <span className="text-right font-medium text-slate-800">{viewParticipant.community || 'Umum'}</span>
              <span className="font-medium text-slate-600">WhatsApp</span>
              <a href={buildWhatsAppLink(viewParticipant.whatsapp, viewParticipant.full_name, event?.title ?? '', event?.venue ?? '')} target="_blank" rel="noopener noreferrer" className="text-right font-bold text-green-700 hover:text-green-800">{viewParticipant.whatsapp}</a>
              {viewParticipant.instagram && <>
                <span className="font-medium text-slate-600">Instagram</span>
                <a href={buildInstagramLink(viewParticipant.instagram)} target="_blank" rel="noopener noreferrer" className="text-right font-medium text-blue-700 hover:text-blue-800">{viewParticipant.instagram}</a>
              </>}
              {viewParticipant.notes && <>
                <span className="font-medium text-slate-600">Catatan</span>
                <span className="text-right font-medium text-slate-800">{viewParticipant.notes}</span>
              </>}
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <a href={buildEventParticipantWhatsAppLink(viewParticipant.whatsapp, viewParticipant, event?.title ?? 'Event', viewParticipant.status)} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700"><MessageCircle className="h-4 w-4" /> Konfirmasi via WhatsApp</a>
              <div className="flex gap-3">
                {viewParticipant.status !== 'rejected' && <button onClick={() => void updateStatus(viewParticipant.id, 'rejected')} className="flex-1 rounded-xl bg-red-100 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-200">Tolak</button>}
                {viewParticipant.status !== 'approved' && <button onClick={() => void updateStatus(viewParticipant.id, 'approved')} className="flex-1 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700">Setujui</button>}
                {viewParticipant.status !== 'pending' && <button onClick={() => void updateStatus(viewParticipant.id, 'pending')} className="flex-1 rounded-xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-300">Pending</button>}
              </div>
              <button onClick={() => void deleteParticipant(viewParticipant)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-100 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-200"><Trash2 className="h-4 w-4" /> Hapus Pendaftar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EventManagement({ rows, loading, pendingCounts, canManageTickets, initialStatus = 'upcoming', onAdd, onEdit, onManagePhotos, onDelete, onTogglePublish, onManageTickets, onManagePartnerships, onViewParticipants }: { rows: EventItem[]; loading: boolean; pendingCounts: Record<string, number>; canManageTickets: boolean; initialStatus?: 'upcoming' | 'completed' | 'cancelled'; onAdd: () => void; onEdit: (row: EventItem) => void; onManagePhotos: (row: EventItem) => void; onDelete: (id: string) => void; onTogglePublish: (id: string, current: boolean) => void; onManageTickets: (row: EventItem) => void; onManagePartnerships: (row: EventItem) => void; onViewParticipants: (row: EventItem) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'completed' | 'cancelled'>(initialStatus);
  useEffect(() => { setStatusFilter(initialStatus); }, [initialStatus]);
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.title.toLowerCase().includes(query) || row.venue.toLowerCase().includes(query);
  }).filter((row) => search.trim() ? true : getEventStatus(row.status, row.date) === statusFilter);
  const statusFolders = [
    ['upcoming', 'Mendatang'],
    ['completed', 'Selesai'],
    ['cancelled', 'Dibatalkan'],
  ] as const;
  const searchedRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.title.toLowerCase().includes(query) || row.venue.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-5">
      <WorkspacePageHeader title="Events" subtitle="Kelola Event yang tampil di website." eyebrow="Event Workspace" action={<button onClick={onAdd} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="Tambah Event" title="Tambah Event"><Plus className="h-5 w-5" /></button>} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari event atau venue..." className="input-field pl-10" aria-label="Cari event" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {statusFolders.map(([value, label]) => (
          <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-2xl border p-3 text-left transition ${statusFilter === value && !search.trim() ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100'}`}>
            <span className="block text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
            <span className="mt-1 block text-2xl font-extrabold">{searchedRows.filter((row) => getEventStatus(row.status, row.date) === value).length}</span>
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-4">Title</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Venue</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Publish</th><th className="px-5 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Memuat data...</td></tr> : filteredRows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><div className="flex items-center gap-3">{e.poster ? <img src={e.poster} alt={`Poster ${e.title}`} className="h-11 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100"><CalendarDays className="h-5 w-5" /></div>}<span className="font-semibold text-slate-800">{e.title}</span></div></td>
                  <td className="px-5 py-4 text-slate-500">{formatDate(e.date)}</td>
                  <td className="px-5 py-4 text-slate-600">{e.venue}</td>
                  <td className="px-5 py-4"><StatusBadge status={getEventStatus(e.status, e.date)} /></td>
                  <td className="px-5 py-4">
                    <button onClick={() => onTogglePublish(e.id, e.published)} className={`rounded-lg p-2 transition ${e.published ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`} title={e.published ? 'Unpublish' : 'Publish'}>
                      {e.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      {getEventStatus(e.status, e.date) !== 'completed' && e.registration_status === 'open' && <button onClick={() => onViewParticipants(e)} className="relative rounded-lg p-2 text-slate-500 hover:bg-green-50 hover:text-green-700" title="Lihat Pendaftar" aria-label={`Lihat pendaftar ${e.title}`}><UserPlus className="h-4 w-4" />{pendingCounts[e.id] > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white">{pendingCounts[e.id]}</span>}</button>}
                      {canManageTickets && getEventStatus(e.status, e.date) !== 'completed' && <button onClick={() => onManageTickets(e)} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Kelola Tiket" aria-label={`Kelola tiket ${e.title}`}><TicketIcon className="h-4 w-4" /></button>}
                      <button onClick={() => onManagePartnerships(e)} className="rounded-lg p-2 text-slate-500 hover:bg-violet-50 hover:text-violet-700" title="Kelola Partner" aria-label={`Kelola partner ${e.title}`}><Users className="h-4 w-4" /></button>
                      {getEventStatus(e.status, e.date) === 'completed' && <button onClick={() => onManagePhotos(e)} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Kelola Foto Dokumentasi" aria-label={`Kelola foto dokumentasi ${e.title}`}><ImagePlus className="h-4 w-4" /></button>}
                      <button onClick={() => onEdit(e)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Edit" aria-label={`Edit ${e.title}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => onDelete(e.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Hapus" aria-label={`Hapus ${e.title}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">{search ? 'Event tidak ditemukan.' : 'Belum ada data.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="space-y-3">{[1,2].map((n) => <div key={n} className="h-36 skeleton" />)}</div>
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title={search ? 'Event tidak ditemukan.' : 'Belum ada Event.'} />
        ) : filteredRows.map((e) => {
          const completed = getEventStatus(e.status, e.date) === 'completed';
          return <div key={e.id} className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
            {e.poster && <img src={e.poster} alt={e.title} className="h-40 w-full object-cover" />}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(e.date)} · {e.venue}</p>
                </div>
                <StatusBadge status={getEventStatus(e.status, e.date)} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <button onClick={() => onTogglePublish(e.id, e.published)} className={`flex items-center gap-1 font-semibold ${e.published ? 'text-green-600' : 'text-slate-400'}`}>
                  {e.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {e.published ? 'Published' : 'Draft'}
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                {!completed && e.registration_status === 'open' && <button onClick={() => onViewParticipants(e)} aria-label={`Lihat pendaftar ${e.title}`} title={`Pendaftar${pendingCounts[e.id] > 0 ? ` (${pendingCounts[e.id]} menunggu)` : ''}`} className="relative flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-green-50 text-green-700 transition hover:bg-green-100"><UserPlus className="h-4 w-4" />{pendingCounts[e.id] > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white">{pendingCounts[e.id]}</span>}</button>}
                {!completed && canManageTickets && <button onClick={() => onManageTickets(e)} aria-label={`Kelola tiket ${e.title}`} title="Kelola tiket" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-amber-50 text-amber-700 transition hover:bg-amber-100"><TicketIcon className="h-4 w-4" /></button>}
                <button onClick={() => onManagePartnerships(e)} aria-label={`Kelola partner ${e.title}`} title="Kelola partner" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-violet-50 text-violet-700 transition hover:bg-violet-100"><Users className="h-4 w-4" /></button>
                {completed && <button onClick={() => onManagePhotos(e)} aria-label={`Kelola foto dokumentasi ${e.title}`} title="Foto dokumentasi" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"><ImagePlus className="h-4 w-4" /></button>}
                <button onClick={() => onEdit(e)} aria-label={`Edit ${e.title}`} title="Edit" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => onDelete(e.id)} aria-label={`Hapus ${e.title}`} title="Hapus" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-red-50 text-red-700 transition hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

function PartnerManagement({ rows, events, partnerships, loading, onAdd, onEdit, onDelete, onTogglePublish }: { rows: Partner[]; events: EventItem[]; partnerships: EventPartnership[]; loading: boolean; onAdd: () => void; onEdit: (row: Partner) => void; onDelete: (id: string) => void; onTogglePublish: (id: string, current: boolean) => void }) {
  const [viewPartner, setViewPartner] = useState<Partner | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [deletePartner, setDeletePartner] = useState<Partner | null>(null);
  const [expandedPartners, setExpandedPartners] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<Partner['category']>('sponsor');
  const eventMap = new Map(events.map((event) => [event.id, { title: event.title, date: event.date }]));

  const categoryLabels: Record<Partner['category'], string> = {
    sponsor: 'Sponsor',
    support: 'Support',
    media_partner: 'Media Partner',
  };

  const normalizedSearch = search.trim().toLowerCase();

  const folderCounts = useMemo(() => ({
    sponsor: rows.filter((row) => row.category === 'sponsor').length,
    support: rows.filter((row) => row.category === 'support').length,
    media_partner: rows.filter((row) => row.category === 'media_partner').length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesFolder = row.category === folder;
    if (!matchesFolder) return false;

    if (!normalizedSearch) return true;

    const haystack = [row.name, row.contact_name, row.notes ?? '', row.website_url ?? ''].join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [folder, normalizedSearch, rows]);

  const getLinkedEvents = (partnerId: string) => partnerships
    .filter((relationship) => relationship.partner_id === partnerId)
    .map((relationship) => {
      const meta = eventMap.get(relationship.event_id) ?? { title: 'Event tidak ditemukan', date: '' };

      return {
        id: relationship.id,
        eventId: relationship.event_id,
        title: meta.title,
        eventDate: meta.date,
        role: relationship.role,
        notes: relationship.notes,
        picName: relationship.pic_name,
        picPhone: relationship.pic_phone,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' }));

  function handleDelete(partner: Partner) {
    setDeletePartner(partner);
  }

  function getPartnerWaMessage(partner: Partner) {
    const contactName = partner.contact_name?.trim() || 'Kontak';
    return `Halo ${contactName}, apa kabar? Saya dari Standupindo Cilegon. Saya ingin mengajak kembali kerja sama terkait ${partner.name}. Mohon balasan jika tertarik.`;
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader title="Partners" subtitle="Kelola sponsor, support, dan media partner yang tampil di website." eyebrow="Event Workspace" action={<button onClick={onAdd} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="Tambah Partner" title="Tambah Partner"><Plus className="h-5 w-5" /></button>} />

      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 sm:gap-2 sm:p-2" role="tablist" aria-label="Kategori partner">
        {(['sponsor', 'support', 'media_partner'] as const).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setFolder(category)}
            role="tab"
            aria-selected={folder === category}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 active:scale-[0.98] sm:min-h-16 sm:px-3 ${folder === category ? 'border-blue-700 bg-blue-600 text-white shadow-md shadow-blue-900/20' : 'border-transparent bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-sm'}`}
          >
            <span className="whitespace-nowrap text-[11px] font-bold leading-tight sm:text-sm">{categoryLabels[category]}</span>
            <span className={`text-[10px] font-medium leading-tight sm:text-xs ${folder === category ? 'text-blue-100' : 'text-slate-500'}`}>{folderCounts[category]} item</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Cari ${categoryLabels[folder].toLowerCase()} atau kontak...`}
          className="input-field pl-10"
          aria-label="Cari partner"
        />
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((n) => <div key={n} className="h-24 skeleton rounded-2xl" />)}</div>
      ) : filteredRows.length === 0 ? (
        <AdminEmptyState title={search ? 'Partner tidak ditemukan.' : `Belum ada ${categoryLabels[folder]}.`} />
      ) : (
        <div className="space-y-3">
          {filteredRows.map((partner) => {
            const linkedEvents = getLinkedEvents(partner.id);
            const expanded = expandedPartners[partner.id] ?? false;

            return (
              <div key={partner.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => partner.logo_url && setViewImage(partner.logo_url)}
                    disabled={!partner.logo_url}
                    className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200 transition hover:ring-blue-300 disabled:cursor-default disabled:hover:ring-slate-200"
                    aria-label={`Lihat logo ${partner.name}`}
                  >
                    {partner.logo_url ? <img src={partner.logo_url} alt={partner.name} className="h-full w-full object-contain p-1.5" /> : <Users className="h-8 w-8 text-slate-400" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setExpandedPartners((current) => ({ ...current, [partner.id]: !expanded }))} className="flex min-w-0 items-start gap-2 text-left">
                        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        <div className="min-w-0">
                        <p className="text-lg font-black leading-tight text-slate-900">{partner.name}</p>
                        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{categoryLabels[partner.category]}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onTogglePublish(partner.id, partner.is_published)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 transition ${partner.is_published ? 'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100' : 'bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200'}`}
                      >
                        {partner.is_published ? 'Published' : 'Draft'}
                      </button>
                    </div>

                    {expanded && <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {partner.website_url && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Website</p>
                          <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[11px] font-medium text-blue-700 transition hover:text-blue-800">{partner.website_url}</a>
                        </div>
                      )}

                      {partner.contact_phone && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Nomor Kontak</p>
                          <a href={waLink(partner.contact_phone, getPartnerWaMessage(partner))} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] font-medium text-green-700 transition hover:text-green-800">{partner.contact_phone}</a>
                        </div>
                      )}

                      {partner.contact_name && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 sm:col-span-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Kontak</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-700">{partner.contact_name}</p>
                        </div>
                      )}
                    </div>}

                    {expanded && linkedEvents.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Kategori Event</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {linkedEvents.slice(0, 3).map((entry) => (
                            <span key={`${partner.id}-${entry.title}-${entry.role}`} className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700 ring-1 ring-violet-200">{entry.role} · {entry.title}</span>
                          ))}
                          {linkedEvents.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">+{linkedEvents.length - 3}</span>}
                        </div>
                      </div>
                    )}

                    {expanded && partner.notes && (
                      <div className="mt-3">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Catatan</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">{partner.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button onClick={() => setViewPartner(partner)} className="rounded-xl bg-violet-50 px-3 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">Lihat Histori</button>
                  <button onClick={() => onEdit(partner)} className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">Edit</button>
                  <button onClick={() => handleDelete(partner)} className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100">Hapus</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewImage && (
        <Modal open onClose={() => setViewImage(null)} title="Logo Partner" size="lg">
          <div className="space-y-4">
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <img src={viewImage} alt="Preview logo partner" className="max-h-[70vh] w-full object-contain" />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setViewImage(null)} className="btn-primary">Tutup</button>
            </div>
          </div>
        </Modal>
      )}

      {deletePartner && (
        <Modal open onClose={() => setDeletePartner(null)} title="Hapus Partner?" size="sm">
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm leading-6 text-slate-700">
                Yakin ingin menghapus <span className="font-extrabold text-slate-900">{deletePartner.name}</span>?
              </p>
              <p className="mt-2 text-xs leading-5 text-red-700">
                Semua data histori partner di event terkait juga akan ikut terhapus.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeletePartner(null)} className="btn-secondary">Batal</button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deletePartner.id);
                  setDeletePartner(null);
                }}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewPartner && (
        <Modal open onClose={() => setViewPartner(null)} title="Detail Partner" size="lg">
          <div className="space-y-5">
            <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                {viewPartner.logo_url ? <img src={viewPartner.logo_url} alt={viewPartner.name} className="h-full w-full object-contain p-2" /> : <Users className="h-8 w-8 text-slate-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Partner</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-900">{viewPartner.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTogglePublish(viewPartner.id, viewPartner.is_published)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 transition ${viewPartner.is_published ? 'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100' : 'bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200'}`}
                  >
                    {viewPartner.is_published ? 'Published' : 'Draft'}
                  </button>
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{viewPartner.category}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {viewPartner.website_url && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Website</p>
                  <p className="mt-1 break-all text-sm font-medium text-slate-700">{viewPartner.website_url}</p>
                </div>
              )}
              {viewPartner.contact_name && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Nama Kontak</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{viewPartner.contact_name}</p>
                </div>
              )}
              {viewPartner.contact_phone && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Nomor Kontak</p>
                  <a href={waLink(viewPartner.contact_phone, getPartnerWaMessage(viewPartner))} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-slate-700 transition hover:text-blue-700">{viewPartner.contact_phone}</a>
                </div>
              )}
            </div>

            {viewPartner.notes && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Catatan</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{viewPartner.notes}</p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Histori Event</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">{getLinkedEvents(viewPartner.id).length} event</span>
              </div>
              {getLinkedEvents(viewPartner.id).length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada event yang terhubung dengan partner ini.</p>
              ) : (
                <div className="space-y-2">
                  {getLinkedEvents(viewPartner.id).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">{entry.title}</p>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">{entry.role}</span>
                      </div>
                      {entry.eventDate && <p className="mt-1 text-[11px] text-slate-500">Tanggal: {formatDate(entry.eventDate)}</p>}
                      {(entry.picName || entry.picPhone) && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {entry.picName && <span>PIC: {entry.picName}</span>}
                          {entry.picPhone && <span>{entry.picName ? ' · ' : 'PIC: '}{entry.picPhone}</span>}
                        </div>
                      )}
                      {entry.notes && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-500">Dukungan / Bentuk Kerja Sama:\n{entry.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => window.print()} className="btn-secondary">Print Laporan</button>
              <button type="button" onClick={() => onEdit(viewPartner)} className="btn-secondary">Edit</button>
              <button type="button" onClick={() => setViewPartner(null)} className="btn-primary">Tutup</button>
            </div>

            <div className="print-sheet">
              <div className="print-brand">
                <img src={LOGO_URL} alt="Logo Standupindo Cilegon" />
                <div>
                  <h1>LAPORAN PARTNER - {viewPartner.name}</h1>
                  <p>{viewPartner.category}</p>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Nama Event</th>
                    <th>Tanggal</th>
                    <th>Role</th>
                    <th>Dukungan / Bentuk Kerja Sama</th>
                    <th>PIC</th>
                    <th>Kontak PIC</th>
                  </tr>
                </thead>
                <tbody>
                  {getLinkedEvents(viewPartner.id).map((entry, index) => (
                    <tr key={entry.id}>
                      <td>{index + 1}</td>
                      <td>{entry.title}</td>
                      <td>{entry.eventDate ? formatDate(entry.eventDate) : '-'}</td>
                      <td>{entry.role}</td>
                      <td>{entry.notes || '-'}</td>
                      <td>{entry.picName || '-'}</td>
                      <td>{entry.picPhone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function KomikaManagement({ rows, registrations, openMics, attendanceCounts, loading, onReload, onAdd, onEdit, onDelete }: { rows: Komika[]; registrations: OpenMicRegistration[]; openMics: OpenMic[]; attendanceCounts: Record<string, number>; loading: boolean; onReload: () => Promise<void>; onAdd: () => void; onEdit: (row: Komika) => void; onDelete: (id: string) => void }) {
  const [viewKomika, setViewKomika] = useState<Komika | null>(null);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'active' | 'archived'>('active');
  const [historySaving, setHistorySaving] = useState(false);
  const [deleteHistoryTarget, setDeleteHistoryTarget] = useState<OpenMicRegistration | null>(null);
  const folderRows = rows.filter((row) => row.status === folder);
  const filteredRows = folderRows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.full_name.toLowerCase().includes(query) || row.stage_name.toLowerCase().includes(query) || row.specialties.join(' ').toLowerCase().includes(query);
  });
  const printRows = [...rows].sort((first, second) => first.stage_name.localeCompare(second.stage_name, 'id', { sensitivity: 'base' }));
  const history = viewKomika ? registrations.filter((registration) => registration.komika_id === viewKomika.id).sort((first, second) => second.created_at.localeCompare(first.created_at)) : [];

  async function deleteHistory() {
    if (!deleteHistoryTarget) return;
    setHistorySaving(true);
    const { error } = await supabase.from('open_mic_registrations').delete().eq('id', deleteHistoryTarget.id);
    setHistorySaving(false);
    if (!error) {
      setDeleteHistoryTarget(null);
      await onReload();
    }
  }

  function printKomikaHistory() {
    document.body.dataset.printMode = 'komika-history';
    window.setTimeout(() => {
      window.print();
      delete document.body.dataset.printMode;
    }, 0);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-slate-900">Komika</h1><p className="mt-1 text-sm text-slate-500">Kelola profil komika yang tampil di website.</p></div>
        <div className="flex gap-2"><button onClick={() => window.print()} className="btn-secondary"><Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span></button><button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Tambah</span></button></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setFolder('active')} className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${folder === 'active' ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100'}`}>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${folder === 'active' ? 'bg-white' : 'bg-slate-50'}`}><FolderOpen className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold">Komika Aktif</span><span className="mt-0.5 block text-xs opacity-70">{rows.filter((row) => row.status === 'active').length} profil</span></span>
        </button>
        <button onClick={() => setFolder('archived')} className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${folder === 'archived' ? 'border-slate-300 bg-slate-100 text-slate-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${folder === 'archived' ? 'bg-white' : 'bg-slate-50'}`}><Archive className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold">Archived</span><span className="mt-0.5 block text-xs opacity-70">{rows.filter((row) => row.status === 'archived').length} profil</span></span>
        </button>
      </div>

      <div className="print-sheet">
        <div className="print-brand"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" /><div><h1>DAFTAR KOMIKA KOMUNITAS STANDUPINDO CILEGON</h1><p>Urut alfabetis berdasarkan nama panggung</p></div></div>
        <table>
          <thead><tr><th>No.</th><th>Foto</th><th>Nama Lengkap</th><th>Nama Panggung</th><th>Spesialis</th><th>Bergabung</th><th>Status</th></tr></thead>
          <tbody>{printRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.photo ? <img src={row.photo} alt="" style={{ width: '16mm', height: '16mm', objectFit: 'cover' }} /> : '-'}</td><td>{row.full_name}</td><td>{row.stage_name}</td><td>{row.specialties.join(', ') || '-'}</td><td>{row.joined_at || '-'}</td><td>{row.status === 'active' ? 'Aktif' : 'Tidak Aktif'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Cari ${folder === 'archived' ? 'komika archived' : 'komika aktif'} atau specialty...`} className="input-field pl-10" aria-label="Cari komika" />
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-4">Nama Lengkap / Stage Name</th><th className="px-5 py-4">Specialties</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Memuat data...</td></tr> : filteredRows.map((k) => (
                <tr key={k.id} onClick={() => setViewKomika(k)} className="cursor-pointer hover:bg-slate-50/70">
                  <td className="px-5 py-4"><div className="flex items-center gap-3">{k.photo ? <img src={k.photo} alt={k.stage_name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-slate-200" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100"><Users className="h-5 w-5" /></div>}<div><p className="font-semibold text-slate-800">{k.full_name}</p><p className="text-xs text-slate-500">{k.stage_name}</p></div></div></td>
                  <td className="px-5 py-4 text-slate-500"><span>{k.specialties.join(', ') || '—'}</span><span className="mt-1 block text-xs font-semibold text-slate-400">{attendanceCounts[k.id] ?? 0}x Tampil</span></td>
                  <td className="px-5 py-4"><StatusBadge status={k.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      {k.whatsapp && <a href={waLink(k.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="rounded-lg p-2 text-green-600 hover:bg-green-50 hover:text-green-700" title="Hubungi via WhatsApp" aria-label={`Hubungi ${k.stage_name} via WhatsApp`}><MessageCircle className="h-4 w-4" /></a>}
                      <button onClick={(event) => { event.stopPropagation(); onEdit(k); }} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={(event) => { event.stopPropagation(); onDelete(k.id); }} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">{search ? 'Komika tidak ditemukan.' : 'Belum ada data.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:hidden">
        {loading ? (
          <>{[1,2,3,4].map((n) => <div key={n} className="h-48 skeleton" />)}</>
        ) : filteredRows.length === 0 ? (
          <div className="col-span-full"><AdminEmptyState title={search ? 'Komika tidak ditemukan.' : folder === 'archived' ? 'Belum ada Komika Archived.' : 'Belum ada Komika Aktif.'} /></div>
        ) : filteredRows.map((k) => (
          <div key={k.id} onClick={() => setViewKomika(k)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setViewKomika(k); }} role="button" tabIndex={0} className="cursor-pointer overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md">
            {k.photo ? (
              <img src={k.photo} alt={k.stage_name} className="h-32 w-full object-cover" />
            ) : (
              <div className="flex h-32 w-full items-center justify-center bg-slate-100"><Users className="h-8 w-8 text-slate-300" /></div>
            )}
            <div className="p-3">
              <p className="font-bold text-slate-900">{k.full_name}</p>
              <p className="text-xs font-medium text-blue-700">{k.stage_name}</p>
              <p className="text-xs text-slate-500">{k.specialties.join(', ') || '—'}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-400">{attendanceCounts[k.id] ?? 0}x Tampil</p>
              {k.joined_at && <p className="mt-1 text-[11px] text-slate-400">Bergabung {k.joined_at}</p>}
              <div className="mt-2"><StatusBadge status={k.status} /></div>
              <div className="mt-3 flex gap-2">
                {k.whatsapp && <a href={waLink(k.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700 transition hover:bg-green-100" title="Hubungi via WhatsApp" aria-label={`Hubungi ${k.stage_name} via WhatsApp`}><MessageCircle className="h-4 w-4" /></a>}
                <button onClick={(event) => { event.stopPropagation(); onEdit(k); }} className="flex-1 rounded-lg bg-blue-50 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">Edit</button>
                <button onClick={(event) => { event.stopPropagation(); onDelete(k.id); }} className="flex-1 rounded-lg bg-red-50 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100">Hapus</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(viewKomika)} onClose={() => setViewKomika(null)} title="Detail Komika" size="lg">
        {viewKomika && (
          <div className="-mx-1 space-y-5 sm:space-y-6">
            <div className="grid gap-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
              <div className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                {viewKomika.photo ? <img src={viewKomika.photo} alt={viewKomika.stage_name} className="h-48 w-full object-contain sm:h-auto sm:aspect-[4/4.5]" /> : <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-50 text-5xl font-extrabold text-blue-700 sm:h-auto sm:aspect-[4/4.5]">{viewKomika.stage_name.charAt(0)}</div>}
              </div>
              <div className="min-w-0 space-y-3 sm:space-y-4 sm:pt-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Komika</p><h4 className="mt-1 truncate text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">{viewKomika.stage_name}</h4><p className="mt-1 truncate text-sm font-medium text-slate-500">{viewKomika.full_name}</p></div>
                  <StatusBadge status={viewKomika.status} />
                </div>
                {viewKomika.specialties.length > 0 && <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Specialties</p><div className="mt-2 flex flex-wrap gap-2">{viewKomika.specialties.map((specialty) => <span key={specialty} className="chip">{specialty}</span>)}</div></div>}
                {viewKomika.bio && <div className="border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Bio</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{viewKomika.bio}</p></div>}
                <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
                  <SocialIconButton instagram={viewKomika.instagram_url} tiktok={viewKomika.tiktok_url} youtube={viewKomika.youtube_url} />
                  {viewKomika.whatsapp && <a href={waLink(viewKomika.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-700 transition hover:bg-green-100" title="Hubungi via WhatsApp" aria-label={`Hubungi ${viewKomika.stage_name} via WhatsApp`}><MessageCircle className="h-4 w-4" /></a>}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><CalendarDays className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">Bergabung</p><p className="text-sm font-semibold text-slate-700">{viewKomika.joined_at || 'Belum diisi'}</p></div></div>
              <button onClick={() => { setViewKomika(null); onEdit(viewKomika); }} className="btn-secondary w-full !border-blue-200 !bg-blue-50 !text-blue-700 sm:w-auto"><Pencil className="h-4 w-4" /> Edit Komika</button>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Riwayat Open Mic</p><p className="mt-0.5 text-xs text-slate-500">Khusus rekaman Komika anggota ini.</p></div><div className="flex items-center gap-2"><button type="button" onClick={printKomikaHistory} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" title="Print riwayat" aria-label="Print riwayat Open Mic"><Printer className="h-4 w-4" /></button><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{attendanceCounts[viewKomika.id] ?? 0}x Tampil</span></div></div>
              {history.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada riwayat Open Mic.</p> : <div className="mt-3 space-y-2">{history.map((registration) => { const historyMic = openMics.find((openMic) => openMic.id === registration.open_mic_id); return <div key={registration.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{historyMic?.title ?? 'Open Mic'}</p><p className="truncate text-xs text-slate-500">{historyMic ? `${formatDate(historyMic.date)} · ${historyMic.venue}` : 'Acara tidak ditemukan'}</p></div><div className="flex shrink-0 items-center gap-1.5"><span className={`rounded-lg px-2 py-1.5 text-[11px] font-bold ${registration.attendance_status === 'attended' ? 'bg-green-100 text-green-700' : registration.attendance_status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{registration.attendance_status === 'attended' ? 'Tampil' : registration.attendance_status === 'absent' ? 'Tidak Tampil' : 'Belum Dicek'}</span><button type="button" onClick={() => setDeleteHistoryTarget(registration)} disabled={historySaving} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Hapus riwayat"><Trash2 className="h-3.5 w-3.5" /></button></div></div>; })}</div>}
            </div>
          </div>
        )}
      </Modal>
      {viewKomika && <div className="print-sheet komika-history-print">
        <div className="print-brand"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" /><div><h1>RIWAYAT OPEN MIC KOMIKA</h1><p>Standupindo Cilegon</p></div></div>
        <div className="komika-print-profile"><strong>{viewKomika.full_name}</strong><span>Stage Name: {viewKomika.stage_name}</span><span>Komunitas: Standupindo Cilegon</span></div>
        <div className="komika-print-summary"><span>Total tampil: <strong>{attendanceCounts[viewKomika.id] ?? 0}</strong></span><span>Total riwayat: <strong>{history.length}</strong></span><span>Tidak tampil / belum dicek: <strong>{history.length - (attendanceCounts[viewKomika.id] ?? 0)}</strong></span></div>
        <table><thead><tr><th>No.</th><th>Nama Open Mic</th><th>Tanggal</th><th>Tempat</th><th>Status</th></tr></thead><tbody>{history.map((registration, index) => { const historyMic = openMics.find((openMic) => openMic.id === registration.open_mic_id); return <tr key={registration.id}><td>{index + 1}</td><td>{historyMic?.title ?? 'Open Mic'}</td><td>{historyMic ? formatDate(historyMic.date) : '-'}</td><td>{historyMic?.venue ?? '-'}</td><td>{registration.attendance_status === 'attended' ? 'Tampil' : registration.attendance_status === 'absent' ? 'Tidak Tampil' : 'Belum Dicek'}</td></tr>; })}</tbody></table>
      </div>}
      <Modal open={Boolean(deleteHistoryTarget)} onClose={() => setDeleteHistoryTarget(null)} title="Hapus Riwayat Open Mic?" size="sm">
        {deleteHistoryTarget && <div className="space-y-4"><p className="text-sm leading-6 text-slate-600">Yakin ingin menghapus rekaman <strong className="text-slate-900">{deleteHistoryTarget.stage_name}</strong> dari riwayat Open Mic ini? Data kehadiran dan hubungan dengan profil Komika akan ikut dihapus.</p><div className="flex gap-3"><button type="button" onClick={() => setDeleteHistoryTarget(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => void deleteHistory()} disabled={historySaving} className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">{historySaving ? 'Menghapus...' : 'Ya, Hapus'}</button></div></div>}
      </Modal>
    </div>
  );
}

function TicketOrdersPage({ orders, events, loading, onStatusChange, onDelete, audienceMode = false }: { orders: TicketOrder[]; events: EventItem[]; loading: boolean; onStatusChange: (id: string, status: TicketOrderStatus) => void; onDelete: (id: string) => void; audienceMode?: boolean }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketOrderStatus>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event.title])), [events]);
  const statusOptions: TicketOrderStatus[] = audienceMode ? ['Lunas', 'Terverifikasi', 'Selesai'] : ['Menunggu Pembayaran', 'Menunggu Verifikasi', 'Lunas', 'Ditolak', 'Expired', 'Sudah Bayar', 'Terverifikasi', 'Selesai', 'Dibatalkan'];

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch = !query || [order.order_number ?? '', order.full_name, order.email ?? '', order.ticket_category, order.notes ?? '', order.whatsapp, eventMap.get(order.event_id) ?? ''].join(' ').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesEvent = eventFilter === 'all' || order.event_id === eventFilter;
      return matchesSearch && matchesStatus && matchesEvent;
    });
  }, [eventFilter, eventMap, orders, search, statusFilter]);

  function printTicketOrders() {
    document.body.dataset.printMode = 'ticket-orders';
    window.setTimeout(() => {
      window.print();
      delete document.body.dataset.printMode;
    }, 0);
  }

  const selectedEventTitle = eventFilter === 'all' ? 'Semua Event' : eventMap.get(eventFilter) ?? 'Event tidak ditemukan';
  const selectedStatusTitle = statusFilter === 'all' ? 'Semua Status' : statusFilter;

  async function openTicketOrderWhatsApp(order: TicketOrder) {
    const popup = window.open('about:blank', '_blank');
    if (!popup) return;

    const { data } = await supabase.from('ticket_orders').select('*').eq('id', order.id).maybeSingle();
    const latestOrder = (data as TicketOrder | null) ?? order;
    const eventTitle = eventMap.get(latestOrder.event_id) ?? 'Event';
    const href = generateTicketOrderWhatsAppUrl(latestOrder.whatsapp, latestOrder, eventTitle, latestOrder.status);
    if (href === '#') {
      popup.close();
      return;
    }
    popup.location.href = href;
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader title={audienceMode ? 'Penonton' : 'Order Tiket'} subtitle={`${filteredOrders.length} ${audienceMode ? 'order lunas' : 'order'} sesuai filter.`} eyebrow={audienceMode ? 'Event Workspace' : 'Ticket Workspace'} action={<button type="button" onClick={printTicketOrders} disabled={loading || filteredOrders.length === 0} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" title="Print data sesuai filter" aria-label="Print data sesuai filter"><Printer className="h-4 w-4" /></button>} />

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, nomor order, atau WhatsApp..."
            className="input-field !text-slate-900 pl-10"
            aria-label="Cari data penonton"
          />
        </div>

        <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="input-field !text-slate-900">
          <option value="all">Semua Event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.title}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
        >
          Semua
        </button>
        {statusOptions.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${statusFilter === status ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-24 skeleton rounded-2xl" />)}</div>
      ) : filteredOrders.length === 0 ? (
        <AdminEmptyState title={search || statusFilter !== 'all' || eventFilter !== 'all' ? 'Data penonton tidak ditemukan.' : 'Belum ada pemesanan tiket.'} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1380px] table-auto text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">No. Pesanan</th>
                    <th className="whitespace-nowrap px-4 py-3">Nama</th>
                    <th className="whitespace-nowrap px-4 py-3">Email</th>
                    <th className="whitespace-nowrap px-4 py-3">WhatsApp</th>
                    <th className="min-w-[180px] px-4 py-3">Event</th>
                    <th className="whitespace-nowrap px-4 py-3">Kategori</th>
                    <th className="whitespace-nowrap px-4 py-3">Jumlah</th>
                    <th className="whitespace-nowrap px-4 py-3">Harga Satuan</th>
                    <th className="whitespace-nowrap px-4 py-3">Total</th>
                    <th className="min-w-[150px] px-4 py-3">Catatan</th>
                    <th className="whitespace-nowrap px-4 py-3">Waktu</th>
                    <th className="min-w-[175px] whitespace-nowrap px-4 py-3">Status</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{order.order_number || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{order.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{order.email || '—'}</td>
                      <td className="px-4 py-3">
                        {audienceMode ? order.whatsapp : <button type="button" onClick={() => void openTicketOrderWhatsApp(order)} className="font-medium text-green-700 hover:text-green-800" title="Kirim pesan WhatsApp sesuai status terbaru" aria-label={`Kirim pesan WhatsApp untuk ${order.order_number || order.full_name}`}>{order.whatsapp}</button>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{eventMap.get(order.event_id) ?? 'Event tidak ditemukan'}</td>
                      <td className="px-4 py-3 text-slate-600">{order.ticket_category}</td>
                      <td className="px-4 py-3 text-slate-600">{order.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{formatPrice(order.unit_price)}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{formatPrice(order.total_price)}</td>
                      <td className="px-4 py-3 text-slate-500">{order.notes || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="min-w-[175px] whitespace-nowrap px-4 py-3">
                        {audienceMode ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ticketOrderStatusTone(order.status)}`}>{order.status}</span> : <select
                          value={order.status}
                          onChange={(event) => onStatusChange(order.id, event.target.value as TicketOrderStatus)}
                          className="input-field !min-h-0 !w-full !min-w-[155px] !py-1.5 !text-xs !font-bold !text-slate-800"
                          aria-label={`Status pesanan ${order.order_number || order.full_name}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>}
                      </td>
                      <td className="px-4 py-3">
                        {!audienceMode && <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => onDelete(order.id)}
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                            title="Hapus pemesanan"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {filteredOrders.map((order) => (
              <div key={order.id} className="rounded-2xl bg-white p-3 shadow-soft ring-1 ring-slate-200/70">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setExpandedOrders((current) => ({ ...current, [order.id]: !current[order.id] }))} className="flex min-w-0 items-start gap-2 text-left">
                    <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expandedOrders[order.id] ? 'rotate-90' : ''}`} />
                    <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-blue-700">{order.order_number || '—'}</p>
                    <p className="mt-0.5 truncate text-base font-extrabold text-slate-950">{order.full_name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">{eventMap.get(order.event_id) ?? 'Event tidak ditemukan'}</p>
                    </div>
                  </button>
                  {!audienceMode && <button type="button" onClick={() => onDelete(order.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50" title="Hapus pemesanan" aria-label={`Hapus pemesanan ${order.order_number || order.full_name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>}
                </div>

                {expandedOrders[order.id] && <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-700">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Email</p>
                    <p className="mt-0.5 truncate font-semibold text-slate-800" title={order.email || '—'}>{order.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">WhatsApp</p>
                    {audienceMode ? <p className="mt-0.5 font-bold text-slate-800">{order.whatsapp}</p> : <button type="button" onClick={() => void openTicketOrderWhatsApp(order)} className="mt-0.5 block font-bold text-green-700" title="Kirim pesan WhatsApp sesuai status terbaru" aria-label={`Kirim pesan WhatsApp untuk ${order.order_number || order.full_name}`}>{order.whatsapp}</button>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Tiket</p>
                    <p className="mt-0.5 font-semibold text-slate-800">{order.ticket_category} · {order.quantity}x</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Total</p>
                    <p className="mt-0.5 font-extrabold text-slate-950">{formatPrice(order.total_price)}</p>
                  </div>
                </div>}

                {expandedOrders[order.id] && order.notes && (
                  <div className="mt-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs leading-4 text-slate-700">
                    <span className="font-bold text-slate-500">Catatan: </span>{order.notes}
                  </div>
                )}

                {!audienceMode && <div className="mt-2.5 flex items-center gap-2">
                  <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</p>
                  <select
                    value={order.status}
                    onChange={(event) => onStatusChange(order.id, event.target.value as TicketOrderStatus)}
                    className="input-field !min-h-0 !w-full !min-w-0 flex-1 !py-1.5 !text-xs !font-bold !text-slate-800"
                    aria-label={`Status pesanan ${order.order_number || order.full_name}`}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>}
                {audienceMode && <div className="mt-2.5 flex items-center gap-2"><p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ticketOrderStatusTone(order.status)}`}>{order.status}</span></div>}
              </div>
            ))}
          </div>

          <div className="print-sheet ticket-orders-print">
            <div className="print-brand">
              <img src={LOGO_URL} alt="Logo Standupindo Cilegon" />
              <div>
                <h1>DATA PENONTON</h1>
                <p>Standupindo Cilegon · {selectedEventTitle} · {selectedStatusTitle}</p>
                {search.trim() && <p>Pencarian: {search.trim()}</p>}
              </div>
            </div>
            <table>
              <thead>
                <tr><th>No. Pesanan</th><th>Nama</th><th>Email</th><th>WhatsApp</th><th>Tiket</th><th>Jumlah</th><th>Total</th><th>Waktu</th><th>Status</th><th>Catatan</th></tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_number || '-'}</td>
                    <td>{order.full_name}</td>
                    <td>{order.email || '-'}</td>
                    <td>{order.whatsapp}</td>
                    <td>{eventMap.get(order.event_id) ?? 'Event tidak ditemukan'}<br />{order.ticket_category}</td>
                    <td>{order.quantity}</td>
                    <td>{formatPrice(order.total_price)}</td>
                    <td>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{order.status}</td>
                    <td>{order.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EvaluatorAssignmentView({ openMics, komika, assignments, currentUserId, onReload, onNotice }: { openMics: OpenMic[]; komika: Komika[]; assignments: EvaluatorAssignment[]; currentUserId: string | null; onReload: () => Promise<void>; onNotice: (message: string) => void }) {
  const [openMicId, setOpenMicId] = useState<string>('');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [openMicSearch, setOpenMicSearch] = useState('');
  const [openMicPickerOpen, setOpenMicPickerOpen] = useState(false);
  const [evaluatorUserId, setEvaluatorUserId] = useState('');
  const [evaluatorSearch, setEvaluatorSearch] = useState('');
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [deleteAssignment, setDeleteAssignment] = useState<EvaluatorAssignment | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState<Set<string>>(new Set());
  const assignedEvaluatorIds = new Set(assignments.filter((assignment) => assignment.status === 'active' && (scope === 'all' || assignment.open_mic_id === null || assignment.open_mic_id === openMicId)).map((assignment) => assignment.evaluator_user_id));
  const evaluatorProfiles = komika
    .filter((profile) => profile.user_id && !assignedEvaluatorIds.has(profile.user_id))
    .sort((a, b) => a.stage_name.localeCompare(b.stage_name, 'id', { sensitivity: 'base' }));
  const filteredEvaluatorProfiles = evaluatorProfiles.filter((profile) => `${profile.stage_name} ${profile.full_name}`.toLowerCase().includes(evaluatorSearch.trim().toLowerCase()));
  const selectedEvaluator = komika.find((profile) => profile.user_id === evaluatorUserId);
  const selectedOpenMic = openMics.find((mic) => mic.id === openMicId);
  const filteredOpenMics = openMics
    .filter((mic) => mic.title.toLowerCase().includes(openMicSearch.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' }));
  const visibleAssignments = assignments.filter((assignment) => {
    const mic = openMics.find((row) => row.id === assignment.open_mic_id);
    const evaluator = komika.find((profile) => profile.user_id === assignment.evaluator_user_id);
    const searchText = `${mic?.title ?? 'Semua Open Mic'} ${evaluator?.stage_name ?? ''} ${evaluator?.full_name ?? ''} ${assignment.status}`.toLowerCase();
    return searchText.includes(assignmentSearch.trim().toLowerCase());
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if ((scope === 'selected' && !openMicId.trim()) || !evaluatorUserId.trim()) {
      onNotice(`${scope === 'selected' ? 'Pilih Open Mic dan ' : ''}nama evaluator.`);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('evaluator_assignments').insert({
      open_mic_id: scope === 'all' ? null : openMicId,
      evaluator_user_id: evaluatorUserId,
      assigned_by: currentUserId,
      status,
    });
    setSaving(false);

    if (error) {
      onNotice('Gagal menambah assignment evaluator: ' + error.message);
      return;
    }

    const { data: roleData, error: roleError } = await supabase.functions.invoke('admin-manage-members', {
      body: { action: 'update-role', user_id: evaluatorUserId, role: 'evaluator' },
    });

    setOpenMicId('');
    setScope('all');
    setOpenMicSearch('');
    setOpenMicPickerOpen(false);
    setEvaluatorUserId('');
    setEvaluatorSearch('');
    setEvaluatorPickerOpen(false);
    setStatus('active');
    onNotice(roleError || roleData?.error ? 'Assignment tersimpan, tetapi role akun belum berubah. Coba ubah role dari menu Akun Member.' : 'Assignment evaluator berhasil disimpan dan akun ditetapkan sebagai Evaluator.');
    await onReload();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('evaluator_assignments').delete().eq('id', id);
    if (error) {
      onNotice('Gagal menghapus assignment evaluator.');
      return;
    }
    setDeleteAssignment(null);
    onNotice('Assignment evaluator berhasil dihapus.');
    await onReload();
  }

  async function handleToggle(assignment: EvaluatorAssignment) {
    const nextStatus = assignment.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('evaluator_assignments').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', assignment.id);
    if (error) {
      onNotice('Gagal mengubah status assignment evaluator: ' + error.message);
      return;
    }
    onNotice(`Assignment evaluator ${nextStatus === 'active' ? 'diaktifkan' : 'dinonaktifkan'}.`);
    await onReload();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Evaluator Assignment</h1>
        <p className="mt-1 text-sm text-slate-500">Tetapkan evaluator ke Open Mic berdasarkan profil komika yang sudah terhubung ke akun.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <span className="label-field">Cakupan assignment</span>
            <div className="grid gap-2">
              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${scope === 'all' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
                <input type="radio" name="evaluator-scope" value="all" checked={scope === 'all'} onChange={() => { setScope('all'); setOpenMicPickerOpen(false); }} className="mt-0.5 h-4 w-4 text-blue-600" />
                <span><span className="block text-sm font-bold text-slate-900">Semua Open Mic</span><span className="mt-0.5 block text-xs text-slate-500">Termasuk Open Mic baru</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${scope === 'selected' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
                <input type="radio" name="evaluator-scope" value="selected" checked={scope === 'selected'} onChange={() => setScope('selected')} className="mt-0.5 h-4 w-4 text-blue-600" />
                <span><span className="block text-sm font-bold text-slate-900">Open Mic tertentu</span><span className="mt-0.5 block text-xs text-slate-500">Pilih satu Open Mic</span></span>
              </label>
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="label-field" htmlFor="eval-open-mic">Open Mic pilihan</label>
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="eval-open-mic"
                  value={scope === 'all' ? 'Semua Open Mic' : selectedOpenMic?.title ?? openMicSearch}
                  onChange={(e) => { setOpenMicId(''); setOpenMicSearch(e.target.value); setOpenMicPickerOpen(true); }}
                  onFocus={() => scope === 'selected' && setOpenMicPickerOpen(true)}
                  disabled={scope === 'all'}
                  className="input-field !pr-10 !pl-10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  placeholder="Cari Open Mic..."
                  autoComplete="off"
                />
                <button type="button" onClick={() => setOpenMicPickerOpen((value) => !value)} disabled={scope === 'all'} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Buka pilihan Open Mic">
                  <ChevronRight className={`h-4 w-4 transition-transform ${openMicPickerOpen ? 'rotate-90 text-blue-600' : ''}`} />
                </button>
              </div>
              {openMicPickerOpen && scope === 'selected' && <>
                <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMicPickerOpen(false)} aria-label="Tutup pilihan Open Mic" />
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {filteredOpenMics.map((mic) => <button key={mic.id} type="button" onClick={() => { setOpenMicId(mic.id); setOpenMicSearch(''); setOpenMicPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:bg-blue-50">{mic.title}{mic.id === openMicId && <Check className="h-4 w-4 shrink-0 text-blue-600" />}</button>)}
                  {filteredOpenMics.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Open Mic tidak ditemukan.</p>}
                </div>
              </>}
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="label-field" htmlFor="eval-komika">Akun Evaluator</label>
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="eval-komika"
                  value={selectedEvaluator ? selectedEvaluator.stage_name : evaluatorSearch}
                  onChange={(e) => { setEvaluatorUserId(''); setEvaluatorSearch(e.target.value); setEvaluatorPickerOpen(true); }}
                  onFocus={() => setEvaluatorPickerOpen(true)}
                  className="input-field !pr-10 !pl-10"
                  placeholder="Cari akun evaluator..."
                  autoComplete="off"
                />
                <button type="button" onClick={() => setEvaluatorPickerOpen((value) => !value)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Buka pilihan evaluator">
                  <ChevronRight className={`h-4 w-4 transition-transform ${evaluatorPickerOpen ? 'rotate-90 text-blue-600' : ''}`} />
                </button>
              </div>
              {evaluatorPickerOpen && <>
                <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setEvaluatorPickerOpen(false)} aria-label="Tutup pilihan evaluator" />
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {filteredEvaluatorProfiles.map((profile) => <button key={profile.id} type="button" onClick={() => { setEvaluatorUserId(profile.user_id ?? ''); setEvaluatorSearch(''); setEvaluatorPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{profile.stage_name}</span><span className="block truncate text-xs text-slate-500">{profile.full_name}</span></span>{profile.user_id === evaluatorUserId && <Check className="h-4 w-4 shrink-0 text-blue-600" />}</button>)}
                  {filteredEvaluatorProfiles.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">{evaluatorProfiles.length === 0 ? 'Semua akun yang tersedia sudah terdaftar.' : 'Akun evaluator tidak ditemukan.'}</p>}
                </div>
              </>}
            </div>
            {evaluatorProfiles.length === 0 && <p className="mt-1.5 text-xs text-amber-600">Semua akun evaluator sudah terdaftar untuk cakupan ini.</p>}
          </div>

          <div className="md:col-span-1">
            <span className="label-field">Status Assignment</span>
            <label className="flex min-h-[50px] cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-blue-300">
              <span>
                <span className="block text-sm font-bold text-slate-900">{status === 'active' ? 'Aktif' : 'Nonaktif'}</span>
                <span className="block text-xs text-slate-500">{status === 'active' ? 'Bisa membuka evaluasi' : 'Akses evaluasi dimatikan'}</span>
              </span>
              <span className={`relative h-6 w-11 rounded-full transition-colors ${status === 'active' ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                <input id="eval-status" type="checkbox" checked={status === 'active'} onChange={(e) => setStatus(e.target.checked ? 'active' : 'inactive')} className="peer sr-only" />
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Menyimpan...' : 'Simpan Assignment'}
          </button>
        </div>
      </form>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
        <h2 className="text-lg font-extrabold text-slate-900">Daftar Assignment</h2>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={assignmentSearch} onChange={(e) => setAssignmentSearch(e.target.value)} className="input-field !pl-10" placeholder="Cari Open Mic atau evaluator..." aria-label="Cari assignment" />
        </div>
        <div className="mt-4 space-y-3">
          {assignments.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada assignment evaluator.</div>
          ) : visibleAssignments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">Assignment tidak ditemukan.</div>
          ) : visibleAssignments.map((assignment) => {
            const mic = openMics.find((row) => row.id === assignment.open_mic_id);
            const evaluator = komika.find((profile) => profile.user_id === assignment.evaluator_user_id);
            const isExpanded = expandedAssignmentIds.has(assignment.id);
            return (
              <div key={assignment.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <button type="button" onClick={() => setExpandedAssignmentIds((current) => { const next = new Set(current); if (next.has(assignment.id)) next.delete(assignment.id); else next.add(assignment.id); return next; })} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                  <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-slate-950">{mic?.title ?? (assignment.open_mic_id === null ? 'Semua Open Mic' : 'Open Mic Tidak Ditemukan')}</span><span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{evaluator?.stage_name ?? 'Profil Komika Tidak Ditemukan'}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] ${assignment.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{assignment.status === 'active' ? 'Aktif' : 'Nonaktif'}</span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></span>
                </button>
                {isExpanded && <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">{assignment.open_mic_id === null ? 'Semua Open Mic' : 'Open Mic tertentu'}</span><div className="ml-auto flex items-center gap-1.5"><button type="button" onClick={() => void handleToggle(assignment)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm transition hover:bg-amber-600" title={assignment.status === 'active' ? 'Nonaktifkan assignment' : 'Aktifkan assignment'} aria-label={assignment.status === 'active' ? 'Nonaktifkan assignment' : 'Aktifkan assignment'}><Power className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeleteAssignment(assignment)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition hover:bg-red-700" title="Hapus assignment" aria-label="Hapus assignment"><Trash2 className="h-3.5 w-3.5" /></button></div></div>}
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={Boolean(deleteAssignment)} onClose={() => setDeleteAssignment(null)} title="Hapus Assignment" size="sm">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">Hapus assignment untuk <span className="font-bold text-slate-900">{deleteAssignment?.open_mic_id === null ? 'Semua Open Mic' : openMics.find((mic) => mic.id === deleteAssignment?.open_mic_id)?.title ?? 'Open Mic ini'}</span>?</p>
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium leading-5 text-amber-800">Evaluator tidak lagi dapat membuka evaluasi dari assignment ini.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleteAssignment(null)} className="btn-secondary flex-1">Batal</button>
            <button type="button" onClick={() => deleteAssignment && void handleDelete(deleteAssignment.id)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(220,38,38,0.2)] transition hover:bg-red-700"><Trash2 className="h-4 w-4" /> Hapus</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MorePage({ onNavigate, onSignOut, ticketOrderUnreadCount, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner }: { onNavigate: (s: Section) => void; onSignOut: () => void; ticketOrderUnreadCount: number; isAdmin: boolean; isOpenMicAdmin: boolean; isEventAdmin: boolean; isTicketAdmin: boolean; isQrScanner: boolean }) {
  const items: { label: string; icon: typeof BarChart3; onClick: () => void; section?: Section; badge?: number }[] = [
    ...(isEventAdmin ? [{ label: 'Akun Admin Tiket / QR', icon: ShieldPlus, onClick: () => onNavigate('admin-accounts'), section: 'admin-accounts' as Section }] : []),
    ...(isTicketAdmin ? [{ label: 'Informasi Pembayaran', icon: TicketIcon, onClick: () => onNavigate('payment-info'), section: 'payment-info' as Section }] : []),
    ...(isTicketAdmin ? [{ label: 'Laporan Tiket', icon: Printer, onClick: () => onNavigate('ticket-report'), section: 'ticket-report' as Section }] : []),
    ...(isQrScanner ? [{ label: 'Laporan Check-in', icon: Printer, onClick: () => onNavigate('check-in-report'), section: 'check-in-report' as Section }] : []),
    ...(isQrScanner ? [{ label: 'Riwayat Scan', icon: TicketIcon, onClick: () => onNavigate('tickets'), section: 'tickets' as Section }] : []),
    { label: 'Gabung Komunitas', icon: UserPlus, onClick: () => onNavigate('applications'), section: 'applications' },
    ...(!isEventAdmin && !isTicketAdmin ? [{ label: 'Data Penonton', icon: TicketIcon, onClick: () => onNavigate('ticket-orders'), section: 'ticket-orders' as Section, badge: ticketOrderUnreadCount }] : []),
    { label: 'Akun Member', icon: UserPlus, onClick: () => onNavigate('member-accounts'), section: 'member-accounts' },
    ...(isAdmin ? [{ label: 'Akun Admin', icon: ShieldPlus, onClick: () => onNavigate('admin-accounts'), section: 'admin-accounts' as Section }] : []),
    ...(!isAdmin ? [{ label: 'Pengaturan Profil', icon: Settings, onClick: () => onNavigate('profile-settings'), section: 'profile-settings' as Section }] : []),
    { label: 'Evaluator', icon: Users, onClick: () => onNavigate('evaluator'), section: 'evaluator' },
    { label: 'Settings', icon: Settings, onClick: () => onNavigate('settings'), section: 'settings' },
  ];
  return (
    <div className="space-y-5">
      <WorkspacePageHeader title={isTicketAdmin ? 'Lainnya' : 'More'} subtitle="Menu lainnya." eyebrow={isTicketAdmin ? 'Admin Tiket' : undefined} />
      <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
        <div className="divide-y divide-slate-100">
          {items.filter((item) => !item.section || canAccessSection(item.section, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin, isQrScanner)).map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={item.onClick} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
                {item.badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-extrabold text-white">{item.badge > 99 ? '99+' : item.badge}</span> : null}
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            );
          })}
        </div>
        <div className="border-t border-slate-100">
          <button onClick={onSignOut} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-red-50">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600"><LogOut className="h-5 w-5" /></span>
            <span className="flex-1 text-sm font-semibold text-red-600">Keluar</span>
            <ChevronRight className="h-4 w-4 text-red-300" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EventDocumentationPhotosModal({ event, onClose, onNotice, onSaved }: { event: EventItem | null; onClose: () => void; onNotice: (message: string) => void; onSaved: () => Promise<void> }) {
  const [photos, setPhotos] = useState<string[]>(event?.documentation_photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setPhotos(event?.documentation_photos ?? []);
    setErrorMessage('');
  }, [event]);

  async function savePhotos() {
    if (!event) return;
    setErrorMessage('');
    setSaving(true);
    try {
      const { error } = await supabase.from('events').update({
        documentation_photos: photos,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id);
      if (error) throw error;
      onNotice('Foto dokumentasi berhasil disimpan.');
      await onSaved();
    } catch (saveError) {
      const detail = getErrorMessage(saveError);
      console.error('Foto dokumentasi event gagal disimpan.', saveError);
      const message = `Foto dokumentasi gagal disimpan: ${detail}`;
      setErrorMessage(message);
      onNotice(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(event)} onClose={onClose} title="Foto Dokumentasi" size="md">
      {event && <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-700">{event.title}</p>
        <MultiImageUpload label="Foto Dokumentasi" folder="events" value={photos} onChange={setPhotos} maxFiles={15} onUploadingChange={setUploading} />
        {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{errorMessage}</p>}
        <div className="flex gap-3 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button type="button" onClick={() => void savePhotos()} disabled={saving || uploading} className="btn-primary flex-1">{uploading ? 'Mengupload...' : saving ? 'Menyimpan...' : 'Simpan Foto'}</button>
        </div>
      </div>}
    </Modal>
  );
}

function AdminFormModal({ kind, editing, venueHistory, saving, onClose, onSaving, onNotice, onSaved }: { kind: 'open-mic' | 'event' | 'komika' | 'partner' | null; editing: OpenMic | EventItem | Komika | Partner | null; venueHistory: OpenMic[]; saving: boolean; onClose: () => void; onSaving: (v: boolean) => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [venueSuggestionsOpen, setVenueSuggestionsOpen] = useState(false);
  const [partnerCategoryOpen, setPartnerCategoryOpen] = useState(false);
  useEffect(() => {
    if (!kind) return;
    setErrorMessage('');
    setPartnerCategoryOpen(false);
    const row = editing as Record<string, unknown> | null;
    if (row) {
      setForm({ ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k === 'instagram_url' ? k : k === 'tiktok_url' ? k : k, k === 'instagram_url' ? formatInstagramHandle(String(v ?? '')) : k === 'tiktok_url' ? formatTikTokHandle(String(v ?? '')) : Array.isArray(v) ? v.join(', ') : String(v ?? '')])) });
      if (Array.isArray(row.documentation_photos)) {
        setForm((current) => ({ ...current, documentation_photos: row.documentation_photos.join('\n') }));
      }
    } else if (kind === 'komika') {
      setForm({ full_name: '', whatsapp: '', stage_name: '', photo: '', bio: '', instagram_url: '', tiktok_url: '', youtube_url: '', specialties: '', joined_at: '', status: 'active', published: 'true' });
    } else if (kind === 'open-mic') {
      setForm({ title: '', poster: '', date: '', time: '19.30', venue: '', location: 'Cilegon', maps_url: '', description: 'Open Mic Standupindo Cilegon adalah ruang terbuka bagi siapa saja yang ingin mencoba, belajar, dan mengembangkan kemampuan di dunia stand up comedy.\n\nDi sini, para komika dapat menguji materi baru, mengasah kemampuan menulis dan membawakan jokes, sekaligus mendapatkan pengalaman tampil langsung di depan penonton.\n\nBukan cuma untuk komika, Open Mic juga menjadi ruang bagi masyarakat Cilegon untuk menikmati hiburan, mengenal dunia stand up comedy, dan menjadi bagian dari perkembangan komunitas komedi di Kota Cilegon.', capacity: '20', status: 'upcoming', registration_status: 'open', published: 'true' });
    } else if (kind === 'partner') {
      setForm({ name: '', logo_url: '', website_url: '', contact_name: '', contact_phone: '', notes: '', category: 'sponsor', is_published: 'true', sort_order: '0' });
    } else {
      setForm({ title: '', poster: '', date: '', time: '19.00', venue: '', location: 'Cilegon', maps_url: '', description: '', documentation_photos: '', status: 'upcoming', registration_status: 'closed', published: 'true', whatsapp_number: '', whatsapp_message: '', event_rules: '' });
    }
  }, [kind, editing]);

  if (!kind) return null;
  const isEdit = Boolean(editing);
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const venueQuery = (form.venue ?? '').trim().toLocaleLowerCase();
  const venueHistoryEntries = kind === 'open-mic'
    ? Array.from(venueHistory.reduce((entries, row) => {
      const venue = row.venue.trim();
      if (!venue) return entries;
      const location = row.location.trim();
      const mapsUrl = row.maps_url?.trim() ?? '';
      const key = venue.toLocaleLowerCase();
      const existing = entries.get(key);
      if (!existing || row.date > existing.date) entries.set(key, { venue, location, mapsUrl, date: row.date });
      return entries;
    }, new Map<string, { venue: string; location: string; mapsUrl: string; date: string }>()).values())
      .sort((first, second) => second.date.localeCompare(first.date))
    : [];
  const matchingVenueSuggestions = venueQuery
    ? venueHistoryEntries.filter((entry) => entry.venue.toLocaleLowerCase().includes(venueQuery)).slice(0, 6)
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage('');
    onSaving(true);
    const base = { ...form };
    try {
      if (kind === 'komika') {
        const payload = { ...base, instagram_url: instagramProfileUrl(base.instagram_url), tiktok_url: tiktokProfileUrl(base.tiktok_url), slug: isEdit ? base.slug : slugify(base.stage_name), specialties: (base.specialties || '').split(',').map((s) => s.trim()).filter(Boolean), featured_order: base.featured_order ? Number(base.featured_order) : null, published: base.published !== 'false' };
        const result = editing ? await supabase.from('komika').update(payload).eq('id', editing.id) : await supabase.from('komika').insert(payload);
        if (result.error) throw result.error;
      } else if (kind === 'partner') {
        const payload = {
          ...base,
          logo_url: base.logo_url?.trim() || null,
          website_url: base.website_url?.trim() || null,
          contact_name: base.contact_name?.trim() || null,
          contact_phone: base.contact_phone?.trim() || null,
          notes: base.notes?.trim() || null,
          category: base.category || 'sponsor',
          is_published: base.is_published !== 'false',
          sort_order: Number(base.sort_order) || 0,
        };
        const result = editing ? await supabase.from('partners').update(payload).eq('id', editing.id) : await supabase.from('partners').insert(payload);
        if (result.error) throw result.error;
      } else if (kind === 'open-mic') {
        const payload = { ...base, slug: isEdit ? base.slug : slugify(base.title), capacity: Number(base.capacity), published: base.published !== 'false' };
        const result = editing ? await supabase.from('open_mics').update(payload).eq('id', editing.id) : await supabase.from('open_mics').insert(payload);
        if (result.error) throw result.error;
      } else {
        const whatsappNumber = normalizeWhatsappNumber(base.whatsapp_number || '');
        const eventFields = { ...base };
        delete eventFields.documentation_photos;
        const payload = {
          ...eventFields,
          slug: isEdit ? base.slug : slugify(base.title),
          published: base.published !== 'false',
          whatsapp_number: whatsappNumber,
          whatsapp_message: base.whatsapp_message?.trim() || null,
          event_rules: base.event_rules?.trim() || null,
        };
        const result = editing
          ? await supabase.from('events').update(payload).eq('id', editing.id)
          : await supabase.from('events').insert(payload);
        if (result.error) throw result.error;
      }
      onSaving(false);
      onSaved();
    } catch (saveError) {
      onSaving(false);
      const detail = getErrorMessage(saveError);
      console.error(`${isEdit ? 'Perubahan' : 'Event'} gagal disimpan.`, saveError);
      const message = `Event gagal disimpan: ${detail}`;
      setErrorMessage(message);
      onNotice(message);
    }
  }

  const title = kind === 'komika' ? 'Komika' : kind === 'event' ? 'Event' : kind === 'partner' ? 'Partner' : 'Open Mic';

  const requiredFields = ['title', 'full_name', 'stage_name', 'date', 'time', 'venue', 'name'];

  const fields: [string, string, 'text' | 'textarea' | 'select' | 'date' | 'number'][] = kind === 'komika'
    ? [['full_name', 'Nama Lengkap', 'text'], ['stage_name', 'Stage Name', 'text'], ['whatsapp', 'Nomor WhatsApp (privat, tidak tampil publik)', 'text'], ['joined_at', 'Bergabung (bulan dan tahun)', 'text'], ['bio', 'Bio', 'textarea'], ['instagram_url', 'Instagram (@username)', 'text'], ['tiktok_url', 'TikTok (@username)', 'text'], ['youtube_url', 'YouTube URL', 'text'], ['specialties', 'Specialties (pisahkan koma)', 'textarea'], ['featured_order', 'Urutan tampil (opsional)', 'number'], ['status', 'Status', 'select']]
    : kind === 'open-mic'
    ? [['title', 'Title', 'text'], ['date', 'Date', 'date'], ['time', 'Time', 'text'], ['venue', 'Venue', 'text'], ['location', 'Location', 'text'], ['maps_url', 'Maps URL', 'text'], ['description', 'Description', 'textarea'], ['capacity', 'Capacity', 'number'], ['status', 'Status', 'select'], ['registration_status', 'Registration', 'select']]
    : kind === 'partner'
    ? [['name', 'Nama Partner', 'text'], ['category', 'Kategori', 'select'], ['website_url', 'Website URL', 'text'], ['contact_name', 'Nama Kontak', 'text'], ['contact_phone', 'Nomor Kontak', 'text'], ['notes', 'Catatan', 'textarea'], ['sort_order', 'Urutan tampil', 'number']]
    : [['title', 'Event title', 'text'], ['date', 'Date', 'date'], ['time', 'Time', 'text'], ['venue', 'Venue', 'text'], ['location', 'Location', 'text'], ['maps_url', 'Maps URL', 'text'], ['description', 'Description', 'textarea'], ['event_rules', 'Peraturan Event', 'textarea'], ['whatsapp_number', 'WhatsApp number', 'text'], ['whatsapp_message', 'WhatsApp purchase message', 'textarea'], ['status', 'Status', 'select'], ['registration_status', 'Pendaftaran Peserta', 'select']];

  const selectOptions: Record<string, [string, string][]> = {
    status: kind === 'komika' ? [['active', 'Active'], ['archived', 'Archived']] : [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']],
    registration_status: [['open', 'Open'], ['closed', 'Closed']],
    category: [['sponsor', 'Sponsor'], ['support', 'Support'], ['media_partner', 'Media Partner']],
  };

  return (
    <Modal open={Boolean(kind)} onClose={onClose} title={`${isEdit ? 'Edit' : 'Tambah'} ${title}`} size={kind === 'event' || kind === 'open-mic' ? 'xl' : 'lg'}>
      <form onSubmit={submit} className="space-y-4 overflow-y-auto pr-1 sm:max-h-[75vh] sm:min-h-0">
        <div className="lg:grid lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.5fr)] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-0">
            {kind === 'komika' && (
              <ImageUpload label="Foto Komika" folder="komika" value={form.photo ?? ''} onChange={(url) => set('photo', url)} aspect="portrait" processingProfile="avatar" onUploadingChange={setUploading} />
            )}
            {kind === 'open-mic' && (
              <ImageUpload label="Poster / Foto Open Mic" folder="open-mic" value={form.poster ?? ''} onChange={(url) => set('poster', url)} aspect="landscape" processingProfile="poster" onUploadingChange={setUploading} skipCrop />
            )}
            {kind === 'event' && (
              <ImageUpload label="Poster Event" folder="events" value={form.poster ?? ''} onChange={(url) => set('poster', url)} aspect="landscape" processingProfile="poster" onUploadingChange={setUploading} skipCrop />
            )}
            {kind === 'partner' && (
              <ImageUpload label="Logo Partner" folder="partners" value={form.logo_url ?? ''} onChange={(url) => set('logo_url', url)} aspect="square" processingProfile="logo" onUploadingChange={setUploading} />
            )}
          </div>
          <div className="mt-4 space-y-4 lg:mt-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {fields.map(([key, label, type]) => (
              <div key={key} className={type === 'textarea' ? 'lg:col-span-2' : ''}>
                <label className="label-field" htmlFor={`admin-${key}`}>{label}</label>
                {kind === 'partner' && key === 'category' ? (
                  <div className="relative">
                    <button
                      id={`admin-${key}`}
                      type="button"
                      onClick={() => setPartnerCategoryOpen((open) => !open)}
                      className={`input-field flex items-center justify-between gap-3 text-left ${partnerCategoryOpen ? 'border-blue-500 ring-2 ring-blue-100' : ''}`}
                      aria-haspopup="listbox"
                      aria-expanded={partnerCategoryOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FolderOpen className="h-4 w-4" /></span>
                        <span className="truncate text-sm font-semibold text-slate-800">{selectOptions.category.find(([value]) => value === form[key])?.[1] ?? 'Pilih kategori'}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${partnerCategoryOpen ? 'rotate-180 text-blue-700' : ''}`} />
                    </button>
                    {partnerCategoryOpen && <div className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.16)]" role="listbox" aria-label="Pilih kategori partner">
                      {(selectOptions.category ?? []).map(([value, label]) => {
                        const selected = form[key] === value;
                        return <button
                          key={value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => { set(key, value); setPartnerCategoryOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><FolderOpen className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className={`mt-0.5 block text-[11px] ${selected ? 'text-blue-700/75' : 'text-slate-500'}`}>{value === 'media_partner' ? 'Kolaborasi publikasi dan media' : value === 'support' ? 'Dukungan barang atau layanan' : 'Dukungan sponsor dan pendanaan'}</span></span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-blue-700" />}
                        </button>;
                      })}
                    </div>}
                  </div>
                ) : kind === 'open-mic' && key === 'venue' ? (
                  <div className="relative">
                    <input
                      id={`admin-${key}`}
                      type="text"
                      value={form[key] ?? ''}
                      onFocus={() => setVenueSuggestionsOpen(true)}
                      onChange={(event) => {
                        set(key, event.target.value);
                        setVenueSuggestionsOpen(true);
                      }}
                      onBlur={() => setVenueSuggestionsOpen(false)}
                      placeholder={getAdminFieldPlaceholder(key)}
                      className="input-field"
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={venueSuggestionsOpen && matchingVenueSuggestions.length > 0}
                      aria-controls="admin-open-mic-venue-suggestions"
                      required={requiredFields.includes(key)}
                    />
                    {venueSuggestionsOpen && matchingVenueSuggestions.length > 0 && (
                      <ul id="admin-open-mic-venue-suggestions" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {matchingVenueSuggestions.map((entry) => (
                          <li key={`${entry.venue}-${entry.location}-${entry.mapsUrl}`} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected="false"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setForm((current) => ({
                                  ...current,
                                  venue: entry.venue,
                                  location: entry.location,
                                  maps_url: entry.mapsUrl,
                                }));
                                setVenueSuggestionsOpen(false);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-blue-50"
                            >
                              <span className="block text-sm font-semibold text-slate-800">{entry.venue}</span>
                              <span className="block text-xs text-slate-500">{[entry.location, `Terakhir ${formatDate(entry.date)}`].filter(Boolean).join(' · ')}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : type === 'textarea' ? (
                  <textarea id={`admin-${key}`} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} placeholder={getAdminFieldPlaceholder(key)} className="input-field min-h-[88px]" />
                ) : type === 'select' ? (
                  <select id={`admin-${key}`} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} className="input-field">
                    {(selectOptions[key] ?? []).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                ) : (
                  <input
                    id={`admin-${key}`}
                    type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                    inputMode={key === 'contact_phone' ? 'numeric' : undefined}
                    value={form[key] ?? ''}
                    onChange={(e) => set(key, key === 'instagram_url' ? formatInstagramHandle(e.target.value) : key === 'tiktok_url' ? formatTikTokHandle(e.target.value) : key === 'contact_phone' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                    placeholder={getAdminFieldPlaceholder(key)}
                    className="input-field"
                    required={requiredFields.includes(key)}
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2 lg:col-span-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={kind === 'partner' ? form.is_published !== 'false' : form.published !== 'false'}
                  onChange={(e) => set(kind === 'partner' ? 'is_published' : 'published', String(e.target.checked))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                /> Tampilkan di website
              </label>
            </div>
            {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 lg:col-span-2">{errorMessage}</p>}
            <div className="flex gap-3 pt-2 lg:col-span-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Batal</button>
              <button type="submit" disabled={saving || uploading} className="btn-primary flex-1">{uploading ? 'Mengupload...' : saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function EventPartnershipManagementModal({ event, partners, partnerships, onClose, onNotice, onReload }: { event: EventItem | null; partners: Partner[]; partnerships: EventPartnership[]; onClose: () => void; onNotice: (msg: string) => void; onReload: () => Promise<void> }) {
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [role, setRole] = useState<'sponsor' | 'support' | 'media_partner'>('sponsor');
  const [notes, setNotes] = useState('');
  const [picName, setPicName] = useState('');
  const [picPhone, setPicPhone] = useState('');
  const [supportType, setSupportType] = useState('Venue');
  const [customSupportType, setCustomSupportType] = useState('');
  const [supportDetail, setSupportDetail] = useState('');
  const [supportItems, setSupportItems] = useState<Array<{ label: string; detail: string }>>([]);
  const [sortOrder, setSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<EventPartnership | null>(null);

  const currentPartnerships = partnerships.filter((item) => item.event_id === event?.id);

  useEffect(() => {
    if (event) {
      setSelectedPartnerId('');
      setRole('sponsor');
      setNotes('');
      setPicName('');
      setPicPhone('');
      setSupportType('Venue');
      setCustomSupportType('');
      setSupportDetail('');
      setSupportItems([]);
      setSortOrder('0');
    }
  }, [event]);

  async function savePartnership() {
    if (!event || !selectedPartnerId) return;
    setSaving(true);
    const supportText = supportItems
      .map((item) => item.detail ? `${item.label}: ${item.detail}` : item.label)
      .join('\n')
      .trim();

    const basePayload = {
      event_id: event.id,
      partner_id: selectedPartnerId,
      role,
      notes: supportText || notes.trim() || null,
      sort_order: Number(sortOrder) || 0,
    };

    const fullPayload = {
      ...basePayload,
      pic_name: picName.trim() || null,
      pic_phone: picPhone.trim() || null,
    };

    let { error } = await supabase.from('event_partnerships').insert(fullPayload);

    if (error && /pic_name|pic_phone|column/i.test(error.message)) {
      const fallback = await supabase.from('event_partnerships').insert(basePayload);
      error = fallback.error;
    }

    setSaving(false);
    if (error) {
      onNotice('Gagal menambahkan partner ke event.');
      return;
    }
    setSelectedPartnerId('');
    setRole('sponsor');
    setNotes('');
    setPicName('');
    setPicPhone('');
    setSupportType('Venue');
    setCustomSupportType('');
    setSupportDetail('');
    setSupportItems([]);
    setSortOrder('0');
    await onReload();
    onNotice('Partner event berhasil ditambahkan.');
  }

  function requestDeletePartnership(id: string) {
    const target = currentPartnerships.find((item) => item.id === id);
    if (!target) return;
    setDeleteEntry(target);
  }

  async function confirmDeletePartnership() {
    if (!deleteEntry) return;
    const { error } = await supabase.from('event_partnerships').delete().eq('id', deleteEntry.id);
    if (error) {
      onNotice('Gagal menghapus hubungan partner.');
      setDeleteEntry(null);
      return;
    }
    await onReload();
    setDeleteEntry(null);
    onNotice('Hubungan partner dihapus.');
  }

  const availablePartners = partners.filter((partner) => !currentPartnerships.some((relationship) => relationship.partner_id === partner.id));
  const supportPresets = [
    'Venue',
    'Cash',
    'Sound System',
    'Lighting',
    'Promosi',
    'Dokumentasi',
    'MC',
    'Dekorasi',
    'Transportasi',
    'Food & Beverage',
    'Merchandise',
    'Speaker / Host',
    'Content / Social Media',
    'Tiket',
    'Lainnya / Other',
  ];

  function formatCurrencyInput(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';

    const amount = Number(digits);
    if (!Number.isFinite(amount)) return '';

    return `Rp ${new Intl.NumberFormat('id-ID').format(amount)}`;
  }

  function addSupportItem() {
    const trimmedType = supportType === 'Lainnya / Other' ? customSupportType.trim() : supportType.trim();
    if (!trimmedType) return;

    const trimmedDetail = supportType === 'Cash' ? formatCurrencyInput(supportDetail) : supportDetail.trim();
    const duplicate = supportItems.some((item) => item.label.toLowerCase() === trimmedType.toLowerCase() && item.detail.toLowerCase() === trimmedDetail.toLowerCase());

    if (duplicate) {
      setSupportDetail('');
      setCustomSupportType('');
      return;
    }

    setSupportItems((current) => [...current, { label: trimmedType, detail: trimmedDetail }]);
    setSupportDetail('');
    setCustomSupportType('');
  }

  return (
    <Modal open={Boolean(event)} onClose={onClose} title={`Partner — ${event?.title ?? ''}`} size="lg">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600">Ringkasan</p>
              <p className="text-sm font-semibold text-slate-800">{event?.title ?? 'Event'} · {role}</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{availablePartners.length} partner tersedia</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label-field" htmlFor="partnership-partner">Partner</label>
              <select id="partnership-partner" value={selectedPartnerId} onChange={(e) => setSelectedPartnerId(e.target.value)} className="input-field">
                <option value="">Pilih partner</option>
                {availablePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="partnership-role">Role</label>
              <select id="partnership-role" value={role} onChange={(e) => setRole(e.target.value as 'sponsor' | 'support' | 'media_partner')} className="input-field">
                <option value="sponsor">Sponsor</option>
                <option value="support">Support</option>
                <option value="media_partner">Media Partner</option>
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="partnership-order">Urutan tampil</label>
              <input id="partnership-order" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="label-field" htmlFor="partnership-notes">Dukungan / Bentuk Kerja Sama</label>
              <p className="mb-2 text-xs text-slate-500">Tambah item satu per satu supaya detailnya rapi dan bisa dibaca di histori partner. Kalau ada tipe yang tidak ada di daftar, pilih “Lainnya / Other” lalu ketik sendiri.</p>
              <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_auto]">
                <select
                  id="partnership-support-type"
                  value={supportType}
                  onChange={(e) => setSupportType(e.target.value)}
                  className="input-field"
                >
                  {supportPresets.map((preset) => (
                    <option key={preset} value={preset}>{preset}</option>
                  ))}
                </select>
                {supportType === 'Lainnya / Other' ? (
                  <input
                    id="partnership-support-custom-type"
                    type="text"
                    value={customSupportType}
                    onChange={(e) => setCustomSupportType(e.target.value)}
                    className="input-field"
                    placeholder="Tulis jenis dukungan lain..."
                  />
                ) : (
                  <input
                    id="partnership-support-detail"
                    type="text"
                    value={supportDetail}
                    onChange={(e) => setSupportDetail(supportType === 'Cash' ? formatCurrencyInput(e.target.value) : e.target.value)}
                    className="input-field"
                    placeholder={supportType === 'Cash' ? 'Contoh: 5000000' : 'Contoh: 1 paket, 2 unit, dll'}
                  />
                )}
                <button
                  type="button"
                  onClick={addSupportItem}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Tambahkan
                </button>
              </div>

              {supportItems.length > 0 && (
                <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_1.5fr_auto] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    <span>Jenis</span>
                    <span>Keterangan</span>
                    <span className="text-right">Aksi</span>
                  </div>
                  {supportItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="grid grid-cols-[1fr_1.5fr_auto] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
                      <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                      <span className="text-sm text-slate-600">{item.detail || '—'}</span>
                      <button
                        type="button"
                        onClick={() => setSupportItems((current) => current.filter((_, idx) => idx !== index))}
                        className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea id="partnership-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="hidden" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => void savePartnership()} disabled={!selectedPartnerId || saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Tambah Partner ke Event'}</button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">Partner terhubung</h3>
          {currentPartnerships.length === 0 ? (
            <AdminEmptyState title="Belum ada partner yang ditambahkan untuk event ini." />
          ) : (
            currentPartnerships.map((entry) => {
              const partner = partners.find((item) => item.id === entry.partner_id);
              if (!partner) return null;
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                      {partner.logo_url ? <img src={partner.logo_url} alt={partner.name} className="h-full w-full object-contain p-1" /> : <Users className="h-5 w-5 text-slate-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{partner.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{entry.role}</p>
                    </div>
                  </div>
                  <button onClick={() => requestDeletePartnership(entry.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100">Hapus</button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {deleteEntry && (
        <Modal open onClose={() => setDeleteEntry(null)} title="Hapus hubungan partner?" size="sm">
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm leading-6 text-slate-700">
                Yakin ingin menghapus hubungan <span className="font-extrabold text-slate-900">{partners.find((item) => item.id === deleteEntry.partner_id)?.name ?? 'Partner'}</span> dari event ini?
              </p>
              <p className="mt-2 text-xs leading-5 text-red-700">
                Data dukungan / bentuk kerja sama yang terkait juga akan ikut dihapus.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteEntry(null)} className="btn-secondary">Batal</button>
              <button
                type="button"
                onClick={() => void confirmDeletePartnership()}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function TicketManagementModal({ event, onClose, onNotice }: { event: EventItem | null; onClose: () => void; onNotice: (msg: string) => void }) {
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTicket, setEditingTicket] = useState<EventTicket | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    const { data } = await supabase.from('event_tickets').select('*').eq('event_id', event.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setTickets((data as EventTicket[]) ?? []);
    setLoading(false);
  }, [event]);

  useEffect(() => { void load(); }, [load]);

  async function deleteTicket(id: string) {
    if (!window.confirm('Hapus tiket ini?')) return;
    const { error } = await supabase.from('event_tickets').delete().eq('id', id);
    if (error) { onNotice('Gagal menghapus tiket.'); return; }
    onNotice('Tiket dihapus.');
    await load();
  }

  async function toggleTicketStatus(t: EventTicket) {
    const next = t.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('event_tickets').update({ status: next, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { onNotice('Gagal mengubah status tiket.'); return; }
    await load();
  }

  return (
    <>
      <Modal open={Boolean(event) && !showForm} onClose={onClose} title={`Tiket — ${event?.title ?? ''}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Link diisi untuk direct ke pihak ketiga. Kosongkan untuk direct ke WhatsApp.</p>
          <button onClick={() => { setEditingTicket(null); setShowForm(true); }} className="btn-primary !py-2 !text-sm"><Plus className="h-4 w-4" /> Tambah Tiket</button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2].map((n) => <div key={n} className="h-20 skeleton rounded-xl" />)}</div>
        ) : tickets.length === 0 ? (
          <AdminEmptyState title="Belum ada tiket. Klik Tambah Tiket untuk membuat." />
        ) : (
          <div className="space-y-2.5">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setExpandedTickets((current) => ({ ...current, [t.id]: !current[t.id] }))} className="flex items-center gap-2 text-left">
                      <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expandedTickets[t.id] ? 'rotate-90' : ''}`} />
                      <h3 className="font-bold text-slate-900">{t.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.status === 'active' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>{t.status === 'active' ? 'Aktif' : 'Nonaktif'}</span>
                    </button>
                    <p className="mt-1 text-lg font-extrabold text-blue-700">{formatPrice(t.price)}</p>
                    {expandedTickets[t.id] && <>
                      {t.description && <p className="mt-1 text-sm text-slate-500">{t.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.available_public && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">Online</span>}
                        {t.available_ots && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-800">OTS · {formatPrice(t.ots_price ?? 0)}</span>}
                        {!t.available_public && !t.available_ots && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Tidak tersedia untuk dijual</span>}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-600">{t.ticket_url ? 'Mode: Link pihak ketiga' : 'Mode: WhatsApp'}</p>
                    </>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => toggleTicketStatus(t)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={t.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}>{t.status === 'active' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => { setEditingTicket(t); setShowForm(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deleteTicket(t.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      </Modal>
      {showForm && event && (
        <TicketFormModal
          event={event}
          ticket={editingTicket}
          onClose={() => { setShowForm(false); setEditingTicket(null); }}
          onSaved={async () => { setShowForm(false); setEditingTicket(null); await load(); onNotice('Tiket berhasil disimpan.'); }}
        />
      )}
    </>
  );
}

function formatTicketPriceInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

function parseTicketPriceInput(value: string): number {
  return Number(value.replace(/\D/g, ''));
}

function TicketFormModal({ event, ticket, onClose, onSaved }: { event: EventItem; ticket: EventTicket | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(ticket?.name ?? '');
  const [price, setPrice] = useState(ticket ? formatTicketPriceInput(String(ticket.price)) : '0');
  const [availablePublic, setAvailablePublic] = useState(ticket?.available_public ?? true);
  const [availableOts, setAvailableOts] = useState(ticket?.available_ots ?? false);
  const [otsPrice, setOtsPrice] = useState(ticket?.ots_price == null ? '' : formatTicketPriceInput(String(ticket.ots_price)));
  const [quota, setQuota] = useState(ticket?.quota == null ? '' : String(ticket.quota));
  const [description, setDescription] = useState(ticket?.description ?? '');
  const [ticketUrl, setTicketUrl] = useState(ticket?.ticket_url ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(ticket?.status ?? 'active');
  const [sortOrder, setSortOrder] = useState(ticket ? String(ticket.sort_order) : '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function validateUrl(url: string): boolean {
    if (!url.trim()) return true;
    try {
      const u = new URL(url.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Nama tiket wajib diisi.'); return; }
    if (!validateUrl(ticketUrl)) { setError('Link Beli Tiket harus diawali dengan http:// atau https://'); return; }
    const numericPrice = price.trim() ? parseTicketPriceInput(price) : 0;
    const numericOtsPrice = parseTicketPriceInput(otsPrice);
    if (!Number.isSafeInteger(numericPrice) || numericPrice > 2147483647) {
      setError('Harga Tiket harus berupa angka Rupiah yang valid.');
      return;
    }
    if (availableOts && (!otsPrice.trim() || !Number.isSafeInteger(numericOtsPrice) || numericOtsPrice > 2147483647)) {
      setError('Harga OTS wajib diisi dengan nominal nol atau lebih.');
      return;
    }
    setSaving(true);
    const payload = {
      event_id: event.id,
      name: name.trim(),
      price: numericPrice,
      available_public: availablePublic,
      available_ots: availableOts,
      ots_price: availableOts ? numericOtsPrice : null,
      quota: quota.trim() ? Number(quota) : null,
      description: description.trim() || null,
      ticket_url: ticketUrl.trim() || null,
      status,
      sort_order: Number(sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };
    const result = ticket
      ? await supabase.from('event_tickets').update(payload).eq('id', ticket.id)
      : await supabase.from('event_tickets').insert(payload);
    setSaving(false);
    if (result.error) { setError('Gagal menyimpan tiket.'); return; }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={ticket ? 'Edit Tiket' : 'Tambah Tiket'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-field" htmlFor="ticket-name">Nama Tiket</label>
          <input id="ticket-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Presale, Regular, VIP..." required />
        </div>
        <div>
          <label className="label-field" htmlFor="ticket-price">Harga Tiket (Rp)</label>
          <input id="ticket-price" type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(formatTicketPriceInput(e.target.value))} className="input-field" placeholder="50.000" />
          <p className="mt-1 text-xs text-slate-400">Masukkan 0 untuk GRATIS.</p>
        </div>
        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-extrabold text-slate-900">Ketersediaan Penjualan</h3>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={availablePublic} onChange={(e) => setAvailablePublic(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
            Tersedia untuk publik/online
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={availableOts} onChange={(e) => setAvailableOts(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
            Tersedia untuk penjualan OTS
          </label>
          {availableOts && <div>
            <label className="label-field" htmlFor="ticket-ots-price">Harga OTS (Rp)</label>
            <input id="ticket-ots-price" type="text" inputMode="numeric" value={otsPrice} onChange={(e) => setOtsPrice(formatTicketPriceInput(e.target.value))} className="input-field" placeholder="60.000" required />
          </div>}
        </section>
        <div>
          <label className="label-field" htmlFor="ticket-quota">Kuota tiket <span className="font-normal text-slate-400">(opsional)</span></label>
          <input id="ticket-quota" type="number" min="0" step="1" value={quota} onChange={(e) => setQuota(e.target.value)} className="input-field" placeholder="Kosongkan untuk tanpa batas" />
        </div>
        <div>
          <label className="label-field" htmlFor="ticket-desc">Deskripsi</label>
          <textarea id="ticket-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field min-h-[72px]" placeholder="Keterangan tiket (opsional)" />
        </div>
        <div>
          <label className="label-field" htmlFor="ticket-url">Link Pihak Ketiga <span className="font-normal text-slate-500">(opsional)</span></label>
          <input id="ticket-url" type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} className="input-field" placeholder="https://ticketing.example.com/..." />
          <p className="mt-1 text-xs font-medium text-slate-600">Isi jika memakai platform ticketing lain. Kosongkan jika ingin direct ke WhatsApp.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-field" htmlFor="ticket-status">Status</label>
            <select id="ticket-status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')} className="admin-ticket-select">
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <div>
            <label className="label-field" htmlFor="ticket-sort">Urutan Tampil</label>
            <input id="ticket-sort" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="input-field" placeholder="0" />
          </div>
        </div>
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsPanel({ settings, onSaved, onNotice }: { settings: SiteSettings; onSaved: () => void; onNotice: (msg: string) => void }) {
  const [form, setForm] = useState<SiteSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('site_settings').update(form).eq('id', 1);
    setSaving(false);
    if (error) { onNotice('Gagal menyimpan pengaturan.'); return; }
    onNotice('Pengaturan berhasil disimpan.');
    onSaved();
  }

  const renderField = ([key, label, type]: [keyof SiteSettings, string, 'text' | 'textarea']) => (
    <div key={key}>
      <label className="label-field" htmlFor={`settings-${key}`}>{label}</label>
      {type === 'textarea' ? (
        <textarea id={`settings-${key}`} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input-field min-h-[96px]" />
      ) : (
        <input id={`settings-${key}`} type="text" value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input-field" />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Kelola identitas, kontak, dan tampilan publik komunitas.</p>
      </div>
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Identitas Komunitas</h2><p className="mt-1 text-xs leading-5 text-slate-500">Nama dan logo yang tampil di header, footer, dan halaman publik.</p></div>
          <ImageUpload label="Logo Utama" folder="branding" value={form.logo_url ?? ''} onChange={(url) => setForm({ ...form, logo_url: url || null })} aspect="square" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{renderField(['site_name', 'Nama Komunitas', 'text'])}{renderField(['site_short_name', 'Nama Singkat di Header', 'text'])}</div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Kontak Berdasarkan Kebutuhan</h2><p className="mt-1 text-xs leading-5 text-slate-500">Gunakan format internasional, contoh: 62812xxxx. Nomor tidak ditampilkan sebagai nama admin kepada publik.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {renderField(['whatsapp_admin_name', 'Nama Penanggung Jawab WhatsApp Umum', 'text'])}
            {renderField(['whatsapp_admin', 'Nomor WhatsApp Umum / Fallback', 'text'])}
            {renderField(['whatsapp_registration_name', 'Nama Penanggung Jawab Pendaftaran', 'text'])}
            {renderField(['whatsapp_registration', 'Nomor WhatsApp Pendaftaran / Open Mic', 'text'])}
            {renderField(['whatsapp_partnership_name', 'Nama Penanggung Jawab Kerja Sama', 'text'])}
            {renderField(['whatsapp_partnership', 'Nomor WhatsApp Kerja Sama', 'text'])}
            {renderField(['whatsapp_ticket_name', 'Nama Penanggung Jawab Tiket Event', 'text'])}
            {renderField(['whatsapp_ticket', 'Nomor WhatsApp Tiket Event', 'text'])}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Sosial Media & Lokasi</h2><p className="mt-1 text-xs leading-5 text-slate-500">Link ini digunakan pada halaman Kontak, footer, dan profil komunitas.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {renderField(['instagram_url', 'Instagram URL', 'text'])}
            {renderField(['tiktok_url', 'TikTok URL', 'text'])}
            {renderField(['youtube_url', 'YouTube URL', 'text'])}
            {renderField(['address', 'Alamat Komunitas', 'text'])}
            <div className="sm:col-span-2">{renderField(['short_description', 'Deskripsi Singkat', 'textarea'])}</div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Afiliasi</h2><p className="mt-1 text-xs leading-5 text-slate-500">Opsional. Akan tampil sebagai Bagian Dari di halaman Kontak dan footer.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {renderField(['affiliation_name', 'Nama Organisasi Afiliasi', 'text'])}
            {renderField(['affiliation_website', 'Website Afiliasi', 'text'])}
            <div className="sm:col-span-2">{renderField(['affiliation_logo_url', 'URL Logo Afiliasi', 'text'])}</div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Identitas Warna</h2><p className="mt-1 text-xs leading-5 text-slate-500">Warna utama, hover, dan aksen untuk elemen brand.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
          {([['brand_primary', 'Warna Utama'], ['brand_hover', 'Warna Hover'], ['brand_accent', 'Warna Aksen']] as const).map(([key, label]) => (
            <div key={key}>
              <label className="label-field" htmlFor={`settings-${key}`}>{label}</label>
              <div className="flex gap-2">
                <input id={`settings-${key}`} type="color" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
                <input type="text" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input-field" pattern="^#[0-9a-fA-F]{6}$" title="Gunakan format warna HEX, contoh #2563EB" />
              </div>
            </div>
          ))}
          </div>
        </section>
        <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</button>
      </form>
    </div>
  );
}
