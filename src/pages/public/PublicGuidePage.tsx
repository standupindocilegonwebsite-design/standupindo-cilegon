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
    title: 'Pilih Open Mic yang Akan Datang',
    description: (
      <>
        Buka daftar <strong>Open Mic</strong> dan pilih acara berstatus mendatang.
        <br /><br />
        Periksa tanggal, waktu, lokasi, serta status pendaftarannya.
      </>
    ),
    icon: CalendarDays,
  },
  {
    title: 'Buka Detail dan Mulai Pendaftaran',
    description: (
      <>
        Buka detail acara, lalu tekan <strong>“Daftar Open Mic”</strong> jika pendaftaran masih dibuka dan slot belum penuh.
      </>
    ),
    icon: Mic,
  },
  {
    title: 'Isi atau Periksa Data Pendaftar',
    description: (
      <>
        Pengunjung umum mengisi data pendaftaran. Member yang sudah masuk menggunakan profil komika yang terhubung ke akunnya.
        <br /><br />
        Gunakan nama lengkap, nama panggung, komunitas, dan akun Instagram secara konsisten agar riwayat penampilan mudah dikenali.
      </>
    ),
    icon: UserRound,
  },
  {
    title: 'Periksa Data, lalu Kirim',
    description: (
      <>
        Periksa kembali data pada halaman konfirmasi sebelum mengirim pendaftaran.
        <br /><br />
        Pengunjung umum juga perlu menyetujui peraturan yang ditampilkan.
      </>
    ),
    icon: ClipboardCheck,
  },
  {
    title: 'Tunggu Konfirmasi Koordinator Open Mic',
    description: (
      <>
        Setelah pendaftaran dikirim, statusnya Menunggu Konfirmasi.
        <br /><br />
        Koordinator Open Mic akan meninjau pendaftaran. Namamu belum masuk lineup sebelum pendaftaran dikonfirmasi.
      </>
    ),
    icon: Clock3,
    status: 'Menunggu Konfirmasi',
    statusStyle: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  {
    title: 'Periksa Lineup Sementara setelah Dikonfirmasi',
    description: (
      <>
        Setelah Koordinator Open Mic mengonfirmasi pendaftaran, nama panggungmu akan masuk ke LINEUP SEMENTARA pada detail Open Mic.
        <br /><br />
        Ikon <Ticket aria-hidden="true" className="inline-block h-4 w-4 align-[-3px] text-blue-600" /> di kolom Status menandakan pendaftaran sudah dikonfirmasi.
      </>
    ),
    icon: Ticket,
    status: 'Terkonfirmasi',
    statusStyle: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  {
    title: 'Periksa Riwayat Penampilan di Open Mic Selesai',
    description: (
      <>
        Jika kamu hadir dan tampil, Koordinator Open Mic akan menandainya. Namamu kemudian masuk ke DAFTAR LINEUP dengan ikon <CheckCircle2 aria-hidden="true" className="inline-block h-4 w-4 align-[-3px] text-green-600" /> dan status Tampil. Jumlah KOMIKA PERFORM mengikuti data acara.
        <br /><br />
        Cari berdasarkan nama panggung, komunitas, tempat, tanggal atau tahun, judul Open Mic, maupun akun Instagram di bagian Open Mic Selesai.
        <br /><br />
        Pilih hasil komika untuk melihat jumlah penampilan dan rincian riwayatnya.
      </>
    ),
    icon: CheckCircle2,
    status: 'Tampil',
    statusStyle: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
];

const TICKET_STEPS: GuideStep[] = [
  {
    title: 'Pilih Event dan Kategori Tiket',
    description: (
      <>
        Buka detail Event dan tekan <strong>“Beli Tiket”</strong>, lalu pilih kategori yang tersedia untuk publik.
        <br /><br />
        Jika diarahkan ke situs lain, lanjutkan pembelian di situs tersebut.
      </>
    ),
    icon: CalendarDays,
  },
  {
    title: 'Isi Data Pemesan dan Jumlah Tiket',
    description: (
      <>
        Isi nama lengkap, alamat email aktif, nomor WhatsApp aktif, dan jumlah tiket yang ingin dibeli.
        <br /><br />
        Masukkan kode voucher jika tersedia.
      </>
    ),
    icon: UserRound,
  },
  {
    title: 'Periksa Total Pembayaran dan Cara Pembayaran',
    description: (
      <>
        Periksa rincian harga akhir, termasuk potongan voucher jika digunakan.
        <br /><br />
        Bayar menggunakan metode yang tersedia, seperti transfer bank atau QRIS.
      </>
    ),
    icon: CreditCard,
  },
  {
    title: 'Unggah Bukti Pembayaran',
    description: (
      <>
        Pilih bukti pembayaran, lalu kirim pesanan. Setelah bukti berhasil dikirim, status pesanan menjadi “Menunggu Verifikasi”.
      </>
    ),
    icon: Upload,
    status: 'Menunggu Verifikasi',
    statusStyle: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  {
    title: 'Tunggu Pembayaran Disetujui',
    description: (
      <>
        QR tiket belum tersedia selama pembayaran masih diverifikasi.
        <br /><br />
        Setelah admin menyetujui pembayaran dan status pesanan menjadi Lunas, tiket digital beserta Kode Akses dikirim ke email terdaftar.
        <br /><br />
        Periksa folder Spam atau Promosi jika email belum ditemukan.
      </>
    ),
    icon: CheckCircle2,
    status: 'Lunas',
    statusStyle: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    title: 'Buka Akses Tiket untuk Melihat QR',
    description: (
      <>
        Buka <strong>Akses Tiket</strong> atau “Tiket Saya”, lalu masukkan nomor WhatsApp pemesan dan Kode Akses dari email.
        <br /><br />
        Tekan <strong>“Lihat Tiket”</strong> untuk membuka tiket digital. Setiap tiket memiliki kode QR tersendiri.
      </>
    ),
    icon: QrCode,
  },
];

const QUESTIONS: Record<GuideSection, Array<[string, ReactNode]>> = {
  'open-mic': [
    [
      'Mengapa nama saya belum muncul di lineup?',
      <>
        Pendaftaran yang sudah dikonfirmasi Koordinator Open Mic muncul di LINEUP SEMENTARA dengan ikon <Ticket aria-hidden="true" className="inline-block h-5 w-5 align-[-4px] text-blue-600" />.
        <br /><br />
        Untuk DAFTAR LINEUP Open Mic Selesai, Koordinator Open Mic harus menandai bahwa kamu hadir dan tampil. Status Tampil ditunjukkan dengan ikon <CheckCircle2 aria-hidden="true" className="inline-block h-5 w-5 align-[-4px] text-green-600" />.
      </>,
    ],
    [
      'Apa yang bisa dilakukan jika pendaftaran ditutup atau slot penuh?',
      'Jika pendaftaran ditutup atau slot penuh, kamu tetap bisa datang sebagai penonton. Jika ada komika di LINEUP SEMENTARA yang berhalangan hadir, tanyakan kepada Koordinator Open Mic apakah ada kesempatan untuk menggantikannya.',
    ],
    [
      'Di mana melihat daftar komika yang tampil?',
      'Buka detail Open Mic dari daftar Open Mic. Untuk acara yang sudah selesai, DAFTAR LINEUP akan muncul setelah Koordinator Open Mic mencatat kehadiran komika.',
    ],
    [
      'Bagaimana cara membagikan Komika Perform?',
      <>
        Buka detail Open Mic yang sudah selesai, lalu tekan tombol bagikan pada bagian DAFTAR LINEUP. Gambar ringkasan lineup dibuat otomatis dan dapat dibagikan dari perangkat atau diunduh.
        <br /><br />
        Foto profil ditampilkan untuk member yang memilikinya. Untuk komika nonmember, gambar ringkasan menggunakan ikon mikrofon karena foto profil tidak tersedia di sistem.
      </>,
    ],
  ],
  ticket: [
    [
      'Apakah QR langsung muncul setelah bukti pembayaran dikirim?',
      <>
        Belum. Setelah bukti dikirim, status pesanan menjadi <strong>“Menunggu Verifikasi”</strong>.
        <br /><br />
        Setelah admin menyetujui pembayaran dan status pesanan menjadi <strong>Lunas</strong>, tiket digital dan Kode Akses dikirim melalui email atas nama Standupindo Cilegon. Periksa folder Spam atau Promosi jika email belum ditemukan.
      </>,
    ],
    [
      'Di mana memasukkan Kode Akses?',
      <>
        Buka halaman <strong>Akses Tiket</strong> atau “Tiket Saya” di /tiket. Masukkan nomor WhatsApp pemesan dan Kode Akses dari email atas nama Standupindo Cilegon.
        <br /><br />
        Jika email tidak ada di Kotak Masuk, periksa folder Spam atau Promosi.
      </>,
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
