import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BarChart3, CalendarDays, Check, ChevronRight, Clock3, Eye, EyeOff, FolderOpen, LogOut, MessageCircle, Mic, MoreHorizontal, Pencil, Plus, Printer, Search, Settings, Ticket as TicketIcon, Trash2, UserPlus, Users, X, ArrowLeft, ExternalLink } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { ApplicationStatus, AttendanceStatus, CommunityApplication, EventItem, EventParticipant, EventTicket, Komika, OpenMic, OpenMicRegistration, SiteSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPrice, getEventStatus, getOpenMicStatus, slugify, waLink } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { LOGO_URL } from '@/lib/types';

interface Props { router: Router; settings: SiteSettings; }
type Section = 'dashboard' | 'open-mic' | 'registrants' | 'event-participants' | 'events' | 'applications' | 'komika' | 'settings' | 'more';

const NAV: { key: Section; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'open-mic', label: 'Open Mic', icon: Mic },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'applications', label: 'Gabung Komunitas', icon: UserPlus },
  { key: 'komika', label: 'Komika', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const BOTTOM_NAV: { key: Section; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: 'Home', icon: BarChart3 },
  { key: 'open-mic', label: 'Open Mic', icon: Mic },
  { key: 'events', label: 'Event', icon: CalendarDays },
  { key: 'komika', label: 'Komika', icon: Users },
  { key: 'more', label: 'More', icon: MoreHorizontal },
];

