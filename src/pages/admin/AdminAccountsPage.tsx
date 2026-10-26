import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, KeyRound, Power, Search, ShieldPlus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';

type AdminRole = 'open_mic_admin' | 'event_admin' | 'admin_ticket' | 'admin_qr';
interface AdminAccount { id: string; email?: string; created_at: string; active: boolean; role: AdminRole; scopes?: Array<{ event_id: string | null; scope_all: boolean }>; }
interface AdminEvent { id: string; title: string; date: string; }

const ROLE_LABELS: Record<AdminRole, string> = { open_mic_admin: 'Admin Open Mic', event_admin: 'Admin Event', admin_ticket: 'Admin Tiket', admin_qr: 'Admin QR Scanner' };

async function getFunctionErrorMessage(error: { message: string; context?: unknown }, fallback: string) {
  const context = error.context;
  if (context && typeof context === 'object' && 'json' in context && typeof context.json === 'function') {
    try {
      const payload = await context.json() as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
    } catch {
      // Fall back to the SDK message when the response body is not JSON.
    }
  }
  return error.message || fallback;
}

export function AdminAccountsPage({ onNotice, creatorRole = 'admin' }: { onNotice: (message: string) => void; creatorRole?: 'admin' | 'event_admin' }) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AdminRole>(creatorRole === 'event_admin' ? 'admin_ticket' : 'open_mic_admin');
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>('all');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const eventDropdownRef = useRef<HTMLDivElement>(null);
  const eventSearchRef = useRef<HTMLInputElement>(null);
  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLocaleLowerCase('id-ID');
    return events.filter((event) => !query || event.title.toLocaleLowerCase('id-ID').includes(query));
  }, [eventSearch, events]);
  const requiresEventScope = role === 'admin_ticket' || role === 'admin_qr';

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'list' } });
    setLoading(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Daftar akun admin gagal dimuat.'); return; }
    setAccounts((data?.admins as AdminAccount[]) ?? []);
  }, [onNotice]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    const { data, error } = await supabase.from('events').select('id, title, date').order('date', { ascending: false });
    setEventsLoading(false);
    if (error) {
      setEventsError('Daftar Event gagal dimuat. Coba muat ulang sebelum membuat akun.');
      return;
    }
    setEventsError('');
    setEvents((data as AdminEvent[]) ?? []);
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!eventDropdownOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !eventDropdownRef.current?.contains(event.target)) {
        setEventDropdownOpen(false);
        setEventSearch('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEventDropdownOpen(false);
        setEventSearch('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    eventSearchRef.current?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [eventDropdownOpen]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: {
      action: 'create',
      email: email.trim(),
      password,
      role,
      ...(role === 'admin_ticket' || role === 'admin_qr' ? {
        scope_all: scopeMode === 'all',
        event_ids: scopeMode === 'all' ? [] : selectedEventIds,
      } : {}),
    } });
    setSaving(false);
    if (error) { onNotice(await getFunctionErrorMessage(error, 'Akun admin gagal dibuat.')); return; }
    if (data?.error) { onNotice(data.error); return; }
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSelectedEventIds([]);
    setScopeMode('all');
    setEventDropdownOpen(false);
    setEventSearch('');
    onNotice('Akun admin operasional berhasil dibuat.');
    await loadAccounts();
  }

  async function toggleAccount(account: AdminAccount) {
    setBusyId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'toggle', user_id: account.id, active: !account.active } });
    setBusyId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Status akun gagal diubah.'); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: Boolean(data?.user?.active) } : item));
  }

  async function deleteAccount(account: AdminAccount) {
    setBusyId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'delete', user_id: account.id } });
    setBusyId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Akun admin gagal dihapus.'); return; }
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    setDeleteTarget(null);
    onNotice('Akun admin berhasil dihapus.');
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader eyebrow="Menu Lainnya" title="Akun Admin" subtitle={creatorRole === 'event_admin' ? 'Buat dan kelola akun Admin Tiket serta Admin QR Scanner.' : 'Buat dan kelola akun admin operasional.'} />
      <form onSubmit={createAccount} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800 ring-1 ring-blue-100"><KeyRound className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Akun memakai login Admin yang sama di <strong>/admin/login</strong>.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label-field" htmlFor="admin-account-email">Email</label><input id="admin-account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" autoComplete="off" /></div>
          <div><label className="label-field" htmlFor="admin-account-password">Password sementara</label><div className="relative"><input id="admin-account-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="input-field !pr-12" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div><label className="label-field" htmlFor="admin-account-role">Role</label><select id="admin-account-role" value={role} onChange={(event) => setRole(event.target.value as AdminRole)} className="input-field">{creatorRole === 'admin' ? <><option value="open_mic_admin">Admin Open Mic</option><option value="event_admin">Admin Event</option></> : null}<option value="admin_ticket">Admin Tiket</option><option value="admin_qr">Admin QR Scanner</option></select></div>
        </div>
        {(role === 'admin_ticket' || role === 'admin_qr') && <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-bold text-slate-800">Akses Event</p>
          <div ref={eventDropdownRef} className="relative">
            <button type="button" onClick={() => setEventDropdownOpen((open) => !open)} disabled={eventsLoading || Boolean(eventsError)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:cursor-not-allowed disabled:bg-slate-100" aria-label="Pilih cakupan Event" aria-haspopup="listbox" aria-expanded={eventDropdownOpen}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{scopeMode === 'all' ? 'Semua Event' : `${selectedEventIds.length} Event dipilih`}</span>
                <span className="block truncate text-xs text-slate-500">{scopeMode === 'all' ? 'Termasuk Event yang dibuat nanti' : events.filter((event) => selectedEventIds.includes(event.id)).map((event) => event.title).join(', ') || 'Pilih minimal satu Event'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${eventDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {eventDropdownOpen && <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.2)]">
              <div className="border-b border-slate-100 p-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input ref={eventSearchRef} type="search" value={eventSearch} onChange={(change) => setEventSearch(change.target.value)} placeholder="Cari nama Event..." className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15" aria-label="Cari Event" />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5" role="group" aria-label="Pilihan cakupan Event">
                <label className={`mb-1 flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${scopeMode === 'all' ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="flex items-center gap-2.5"><input type="checkbox" checked={scopeMode === 'all'} onChange={() => { setScopeMode('all'); setSelectedEventIds([]); }} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span>Semua Event</span></span>
                  {scopeMode === 'all' && <Check className="h-4 w-4 shrink-0" />}
                </label>
                {filteredEvents.map((event) => <label key={event.id} className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${scopeMode === 'selected' && selectedEventIds.includes(event.id) ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="flex min-w-0 items-center gap-2.5"><input type="checkbox" checked={scopeMode === 'selected' && selectedEventIds.includes(event.id)} onChange={(change) => { setScopeMode('selected'); setSelectedEventIds((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id)); }} className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span className="min-w-0"><span className="block truncate">{event.title}</span><span className="block text-xs font-normal text-slate-500">{event.date}</span></span></span>
                  {scopeMode === 'selected' && selectedEventIds.includes(event.id) && <Check className="h-4 w-4 shrink-0" />}
                </label>)}
                {!filteredEvents.length && <p className="px-3 py-4 text-center text-xs font-medium text-slate-500">{events.length ? 'Event tidak ditemukan.' : 'Belum ada Event. Buat Event terlebih dahulu agar dapat dipilih.'}</p>}
              </div>
            </div>}
          </div>
          {eventsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><span>{eventsError}</span><button type="button" onClick={() => void loadEvents()} disabled={eventsLoading} className="font-bold underline disabled:opacity-50">{eventsLoading ? 'Memuat...' : 'Coba lagi'}</button></div>}
          {scopeMode === 'all' ? <p className="text-xs text-slate-600">Akun dapat mengakses semua Event, termasuk Event yang dibuat nanti.</p> : <p className="text-xs text-slate-600">{selectedEventIds.length} Event dipilih.</p>}
        </div>}
        <button type="submit" disabled={saving || requiresEventScope && (eventsLoading || scopeMode === 'selected' && (Boolean(eventsError) || selectedEventIds.length === 0))} className="btn-primary mt-5"><ShieldPlus className="h-4 w-4" />{saving ? 'Membuat akun...' : 'Buat Akun Admin'}</button>
      </form>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Daftar Akun Admin</h2><p className="mt-1 text-sm text-slate-500">Akun operasional yang dapat masuk melalui login Admin.</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{accounts.length} akun</span></div>
        <div className="mt-4 space-y-2.5">{loading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : accounts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada akun admin operasional.</div> : accounts.map((account) => { const scopeLabel = !account.scopes?.length ? '' : account.scopes.some((scope) => scope.scope_all) ? 'Semua Event' : `${new Set(account.scopes.map((scope) => scope.event_id)).size} Event terpilih`; return <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">{account.email}</p><p className="text-xs font-semibold text-blue-700">{ROLE_LABELS[account.role]}</p>{scopeLabel && <p className="mt-0.5 text-xs text-slate-500">Akses: {scopeLabel}</p>}</div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span><button type="button" onClick={() => void toggleAccount(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white disabled:opacity-50" title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteTarget(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white disabled:opacity-50" title="Hapus akun"><Trash2 className="h-4 w-4" /></button></div></div>; })}</div>
      </section>
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Hapus Akun Admin?" size="sm"><div className="space-y-4"><p className="text-sm text-slate-600">Akun <strong>{deleteTarget?.email}</strong> tidak dapat login lagi.</p><div className="flex gap-3"><button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => deleteTarget && void deleteAccount(deleteTarget)} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white"><Trash2 className="mr-1 inline h-4 w-4" /> Hapus</button></div></div></Modal>
    </div>
  );
}
