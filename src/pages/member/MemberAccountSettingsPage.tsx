import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export function MemberAccountSettingsPage({ router }: { router: Router }) {
  const { user, signIn } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (form.next.length < 6) { setMessage({ type: 'error', text: 'Password baru minimal 6 karakter.' }); return; }
    if (form.next !== form.confirm) { setMessage({ type: 'error', text: 'Konfirmasi password baru belum sama.' }); return; }
    if (!user?.email) return;

    setSaving(true);
    const verified = await signIn(user.email, form.current);
    if (verified.error) {
      setSaving(false);
      setMessage({ type: 'error', text: 'Password lama tidak benar.' });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: form.next });
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: 'Password belum berhasil diubah. Silakan coba lagi.' });
      return;
    }
    setForm({ current: '', next: '', confirm: '' });
    setMessage({ type: 'success', text: 'Password berhasil diubah. Gunakan password baru pada login berikutnya.' });
  }

  function passwordField(key: 'current' | 'next' | 'confirm', label: string, placeholder: string) {
    return (
      <div>
        <label className="label-field" htmlFor={`member-password-${key}`}>{label}</label>
        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id={`member-password-${key}`} required type={visible[key] ? 'text' : 'password'} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="input-field !pl-10 !pr-11" placeholder={placeholder} autoComplete={key === 'current' ? 'current-password' : 'new-password'} />
          <button type="button" onClick={() => setVisible({ ...visible, [key]: !visible[key] })} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={visible[key] ? `Sembunyikan ${label}` : `Tampilkan ${label}`}>
            {visible[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Pengaturan Akun" subtitle="Kelola keamanan akun member kamu." />
      <div className="container-app py-6 sm:py-8"><div className="mx-auto max-w-xl">
        <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Keamanan akun</p><h2 className="mt-1 text-xl font-black text-slate-900">Ganti Password</h2><p className="mt-1 text-sm text-slate-500">Pastikan password baru mudah diingat dan tidak dibagikan kepada siapa pun.</p></div>
          <div className="space-y-4">{passwordField('current', 'Password saat ini', 'Masukkan password saat ini')}{passwordField('next', 'Password baru', 'Minimal 6 karakter')}{passwordField('confirm', 'Konfirmasi password baru', 'Ulangi password baru')}</div>
          {message && <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>{message.text}</div>}
          <button type="submit" disabled={saving} className="btn-primary mt-5 w-full !py-3.5"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Password Baru'}</button>
        </form>
      </div></div>
    </div>
  );
}
