import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Power, ShieldPlus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

type AdminRole = 'open_mic_admin' | 'event_admin';
interface AdminAccount { id: string; email?: string; created_at: string; active: boolean; role: AdminRole; }

const ROLE_LABELS: Record<AdminRole, string> = { open_mic_admin: 'Admin Open Mic', event_admin: 'Admin Event' };

export function AdminAccountsPage({ onNotice }: { onNotice: (message: string) => void }) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('open_mic_admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'list' } });
    setLoading(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Daftar akun admin gagal dimuat.'); return; }
    setAccounts((data?.admins as AdminAccount[]) ?? []);
  }, [onNotice]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-manage-admins', { body: { action: 'create', email: email.trim(), password, role } });
    setSaving(false);
    if (error || data?.error) { onNotice(error?.message ?? data?.error ?? 'Akun admin gagal dibuat.'); return; }
    setEmail('');
    setPassword('');
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
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Akun Admin</h1>
        <p className="mt-1 text-sm text-slate-500">Buat dan kelola akun Admin Open Mic serta Admin Event.</p>
      </div>
      <form onSubmit={createAccount} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800 ring-1 ring-blue-100"><KeyRound className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Akun memakai login Admin yang sama di <strong>/admin/login</strong>.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label-field" htmlFor="admin-account-email">Email</label><input id="admin-account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" autoComplete="off" /></div>
          <div><label className="label-field" htmlFor="admin-account-password">Password sementara</label><input id="admin-account-password" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="input-field" autoComplete="new-password" /></div>
          <div><label className="label-field" htmlFor="admin-account-role">Role</label><select id="admin-account-role" value={role} onChange={(event) => setRole(event.target.value as AdminRole)} className="input-field"><option value="open_mic_admin">Admin Open Mic</option><option value="event_admin">Admin Event</option></select></div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary mt-5"><ShieldPlus className="h-4 w-4" />{saving ? 'Membuat akun...' : 'Buat Akun Admin'}</button>
      </form>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Daftar Akun Admin</h2><p className="mt-1 text-sm text-slate-500">Akun operasional yang dapat masuk melalui login Admin.</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{accounts.length} akun</span></div>
        <div className="mt-4 space-y-2.5">{loading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : accounts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada akun admin operasional.</div> : accounts.map((account) => <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">{account.email}</p><p className="text-xs font-semibold text-blue-700">{ROLE_LABELS[account.role]}</p></div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${account.active ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'}`}>{account.active ? 'Aktif' : 'Nonaktif'}</span><button type="button" onClick={() => void toggleAccount(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white disabled:opacity-50" title={account.active ? 'Nonaktifkan akun' : 'Aktifkan akun'}><Power className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteTarget(account)} disabled={busyId === account.id} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white disabled:opacity-50" title="Hapus akun"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
      </section>
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Hapus Akun Admin?" size="sm"><div className="space-y-4"><p className="text-sm text-slate-600">Akun <strong>{deleteTarget?.email}</strong> tidak dapat login lagi.</p><div className="flex gap-3"><button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Batal</button><button type="button" onClick={() => deleteTarget && void deleteAccount(deleteTarget)} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white"><Trash2 className="mr-1 inline h-4 w-4" /> Hapus</button></div></div></Modal>
    </div>
  );
}
