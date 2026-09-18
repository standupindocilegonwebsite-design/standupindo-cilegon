import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import type { Router } from '@/lib/router';
import { useAuth } from '@/lib/auth-context';
import { LOGO_URL } from '@/lib/types';

export function MemberLoginPage({ router }: { router: Router }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await Promise.race([
        signIn(email, password, { requireRole: 'member' }),
        new Promise<{ error: string }>((resolve) => {
          window.setTimeout(() => resolve({ error: 'Permintaan login terlalu lama. Periksa koneksi lalu coba lagi.' }), 15000);
        }),
      ]);

      if (result.error) {
        setError(result.error);
      } else {
        router.navigate('/member');
      }
    } catch (err) {
      console.error('member login failed', err);
      setError('Login member gagal karena koneksi ke Supabase bermasalah. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="member-login-page flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-scale-in">
        <div className="mb-6 text-center">
          <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="mx-auto h-16 w-16 rounded-2xl object-contain shadow-lg ring-2 ring-white/20" />
          <h1 className="mt-4 text-xl font-extrabold text-white">Member Area</h1>
          <p className="mt-1 text-sm text-blue-100">Masuk untuk melihat profil dan performa kamu.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 space-y-4">
          <div>
            <label className="label-field" htmlFor="member-email">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="member-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field !pl-10" placeholder="member@email.com" autoComplete="email" />
            </div>
          </div>

          <div>
            <label className="label-field" htmlFor="member-password">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="member-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="input-field !pl-10 !pr-11" placeholder="••••••••" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5">
            {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Memproses...</> : 'Masuk ke Member'}
          </button>

          <button type="button" onClick={() => router.navigate('/')} className="flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-700">
            <ArrowLeft className="h-4 w-4" /> Kembali ke website
          </button>
        </form>
      </div>
    </div>
  );
}
