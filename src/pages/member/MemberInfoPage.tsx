import { useEffect } from 'react';
import { ArrowRight, BookOpen, CircleHelp, ClipboardList, ExternalLink, House, Menu, Mic, ShieldCheck, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { waLink } from '@/lib/format';

export function MemberInfoPage({ router, kind }: { router: Router; kind: 'roles' | 'help' }) {
  const { roles } = useAuth();
  const { settings } = useSiteSettings();
  const isHelp = kind === 'help';
  useEffect(() => {
    if (!isHelp) void supabase.auth.refreshSession();
  }, [isHelp]);
  const title = isHelp ? 'Bantuan Member' : 'Peran & Hak Akses';
  const menuGuides: Array<{ label: string; description: string; icon: LucideIcon; path: string }> = [
    { label: 'Home', description: 'Lihat ringkasan akun, Open Mic terdekat, lineup aktif, dan jumlah tampil yang sudah tercatat.', icon: House, path: '/member' },
    { label: 'Open Mic', description: 'Cari Open Mic, lihat detail dan lineup, daftar tampil, serta telusuri Open Mic mendatang atau selesai.', icon: Mic, path: '/member/open-mic' },
    { label: 'Buku Materi', description: 'Tulis, cari, dan kelola materi komedi. Gunakan Mode Baca atau susun beberapa materi menjadi Setlist.', icon: BookOpen, path: '/member/materials' },
    { label: 'Profile', description: 'Kelola profil komika yang tampil ke publik, termasuk foto, nama panggung, bio, WhatsApp, dan tautan sosial.', icon: UserRound, path: '/member/profile' },
    { label: 'Evaluasi', description: 'Baca masukan dan skor performa dari evaluator. Kamu juga bisa menyaring evaluasi berdasarkan Open Mic.', icon: ClipboardList, path: '/member/evaluations' },
    { label: 'More', description: 'Buka pengaturan akun, lihat peran dan hak akses, akses Bantuan, atau keluar dari akun.', icon: Menu, path: '/member/more' },
  ];
  const items = isHelp ? [
    ['Bagaimana cara mendaftar Open Mic?', 'Buka menu Open Mic, pilih acara yang pendaftarannya masih dibuka, lalu tekan Daftar Open Mic dan lengkapi formulir.'],
    ['Di mana melihat hasil evaluasi?', 'Buka menu Evaluasi untuk membaca masukan dan skor performa yang sudah dikirim evaluator.'],
    ['Bagaimana mengubah data profil?', 'Buka tab Profile di navigasi utama untuk mengubah foto, nama panggung, bio, WhatsApp, dan tautan sosial.'],
    ['Apakah masuk lineup berarti sudah dihitung tampil?', 'Belum. Performa Open Mic internal baru dihitung setelah kehadiran dicatat sebagai Hadir. Status pendaftaran dan lineup dapat dilihat di Home atau Open Mic.'],
    ['Di mana membuat atau mengunduh Setlist?', 'Buka Buku Materi, lalu pilih ikon Setlist. Dari Setlist, kamu bisa mengunduh PDF atau Word.'],
    ['Bagaimana jika ada masalah akun?', 'Hubungi admin melalui WhatsApp agar akun dan profil kamu dapat diperiksa.'],
  ] : [];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={title} subtitle={isHelp ? 'Panduan singkat untuk menggunakan Member Area.' : 'Akses yang tersedia untuk akun kamu.'} />
      <div className="container-app py-6 sm:py-8"><div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-[24px] border border-blue-100 bg-blue-50 p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">{isHelp ? <CircleHelp className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span><div><h2 className="text-base font-black text-slate-900">{isHelp ? 'Butuh bantuan?' : 'Akses akun'}</h2><p className="mt-0.5 text-sm text-slate-600">{isHelp ? 'Jawaban cepat dan kontak admin komunitas.' : 'Role yang aktif di akun kamu.'}</p></div></div></div>
        {isHelp ? <>
          <section className="space-y-2.5">
            <div><h3 className="text-sm font-extrabold text-slate-900">PANDUAN MENU MEMBER</h3><p className="mt-1 text-xs text-slate-500">Ringkasan fungsi setiap menu Member Area.</p></div>
            {menuGuides.map(({ label, description, icon: Icon, path }) => (
              <button key={label} type="button" onClick={() => router.navigate(path)} className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{label}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
              </button>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">PERTANYAAN UMUM</h3>
            {items.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer list-none pr-6 text-sm font-bold text-slate-900 marker:hidden">{question}</summary><p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}
          </section>
          <a href={waLink(settings.whatsapp_admin, 'Halo Admin Standupindo Cilegon, saya membutuhkan bantuan terkait Member Area.')} target="_blank" rel="noopener noreferrer" className="btn-primary w-full"><ExternalLink className="h-4 w-4" /> Hubungi Admin via WhatsApp</a>
        </> : <div className="space-y-2">{roles.map((role) => <div key={role} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UserRound className="h-4 w-4" /></span><span className="flex-1 text-sm font-bold capitalize text-slate-900">{role === 'evaluator' ? 'Evaluator' : role}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Aktif</span></div>)}</div>}
      </div></div>
    </div>
  );
}
