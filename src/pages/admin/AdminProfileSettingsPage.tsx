import { useEffect, useState } from 'react';
import { KeyRound, Save, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ImageUpload } from '@/components/ui/ImageUpload';

export function AdminProfileSettingsPage({ onNotice }: { onNotice: (message: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [passwordEditing, setPasswordEditing] = useState(false);

  useEffect(() => {
    setName(typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '');
    setPhoto(typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '');
  }, [user?.id, user?.user_metadata?.avatar_url, user?.user_metadata?.full_name]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim(), avatar_url: photo.trim() || null } });
    setSavingProfile(false);
    if (error) { onNotice('Profil gagal disimpan.'); return; }
    onNotice('Profil admin berhasil diperbarui.');
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.email) return;
    if (nextPassword.length < 6) { onNotice('Password baru minimal 6 karakter.'); return; }
    if (nextPassword !== confirmPassword) { onNotice('Konfirmasi password belum sama.'); return; }
    setSavingPassword(true);
    const verified = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verified.error) { setSavingPassword(false); onNotice('Password saat ini tidak benar.'); return; }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    setSavingPassword(false);
    if (error) { onNotice('Password gagal diubah.'); return; }
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
    onNotice('Password admin berhasil diubah.');
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-extrabold text-slate-900">Pengaturan Profil</h1><p className="mt-1 text-sm text-slate-500">Kelola identitas dan keamanan akun workspace kamu.</p></div>
      {!profileEditing && !passwordEditing && <div className="max-w-2xl space-y-3">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">{photo ? <img src={photo} alt="Foto profil admin" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7" />}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Profil workspace</p><h2 className="mt-1 truncate text-lg font-extrabold text-slate-900">{name || 'Nama admin belum diatur'}</h2><p className="truncate text-sm text-slate-500">{user?.email}</p></div></div>
          <button type="button" onClick={() => setProfileEditing(true)} className="btn-primary mt-5 w-full sm:w-auto"><UserRound className="h-4 w-4" /> Edit Profile</button>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><KeyRound className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-900">Keamanan Akun</h2><p className="text-sm text-slate-500">Perbarui password login Admin.</p></div></div><button type="button" onClick={() => setPasswordEditing(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-extrabold text-amber-800 transition hover:bg-amber-100 sm:w-auto"><KeyRound className="h-4 w-4" /> Ganti Password</button></div>
      </div>}
      {profileEditing && <form onSubmit={saveProfile} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Edit Profile</h2><p className="text-sm text-slate-500">Nama dan foto yang tampil di workspace.</p></div><button type="button" onClick={() => setProfileEditing(false)} className="btn-secondary !px-3">Batal</button></div><div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start"><ImageUpload label="Foto profil" folder="admin-profiles" value={photo} onChange={setPhoto} aspect="square" avatar /><div><label className="label-field" htmlFor="admin-profile-name">Nama tampil</label><input id="admin-profile-name" value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="Nama admin" /><p className="mt-2 text-xs text-slate-500">Email login: {user?.email}</p></div></div><button type="submit" disabled={savingProfile} className="btn-primary mt-5 w-full sm:w-auto"><Save className="h-4 w-4" />{savingProfile ? 'Menyimpan...' : 'Simpan Profil'}</button></form>}
      {passwordEditing && <form onSubmit={changePassword} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Ganti Password</h2><p className="text-sm text-slate-500">Gunakan password baru minimal 6 karakter.</p></div><button type="button" onClick={() => setPasswordEditing(false)} className="btn-secondary !px-3">Batal</button></div><div className="space-y-4"><div><label className="label-field" htmlFor="admin-current-password">Password saat ini</label><input id="admin-current-password" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="input-field" autoComplete="current-password" /></div><div><label className="label-field" htmlFor="admin-next-password">Password baru</label><input id="admin-next-password" type="password" required minLength={6} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className="input-field" autoComplete="new-password" /></div><div><label className="label-field" htmlFor="admin-confirm-password">Konfirmasi password baru</label><input id="admin-confirm-password" type="password" required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-field" autoComplete="new-password" /></div></div><button type="submit" disabled={savingPassword} className="btn-primary mt-5 w-full sm:w-auto"><KeyRound className="h-4 w-4" />{savingPassword ? 'Menyimpan...' : 'Simpan Password'}</button></form>}
    </div>
  );
}