function getSection(path: string): Section {
  const parts = path.split('/').filter(Boolean);
  if (parts[1] === 'pendaftar' && parts[2]) return 'registrants';
  if (parts[1] === 'event-pendaftar' && parts[2]) return 'event-participants';
  const part = parts[1] as Section | undefined;
  if (part === 'more') return 'more';
  if (NAV.some((n) => n.key === part)) return part as Section;
  return 'dashboard';
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

function AttendanceBadge({ status }: { status?: AttendanceStatus }) {
  const current = status ?? 'unmarked';
  const label = current === 'attended' ? 'Hadir' : current === 'absent' ? 'Tidak Hadir' : 'Belum Dicek';
  const style = current === 'attended' ? 'bg-green-50 text-green-700 ring-green-200' : current === 'absent' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-slate-100 text-slate-500 ring-slate-200';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${style}`}>{label}</span>;
}

export function AdminPage({ router, settings }: Props) {
  const { user, signOut } = useAuth();
  const section = getSection(router.path);
  const [openMics, setOpenMics] = useState<OpenMic[]>([]);
  const [registrations, setRegistrations] = useState<OpenMicRegistration[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [komika, setKomika] = useState<Komika[]>([]);
  const [communityApplications, setCommunityApplications] = useState<CommunityApplication[]>([]);
  const [eventPendingCounts, setEventPendingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'open-mic' | 'event' | 'komika' | null>(null);
  const [editing, setEditing] = useState<OpenMic | EventItem | Komika | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [ticketEvent, setTicketEvent] = useState<EventItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, e, k, a, p] = await Promise.all([
      supabase.from('open_mics').select('*').order('date', { ascending: false }),
      supabase.from('open_mic_registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('*').order('date', { ascending: false }),
      supabase.from('komika').select('*').order('stage_name', { ascending: true }),
      supabase.from('community_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('event_participants').select('event_id, status'),
    ]);
    setOpenMics((m.data as OpenMic[]) ?? []);
    setRegistrations((r.data as OpenMicRegistration[]) ?? []);
    setEvents((e.data as EventItem[]) ?? []);
    setKomika((k.data as Komika[]) ?? []);
    setCommunityApplications((a.data as CommunityApplication[]) ?? []);
    const pendingByEvent: Record<string, number> = {};
    (p.data as { event_id: string; status: ApplicationStatus }[] ?? []).forEach((participant) => {
      if (participant.status === 'pending') pendingByEvent[participant.event_id] = (pendingByEvent[participant.event_id] ?? 0) + 1;
    });
    setEventPendingCounts(pendingByEvent);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-registration-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_mic_registrations' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_applications' }, () => void load())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  async function togglePublish(table: 'open_mics' | 'events', id: string, current: boolean) {
    const { error } = await supabase.from(table).update({ published: !current, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { setNotice('Gagal mengubah status publish.'); return; }
    setNotice(!current ? 'Konten dipublikasikan.' : 'Konten disembunyikan.');
    await load();
  }

  async function deleteRow(table: 'open_mics' | 'events' | 'komika', id: string) {
    if (!window.confirm('Hapus data ini? Tindakan ini tidak dapat dibatalkan.')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { setNotice('Gagal menghapus data.'); return; }
    setNotice('Data berhasil dihapus.');
    await load();
  }

  function navigateSection(next: Section) { router.navigate(next === 'dashboard' ? '/admin' : `/admin/${next}`); }

  const pendingRegistrationCount = registrations.filter((registration) => registration.status === 'pending').length;
  const komikaAttendanceCounts = useMemo(() => registrations.reduce<Record<string, number>>((counts, registration) => {
    if (registration.komika_id && registration.attendance_status === 'attended') counts[registration.komika_id] = (counts[registration.komika_id] ?? 0) + 1;
    return counts;
  }, {}), [registrations]);
  const isSubpage = section !== 'dashboard' && section !== 'more';
  const pageTitle = section === 'registrants' ? 'Pendaftar Open Mic' : section === 'event-participants' ? 'Pendaftar Event' : NAV.find((n) => n.key === section)?.label ?? 'More';
  const registrantOpenMicId = section === 'registrants' ? router.path.split('/').filter(Boolean)[2] ?? '' : '';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop Header */}
      <header className="sticky top-0 z-40 hidden border-b border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-sm font-extrabold text-slate-900">ADMIN <span className="text-blue-600">PANEL</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{user?.email}</span>
            <button onClick={async () => { await signOut(); router.navigate('/admin/login'); }} className="btn-ghost !px-3"><LogOut className="h-4 w-4" /> Keluar</button>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          {isSubpage ? (
            <button onClick={() => section === 'registrants' ? router.navigate('/admin/open-mic') : section === 'event-participants' ? router.navigate('/admin/events') : router.navigate('/admin')} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              <ArrowLeft className="h-5 w-5" /> <span className="text-slate-900">{pageTitle}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <img src={LOGO_URL} alt="Logo" className="h-7 w-7 rounded-lg object-contain" />
              <span className="text-sm font-extrabold text-slate-900">Admin Panel</span>
            </div>
          )}
          {section === 'more' && (
            <button onClick={async () => { await signOut(); router.navigate('/admin/login'); }} className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:w-60 lg:shrink-0 lg:border-r lg:border-slate-200 lg:bg-white lg:p-3">
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const pendingEventCount = Object.values(eventPendingCounts).reduce((total, count) => total + count, 0);
              const communityPendingCount = communityApplications.filter((application) => application.status === 'pending').length;
              const showPendingBadge = (item.key === 'open-mic' && pendingRegistrationCount > 0) || (item.key === 'events' && pendingEventCount > 0) || (item.key === 'applications' && communityPendingCount > 0);
              return (
                <button key={item.key} onClick={() => navigateSection(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${section === item.key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {showPendingBadge && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-extrabold leading-none text-white" aria-label="Pendaftar baru menunggu konfirmasi">{item.key === 'open-mic' ? pendingRegistrationCount : item.key === 'events' ? pendingEventCount : communityPendingCount}</span>}
                </button>
              );
            })}
          </nav>
          <div className="mt-8 border-t border-slate-100 pt-4">
            <button onClick={() => router.navigate('/')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-700">
              <ExternalLink className="h-5 w-5" /> Lihat Website
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          {notice && (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-green-200">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="Tutup pesan" className="text-green-600 hover:text-green-800"><X className="h-4 w-4" /></button>
            </div>
          )}

          {section === 'dashboard' && <Dashboard openMics={openMics} registrations={registrations} events={events} komika={komika} loading={loading} onNavigate={navigateSection} />}
          {section === 'open-mic' && <OpenMicManagement rows={openMics} registrations={registrations} loading={loading} onAdd={() => { setEditing(null); setModal('open-mic'); }} onEdit={(row) => { setEditing(row); setModal('open-mic'); }} onDelete={(id) => deleteRow('open_mics', id)} onTogglePublish={(id, val) => togglePublish('open_mics', id, val)} onViewRegistrants={(m) => router.navigate(`/admin/pendaftar/${m.id}`)} />}
          {section === 'registrants' && <RegistrantsView openMicId={registrantOpenMicId} komika={komika} onBack={() => router.navigate('/admin/open-mic')} />}
          {section === 'event-participants' && <EventParticipantsView eventId={router.path.split('/').filter(Boolean)[2] ?? ''} onBack={() => router.navigate('/admin/events')} />}
          {section === 'events' && <EventManagement rows={events} loading={loading} pendingCounts={eventPendingCounts} onAdd={() => { setEditing(null); setModal('event'); }} onEdit={(row) => { setEditing(row); setModal('event'); }} onDelete={(id) => deleteRow('events', id)} onTogglePublish={(id, val) => togglePublish('events', id, val)} onManageTickets={(row) => setTicketEvent(row)} onViewParticipants={(row) => router.navigate(`/admin/event-pendaftar/${row.id}`)} />}
          {section === 'applications' && <ApplicationsView community={communityApplications} onNotice={setNotice} onReload={load} />}
          {section === 'komika' && <KomikaManagement rows={komika} registrations={registrations} openMics={openMics} attendanceCounts={komikaAttendanceCounts} loading={loading} onReload={load} onAdd={() => { setEditing(null); setModal('komika'); }} onEdit={(row) => { setEditing(row); setModal('komika'); }} onDelete={(id) => deleteRow('komika', id)} />}
          {section === 'settings' && <SettingsPanel settings={settings} onSaved={load} onNotice={setNotice} />}
          {section === 'more' && <MorePage onNavigate={navigateSection} onSignOut={async () => { await signOut(); router.navigate('/admin/login'); }} onViewWebsite={() => router.navigate('/')} />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden" aria-label="Navigasi admin mobile">
        <div className="flex w-full max-w-md items-stretch justify-around rounded-[1.75rem] border border-blue-100 bg-white/95 p-2 shadow-[0_-8px_30px_rgba(37,99,235,0.12)] backdrop-blur-xl">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.key || (item.key === 'events' && section === 'events') || (item.key === 'komika' && section === 'komika');
            const moreActive = item.key === 'more' && (section === 'more' || section === 'settings');
            const pendingEventCount = Object.values(eventPendingCounts).reduce((total, count) => total + count, 0);
            const communityPendingCount = communityApplications.filter((application) => application.status === 'pending').length;
            const showPendingBadge = (item.key === 'open-mic' && pendingRegistrationCount > 0) || (item.key === 'events' && pendingEventCount > 0) || (item.key === 'applications' && communityPendingCount > 0);
            const isActive = active || moreActive;
            return (
              <button key={item.key} onClick={() => navigateSection(item.key)} className={`mobile-nav-item flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition-all duration-300 ${isActive ? 'mobile-nav-item-active text-blue-700' : 'text-slate-400'}`}>
                <span className={`mobile-nav-icon relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300 ${isActive ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'bg-slate-100 text-slate-400'}`}>
                  <Icon className="h-4.5 w-4.5" />
                  {showPendingBadge && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-extrabold leading-none text-white" aria-label="Pendaftar baru menunggu konfirmasi">{item.key === 'open-mic' ? pendingRegistrationCount : item.key === 'events' ? pendingEventCount : communityPendingCount}</span>}
                </span>
                <span className={`mobile-nav-label ${isActive ? 'mobile-nav-label-active' : ''}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Ticket Management Modal */}
      <TicketManagementModal event={ticketEvent} onClose={() => setTicketEvent(null)} onNotice={setNotice} />

      {/* Form Modal */}
      <AdminFormModal kind={modal} editing={editing} saving={saving} settings={settings} onClose={() => setModal(null)} onSaving={setSaving} onSaved={async () => { setModal(null); await load(); setNotice('Perubahan berhasil disimpan.'); }} />

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
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{m.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{formatDate(m.date)} · {m.venue}</p></div>
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

      <Modal open={Boolean(confirmReg)} onClose={() => setConfirmReg(null)} title={confirmReg?.action === 'confirmed' ? 'Konfirmasi Pendaftar?' : 'Tolak Pendaftar?'} size="sm">
        {confirmReg && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {confirmReg.action === 'confirmed'
                ? `Peserta ${confirmReg.reg.stage_name} akan dikonfirmasi sebagai peserta${openMic ? ` ${openMic.title}` : ''}.`
                : `Apakah Anda yakin ingin menolak pendaftar ${confirmReg.reg.stage_name}?`}
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
    bio: 'Contoh: Komika dengan materi observasi sehari-hari.', specialties: 'Contoh: Observasi, kehidupan kerja', title: 'Contoh: Open Mic #30',
    venue: 'Contoh: Aula Serbaguna Cilegon', location: 'Contoh: Cilegon, Banten', maps_url: 'Contoh: https://maps.google.com/...', capacity: 'Contoh: 10', time: 'Contoh: 19.00',
  };
  return placeholders[key];
}

function OpenMicManagement({ rows, registrations, loading, onAdd, onEdit, onDelete, onTogglePublish, onViewRegistrants }: { rows: OpenMic[]; registrations: OpenMicRegistration[]; loading: boolean; onAdd: () => void; onEdit: (row: OpenMic) => void; onDelete: (id: string) => void; onTogglePublish: (id: string, current: boolean) => void; onViewRegistrants: (m: OpenMic) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming');
  const searchedRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.title.toLowerCase().includes(query) || row.venue.toLowerCase().includes(query);
  });
  const filteredRows = search.trim() ? searchedRows : searchedRows.filter((row) => getOpenMicStatus(row.status, row.date) === statusFilter);
  const statusFolders = [
    ['upcoming', 'Mendatang'],
    ['completed', 'Selesai'],
    ['cancelled', 'Dibatalkan'],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-slate-900">Open Mic</h1><p className="mt-1 text-sm text-slate-500">Kelola Open Mic yang tampil di website.</p></div>
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
                      <span className="font-semibold text-slate-800">{m.title}</span>
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
                      <button onClick={() => onViewRegistrants(m)} className="relative rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Lihat Pendaftar"><Users className="h-4 w-4" />{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-extrabold leading-none text-white">{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length}</span>}</button>
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
                  <p className="truncate font-bold text-slate-900">{m.title}</p>
                  <p className="truncate text-xs text-slate-500">{formatDate(m.date)} · {m.venue}</p>
                </div>
              </div>
              <StatusBadge status={getOpenMicStatus(m.status, m.date)} />
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span>Kapasitas: <strong className="text-slate-700">{m.capacity}</strong></span>
              <span className="text-slate-300">|</span>
              <button onClick={() => onTogglePublish(m.id, m.published)} className={`flex items-center gap-1 font-semibold ${m.published ? 'text-green-600' : 'text-slate-400'}`}>
                {m.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {m.published ? 'Published' : 'Draft'}
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => onViewRegistrants(m)} className="relative flex-1 rounded-lg bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">Pendaftar{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-extrabold leading-none text-white">{registrations.filter((registration) => registration.open_mic_id === m.id && registration.status === 'pending').length}</span>}</button>
              <button onClick={() => onEdit(m)} className="flex-1 rounded-lg bg-blue-50 py-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">Edit</button>
              <button onClick={() => onDelete(m.id)} className="flex-1 rounded-lg bg-red-50 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100">Hapus</button>
            </div>
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

function EventManagement({ rows, loading, pendingCounts, onAdd, onEdit, onDelete, onTogglePublish, onManageTickets, onViewParticipants }: { rows: EventItem[]; loading: boolean; pendingCounts: Record<string, number>; onAdd: () => void; onEdit: (row: EventItem) => void; onDelete: (id: string) => void; onTogglePublish: (id: string, current: boolean) => void; onManageTickets: (row: EventItem) => void; onViewParticipants: (row: EventItem) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming');
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
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-slate-900">Events</h1><p className="mt-1 text-sm text-slate-500">Kelola Event yang tampil di website.</p></div>
        <button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Tambah</span></button>
      </div>

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
                  <td className="px-5 py-4"><div className="flex items-center gap-3">{e.poster ? <img src={e.poster} alt={`Poster ${e.title}`} className="h-11 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100"><CalendarDays className="h-5 w-5" /></div>}<span className="font-semibold text-slate-800">{e.title}{e.registration_status === 'open' && pendingCounts[e.id] > 0 && <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-extrabold text-white">{pendingCounts[e.id]}</span>}</span></div></td>
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
                      {e.registration_status === 'open' && <button onClick={() => onViewParticipants(e)} className="rounded-lg p-2 text-slate-500 hover:bg-green-50 hover:text-green-700" title="Lihat Pendaftar"><UserPlus className="h-4 w-4" /></button>}
                      <button onClick={() => onManageTickets(e)} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Kelola Tiket"><TicketIcon className="h-4 w-4" /></button>
                      <button onClick={() => onEdit(e)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => onDelete(e.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Hapus"><Trash2 className="h-4 w-4" /></button>
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
        ) : filteredRows.map((e) => (
          <div key={e.id} className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
            {e.poster && <img src={e.poster} alt={e.title} className="h-40 w-full object-cover" />}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(e.date)} · {e.venue}</p>
                </div>
                <div className="flex items-center gap-2"><StatusBadge status={getEventStatus(e.status, e.date)} />{e.registration_status === 'open' && pendingCounts[e.id] > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-extrabold text-white">{pendingCounts[e.id]}</span>}</div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <button onClick={() => onTogglePublish(e.id, e.published)} className={`flex items-center gap-1 font-semibold ${e.published ? 'text-green-600' : 'text-slate-400'}`}>
                  {e.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {e.published ? 'Published' : 'Draft'}
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                {e.registration_status === 'open' && <button onClick={() => onViewParticipants(e)} className="flex-1 rounded-lg bg-green-50 py-2.5 text-xs font-semibold text-green-700 transition hover:bg-green-100">Pendaftar</button>}
                <button onClick={() => onManageTickets(e)} className="flex-1 rounded-lg bg-amber-50 py-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">Tiket</button>
                <button onClick={() => onEdit(e)} className="flex-1 rounded-lg bg-blue-50 py-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">Edit</button>
                <button onClick={() => onDelete(e.id)} className="flex-1 rounded-lg bg-red-50 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100">Hapus</button>
              </div>
            </div>
          </div>
        ))}
      </div>
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

  async function updateHistoryAttendance(registration: OpenMicRegistration) {
    const nextStatus = registration.attendance_status === 'attended' ? 'unmarked' : 'attended';
    setHistorySaving(true);
    const { error } = await supabase.from('open_mic_registrations').update({ attendance_status: nextStatus, updated_at: new Date().toISOString() }).eq('id', registration.id);
    setHistorySaving(false);
    if (!error) await onReload();
  }

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
                  <td className="px-5 py-4 text-slate-500"><span>{k.specialties.join(', ') || '—'}</span><span className="mt-1 block text-xs font-semibold text-slate-400">{attendanceCounts[k.id] ?? 0}x hadir</span></td>
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
              <p className="mt-1 text-[11px] font-semibold text-slate-400">{attendanceCounts[k.id] ?? 0}x hadir</p>
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
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Riwayat Open Mic</p><p className="mt-0.5 text-xs text-slate-500">Khusus rekaman Komika anggota ini.</p></div><div className="flex items-center gap-2"><button type="button" onClick={printKomikaHistory} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" title="Print riwayat" aria-label="Print riwayat Open Mic"><Printer className="h-4 w-4" /></button><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{attendanceCounts[viewKomika.id] ?? 0}x hadir</span></div></div>
              {history.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada riwayat Open Mic.</p> : <div className="mt-3 space-y-2">{history.map((registration) => { const historyMic = openMics.find((openMic) => openMic.id === registration.open_mic_id); return <div key={registration.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{historyMic?.title ?? 'Open Mic'}</p><p className="truncate text-xs text-slate-500">{historyMic ? `${formatDate(historyMic.date)} · ${historyMic.venue}` : 'Acara tidak ditemukan'}</p></div><div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => void updateHistoryAttendance(registration)} disabled={historySaving} className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${registration.attendance_status === 'attended' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Ubah status kehadiran">{registration.attendance_status === 'attended' ? 'Hadir' : 'Belum'}</button><button type="button" onClick={() => setDeleteHistoryTarget(registration)} disabled={historySaving} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Hapus riwayat"><Trash2 className="h-3.5 w-3.5" /></button></div></div>; })}</div>}
            </div>
          </div>
        )}
      </Modal>
      {viewKomika && <div className="print-sheet komika-history-print">
        <div className="print-brand"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" /><div><h1>RIWAYAT OPEN MIC KOMIKA</h1><p>Standupindo Cilegon</p></div></div>
        <div className="komika-print-profile"><strong>{viewKomika.full_name}</strong><span>Stage Name: {viewKomika.stage_name}</span><span>Komunitas: Standupindo Cilegon</span></div>
        <div className="komika-print-summary"><span>Total hadir: <strong>{attendanceCounts[viewKomika.id] ?? 0}</strong></span><span>Total riwayat: <strong>{history.length}</strong></span><span>Tidak hadir / belum dicek: <strong>{history.length - (attendanceCounts[viewKomika.id] ?? 0)}</strong></span></div>
        <table><thead><tr><th>No.</th><th>Nama Open Mic</th><th>Tanggal</th><th>Tempat</th><th>Status</th></tr></thead><tbody>{history.map((registration, index) => { const historyMic = openMics.find((openMic) => openMic.id === registration.open_mic_id); return <tr key={registration.id}><td>{index + 1}</td><td>{historyMic?.title ?? 'Open Mic'}</td><td>{historyMic ? formatDate(historyMic.date) : '-'}</td><td>{historyMic?.venue ?? '-'}</td><td>{registration.attendance_status === 'attended' ? 'Hadir' : registration.attendance_status === 'absent' ? 'Tidak Hadir' : 'Belum Dicek'}</td></tr>; })}</tbody></table>
      </div>}
      <Modal open={Boolean(deleteHistoryTarget)} onClose={() => setDeleteHistoryTarget(null)} title="Hapus Riwayat Open Mic?" size="sm">
        {deleteHistoryTarget && <div className="space-y-4"><p className="text-sm leading-6 text-slate-600">Yakin ingin menghapus rekaman <strong className="text-slate-900">{deleteHistoryTarget.stage_name}</strong> dari riwayat Open Mic ini? Data kehadiran dan hubungan dengan profil Komika akan ikut dihapus.</p><div className="flex gap-3"><button type="button" onClick={() => setDeleteHistoryTarget(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => void deleteHistory()} disabled={historySaving} className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">{historySaving ? 'Menghapus...' : 'Ya, Hapus'}</button></div></div>}
      </Modal>
    </div>
  );
}

function MorePage({ onNavigate, onSignOut, onViewWebsite }: { onNavigate: (s: Section) => void; onSignOut: () => void; onViewWebsite: () => void }) {
  const items: { label: string; icon: typeof BarChart3; onClick: () => void; section?: Section }[] = [
    { label: 'Gabung Komunitas', icon: UserPlus, onClick: () => onNavigate('applications'), section: 'applications' },
    { label: 'Settings', icon: Settings, onClick: () => onNavigate('settings'), section: 'settings' },
    { label: 'Lihat Website', icon: ExternalLink, onClick: onViewWebsite },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">More</h1>
        <p className="mt-1 text-sm text-slate-500">Menu lainnya.</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={item.onClick} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
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

function AdminFormModal({ kind, editing, saving, settings, onClose, onSaving, onSaved }: { kind: 'open-mic' | 'event' | 'komika' | null; editing: OpenMic | EventItem | Komika | null; saving: boolean; settings: SiteSettings; onClose: () => void; onSaving: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!kind) return;
    const row = editing as Record<string, unknown> | null;
    if (row) {
      setForm({ ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k === 'instagram_url' ? k : k === 'tiktok_url' ? k : k, k === 'instagram_url' ? formatInstagramHandle(String(v ?? '')) : k === 'tiktok_url' ? formatTikTokHandle(String(v ?? '')) : Array.isArray(v) ? v.join(', ') : String(v ?? '')])) });
    } else if (kind === 'komika') {
      setForm({ full_name: '', whatsapp: '', stage_name: '', photo: '', bio: '', instagram_url: '', tiktok_url: '', youtube_url: '', specialties: '', joined_at: '', status: 'active', published: 'true' });
    } else if (kind === 'open-mic') {
      setForm({ title: '', poster: '', date: '', time: '19.00', venue: '', location: 'Cilegon', maps_url: '', description: '', capacity: '10', status: 'upcoming', registration_status: 'open', published: 'true' });
    } else {
      setForm({ title: '', poster: '', date: '', time: '19.00', venue: '', location: 'Cilegon', maps_url: '', description: '', status: 'upcoming', registration_status: 'closed', published: 'true', whatsapp_number: settings.whatsapp_admin, whatsapp_message: '' });
    }
  }, [kind, editing, settings.whatsapp_admin]);

  if (!kind) return null;
  const isEdit = Boolean(editing);
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onSaving(true);
    const base = { ...form };
    try {
      if (kind === 'komika') {
        const payload = { ...base, instagram_url: instagramProfileUrl(base.instagram_url), tiktok_url: tiktokProfileUrl(base.tiktok_url), slug: isEdit ? base.slug : slugify(base.stage_name), specialties: (base.specialties || '').split(',').map((s) => s.trim()).filter(Boolean), published: base.published !== 'false' };
        const result = editing ? await supabase.from('komika').update(payload).eq('id', editing.id) : await supabase.from('komika').insert(payload);
        if (result.error) throw result.error;
      } else if (kind === 'open-mic') {
        const payload = { ...base, slug: isEdit ? base.slug : slugify(base.title), capacity: Number(base.capacity), published: base.published !== 'false' };
        const result = editing ? await supabase.from('open_mics').update(payload).eq('id', editing.id) : await supabase.from('open_mics').insert(payload);
        if (result.error) throw result.error;
      } else {
        const payload = { ...base, slug: isEdit ? base.slug : slugify(base.title), published: base.published !== 'false', whatsapp_number: settings.whatsapp_admin };
        const result = editing ? await supabase.from('events').update(payload).eq('id', editing.id) : await supabase.from('events').insert(payload);
        if (result.error) throw result.error;
      }
      onSaving(false);
      onSaved();
    } catch {
      onSaving(false);
    }
  }

  const title = kind === 'komika' ? 'Komika' : kind === 'event' ? 'Event' : 'Open Mic';

  const requiredFields = ['title', 'full_name', 'stage_name', 'date', 'time', 'venue'];

  const fields: [string, string, 'text' | 'textarea' | 'select' | 'date' | 'number'][] = kind === 'komika'
    ? [['full_name', 'Nama Lengkap', 'text'], ['stage_name', 'Stage Name', 'text'], ['whatsapp', 'Nomor WhatsApp (privat, tidak tampil publik)', 'text'], ['joined_at', 'Bergabung (bulan dan tahun)', 'text'], ['bio', 'Bio', 'textarea'], ['instagram_url', 'Instagram (@username)', 'text'], ['tiktok_url', 'TikTok (@username)', 'text'], ['youtube_url', 'YouTube URL', 'text'], ['specialties', 'Specialties (pisahkan koma)', 'textarea'], ['status', 'Status', 'select']]
    : kind === 'open-mic'
    ? [['title', 'Title', 'text'], ['date', 'Date', 'date'], ['time', 'Time', 'text'], ['venue', 'Venue', 'text'], ['location', 'Location', 'text'], ['maps_url', 'Maps URL', 'text'], ['description', 'Description', 'textarea'], ['capacity', 'Capacity', 'number'], ['status', 'Status', 'select'], ['registration_status', 'Registration', 'select']]
    : [['title', 'Event title', 'text'], ['date', 'Date', 'date'], ['time', 'Time', 'text'], ['venue', 'Venue', 'text'], ['location', 'Location', 'text'], ['maps_url', 'Maps URL', 'text'], ['description', 'Description', 'textarea'], ['whatsapp_number', 'WhatsApp number', 'text'], ['whatsapp_message', 'WhatsApp purchase message', 'textarea'], ['status', 'Status', 'select'], ['registration_status', 'Pendaftaran Peserta', 'select']];

  const selectOptions: Record<string, [string, string][]> = {
    status: kind === 'komika' ? [['active', 'Active'], ['archived', 'Archived']] : [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']],
    registration_status: [['open', 'Open'], ['closed', 'Closed']],
  };

  return (
    <Modal open={Boolean(kind)} onClose={onClose} title={`${isEdit ? 'Edit' : 'Tambah'} ${title}`} size="lg">
      <form onSubmit={submit} className="space-y-4 overflow-y-auto pr-1 sm:max-h-[75vh] sm:min-h-0">
        {kind === 'komika' && (
          <ImageUpload label="Foto Komika" folder="komika" value={form.photo ?? ''} onChange={(url) => set('photo', url)} aspect="portrait" onUploadingChange={setUploading} />
        )}
        {kind === 'open-mic' && (
          <ImageUpload label="Poster / Foto Open Mic" folder="open-mic" value={form.poster ?? ''} onChange={(url) => set('poster', url)} aspect="landscape" onUploadingChange={setUploading} />
        )}
        {kind === 'event' && (
          <ImageUpload label="Poster Event" folder="events" value={form.poster ?? ''} onChange={(url) => set('poster', url)} aspect="landscape" onUploadingChange={setUploading} />
        )}
        {fields.map(([key, label, type]) => (
          <div key={key}>
            <label className="label-field" htmlFor={`admin-${key}`}>{label}</label>
            {type === 'textarea' ? (
              <textarea id={`admin-${key}`} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} placeholder={getAdminFieldPlaceholder(key)} className="input-field min-h-[88px]" />
            ) : type === 'select' ? (
              <select id={`admin-${key}`} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} className="input-field">
                {(selectOptions[key] ?? []).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
              </select>
            ) : (
              <input id={`admin-${key}`} type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'} value={form[key] ?? ''} onChange={(e) => set(key, key === 'instagram_url' ? formatInstagramHandle(e.target.value) : key === 'tiktok_url' ? formatTikTokHandle(e.target.value) : e.target.value)} placeholder={getAdminFieldPlaceholder(key)} className="input-field" required={requiredFields.includes(key)} />
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.published !== 'false'} onChange={(e) => set('published', String(e.target.checked))} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Tampilkan di website
          </label>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button type="submit" disabled={saving || uploading} className="btn-primary flex-1">{uploading ? 'Mengupload...' : saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TicketManagementModal({ event, onClose, onNotice }: { event: EventItem | null; onClose: () => void; onNotice: (msg: string) => void }) {
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTicket, setEditingTicket] = useState<EventTicket | null>(null);
  const [showForm, setShowForm] = useState(false);

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
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{t.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.status === 'active' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>{t.status === 'active' ? 'Aktif' : 'Nonaktif'}</span>
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-blue-700">{formatPrice(t.price)}</p>
                    {t.description && <p className="mt-1 text-sm text-slate-500">{t.description}</p>}
                    <p className="mt-1 text-xs font-semibold text-slate-600">{t.ticket_url ? 'Mode: Link pihak ketiga' : 'Mode: WhatsApp'}</p>
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

function TicketFormModal({ event, ticket, onClose, onSaved }: { event: EventItem; ticket: EventTicket | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(ticket?.name ?? '');
  const [price, setPrice] = useState(ticket ? String(ticket.price) : '0');
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
    setSaving(true);
    const payload = {
      event_id: event.id,
      name: name.trim(),
      price: Number(price) || 0,
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
          <input id="ticket-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="input-field" placeholder="50000" />
          <p className="mt-1 text-xs text-slate-400">Masukkan 0 untuk GRATIS.</p>
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
            <select id="ticket-status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')} className="input-field">
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
