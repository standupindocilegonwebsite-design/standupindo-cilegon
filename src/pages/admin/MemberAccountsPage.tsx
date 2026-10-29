import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, KeyRound, Mail, Pencil, Power, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';
import type { StatusBannerVariant } from '@/components/ui/StatusBanner';

interface MemberAccount {
  id: string;
  email?: string;
  created_at: string;
  active: boolean;
  role: 'member' | 'evaluator';
  evaluator_enabled?: boolean;
  profile?: { stage_name: string; full_name: string; photo: string | null; status: string } | null;
}

export function MemberAccountsPage({ komika, onNotice }: { komika: Komika[]; onNotice: (message: string, variant: StatusBannerVariant) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [komikaId, setKomikaId] = useState('');
  const [komikaSearch, setKomikaSearch] = useState('');
  const [komikaPickerOpen, setKomikaPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<MemberAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<'member' | 'evaluator'>('member');
  const [accountSearch, setAccountSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MemberAccount | null>(null);
  const [editTarget, setEditTarget] = useState<MemberAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const selectedKomika = komika.find((profile) => profile.id === komikaId);
  const filteredKomika = useMemo(() => komika
    .filter((profile) => profile.stage_name.toLowerCase().includes(komikaSearch.trim().toLowerCase()) || profile.full_name.toLowerCase().includes(komikaSearch.trim().toLowerCase()))
    .sort((a, b) => a.stage_name.localeCompare(b.stage_name, 'id', { sensitivity: 'base' })), [komika, komikaSearch]);
  const filteredAccounts = useMemo(() => accounts
    .filter((account) => `${account.profile?.stage_name ?? ''} ${account.profile?.full_name ?? ''} ${account.email ?? ''}`.toLowerCase().includes(accountSearch.trim().toLowerCase()))
    .sort((a, b) => (a.profile?.stage_name ?? a.profile?.full_name ?? a.email ?? '').localeCompare(b.profile?.stage_name ?? b.profile?.full_name ?? b.email ?? '', 'id', { sensitivity: 'base' })), [accounts, accountSearch]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'list' } });
    setAccountsLoading(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Daftar akun member gagal dimuat.', 'error'); return; }
    setAccounts((data?.members as MemberAccount[]) ?? []);
  }, [onNotice]);

  async function toggleAccount(account: MemberAccount) {
    setTogglingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'toggle', user_id: account.id, active: !account.active } });
    setTogglingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Status akun gagal diubah.', 'error'); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: Boolean(data?.user?.active) } : item));
    onNotice(`Akun ${account.email ?? 'member'} sekarang ${data?.user?.active ? 'aktif' : 'nonaktif'}.`, 'success');
  }

  async function deleteAccount(account: MemberAccount) {
    const label = account.profile?.stage_name ?? account.email ?? 'akun ini';
    setTogglingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'delete', user_id: account.id } });
    setTogglingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Akun member gagal dihapus.', 'error'); return; }
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    setDeleteTarget(null);
    onNotice(`Akun ${label} berhasil dihapus.`, 'success');
  }

  async function updateRole(account: MemberAccount, role: 'member' | 'evaluator') {
    if (role === account.role) return;
    setRoleUpdatingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'update-role', user_id: account.id, role } });
    setRoleUpdatingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Peran akun gagal diubah.', 'error'); return; }
    const updatedRole = data?.user?.role === 'evaluator' ? 'evaluator' : 'member';
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: updatedRole, evaluator_enabled: updatedRole === 'evaluator' } : item));
    setEditTarget((current) => current?.id === account.id ? { ...current, role: updatedRole, evaluator_enabled: updatedRole === 'evaluator' } : current);
    setRoleDraft(updatedRole);
    onNotice(`${account.email ?? 'Akun member'} sekarang memiliki role ${role === 'evaluator' ? 'Member + Evaluator' : 'Member'}.`, 'success');
  }

  async function resetAccountPassword() {
    if (!editTarget || resetPassword.length < 6) return;
    setResetPasswordError('');
    if (resetPassword !== resetPasswordConfirm) {
      setResetPasswordError('Konfirmasi password baru tidak sama.');
      return;
    }
    setResetSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'reset-password', user_id: editTarget.id, password: resetPassword } });
    setResetSaving(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Password akun gagal direset.', 'error'); return; }
    setResetPassword('');
    setResetPasswordConfirm('');
    setPasswordChangeOpen(false);
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    onNotice(`Password ${editTarget.email ?? 'akun member'} berhasil diperbarui.`, 'success');
  }

  function openEditAccount(account: MemberAccount) {
    setEditTarget(account);
    setRoleDraft(account.role);
    setRoleDropdownOpen(false);
    setResetPassword('');
    setResetPasswordConfirm('');
    setPasswordChangeOpen(false);
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
  }

  function closeEditAccount() {
    setEditTarget(null);
    setRoleDraft('member');
    setRoleDropdownOpen(false);
    setResetPassword('');
    setResetPasswordConfirm('');
    setPasswordChangeOpen(false);
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
  }

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const { data, error } = await supabase.functions.invoke('admin-create-member', {
      body: { email: email.trim(), password, komika_id: komikaId || null },
    });

    setSaving(false);
    if (error || data?.error) {
      onNotice(data?.error ?? (error ? await getFunctionErrorMessage(error, 'Akun member gagal dibuat.') : 'Akun member gagal dibuat.'), 'error');
      return;
    }

    setEmail('');
    setPassword('');
    setShowPassword(false);
    setKomikaId('');
    setKomikaSearch('');
    setKomikaPickerOpen(false);
    setCreateModalOpen(false);
    onNotice('Akun member berhasil dibuat dan siap digunakan.', 'success');
    await loadAccounts();
  }

  return (
    <div className="space-y-5">
      <WorkspacePageHeader eyebrow="Menu Lainnya" title="Akun Member" subtitle="Kelola akun login dan hubungkan ke profil Komika." action={<button type="button" onClick={() => setCreateModalOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="Tambah Akun Member" title="Tambah Akun Member"><Plus className="h-5 w-5" /></button>} />

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Tambah Akun Member" titleEyebrow="Akun Member" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-blue-50 p-3.5 text-blue-800 ring-1 ring-blue-100"><KeyRound className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Akun aktif dan dapat langsung login melalui halaman Member.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label-field" htmlFor="member-account-email">Email</label><input id="member-account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" placeholder="member@email.com" autoComplete="off" /></div>
            <div><label className="label-field" htmlFor="member-account-password">Password sementara</label><div className="relative"><input id="member-account-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="input-field !pr-12" placeholder="Minimal 6 karakter" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          </div>
          <div className="relative">
            <label className="label-field" htmlFor="member-account-komika-search">Profil Komika <span className="font-medium text-slate-500">(Opsional)</span></label>
            <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="member-account-komika-search" value={selectedKomika ? selectedKomika.stage_name : komikaSearch} onChange={(event) => { setKomikaId(''); setKomikaSearch(event.target.value); setKomikaPickerOpen(true); }} onFocus={() => setKomikaPickerOpen(true)} className="input-field !pr-20 !pl-10" placeholder="Cari nama Komika..." autoComplete="off" />{selectedKomika && <button type="button" onClick={() => { setKomikaId(''); setKomikaSearch(''); setKomikaPickerOpen(true); }} className="absolute right-9 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Hapus pilihan Komika"><X className="h-4 w-4" /></button>}<button type="button" onClick={() => setKomikaPickerOpen((value) => !value)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Buka pilihan profil Komika"><ChevronDown className={`h-4 w-4 transition ${komikaPickerOpen ? 'rotate-180 text-blue-600' : ''}`} /></button></div>
            {komikaPickerOpen && <>
              <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setKomikaPickerOpen(false)} aria-label="Tutup pilihan profil Komika" />
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                <button type="button" onClick={() => { setKomikaId(''); setKomikaSearch(''); setKomikaPickerOpen(false); }} className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">Tanpa menghubungkan profil</button>
                {filteredKomika.map((profile) => <button key={profile.id} type="button" onClick={() => { setKomikaId(profile.id); setKomikaSearch(''); setKomikaPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-100 text-xs font-black text-blue-700">{profile.photo ? <img src={profile.photo} alt="" className="h-full w-full object-cover" /> : profile.stage_name.charAt(0).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{profile.stage_name}</span><span className="block truncate text-xs text-slate-500">{profile.full_name}</span>{profile.user_id && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600"><Check className="h-3 w-3" />Akun terhubung</span>}</span></span>{profile.id === komikaId && <Check className="h-4 w-4 shrink-0 text-blue-600" />}</button>)}
                {!filteredKomika.length && <p className="px-3 py-3 text-sm text-slate-500">Profil Komika tidak ditemukan.</p>}
              </div>
            </>}
            <p className="mt-1.5 text-xs text-slate-500">Hubungkan profil agar member dapat melihat pendaftaran dan evaluasinya sendiri.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary min-h-11 justify-center sm:min-w-28">Batal</button><button type="submit" disabled={saving} className="btn-primary min-h-11 justify-center sm:min-w-44"><UserPlus className="h-4 w-4" />{saving ? 'Membuat akun...' : 'Buat Akun Member'}</button></div>
        </form>
      </Modal>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">Daftar Akun Member</h2><p className="mt-1 text-sm text-slate-500">Kelola akun, role, dan profil Komika yang terhubung.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{accounts.length} akun</span><button type="button" onClick={() => void loadAccounts()} disabled={accountsLoading} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60" aria-label="Muat ulang daftar akun member" title="Muat ulang daftar akun member"><RefreshCw className={`h-4 w-4 ${accountsLoading ? 'animate-spin' : ''}`} /></button></div></div>
        <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 sm:max-w-sm" placeholder="Cari nama, email, atau nama panggung..." aria-label="Cari akun member" /></div>
        <p className="mt-2 text-xs font-semibold text-slate-500">{filteredAccounts.length} dari {accounts.length} akun</p>
        {accountsLoading ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-100" />
          : filteredAccounts.length === 0 ? <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"><Users className="h-6 w-6" /></span><p className="mt-3 text-sm font-bold text-slate-700">{accounts.length ? 'Akun member tidak ditemukan' : 'Belum ada akun member'}</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{accounts.length ? 'Coba kata kunci pencarian lain.' : 'Akun member yang dibuat akan muncul di daftar ini.'}</p></div>
            : <>
              <div className="mt-4 space-y-3 md:hidden">
                {filteredAccounts.map((account) => <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-sm font-black text-blue-700">{account.profile?.photo ? <img src={account.profile.photo} alt="" className="h-full w-full object-cover" /> : (account.profile?.stage_name ?? account.email ?? 'M').charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-900">{account.profile?.stage_name ?? 'Profil belum terhubung'}</p><p className="mt-0.5 truncate text-xs text-slate-600">{account.profile?.full_name ?? 'Nama lengkap belum tersedia'}</p><p className="mt-1 flex items-start gap-1.5 break-all text-xs text-slate-500"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />{account.email ?? 'Email tidak tersedia'}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-blue-800">{account.role === 'evaluator' ? 'Member + Evaluator' : 'Member'}</p><p className="mt-0.5 text-xs text-slate-600">{account.profile ? `Profil terhubung · ${account.profile.status}` : 'Belum terhubung ke profil Komika'}</p></div>
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => openEditAccount(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50" title="Detail dan edit akun" aria-label="Detail dan edit akun member"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void toggleAccount(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-50 ${account.active ? 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'}`} title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} aria-label={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setDeleteTarget(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50" title="Hapus akun" aria-label="Hapus akun member"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>)}
              </div>
              <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Profil Komika</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{filteredAccounts.map((account) => <tr key={account.id} className="bg-white">
                    <td className="px-4 py-3"><p className="font-bold text-slate-900">{account.profile?.stage_name ?? 'Profil belum terhubung'}</p><p className="mt-0.5 text-xs text-slate-500">{account.profile?.full_name ?? 'Nama lengkap belum tersedia'}</p></td>
                    <td className="px-4 py-3 text-slate-700">{account.email ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-blue-800">{account.role === 'evaluator' ? 'Member + Evaluator' : 'Member'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEditAccount(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50" title="Detail dan edit akun" aria-label="Detail dan edit akun member"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void toggleAccount(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${account.active ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'} disabled:opacity-50`} title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} aria-label={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteTarget(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50" title="Hapus akun" aria-label="Hapus akun member"><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
      </section>

      <Modal open={Boolean(editTarget)} onClose={closeEditAccount} title="Detail Akun Member" titleEyebrow="Kelola Akun" size="md">
        {editTarget && <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-700 text-sm font-black text-white">{editTarget.profile?.photo ? <img src={editTarget.profile.photo} alt="" className="h-full w-full object-cover" /> : (editTarget.profile?.stage_name ?? editTarget.email ?? 'M').charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Detail akun</p><button type="button" onClick={() => { setPasswordChangeOpen((open) => !open); if (passwordChangeOpen) { setResetPassword(''); setResetPasswordConfirm(''); setShowResetPassword(false); setShowResetPasswordConfirm(false); } }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${passwordChangeOpen ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-700'}`} title={passwordChangeOpen ? 'Tutup ganti password' : 'Ganti password'} aria-label={passwordChangeOpen ? 'Tutup ganti password' : 'Buka ganti password'} aria-expanded={passwordChangeOpen}><KeyRound className="h-4 w-4" /></button></div>
                <p className="mt-1 break-all text-sm font-bold text-slate-900">{editTarget.email ?? 'Email tidak tersedia'}</p>
                <div className="mt-2 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-700 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck className="h-3.5 w-3.5" />{editTarget.role === 'evaluator' ? 'Member + Evaluator' : 'Member'}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${editTarget.active ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white'}`}>{editTarget.active ? 'Aktif' : 'Nonaktif'}</span></div>
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white px-4 py-3"><p className="text-xs font-bold text-slate-700">Profil Komika</p><p className="mt-1 text-sm font-semibold text-slate-900">{editTarget.profile?.stage_name ?? 'Belum terhubung'}</p>{editTarget.profile && <p className="mt-0.5 text-xs text-slate-500">{editTarget.profile.full_name} · {editTarget.profile.status}</p>}</div>
          </section>
          <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <div><h4 id="member-account-role-label" className="text-sm font-extrabold text-slate-900">Peran Akun</h4><p className="mt-0.5 text-xs leading-5 text-slate-500">Pilih akses tambahan Evaluator jika diperlukan.</p></div>
            <div
              className="relative"
              onBlur={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                  setRoleDropdownOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRoleDropdownOpen(false);
              }}
            >
              <button
                type="button"
                aria-labelledby="member-account-role-label"
                aria-haspopup="listbox"
                aria-expanded={roleDropdownOpen}
                onClick={() => setRoleDropdownOpen((open) => !open)}
                disabled={roleUpdatingId === editTarget.id}
                className={`input-field flex min-h-12 items-center justify-between gap-3 text-left transition ${roleDropdownOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'hover:border-blue-300'} disabled:cursor-wait disabled:opacity-60`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${roleDraft === 'evaluator' ? 'bg-violet-700' : 'bg-blue-700'}`}><ShieldCheck className="h-4 w-4" /></span>
                  <span className="truncate text-sm font-bold text-slate-800">{roleDraft === 'evaluator' ? 'Member + Evaluator' : 'Member'}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${roleDropdownOpen ? 'rotate-180 text-blue-700' : ''}`} />
              </button>
              {roleDropdownOpen && <div role="listbox" aria-labelledby="member-account-role-label" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
                {([
                  { value: 'member', label: 'Member', description: 'Akses akun dan profil member', iconClass: 'bg-blue-700 text-white' },
                  { value: 'evaluator', label: 'Member + Evaluator', description: 'Akses member serta fitur evaluasi', iconClass: 'bg-violet-700 text-white' },
                ] as const).map((option) => {
                  const selected = roleDraft === option.value;
                  return <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setRoleDropdownOpen(false);
                      setRoleDraft(option.value);
                    }}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${option.iconClass}`}><ShieldCheck className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{option.label}</span><span className={`mt-0.5 block text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>{option.description}</span></span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-white" />}
                  </button>;
                })}
              </div>}
            </div>
            {roleDraft !== editTarget.role && <div className="flex flex-col gap-2 rounded-xl border border-slate-200 border-l-4 border-l-blue-700 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold leading-5 text-slate-700">Perubahan role belum disimpan.</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setRoleDraft(editTarget.role)} disabled={roleUpdatingId === editTarget.id} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Batal</button>
                <button type="button" onClick={() => void updateRole(editTarget, roleDraft)} disabled={roleUpdatingId === editTarget.id} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"><Check className="h-3.5 w-3.5" />{roleUpdatingId === editTarget.id ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
              </div>
            </div>}
          </section>
          {passwordChangeOpen && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white"><KeyRound className="h-4 w-4" /></span><div><h4 className="text-sm font-extrabold text-slate-900">Ganti Password <span className="font-semibold text-slate-500">(Opsional)</span></h4><p className="mt-0.5 text-xs leading-5 text-slate-500">Isi password baru minimal 6 karakter lalu konfirmasi.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label-field" htmlFor="member-reset-password">Password Baru</label><div className="relative"><input id="member-reset-password" type={showResetPassword ? 'text' : 'password'} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="input-field !pr-12" placeholder="Minimal 6 karakter" minLength={6} autoComplete="new-password" /><button type="button" onClick={() => setShowResetPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700" aria-label={showResetPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}>{showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <div><label className="label-field" htmlFor="member-reset-password-confirm">Konfirmasi Password Baru</label><div className="relative"><input id="member-reset-password-confirm" type={showResetPasswordConfirm ? 'text' : 'password'} value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} className="input-field !pr-12" placeholder="Ulangi password baru" minLength={6} autoComplete="new-password" /><button type="button" onClick={() => setShowResetPasswordConfirm((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700" aria-label={showResetPasswordConfirm ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}>{showResetPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            </div>
            {resetPasswordError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resetPasswordError}</p>}
            <button type="button" onClick={() => void resetAccountPassword()} disabled={resetPassword.length < 6 || resetPassword !== resetPasswordConfirm || resetSaving} className="btn-primary min-h-11 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">{resetSaving ? 'Menyimpan...' : 'Simpan Password Baru'}</button>
          </section>}
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">Role mengatur akses Evaluator. Profil Komika dan riwayat pendaftaran tidak berubah dari menu ini.</p>
          <button type="button" onClick={closeEditAccount} className="btn-secondary min-h-11 w-full justify-center">Tutup</button>
        </div>}
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Hapus Akun Member" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white"><Trash2 className="h-4 w-4" /></span>
            <div><p className="text-sm font-extrabold text-slate-900">Yakin ingin menghapus akun ini?</p><p className="mt-1 text-xs leading-5 text-slate-600">Akun <span className="font-bold text-slate-900">{deleteTarget?.profile?.stage_name ?? deleteTarget?.email ?? 'member'}</span> tidak dapat login lagi. Profil komika dan riwayatnya tetap disimpan.</p></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary w-full sm:w-auto">Batal</button>
            <button type="button" onClick={() => deleteTarget && void deleteAccount(deleteTarget)} disabled={Boolean(togglingId)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(220,38,38,0.2)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"><Trash2 className="h-4 w-4" /> Hapus Akun</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
