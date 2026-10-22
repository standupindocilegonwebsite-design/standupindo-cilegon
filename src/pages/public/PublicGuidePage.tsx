import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CreditCard,
  KeyRound,
  Mic,
  QrCode,
  Ticket,
  Upload,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';

type GuideSection = 'open-mic' | 'ticket';

interface GuideStep {
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  status?: string;
  statusStyle?: string;
}

const OPEN_MIC_STEPS: GuideStep[] = [
  {
    title: 'Pilih Open Mic yang akan datang',
    description: 'Buka daftar Open Mic, pilih acara berstatus mendatang, lalu periksa tanggal, waktu, lokasi, dan status pendaftarannya.',
    icon: CalendarDays,
  },
  {
    title: 'Buka detail dan mulai pendaftaran',
    description: 'Tekan “Daftar Open Mic” jika pendaftaran masih dibuka dan slot belum penuh.',
    icon: Mic,
  },
  {
    title: 'Isi atau periksa data pendaftar',
    description: 'Pengunjung umum mengisi data pendaftaran. Member yang masuk menggunakan profil komika yang terhubung ke akunnya. Saat mendaftar lagi, gunakan nama lengkap, nama panggung, komunitas, dan Instagram yang konsisten—terutama nama panggung dan Instagram agar riwayat tampil mudah dikenali.',
    icon: UserRound,
  },
  {
    title: 'Periksa data lalu kirim',
    description: 'Tinjau data pada konfirmasi pendaftaran sebelum mengirim. Pengunjung umum juga perlu menyetujui peraturan yang ditampilkan.',
    icon: ClipboardCheck,
  },
  {
    title: 'Tunggu konfirmasi Koordinator Open Mic',
    description: 'Setelah pendaftaran dikirim, Koordinator Open Mic akan meninjau dan mengonfirmasinya. Namamu belum masuk lineup sampai pendaftaran dikonfirmasi.',
    icon: Clock3,
    status: 'Menunggu Konfirmasi',
    statusStyle: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  {
    title: 'Cek Lineup Sementara setelah dikonfirmasi',
    description: (
      <>
        Setelah Koordinator Open Mic mengonfirmasi pendaftaran, nama panggungmu masuk ke LINEUP SEMENTARA pada detail Open Mic. Ikon <Ticket aria-hidden="true" className="inline-block h-4 w-4 align-[-3px] text-blue-600" /> di kolom Status menandakan pendaftaranmu sudah dikonfirmasi.
      </>
    ),
    icon: Ticket,
    status: 'Terkonfirmasi',
    statusStyle: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  {
    title: 'Cek penampilan di Open Mic Selesai',
    description: (
      <>
        Jika kamu benar hadir dan tampil, setelah Koordinator Open Mic menandainya namamu masuk ke DAFTAR LINEUP dengan ikon <CheckCircle2 aria-hidden="true" className="inline-block h-4 w-4 align-[-3px] text-green-600" /> dan status Tampil. Jumlah KOMIKA PERFORM mengikuti data acara. Di pencarian Open Mic Selesai, cari nama panggung, komunitas, tempat, tanggal atau tahun, judul Open Mic, maupun Instagram. Pilih hasil komika untuk melihat jumlah penampilanmu di Open Mic Cilegon dan rincian riwayatnya.
      </>
    ),
    icon: CheckCircle2,
    status: 'Tampil',
    statusStyle: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
];

const TICKET_STEPS: GuideStep[] = [
  {
    title: 'Pilih Event dan kategori tiket',
    description: 'Buka detail Event, tekan “Beli Tiket”, lalu pilih tiket publik yang tersedia. Jika tombol membawa ke situs lain, lanjutkan pembelian di situs tersebut.',
    icon: CalendarDays,
  },
  {
    title: 'Isi data pemesan dan jumlah tiket',
    description: 'Isi nama lengkap, email aktif, nomor WhatsApp aktif, dan jumlah tiket. Kode voucher dapat dimasukkan jika tersedia.',
    icon: UserRound,
  },
  {
    title: 'Periksa total dan cara pembayaran',
    description: 'Periksa rincian harga yang ditampilkan. Ikuti informasi pembayaran yang tersedia, seperti transfer bank atau QRIS.',
    icon: CreditCard,
  },
  {
    title: 'Upload bukti pembayaran',
    description: 'Pilih file bukti transfer lalu kirim order. Setelah bukti diterima, status order menjadi “Menunggu Verifikasi”.',
    icon: Upload,
    status: 'Menunggu Verifikasi',
    statusStyle: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  {
    title: 'Tunggu pembayaran disetujui',
    description: 'QR belum tersedia setelah bukti pembayaran dikirim. Setelah admin memverifikasi pembayaran dan status pesanan menjadi Lunas, tiket digital dan Kode Akses akan dikirim ke email yang kamu daftarkan. Jika belum menerima email, periksa folder Spam atau Promosi.',
    icon: CheckCircle2,
    status: 'Lunas',
    statusStyle: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    title: 'Masuk ke Tiket Saya untuk melihat QR',
    description: 'Buka Akses Tiket, lalu masukkan nomor WhatsApp pada pesanan dan Kode Akses yang dikirim ke email terdaftar. Jika email belum terlihat, periksa folder Spam atau Promosi. Tekan “Lihat Tiket” untuk membuka tiket digital; setiap tiket memiliki QR tersendiri.',
    icon: QrCode,
  },
];

const QUESTIONS: Record<GuideSection, Array<[string, ReactNode]>> = {
  'open-mic': [
    [
      'Mengapa nama saya belum muncul di lineup?',
      <>
        Pendaftaran yang sudah dikonfirmasi Koordinator Open Mic muncul di LINEUP SEMENTARA dengan ikon <Ticket aria-hidden="true" className="inline-block h-5 w-5 align-[-4px] text-blue-600" />.
        {' '}Untuk DAFTAR LINEUP Open Mic Selesai, Koordinator Open Mic harus menandai bahwa kamu hadir dan tampil; statusnya ditunjukkan dengan ikon <CheckCircle2 aria-hidden="true" className="inline-block h-5 w-5 align-[-4px] text-green-600" />.
      </>,
    ],
    [
      'Apa yang bisa dilakukan jika pendaftaran ditutup atau slot penuh?',
      'Jika pendaftaran ditutup atau slot penuh, kamu tetap bisa datang sebagai penonton dan menikmati acaranya. Bila ada komika di lineup sementara yang berhalangan hadir, tanyakan kepada Koordinator Open Mic apakah ada kesempatan untuk menggantikannya.',
    ],
    [
      'Di mana melihat daftar komika yang tampil?',
      'Buka detail Open Mic dari daftar Open Mic. Untuk acara yang sudah selesai, lineup arsip muncul setelah kehadiran komika ditandai oleh Koordinator Open Mic.',
    ],
    [
      'Bagaimana cara membagikan Komika Perform?',
      'Buka detail Open Mic yang sudah selesai, lalu tekan tombol bagikan pada bagian DAFTAR LINEUP. Gambar ringkasan lineup dibuat otomatis dan bisa dibagikan dari perangkat atau diunduh. Foto profil ditampilkan untuk member yang memiliki foto profil; komika non-member tidak memiliki foto profil di sistem, jadi gambarnya memakai ikon mikrofon.',
    ],
  ],
  ticket: [
    [
      'Apakah QR langsung muncul setelah bukti pembayaran dikirim?',
      'Belum. Bukti masuk ke status “Menunggu Verifikasi”. Setelah pembayaran dikonfirmasi dan order berstatus lunas, tiket digital dan Kode Akses dikirim melalui email atas nama Standupindo Cilegon. Jika belum menerima email, cek folder Spam atau Promosi.',
    ],
    [
      'Di mana memasukkan Kode Akses?',
      'Buka halaman Akses Tiket atau “Tiket Saya” di /tiket, lalu masukkan nomor WhatsApp pemesan dan Kode Akses dari email atas nama Standupindo Cilegon. Jika email tidak ada di Kotak Masuk, cek folder Spam atau Promosi.',
    ],
    [
      'Bagaimana jika membeli lebih dari satu tiket?',
      'Setelah berhasil masuk, halaman tiket menampilkan tiket dalam order. Setiap tiket memiliki QR masing-masing.',
    ],
  ],
};

export function PublicGuidePage({ router }: { router: Router }) {
  const [section, setSection] = useState<GuideSection>('open-mic');
  const steps = section === 'open-mic' ? OPEN_MIC_STEPS : TICKET_STEPS;
  const questions = QUESTIONS[section];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Panduan & FAQ" subtitle="Langkah jelas untuk daftar Open Mic dan membeli tiket Event." />

      <div className="container-app space-y-6 pb-[calc(6.5rem+var(--safe-bottom))] pt-5 sm:space-y-8 sm:py-8">
        <section className="mx-auto max-w-4xl overflow-hidden rounded-[24px] border border-blue-100 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-7">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-blue-700 to-blue-500 text-white shadow-[0_6px_14px_rgba(29,78,216,0.2)] sm:h-12 sm:w-12">
              <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-blue-700">Panduan singkat</p>
              <h2 className="mt-0.5 text-lg font-black tracking-tight text-slate-950 sm:text-xl">Pilih yang ingin kamu lakukan</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Ikuti langkah sesuai proses di website.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5 sm:mt-5 sm:gap-2" role="group" aria-label="Pilih panduan">
            <button
              id="guide-tab-open-mic"
              type="button"
              aria-pressed={section === 'open-mic'}
              onClick={() => setSection('open-mic')}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-extrabold transition sm:min-h-12 sm:gap-2 sm:px-3 sm:text-sm ${section === 'open-mic' ? 'bg-blue-700 text-white shadow-[0_4px_10px_rgba(29,78,216,0.2)]' : 'text-slate-600 hover:bg-white hover:text-blue-800'}`}
            >
              <Mic className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
              <span className="whitespace-nowrap"><span className="sm:hidden">Open Mic</span><span className="hidden sm:inline">Daftar Open Mic</span></span>
            </button>
            <button
              id="guide-tab-ticket"
              type="button"
              aria-pressed={section === 'ticket'}
              onClick={() => setSection('ticket')}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-extrabold transition sm:min-h-12 sm:gap-2 sm:px-3 sm:text-sm ${section === 'ticket' ? 'bg-blue-700 text-white shadow-[0_4px_10px_rgba(29,78,216,0.2)]' : 'text-slate-600 hover:bg-white hover:text-blue-800'}`}
            >
              <Ticket className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
              <span className="whitespace-nowrap"><span className="sm:hidden">Tiket Event</span><span className="hidden sm:inline">Beli Tiket Event</span></span>
            </button>
          </div>
        </section>

        <section id="guide-panel" aria-live="polite" className="mx-auto max-w-4xl">
          <div className="mb-3 flex items-end justify-between gap-3 px-1 sm:mb-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-blue-700">Langkah-langkah</p>
              <h2 className="mt-0.5 text-lg font-black leading-tight text-slate-950 sm:text-2xl">{section === 'open-mic' ? 'Dari daftar sampai lineup' : 'Dari pilih tiket sampai QR'}</h2>
            </div>
            <span className="shrink-0 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-extrabold text-blue-800 sm:px-3 sm:py-1.5 sm:text-xs">{steps.length} langkah</span>
          </div>

          <ol className="space-y-2.5 sm:space-y-3.5">
            {steps.map(({ title, description, icon: Icon, status, statusStyle }, index) => (
              <li key={title} className="relative flex gap-2.5 sm:gap-4">
                {index < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-[-11px] left-[18px] top-[42px] w-px bg-blue-200 sm:bottom-[-15px] sm:left-[25px] sm:top-[52px]" />}
                <span className="relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] border border-blue-100 bg-blue-50 text-blue-700 sm:h-[52px] sm:w-[52px] sm:rounded-2xl">
                  <Icon className="h-[18px] w-[18px] sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 border-l-[3px] border-l-blue-500 bg-white p-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-colors hover:border-blue-200 hover:border-l-blue-500 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="flex min-w-0 flex-1 gap-2 text-[13px] font-extrabold leading-5 text-slate-950 sm:text-base">
                      <span className="shrink-0 font-black text-blue-700">{String(index + 1).padStart(2, '0')}</span>
                      <span>{title}</span>
                    </h3>
                    {status && <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold sm:px-2.5 sm:py-1 sm:text-[10px] ${statusStyle}`}>{status}</span>}
                  </div>
                  <p className="mt-1.5 text-xs leading-[1.65] text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="mt-7 space-y-3 sm:mt-9">
            <div className="px-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Pertanyaan umum</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Yang sering ditanyakan</h2>
            </div>
            <div className="space-y-2.5">
              {questions.map(([question, answer]) => (
                <details key={question} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm open:border-blue-200 open:shadow-[0_8px_22px_rgba(37,99,235,0.07)]">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-bold leading-5 text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">{question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 group-open:text-blue-700" />
                  </summary>
                  <p className="border-t border-slate-100 px-4 py-3.5 text-sm leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
            {section === 'open-mic' ? (
              <button type="button" onClick={() => router.navigate('/open-mic')} className="btn-primary min-h-12 w-full">
                <Mic className="h-4 w-4" /> Lihat Open Mic <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => router.navigate('/event')} className="btn-primary min-h-12 w-full">
                  <CalendarDays className="h-4 w-4" /> Lihat Event <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => router.navigate('/tiket')} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50">
                  <KeyRound className="h-4 w-4" /> Buka Tiket Saya
                </button>
              </>
            )}
          </div>
          {section === 'ticket' && <p className="mx-auto mt-3 flex max-w-xl items-start justify-center gap-2 text-center text-xs leading-5 text-slate-500"><QrCode className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />Tiket dibuka menggunakan Kode Akses yang diterima setelah pembayaran disetujui.</p>}
        </section>
      </div>
    </div>
  );
}
