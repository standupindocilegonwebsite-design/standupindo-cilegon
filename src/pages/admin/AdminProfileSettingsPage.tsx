import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserRound } from 'lucide-react';
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
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });

  function togglePasswordVisibility(field: 'current' | 'next' | 'confirm') {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  }

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
      <div><h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Pengaturan Profil</h1><p className="mt-1 text-sm text-slate-500">Kelola identitas dan keamanan akun workspace kamu.</p></div>
      {!profileEditing && !passwordEditing && <div className="max-w-2xl space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">{photo ? <img src={photo} alt="Foto profil admin" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6" />}</div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">Profil workspace</p><h2 className="mt-1 truncate text-base font-extrabold text-slate-900 sm:text-lg">{name || 'Nama admin belum diatur'}</h2><p className="truncate text-sm text-slate-500">{user?.email}</p></div></div>
          <button type="button" onClick={() => setProfileEditing(true)} className="btn-primary mt-4 min-h-11 w-full"><UserRound className="h-4 w-4" /> Edit Profile</button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><KeyRound className="h-4 w-4" /></span><div><h2 className="text-base font-extrabold text-slate-900 sm:text-lg">Keamanan Akun</h2><p className="text-sm text-slate-500">Perbarui password login Admin.</p></div></div><button type="button" onClick={() => setPasswordEditing(true)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-800 transition hover:bg-amber-100"><KeyRound className="h-4 w-4" /> Ganti Password</button></div>
      </div>}
      {profileEditing && <form onSubmit={saveProfile} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Edit Profile</h2><p className="text-sm text-slate-500">Nama dan foto yang tampil di workspace.</p></div><button type="button" onClick={() => setProfileEditing(false)} className="btn-secondary !px-3">Batal</button></div><div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start"><ImageUpload label="Foto profil" folder="admin-profiles" value={photo} onChange={setPhoto} aspect="square" avatar /><div><label className="label-field" htmlFor="admin-profile-name">Nama tampil</label><input id="admin-profile-name" value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="Nama admin" /><p className="mt-2 text-xs text-slate-500">Email login: {user?.email}</p></div></div><button type="submit" disabled={savingProfile} className="btn-primary mt-5 w-full sm:w-auto"><Save className="h-4 w-4" />{savingProfile ? 'Menyimpan...' : 'Simpan Profil'}</button></form>}
      {passwordEditing && <form onSubmit={changePassword} className="max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Ganti Password</h2><p className="text-sm text-slate-500">Gunakan password baru minimal 6 karakter.</p></div><button type="button" onClick={() => setPasswordEditing(false)} className="btn-secondary !px-3">Batal</button></div><div className="space-y-4"><div><label className="label-field" htmlFor="admin-current-password">Password saat ini</label><div className="relative"><input id="admin-current-password" type={visiblePasswords.current ? 'text' : 'password'} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="input-field pr-11" autoComplete="current-password" /><button type="button" onClick={() => togglePasswordVisibility('current')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700" aria-label={visiblePasswords.current ? 'Sembunyikan password' : 'Tampilkan password'}>{visiblePasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><div><label className="label-field" htmlFor="admin-next-password">Password baru</label><div className="relative"><input id="admin-next-password" type={visiblePasswords.next ? 'text' : 'password'} required minLength={6} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className="input-field pr-11" autoComplete="new-password" /><button type="button" onClick={() => togglePasswordVisibility('next')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700" aria-label={visiblePasswords.next ? 'Sembunyikan password' : 'Tampilkan password'}>{visiblePasswords.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><div><label className="label-field" htmlFor="admin-confirm-password">Konfirmasi password baru</label><div className="relative"><input id="admin-confirm-password" type={visiblePasswords.confirm ? 'text' : 'password'} required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-field pr-11" autoComplete="new-password" /><button type="button" onClick={() => togglePasswordVisibility('confirm')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700" aria-label={visiblePasswords.confirm ? 'Sembunyikan password' : 'Tampilkan password'}>{visiblePasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div></div><button type="submit" disabled={savingPassword} className="btn-primary mt-5 w-full sm:w-auto"><KeyRound className="h-4 w-4" />{savingPassword ? 'Menyimpan...' : 'Simpan Password'}</button></form>}
    </div>
  );
}
