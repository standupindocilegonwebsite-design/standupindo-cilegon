import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, KeyRound, Power, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

interface MemberAccount {
  id: string;
  email?: string;
  created_at: string;
  active: boolean;
  role: 'member' | 'evaluator';
  evaluator_enabled?: boolean;
  profile?: { stage_name: string; full_name: string; photo: string | null; status: string } | null;
}

export function MemberAccountsPage({ komika, onNotice }: { komika: Komika[]; onNotice: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [komikaId, setKomikaId] = useState('');
  const [komikaSearch, setKomikaSearch] = useState('');
  const [komikaPickerOpen, setKomikaPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<MemberAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MemberAccount | null>(null);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const selectedKomika = komika.find((profile) => profile.id === komikaId);
  const filteredKomika = useMemo(() => komika.filter((profile) => profile.stage_name.toLowerCase().includes(komikaSearch.trim().toLowerCase()) || profile.full_name.toLowerCase().includes(komikaSearch.trim().toLowerCase())), [komika, komikaSearch]);
  const filteredAccounts = accounts.filter((account) => `${account.profile?.stage_name ?? ''} ${account.profile?.full_name ?? ''} ${account.email ?? ''}`.toLowerCase().includes(accountSearch.trim().toLowerCase()));
  const visibleAccounts = accountSearch.trim() || showAllAccounts ? filteredAccounts : filteredAccounts.slice(0, 4);

  async function loadAccounts() {
    setAccountsLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'list' } });
    setAccountsLoading(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Daftar akun member gagal dimuat.'); return; }
    setAccounts((data?.members as MemberAccount[]) ?? []);
  }

  async function toggleAccount(account: MemberAccount) {
    setTogglingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'toggle', user_id: account.id, active: !account.active } });
    setTogglingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Status akun gagal diubah.'); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: Boolean(data?.user?.active) } : item));
    onNotice(`Akun ${account.email ?? 'member'} sekarang ${data?.user?.active ? 'aktif' : 'nonaktif'}.`);
  }

  async function deleteAccount(account: MemberAccount) {
    const label = account.profile?.stage_name ?? account.email ?? 'akun ini';
    setTogglingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'delete', user_id: account.id } });
    setTogglingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Akun member gagal dihapus.'); return; }
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    setDeleteTarget(null);
    onNotice(`Akun ${label} berhasil dihapus.`);
  }

  async function updateRole(account: MemberAccount, role: 'member' | 'evaluator') {
    if (role === account.role) return;
    setRoleUpdatingId(account.id);
    const { data, error } = await supabase.functions.invoke('admin-manage-members', { body: { action: 'update-role', user_id: account.id, role } });
    setRoleUpdatingId(null);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Peran akun gagal diubah.'); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: data?.user?.role === 'evaluator' ? 'evaluator' : 'member', evaluator_enabled: data?.user?.role === 'evaluator' } : item));
    onNotice(`${account.email ?? 'Akun member'} sekarang memiliki role ${role === 'evaluator' ? 'Member + Evaluator' : 'Member'}.`);
  }

  useEffect(() => { void loadAccounts(); }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const { data, error } = await supabase.functions.invoke('admin-create-member', {
      body: { email: email.trim(), password, komika_id: komikaId || null },
    });

    setSaving(false);
    if (error || data?.error) {
      onNotice(error?.message ?? data?.error ?? 'Akun member gagal dibuat.');
      return;
    }

    setEmail('');
    setPassword('');
    setKomikaId('');
    setKomikaSearch('');
    onNotice('Akun member berhasil dibuat dan siap digunakan.');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Akun Member</h1>
        <p className="mt-1 text-sm text-slate-500">Buat akun member dan hubungkan langsung ke profil komika yang sesuai.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800 ring-1 ring-blue-100">
          <KeyRound className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Akun dibuat aktif dan dapat langsung login melalui halaman Member.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field" htmlFor="member-account-email">Email</label>
            <input id="member-account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" placeholder="member@email.com" autoComplete="off" />
          </div>
          <div>
            <label className="label-field" htmlFor="member-account-password">Password sementara</label>
            <input id="member-account-password" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="input-field" placeholder="Minimal 6 karakter" autoComplete="new-password" />
          </div>
        </div>

        <div className="relative mt-4">
          <label className="label-field" htmlFor="member-account-komika-search">Profil Komika</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="member-account-komika-search" value={selectedKomika ? selectedKomika.stage_name : komikaSearch} onChange={(event) => { setKomikaId(''); setKomikaSearch(event.target.value); setKomikaPickerOpen(true); }} onFocus={() => setKomikaPickerOpen(true)} className="input-field !pr-20 !pl-10" placeholder="Cari nama komika..." autoComplete="off" />
            {selectedKomika && <button type="button" onClick={() => { setKomikaId(''); setKomikaSearch(''); setKomikaPickerOpen(true); }} className="absolute right-9 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Hapus pilihan komika"><X className="h-4 w-4" /></button>}
            <button type="button" onClick={() => setKomikaPickerOpen((value) => !value)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Buka pilihan profil komika"><ChevronDown className={`h-4 w-4 transition ${komikaPickerOpen ? 'rotate-180 text-blue-600' : ''}`} /></button>
          </div>
          {komikaPickerOpen && <>
            <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setKomikaPickerOpen(false)} aria-label="Tutup pilihan profil komika" />
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <button type="button" onClick={() => { setKomikaId(''); setKomikaSearch(''); setKomikaPickerOpen(false); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">Tanpa menghubungkan profil</button>
              {filteredKomika.map((profile) => <button key={profile.id} type="button" onClick={() => { setKomikaId(profile.id); setKomikaSearch(''); setKomikaPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-100 text-xs font-black text-blue-700">{profile.photo ? <img src={profile.photo} alt="" className="h-full w-full object-cover" /> : profile.stage_name.charAt(0).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{profile.stage_name}</span><span className="block truncate text-xs text-slate-500">{profile.full_name}</span></span></span>{profile.id === komikaId && <Check className="h-4 w-4 shrink-0 text-blue-600" />}</button>)}
              {filteredKomika.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Profil komika tidak ditemukan.</p>}
            </div>
          </>}
          <p className="mt-1.5 text-xs text-slate-500">Pilih profil agar member dapat melihat pendaftaran dan evaluasinya sendiri.</p>
        </div>

        <button type="submit" disabled={saving} className="btn-primary mt-5 w-full sm:w-auto">
          <UserPlus className="h-4 w-4" />
          {saving ? 'Membuat akun...' : 'Buat Akun Member'}
        </button>
      </form>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Daftar Akun Member</h2><p className="mt-1 text-sm text-slate-500">Pantau akun dan aktifkan atau nonaktifkan akses login.</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{accounts.length > 0 ? `${accounts.length} akun` : 'Belum ada'}</span></div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} className="input-field !pl-10" placeholder="Cari nama, email, atau nama panggung..." aria-label="Cari akun member" />
        </div>
        <div className="mt-4 space-y-2.5">
          {accountsLoading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : accounts.length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"><Users className="h-6 w-6" /></span><p className="mt-3 text-sm font-bold text-slate-700">Belum ada akun member</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Akun member yang dibuat akan muncul di daftar ini.</p></div> : filteredAccounts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">Akun member tidak ditemukan.</div> : visibleAccounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs font-black text-slate-700">{account.profile?.photo ? <img src={account.profile.photo} alt="" className="h-full w-full object-cover" /> : (account.profile?.stage_name ?? account.email ?? 'M').charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{account.profile?.stage_name ?? 'Profil belum terhubung'}</p><p className="truncate text-[11px] text-slate-500">{account.profile?.full_name ?? account.email}</p><p className="truncate text-[11px] text-slate-400">{account.email}</p></div></div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:justify-end"><select value={account.role === 'evaluator' ? 'evaluator' : 'member'} onChange={(event) => void updateRole(account, event.target.value as 'member' | 'evaluator')} disabled={roleUpdatingId === account.id} className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-bold text-blue-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50" aria-label={`Peran ${account.profile?.stage_name ?? account.email ?? 'akun'}`}><option value="member">Member</option><option value="evaluator">Evaluator</option></select><span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${account.active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-600 bg-slate-700 text-white'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span><button type="button" onClick={() => void toggleAccount(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${account.active ? 'bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600 focus:ring-amber-500' : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700 focus:ring-emerald-600'}`} title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} aria-label={account.active ? `Nonaktifkan ${account.email ?? 'akun'}` : `Aktifkan ${account.email ?? 'akun'}`}><Power className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeleteTarget(account)} disabled={togglingId === account.id || roleUpdatingId === account.id} className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm shadow-red-600/20 transition hover:-translate-y-0.5 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" title="Hapus akun" aria-label={`Hapus ${account.email ?? 'akun'}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
            </div>
          ))}
          {!accountSearch.trim() && filteredAccounts.length > 4 && <button type="button" onClick={() => setShowAllAccounts((current) => !current)} className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50" aria-expanded={showAllAccounts}>{showAllAccounts ? 'Tampilkan lebih sedikit' : `Tampilkan ${filteredAccounts.length - 4} akun lainnya`}<ChevronDown className={`h-4 w-4 transition-transform ${showAllAccounts ? 'rotate-180' : ''}`} /></button>}
        </div>
      </section>

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
