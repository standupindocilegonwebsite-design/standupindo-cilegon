import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Eye, EyeOff, KeyRound, Mail, Pencil, Phone, Power, Plus, Search, ShieldCheck, ShieldPlus, Trash2, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';
import type { StatusBannerVariant } from '@/components/ui/StatusBanner';

type AdminRole = 'open_mic_admin' | 'event_admin' | 'admin_ticket' | 'admin_qr';
interface AdminAccount { id: string; email?: string; full_name: string; whatsapp: string; created_at: string; active: boolean; role: AdminRole; scopes?: Array<{ event_id: string | null; scope_all: boolean }>; }
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

export function AdminAccountsPage({ onNotice, creatorRole = 'admin' }: { onNotice: (message: string, variant: StatusBannerVariant) => void; creatorRole?: 'admin' | 'event_admin' }) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('');
  const [passwordValidationError, setPasswordValidationError] = useState('');
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditPasswordConfirm, setShowEditPasswordConfirm] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [search, setSearch] = useState('');
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
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return accounts.filter((account) => `${account.full_name} ${account.email ?? ''} ${account.whatsapp} ${ROLE_LABELS[account.role]}`.toLocaleLowerCase('id-ID').includes(query));
  }, [accounts, search]);
  const requiresEventScope = role === 'admin_ticket' || role === 'admin_qr';

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'list' } });
    setLoading(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Daftar akun admin gagal dimuat.', 'error'); return; }
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
      full_name: fullName.trim(),
      whatsapp: whatsapp.trim(),
      role,
      ...(role === 'admin_ticket' || role === 'admin_qr' ? {
        scope_all: scopeMode === 'all',
        event_ids: scopeMode === 'all' ? [] : selectedEventIds,
      } : {}),
    } });
    setSaving(false);
    if (error) { onNotice(await getFunctionErrorMessage(error, 'Akun admin gagal dibuat.'), 'error'); return; }
    if (data?.error) { onNotice(data.error, 'error'); return; }
    setEmail('');
    setPassword('');
    setFullName('');
    setWhatsapp('');
    setShowPassword(false);
    setSelectedEventIds([]);
    setScopeMode('all');
    setEventDropdownOpen(false);
    setEventSearch('');
    setCreateModalOpen(false);
    onNotice('Akun admin operasional berhasil dibuat.', 'success');
    await loadAccounts();
  }

  async function updateAccountProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    setPasswordValidationError('');
    if (editPassword && editPassword.length < 6) {
      setPasswordValidationError('Password baru minimal 6 karakter.');
      return;
    }
    if (editPassword !== editPasswordConfirm) {
      setPasswordValidationError('Konfirmasi password baru tidak sama.');
      return;
    }
    setProfileSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: {
      action: 'update-profile',
      user_id: editTarget.id,
      full_name: editFullName.trim(),
      whatsapp: editWhatsapp.trim(),
      ...(editPassword ? { password: editPassword } : {}),
    } });
    setProfileSaving(false);
    if (error || data?.error) { onNotice(error ? await getFunctionErrorMessage(error, 'Profil akun gagal diperbarui.') : data?.error, 'error'); return; }
    setAccounts((current) => current.map((account) => account.id === editTarget.id
      ? { ...account, full_name: data.user.full_name, whatsapp: data.user.whatsapp }
      : account));
    setEditTarget(null);
    setEditPassword('');
    setEditPasswordConfirm('');
    setPasswordChangeOpen(false);
    setShowEditPassword(false);
    setShowEditPasswordConfirm(false);
    onNotice(editPassword ? 'Profil dan password admin berhasil diperbarui.' : 'Nama dan nomor handphone admin berhasil diperbarui.', 'success');
  }

  async function toggleAccount(account: AdminAccount) {
    setBusyId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'toggle', user_id: account.id, active: !account.active } });
    setBusyId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Status akun gagal diubah.', 'error'); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: Boolean(data?.user?.active) } : item));
  }

  async function deleteAccount(account: AdminAccount) {
    setBusyId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'delete', user_id: account.id } });
    setBusyId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Akun admin gagal dihapus.', 'error'); return; }
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    setDeleteTarget(null);
    onNotice('Akun admin berhasil dihapus.', 'success');
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader eyebrow="Menu Lainnya" title="Akun Admin" subtitle={creatorRole === 'event_admin' ? 'Buat dan kelola akun Admin Tiket serta Admin QR Scanner.' : 'Buat dan kelola akun admin operasional.'} action={<button type="button" onClick={() => setCreateModalOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="Tambah Akun Admin" title="Tambah Akun Admin"><Plus className="h-5 w-5" /></button>} />
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Tambah Akun Admin" titleEyebrow="Akun Operasional" size="lg">
      <form onSubmit={createAccount} className="space-y-4">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800 ring-1 ring-blue-100"><KeyRound className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Akun memakai login Admin yang sama di <strong>/admin/login</strong>.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label-field" htmlFor="admin-account-full-name">Nama Lengkap</label><input id="admin-account-full-name" required maxLength={160} value={fullName} onChange={(event) => setFullName(event.target.value)} className="input-field" autoComplete="name" placeholder="Nama sesuai identitas" /></div>
          <div><label className="label-field" htmlFor="admin-account-whatsapp">Nomor Handphone</label><input id="admin-account-whatsapp" type="tel" required maxLength={30} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="input-field" autoComplete="tel" placeholder="Contoh: 08xxxxxxxxxx" /></div>
          <div><label className="label-field" htmlFor="admin-account-email">Email</label><input id="admin-account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" autoComplete="off" /></div>
          <div><label className="label-field" htmlFor="admin-account-password">Password sementara</label><div className="relative"><input id="admin-account-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="input-field !pr-12" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div className="sm:col-span-2"><label className="label-field" htmlFor="admin-account-role">Role</label><select id="admin-account-role" value={role} onChange={(event) => setRole(event.target.value as AdminRole)} className="input-field">{creatorRole === 'admin' ? <><option value="open_mic_admin">Admin Open Mic</option><option value="event_admin">Admin Event</option></> : null}<option value="admin_ticket">Admin Tiket</option><option value="admin_qr">Admin QR Scanner</option></select></div>
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
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary min-h-11 justify-center sm:min-w-28">Batal</button><button type="submit" disabled={saving || requiresEventScope && (eventsLoading || scopeMode === 'selected' && (Boolean(eventsError) || selectedEventIds.length === 0))} className="btn-primary min-h-11 justify-center sm:min-w-44"><ShieldPlus className="h-4 w-4" />{saving ? 'Membuat akun...' : 'Buat Akun Admin'}</button></div>
      </form>
      </Modal>
      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-extrabold text-slate-900">Daftar Akun Admin</h2><p className="mt-1 text-sm text-slate-500">Akun operasional yang dapat masuk melalui login Admin.</p></div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, nomor, atau role..." aria-label="Cari akun admin" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></div>
          <span className="text-xs font-semibold text-slate-500">{filteredAccounts.length} dari {accounts.length} akun</span>
        </div>
        {loading ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-100" />
          : filteredAccounts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{accounts.length ? 'Akun tidak ditemukan.' : 'Belum ada akun admin operasional.'}</div>
            : <>
              <div className="mt-4 space-y-3 md:hidden">
                {filteredAccounts.map((account) => {
                  const scopeLabel = !account.scopes?.length ? '' : account.scopes.some((scope) => scope.scope_all) ? 'Semua Event' : `${new Set(account.scopes.map((scope) => scope.event_id)).size} Event terpilih`;
                  return <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UserRound className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-900">{account.full_name || 'Nama belum diisi'}</p><p className="mt-0.5 truncate text-xs text-slate-600">{account.email}</p><p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-600"><Phone className="h-3.5 w-3.5" />{account.whatsapp || 'Nomor belum diisi'}</p></div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-blue-800">{ROLE_LABELS[account.role]}</p>{scopeLabel && <p className="mt-0.5 text-xs text-slate-600">Akses: {scopeLabel}</p>}</div>
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => { setEditTarget(account); setEditFullName(account.full_name); setEditWhatsapp(account.whatsapp); }} disabled={busyId === account.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50" title="Edit profil" aria-label="Edit profil admin"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void toggleAccount(account)} disabled={busyId === account.id} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-50 ${account.active ? 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'}`} title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} aria-label={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteTarget(account)} disabled={busyId === account.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50" title="Hapus akun" aria-label="Hapus akun"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </article>;
                })}
              </div>
              <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nama / Email</th><th className="px-4 py-3">Nomor Handphone</th><th className="px-4 py-3">Role / Akses</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.map((account) => {
                      const scopeLabel = !account.scopes?.length ? '' : account.scopes.some((scope) => scope.scope_all) ? 'Semua Event' : `${new Set(account.scopes.map((scope) => scope.event_id)).size} Event terpilih`;
                      return <tr key={account.id} className="bg-white">
                        <td className="px-4 py-3"><p className="font-bold text-slate-900">{account.full_name || 'Nama belum diisi'}</p><p className="mt-0.5 text-xs text-slate-500">{account.email}</p></td>
                        <td className="px-4 py-3 text-slate-700">{account.whatsapp || '—'}</td>
                        <td className="px-4 py-3"><p className="font-semibold text-blue-800">{ROLE_LABELS[account.role]}</p>{scopeLabel && <p className="mt-0.5 text-xs text-slate-500">Akses: {scopeLabel}</p>}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span></td>
                        <td className="px-4 py-3"><div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setEditTarget(account); setEditFullName(account.full_name); setEditWhatsapp(account.whatsapp); }} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50" title="Edit profil" aria-label="Edit profil admin"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => void toggleAccount(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50" title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button>
                          <button type="button" onClick={() => setDeleteTarget(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50" title="Hapus akun"><Trash2 className="h-4 w-4" /></button>
                        </div></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </>}
      </section>
      <Modal open={Boolean(editTarget)} onClose={() => { setEditTarget(null); setEditPassword(''); setEditPasswordConfirm(''); setPasswordChangeOpen(false); setShowEditPassword(false); setShowEditPasswordConfirm(false); }} title="Edit Profil Admin" titleEyebrow="Kelola Akun" size="md">
        <form onSubmit={updateAccountProfile} className="space-y-4">
          {editTarget && (() => {
            const scopeLabel = !editTarget.scopes?.length ? 'Tidak ada scope khusus'
              : editTarget.scopes.some((scope) => scope.scope_all) ? 'Semua Event'
                : `${new Set(editTarget.scopes.map((scope) => scope.event_id)).size} Event dipilih`;
            return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <div className="flex items-start gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><UserRound className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Detail akun</p>
                    <button type="button" onClick={() => { setPasswordChangeOpen((open) => !open); if (passwordChangeOpen) { setEditPassword(''); setEditPasswordConfirm(''); setShowEditPassword(false); setShowEditPasswordConfirm(false); } }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${passwordChangeOpen ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'}`} title={passwordChangeOpen ? 'Tutup ganti password' : 'Ganti password'} aria-label={passwordChangeOpen ? 'Tutup ganti password' : 'Buka ganti password'} aria-expanded={passwordChangeOpen}><KeyRound className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-1 flex min-w-0 items-start gap-2 text-sm font-bold text-slate-900"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="break-all">{editTarget.email || 'Email tidak tersedia'}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800"><ShieldCheck className="h-3.5 w-3.5" />{ROLE_LABELS[editTarget.role]}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${editTarget.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{editTarget.active ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                </div>
              </div>
              {(editTarget.role === 'admin_ticket' || editTarget.role === 'admin_qr') && <div className="flex items-start gap-2.5 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span><strong className="font-bold text-slate-700">Akses Event:</strong> {scopeLabel}</span>
              </div>}
            </section>;
          })()}
          <div className="space-y-3">
            <div><h4 className="text-sm font-extrabold text-slate-900">Informasi Profil</h4><p className="mt-0.5 text-xs leading-5 text-slate-500">Ubah nama dan nomor handphone yang terhubung ke akun admin ini.</p></div>
            <div><label className="label-field" htmlFor="edit-admin-full-name">Nama Lengkap</label><input id="edit-admin-full-name" required maxLength={160} value={editFullName} onChange={(event) => setEditFullName(event.target.value)} className="input-field" autoComplete="name" /></div>
            <div><label className="label-field" htmlFor="edit-admin-whatsapp">Nomor Handphone</label><input id="edit-admin-whatsapp" type="tel" required maxLength={30} value={editWhatsapp} onChange={(event) => setEditWhatsapp(event.target.value)} className="input-field" autoComplete="tel" /></div>
          </div>
          {passwordChangeOpen && <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><KeyRound className="h-4 w-4" /></span>
              <div><h4 className="text-sm font-extrabold text-slate-900">Ganti Password <span className="font-semibold text-slate-500">(Opsional)</span></h4><p className="mt-0.5 text-xs leading-5 text-slate-500">Isi hanya jika ingin membuat password baru. Minimal 6 karakter.</p></div>
            </div>
            {passwordValidationError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{passwordValidationError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field" htmlFor="edit-admin-password">Password Baru</label>
                <div className="relative"><input id="edit-admin-password" type={showEditPassword ? 'text' : 'password'} minLength={6} value={editPassword} onChange={(event) => setEditPassword(event.target.value)} className="input-field !pr-12" autoComplete="new-password" placeholder="Minimal 6 karakter" /><button type="button" onClick={() => setShowEditPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={showEditPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}>{showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              </div>
              <div>
                <label className="label-field" htmlFor="edit-admin-password-confirm">Konfirmasi Password Baru</label>
                <div className="relative"><input id="edit-admin-password-confirm" type={showEditPasswordConfirm ? 'text' : 'password'} minLength={6} value={editPasswordConfirm} onChange={(event) => setEditPasswordConfirm(event.target.value)} className="input-field !pr-12" autoComplete="new-password" placeholder="Ulangi password baru" /><button type="button" onClick={() => setShowEditPasswordConfirm((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={showEditPasswordConfirm ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}>{showEditPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              </div>
            </div>
          </section>}
          <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">Email, role, dan akses Event hanya ditampilkan sebagai informasi dan tidak berubah saat profil disimpan.</p>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditTarget(null)} className="btn-secondary min-h-11 justify-center sm:min-w-28">Batal</button><button type="submit" disabled={profileSaving} className="btn-primary min-h-11 justify-center sm:min-w-36"><Check className="h-4 w-4" />{profileSaving ? 'Menyimpan...' : 'Simpan Profil'}</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Hapus Akun Admin?" size="sm"><div className="space-y-4"><p className="text-sm text-slate-600">Akun <strong>{deleteTarget?.email}</strong> tidak dapat login lagi.</p><div className="flex gap-3"><button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => deleteTarget && void deleteAccount(deleteTarget)} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white"><Trash2 className="mr-1 inline h-4 w-4" /> Hapus</button></div></div></Modal>
    </div>
  );
}
