import { ArrowUpRight, MessageCircle } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { waLink } from '@/lib/format';

type LegalDocument = 'terms' | 'privacy';

interface Props {
  router: Router;
  settings: SiteSettings;
  document: LegalDocument;
}

const TERMS = [
  {
    title: 'Ketentuan umum pembelian',
    paragraphs: [
      'Ketentuan ini berlaku untuk pemesanan tiket publik melalui website Standupindo Cilegon. Dengan membuat order, pembeli menyatakan data yang diberikan benar dan memahami informasi event serta aturan venue yang tercantum pada halaman event.',
      'Tiket publik hanya ditawarkan untuk kategori aktif yang ditampilkan pada halaman pemilihan tiket. Ketersediaan akhir mengikuti kuota kategori dan validasi sistem saat order dibuat.',
    ],
  },
  {
    title: 'Data pembeli dan pemesanan',
    paragraphs: [
      'Checkout meminta nama lengkap, alamat email, nomor WhatsApp, kategori dan jumlah tiket, serta bukti transfer. Data digunakan untuk membuat dan mengelola order, menghubungi pembeli terkait transaksi, serta memproses tiket.',
      'Jumlah pemesanan dibatasi maksimal 10 tiket per order melalui form checkout yang tersedia. Order hanya berhasil dibuat jika kategori masih aktif, kuota tersedia, event menerima pemesanan, dan informasi pembayaran event aktif.',
    ],
  },
  {
    title: 'Harga dan pembayaran',
    paragraphs: [
      'Harga yang berlaku adalah harga kategori publik yang ditampilkan saat pemesanan. Pembayaran dilakukan mengikuti instruksi bank atau QRIS yang ditampilkan pada checkout. Jumlah transfer harus sesuai dengan total order.',
      'Pembeli perlu mengunggah bukti transfer. Order menunggu verifikasi admin; mengirim bukti tidak berarti pembayaran telah disetujui atau tiket telah diterbitkan. Order pembayaran memiliki batas waktu sesuai status dan waktu kedaluwarsa yang ditampilkan/diberlakukan sistem.',
    ],
  },
  {
    title: 'Status order, Access Code, dan tiket',
    paragraphs: [
      'Status order dapat mencakup menunggu pembayaran, menunggu verifikasi, lunas/terverifikasi, ditolak, kedaluwarsa, selesai, atau dibatalkan. Periksa status transaksi melalui fitur tiket menggunakan data akses transaksi yang diberikan sistem.',
      'Setelah order disetujui, sistem dapat menerbitkan Access Code dan tiket elektronik dengan QR Code. Jaga kerahasiaan Access Code dan jangan membagikan QR Code kepada orang lain. Tiket atau QR yang telah digunakan untuk check-in tidak dapat digunakan kembali.',
    ],
  },
  {
    title: 'Check-in dan penyalahgunaan',
    paragraphs: [
      'Tiket diperiksa oleh petugas melalui QR Code sesuai prosedur check-in event. Tiket yang sudah digunakan, tidak aktif, kedaluwarsa, atau dibatalkan tidak dapat digunakan untuk check-in.',
      'Pembeli bertanggung jawab menjaga kode dan tiketnya. Penggandaan, penggunaan tanpa hak, manipulasi bukti pembayaran, atau penyalahgunaan tiket dapat menyebabkan order/tiket ditolak atau dinonaktifkan setelah pemeriksaan.',
    ],
  },
  {
    title: 'Event, venue, OTS, dan Free Pass',
    paragraphs: [
      'Ketentuan masuk, perubahan jadwal, pembatalan acara, dan aturan venue mengikuti informasi yang diumumkan penyelenggara pada halaman event atau melalui kanal resmi. Pembeli disarankan memeriksa pembaruan sebelum hadir.',
      'Harga dan kategori yang ditawarkan melalui checkout publik berbeda dari proses penjualan OTS dan penerbitan Free Pass oleh admin. OTS dan Free Pass dikelola melalui proses internal dan bukan kategori pembelian publik kecuali secara khusus ditampilkan sebagai tiket publik.',
    ],
  },
  {
    title: 'Pembatalan dan pengembalian dana',
    paragraphs: [
      'Website saat ini tidak menyediakan fitur pembatalan order atau pengajuan refund secara otomatis. Jika terjadi kendala pembayaran, perubahan, atau pembatalan event, hubungi admin melalui kanal resmi untuk mendapatkan informasi penanganan sesuai kondisi dan kebijakan penyelenggara. Pengembalian dana tidak dijamin oleh halaman ini.',
    ],
  },
  {
    title: 'Perubahan ketentuan dan kontak',
    paragraphs: [
      'Syarat & Ketentuan dapat diperbarui untuk mencerminkan perubahan layanan atau proses ticketing. Ketentuan yang berlaku adalah versi yang ditampilkan pada website saat digunakan.',
    ],
  },
];

