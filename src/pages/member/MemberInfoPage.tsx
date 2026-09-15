import { CircleHelp, ExternalLink, ShieldCheck, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { waLink } from '@/lib/format';

export function MemberInfoPage({ router, kind }: { router: Router; kind: 'roles' | 'help' }) {
  const { roles } = useAuth();
  const { settings } = useSiteSettings();
  const isHelp = kind === 'help';
  const title = isHelp ? 'Bantuan Member' : 'Peran & Hak Akses';
  const items = isHelp ? [
    ['Bagaimana cara mendaftar Open Mic?', 'Buka menu Open Mic, pilih acara yang tersedia, lalu lanjutkan pendaftaran menggunakan profil komika kamu.'],
    ['Di mana melihat hasil evaluasi?', 'Buka menu Evaluasi untuk melihat evaluasi yang sudah dikirim oleh evaluator.'],
    ['Bagaimana mengubah data profil?', 'Buka More lalu Profil Member. Nama panggung, foto, sosial media, dan nomor WhatsApp dapat diperbarui dari sana.'],
    ['Bagaimana jika ada masalah akun?', 'Hubungi admin melalui WhatsApp agar akun dan profil kamu dapat diperiksa.'],
  ] : [];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={title} subtitle={isHelp ? 'Panduan singkat untuk menggunakan Member Area.' : 'Akses yang tersedia untuk akun kamu.'} />
      <div className="container-app py-6 sm:py-8"><div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-[24px] border border-blue-100 bg-blue-50 p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">{isHelp ? <CircleHelp className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span><div><h2 className="text-base font-black text-slate-900">{isHelp ? 'Butuh bantuan?' : 'Akses akun'}</h2><p className="mt-0.5 text-sm text-slate-600">{isHelp ? 'Jawaban cepat dan kontak admin komunitas.' : 'Role yang aktif di akun kamu.'}</p></div></div></div>
        {isHelp ? <div className="space-y-3">{items.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer list-none pr-6 text-sm font-bold text-slate-900 marker:hidden">{question}</summary><p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}<a href={waLink(settings.whatsapp_admin, 'Halo Admin Standupindo Cilegon, saya membutuhkan bantuan terkait Member Area.')} target="_blank" rel="noopener noreferrer" className="btn-primary w-full"><ExternalLink className="h-4 w-4" /> Hubungi Admin via WhatsApp</a></div> : <div className="space-y-2">{roles.map((role) => <div key={role} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UserRound className="h-4 w-4" /></span><span className="flex-1 text-sm font-bold capitalize text-slate-900">{role === 'evaluator' ? 'Evaluator' : role}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Aktif</span></div>)}</div>}
      </div></div>
    </div>
  );
}
