import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleX, Eye, EyeOff, KeyRound, Mail, Pencil, Phone, Save, ShieldCheck, UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { PasswordChangeConfirmationModal } from '@/components/ui/PasswordChangeConfirmationModal';
import { PushNotificationSettings } from '@/components/PushNotificationSettings';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import type { StatusBannerVariant } from '@/components/ui/StatusBanner';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin Penuh / Superadmin',
  event_admin: 'Admin Event',
  open_mic_admin: 'Admin Open Mic',
  admin_ticket: 'Admin Tiket',
  admin_qr: 'Admin QR Scanner',
};

function getAdminRoleLabels(roles: string[]) {
  const labels = [...new Set(roles.map((role) => ROLE_LABELS[role]).filter((label): label is string => Boolean(label)))];
  return labels.length ? labels : ['Admin'];
}

export function AdminProfileSettingsPage({ onNotice, onBack }: { onNotice: (message: string, variant: StatusBannerVariant) => void; onBack?: () => void }) {
  const { user, roles } = useAuth();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [photo, setPhoto] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileFormError, setProfileFormError] = useState('');
  const [passwordFormError, setPasswordFormError] = useState('');
  const [profileEditing, setProfileEditing] = useState(false);
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [passwordConfirmationOpen, setPasswordConfirmationOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ next: false, confirm: false });

  useEffect(() => {
    setName(typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '');
    setWhatsapp(typeof user?.user_metadata?.whatsapp === 'string' ? user.user_metadata.whatsapp : '');
    setPhoto(typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '');
  }, [user?.id, user?.user_metadata?.avatar_url, user?.user_metadata?.full_name, user?.user_metadata?.whatsapp]);

  const roleLabels = getAdminRoleLabels(roles);

  function cancelProfileEdit() {
    setName(typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '');
    setWhatsapp(typeof user?.user_metadata?.whatsapp === 'string' ? user.user_metadata.whatsapp : '');
    setPhoto(typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '');
    setProfileEditing(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileFormError('');
    if (!name.trim()) {
      setProfileFormError('Nama lengkap wajib diisi.');
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: name.trim(),
        whatsapp: whatsapp.trim() || null,
        avatar_url: photo.trim() || null,
      },
    });
    setSavingProfile(false);
    if (error) {
      onNotice(`Profil gagal disimpan: ${error.message}`, 'error');
      return;
    }
    setProfileEditing(false);
    onNotice('Profil admin berhasil diperbarui.', 'success');
  }

  function requestPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFormError('');
    if (nextPassword.length < 6) {
      setPasswordFormError('Password baru minimal 6 karakter.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordFormError('Konfirmasi password belum sama.');
      return;
    }
    setPasswordConfirmationOpen(true);
  }

  async function changePassword() {
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    setSavingPassword(false);
    setPasswordConfirmationOpen(false);
    if (error) {
      onNotice(`Password gagal diubah: ${error.message}`, 'error');
      return;
    }
    setNextPassword('');
    setConfirmPassword('');
    setPasswordEditing(false);
    onNotice('Password admin berhasil diubah.', 'success');
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Profil & Pengaturan Akun"
        subtitle="Kelola informasi profil, notifikasi, dan keamanan akun."
        eyebrow="Profil Akun"
        onBack={onBack}
      />

      <section className="max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 p-4 sm:p-5">
          {profileEditing
            ? <ImageUpload label="Foto profil" folder="admin-profiles" value={photo} onChange={setPhoto} aspect="square" processingProfile="avatar" avatar />
            : <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-blue-800 ring-1 ring-blue-200">
              {photo ? <img src={photo} alt={`Foto profil ${name || 'admin'}`} className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8" />}
            </div>}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-800">Profil Admin</p>
            <h2 className="mt-1 truncate text-lg font-extrabold text-slate-950">{name || 'Nama belum diatur'}</h2>
            <p className="truncate text-sm text-slate-600">{user?.email ?? '—'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roleLabels.map((role) => <span key={role} className="inline-flex items-center gap-1 rounded-full bg-blue-800 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck className="h-3 w-3" />{role}</span>)}
            </div>
          </div>
          {profileEditing ? (
            <button type="button" onClick={cancelProfileEdit} disabled={savingProfile} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-800 transition hover:bg-blue-50 active:scale-95 disabled:opacity-50" aria-label="Batal mengedit profil" title="Batal mengedit">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={() => setProfileEditing(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-800 text-white transition hover:bg-blue-900 active:scale-95" aria-label="Edit profil" title="Edit profil">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={saveProfile}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" />
              <div className="min-w-0 flex-1">
                <label className="text-[11px] font-semibold text-slate-600" htmlFor="admin-profile-name">Nama Lengkap</label>
                {profileEditing
                  ? <input id="admin-profile-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="input-field mt-1" placeholder="Nama lengkap" autoComplete="name" />
                  : <p className="mt-1 break-words text-sm font-bold text-slate-950">{name || '—'}</p>}
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" />
              <div className="min-w-0 flex-1">
                <label className="text-[11px] font-semibold text-slate-600" htmlFor="admin-profile-whatsapp">Nomor WhatsApp</label>
                {profileEditing
                  ? <input id="admin-profile-whatsapp" type="tel" maxLength={30} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="input-field mt-1" placeholder="Contoh: 081234567890" autoComplete="tel" />
                  : <p className="mt-1 break-all text-sm font-bold text-slate-950">{whatsapp || '—'}</p>}
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-600">Email</p>
                <p className="mt-1 break-all text-sm font-bold text-slate-950">{user?.email || '—'}</p>
                <p className="mt-1 text-[10px] text-slate-500">Email tidak dapat diubah di halaman ini.</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-600">Role Akun</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{roleLabels.join(', ')}</p>
                <p className="mt-1 text-[10px] text-slate-500">Role dikelola oleh administrator.</p>
              </div>
            </div>
          </div>
          {profileEditing && profileFormError && <p role="alert" className="mx-4 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-5">{profileFormError}</p>}
          {profileEditing && <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:justify-end sm:px-5 sm:pb-5">
            <button type="button" onClick={cancelProfileEdit} disabled={savingProfile} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="submit" disabled={savingProfile} className="btn-primary min-h-11 w-full sm:w-auto"><Save className="h-4 w-4" />{savingProfile ? 'Menyimpan...' : 'Simpan Profil'}</button>
          </div>}
        </form>
      </section>

      <section className="max-w-3xl space-y-3" aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading" className="text-lg font-extrabold text-slate-950">Pengaturan Akun</h2>
        <PushNotificationSettings />
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800 ring-1 ring-blue-200"><KeyRound className="h-5 w-5" /></span><div><h3 className="text-base font-extrabold text-slate-950">Ganti Password</h3><p className="text-sm text-slate-600">Perbarui password untuk akun ini.</p></div></div>
            {!passwordEditing && <button type="button" onClick={() => setPasswordEditing(true)} className="btn-secondary min-h-10 w-full sm:w-auto"><KeyRound className="h-4 w-4" /> Ganti Password</button>}
          </div>
          {passwordEditing && <form onSubmit={requestPasswordChange} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-600">Masukkan password baru minimal 6 karakter. Pembaruan menggunakan sesi login akun yang sedang aktif.</p>
            {passwordFormError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{passwordFormError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { id: 'admin-next-password', label: 'Password Baru', field: 'next' as const, value: nextPassword, setValue: setNextPassword, autoComplete: 'new-password' },
                { id: 'admin-confirm-password', label: 'Konfirmasi Password Baru', field: 'confirm' as const, value: confirmPassword, setValue: setConfirmPassword, autoComplete: 'new-password' },
              ]).map((input) => <div key={input.id}>
                <label className="label-field" htmlFor={input.id}>{input.label}</label>
                <div className="relative">
                  <input id={input.id} type={visiblePasswords[input.field] ? 'text' : 'password'} required minLength={6} value={input.value} onChange={(event) => input.setValue(event.target.value)} className="input-field pr-11" autoComplete={input.autoComplete} />
                  <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [input.field]: !current[input.field] }))} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-800" aria-label={visiblePasswords[input.field] ? 'Sembunyikan password' : 'Tampilkan password'}>{visiblePasswords[input.field] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                {input.field === 'confirm' && confirmPassword.length > 0 && <p aria-live="polite" className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${nextPassword === confirmPassword ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {nextPassword === confirmPassword ? <><CheckCircle2 className="h-4 w-4" /> Password cocok</> : <><CircleX className="h-4 w-4" /> Password belum cocok</>}
                </p>}
              </div>)}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setPasswordEditing(false); setNextPassword(''); setConfirmPassword(''); }} className="btn-secondary min-h-10">Batal</button>
              <button type="submit" disabled={savingPassword} className="btn-primary min-h-10"><KeyRound className="h-4 w-4" />{savingPassword ? 'Menyimpan...' : 'Simpan Password'}</button>
            </div>
          </form>}
        </section>
      </section>
      <PasswordChangeConfirmationModal
        open={passwordConfirmationOpen}
        saving={savingPassword}
        onClose={() => setPasswordConfirmationOpen(false)}
        onConfirm={() => void changePassword()}
        useAdminHeader
      />
    </div>
  );
}