const PRIVACY = [
  {
    title: 'Data yang diproses',
    paragraphs: [
      'Saat Anda memesan tiket, aplikasi memproses nama lengkap, email, nomor WhatsApp, event yang dipilih, kategori dan jumlah tiket, serta nomor dan status order. Untuk verifikasi pembayaran, aplikasi menerima file bukti transfer yang Anda unggah dan informasi transaksi yang terkait.',
      'Setelah tiket diterbitkan, sistem memproses data tiket, QR Code, Access Code bila diberikan, status tiket, dan catatan check-in seperti waktu penggunaan. Informasi rekening/QRIS yang ditampilkan sebagai tujuan pembayaran merupakan instruksi pembayaran event, bukan data kartu atau kredensial bank yang diminta dari Anda.',
    ],
  },
  {
    title: 'Tujuan penggunaan data',
    paragraphs: [
      'Data digunakan untuk membuat dan mengelola order, menghitung pembayaran, memeriksa bukti transfer, mengirim informasi transaksi, menerbitkan dan menyediakan akses tiket, memvalidasi QR saat check-in, menjalankan administrasi event, serta menjaga keamanan dan mencegah penyalahgunaan.',
      'Data transaksi tidak digunakan oleh fitur pembelian tiket ini untuk mengirim pemasaran. Komunikasi yang terkait dengan order digunakan untuk penyelesaian transaksi dan layanan tiket.',
    ],
  },
  {
    title: 'Penyimpanan dan layanan pendukung',
    paragraphs: [
      'Data order, tiket, dan bukti pembayaran disimpan dalam database dan penyimpanan aplikasi agar fungsi order, verifikasi, ticketing, dan check-in dapat berjalan. Akses serta masa penyimpanan mengikuti kebutuhan operasional, keamanan, dan pencatatan transaksi.',
      'Layanan pendukung dapat memproses data seperlunya untuk penyimpanan, pemrosesan aplikasi, dan pengiriman komunikasi transaksi. Data tidak dijual melalui fitur ticketing ini. Tidak ada sistem yang dapat menjamin keamanan mutlak; aplikasi menerapkan pembatasan akses dan kontrol teknis yang tersedia.',
    ],
  },
  {
    title: 'Hak dan permintaan pengguna',
    paragraphs: [
      'Anda dapat meminta informasi, koreksi, atau bantuan terkait data order dengan menghubungi admin melalui kanal resmi dan memberikan informasi secukupnya untuk membantu verifikasi kepemilikan transaksi. Permintaan dapat dibatasi apabila data diperlukan untuk keamanan, penyelesaian transaksi, atau administrasi yang masih berjalan.',
    ],
  },
  {
    title: 'Perubahan kebijakan dan kontak',
    paragraphs: [
      'Kebijakan ini dapat diperbarui mengikuti perubahan pengumpulan data atau fungsi ticketing. Perubahan akan ditampilkan pada halaman ini. Untuk pertanyaan privasi atau transaksi tiket, hubungi admin melalui halaman kontak resmi Standupindo Cilegon.',
    ],
  },
];

export function TicketLegalPage({ router, settings, document }: Props) {
  const isTerms = document === 'terms';
  const title = isTerms ? 'Syarat & Ketentuan' : 'Kebijakan Privasi';
  const sections = isTerms ? TERMS : PRIVACY;
  const whatsapp = settings.whatsapp_ticket || settings.whatsapp_admin;
  const requestedBackTo = router.query.get('backTo') ?? '';
  const backTo = /^\/event\/[^/]+\/tiket\/[^/]+$/.test(requestedBackTo) ? requestedBackTo : '/event';

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={title} subtitle="Informasi pembelian tiket publik" backTo={backTo} />
      <main className="container-app py-6 sm:py-9">
        <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm leading-6 text-slate-600">
            Dokumen ini menjelaskan ketentuan dan penggunaan data pada flow pembelian tiket publik Standupindo Cilegon.
          </p>
          <div className="mt-6 space-y-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-900 sm:text-sm">{section.title}</h2>
                <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row">
            <a href="/more/kontak" className="btn-secondary min-h-11 flex-1">Halaman Kontak <ArrowUpRight className="h-4 w-4" /></a>
            {whatsapp && <a href={waLink(whatsapp, `Halo Admin Standupindo Cilegon, saya ingin bertanya tentang ${title}.`)} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-11 flex-1"><MessageCircle className="h-4 w-4" /> Hubungi Admin</a>}
          </div>
        </article>
      </main>
    </div>
  );
}
