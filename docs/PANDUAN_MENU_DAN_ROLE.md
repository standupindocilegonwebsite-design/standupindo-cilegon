# Panduan Menu dan Peran Standupindo Cilegon

Panduan ini menjelaskan fungsi menu untuk pengunjung publik, Member, Evaluator,
dan Admin, sekaligus hubungan antarfitur. Nama menu dapat sedikit berbeda antara
desktop dan ponsel, tetapi fungsi utamanya sama.

## 1. Mengenal area dan akun

- **Publik** adalah pengunjung website. Sebagian besar informasi dapat dilihat
  tanpa login. Pendaftaran Open Mic, pendaftaran peserta Event, dan pembelian
  tiket juga dapat dimulai dari area publik.
- **Member** adalah akun komika yang dapat mengelola profil, materi, evaluasi,
  dan riwayat kegiatan.
- **Evaluator** mendapat tugas menilai penampilan pada Open Mic tertentu.
  Akun Evaluator juga dapat menggunakan fitur Member.
- **Admin** mengelola data operasional. Menu yang terlihat mengikuti peran
  akun; Admin Tiket dan Admin QR, misalnya, tidak mendapat akses yang sama.

Area masuk:

| Area | Alamat |
|---|---|
| Website publik | Halaman utama website |
| Member | `/member/login` |
| Admin | `/admin/login` |

Gunakan akun dan area login yang sesuai. Jika suatu menu tidak terlihat, akun
tersebut mungkin tidak memiliki hak akses untuk menu itu.

## 2. Area Publik

Navigasi utama publik berisi **Home**, **Open Mic**, **Event**, **Komika**, dan
**More**.

| Menu | Fungsi |
|---|---|
| **Home** | Melihat informasi komunitas dan konten utama, termasuk informasi kegiatan yang ditampilkan. |
| **Open Mic** | Menjelajahi Open Mic mendatang maupun yang sudah selesai, membuka detail acara, melihat lineup, mencari riwayat komika, dan membagikan informasi lineup. |
| **Event** | Melihat Event mendatang maupun Event Selesai, membuka detail, dokumentasi, lineup pengisi acara, serta pendaftaran peserta atau tiket jika tersedia. |
| **Komika** | Menjelajahi profil komika yang ditampilkan publik dan membuka detail profilnya. |
| **More** | Mengakses Gabung Komunitas, Tentang Komunitas, Kerja Sama, Kontak & Sosial Media, dan pengaturan notifikasi browser. |
| **Panduan** | Membaca panduan pendaftaran Open Mic dan tiket serta jawaban atas pertanyaan umum. |
| **Akses Tiket** | Membuka tiket digital menggunakan data pemesan dan Kode Akses yang dikirim setelah tiket diterbitkan. |
| **Recap** | Melihat Annual Recap komunitas yang sudah dipublikasikan. |
| **Syarat & Ketentuan / Kebijakan Privasi** | Membaca ketentuan penggunaan dan informasi privasi. |
| **Merchandise** | Membuka tautan toko melalui banner **Beli Merchandise** jika promosi toko sedang aktif. |

### Open Mic: acara mendatang, selesai, dan arsip penampilan

Halaman **Open Mic** memiliki dua bagian utama:

- **Mendatang** menampilkan acara yang akan berlangsung. Pengunjung dapat
  mencari acara, membuka detail untuk membaca informasi panggung dan lineup
  sementara, lalu mendaftar jika pendaftaran masih dibuka dan slot belum penuh.
- Kolom **Cari Open Mic mendatang** mencari judul Open Mic, venue/lokasi,
  tanggal, atau tanggal dalam format yang ditampilkan. Ketik sebagian kata
  saja; pencarian tidak membedakan huruf besar-kecil. Kolom ini hanya memfilter
  daftar Mendatang.
- **Open Mic Selesai** adalah arsip acara yang sudah berlangsung. Saat kolom
  pencarian kosong, halaman menampilkan hingga lima acara terbaru. Setelah
  pengunjung mengetik pencarian, semua acara yang cocok dapat ditampilkan.
- Pencarian Open Mic Selesai dapat mencocokkan judul acara, tempat/lokasi,
  tanggal atau tahun, nama komika/nama panggung, komunitas, dan Instagram.
  Satu pencarian juga mencari komika yang pernah tampil, bukan hanya kartu
  acaranya.
- Kolom pencarian Open Mic Selesai hanya memengaruhi arsip selesai dan hasil
  komika yang pernah tampil; pencarian di bagian Mendatang terpisah. Hapus
  kata pencarian untuk kembali ke lima acara selesai terbaru.
- Hasil **Komika yang pernah tampil** dapat dibuka untuk melihat jumlah
  penampilan serta rincian Open Mic yang tercatat. Riwayat internal ini berasal
  dari data hadir/tampil yang dicatat admin; pendaftaran saja belum dihitung
  sebagai penampilan.

Contoh penggunaan pencarian Open Mic:

1. Untuk mencari panggung mendatang, ketik judul atau lokasi di kolom
   **Cari Open Mic mendatang**.
2. Untuk mencari arsip, ketik kata seperti judul acara, nama komika, nama
   tempat, bulan, tahun, komunitas, atau nama Instagram di kolom
   **Open Mic Selesai**.
3. Jika mencari nama komika, lihat bagian **Komika yang pernah tampil** di
   atas kartu arsip. Pilih nama komika untuk membuka rincian jumlah dan daftar
   penampilannya.
4. Hapus teks pencarian untuk melihat kembali daftar awal. Pada bagian selesai,
   daftar awal berisi maksimal lima acara terbaru.

### Detail Open Mic dan arti lineup

Di detail setiap Open Mic, bagian lineup berubah sesuai status acara:

- **Lineup Sementara** untuk acara yang belum selesai berisi komika yang
  pendaftarannya sudah dikonfirmasi dan belum dicatat hadir. Ikon tiket biru
  berarti terkonfirmasi. Daftar ini membantu penonton melihat siapa yang
  dijadwalkan tampil dan dapat menjadi acuan antrean saat acara.
- **Daftar Lineup** pada Open Mic Selesai adalah arsip komika yang dicatat hadir
  dan tampil. Ikon centang hijau menandakan status tampil. Peserta yang tidak
  hadir atau belum ditandai tampil tidak masuk ke arsip ini.
- Jumlah **Komika Terdaftar** pada acara mendatang berbeda makna dengan jumlah
  **Komika Perform** pada acara selesai. Angka selesai mengikuti komika yang
  tercatat tampil.
- Daftar lineup dapat dicari berdasarkan nama panggung, Instagram, atau
  komunitas. Jika profil komika Member aktif dan dipublikasikan, nama di lineup
  selesai dapat membuka profil publiknya. Tautan Instagram juga dapat dibuka
  langsung jika tersedia.

### Tombol Bagikan pada lineup Open Mic

Ikon bagikan berada di judul bagian lineup pada detail Open Mic. Fungsinya
menyesuaikan status acaranya:

- Pada **Lineup Sementara**, tombol membuka menu berbagi perangkat berisi
  ringkasan lineup sementara dan tautan halaman Open Mic. Jika perangkat atau
  browser tidak mendukung menu berbagi, tautan halaman disalin agar dapat
  dibagikan secara manual.
- Pada **Open Mic Selesai**, tombol membuka pratinjau gambar ringkasan
  **Daftar Lineup**. Dari pratinjau, pengunjung dapat mengunduh gambar atau
  membagikannya melalui menu berbagi perangkat. Jika perangkat tidak dapat
  membagikan gambar, gambar akan diunduh terlebih dahulu agar dapat dikirim
  lewat aplikasi pilihan.
- Tombol bagikan di bagian informasi acara (dekat poster/status) berbeda:
  tombol tersebut membagikan tautan dan ringkasan detail Open Mic, sedangkan
  ikon di bagian lineup membagikan lineup.

Penjelasan singkat untuk presentasi: **lineup sementara menunjukkan siapa yang
direncanakan tampil; daftar lineup Open Mic selesai adalah catatan siapa yang
benar-benar hadir dan tampil. Tombol bagikan pada lineup selesai membuat
gambar arsip yang siap diunduh atau dibagikan.**

### Event Selesai dan dokumentasi publik

Pada halaman **Event**, pengunjung dapat membedakan Event Mendatang dengan
**Event Selesai**:

- Event Selesai berisi arsip Event yang sudah berlangsung dan diurutkan dari
  yang terbaru. Berbeda dari arsip Open Mic yang membatasi lima kartu saat
  pencarian kosong, daftar Event Selesai menampilkan semua Event selesai yang
  dipublikasikan.
- **Cari event mendatang** dan **Cari riwayat event** adalah dua kolom
  pencarian terpisah: yang satu memfilter Event Mendatang, yang lain memfilter
  Event Selesai. Mengetik pada satu kolom tidak mengubah hasil di bagian
  satunya.
- Kedua pencarian Event dapat mencocokkan judul, venue/lokasi, tanggal
  (termasuk format tanggal yang ditampilkan), bulan/tahun, dan jam. Pencarian
  juga mencocokkan nama pengisi acara/nama panggung, peran, dan kategori peran
  yang tercatat pada lineup Event.
- Pencarian tidak membedakan huruf besar-kecil dan menerima sebagian kata.
  Contohnya, ketik nama venue, `2026`, nama komika, atau `MC` untuk
  mempersempit hasil. Hapus teks pencarian untuk menampilkan kembali semua
  Event pada bagian itu.
- Di bagian Mendatang, jumlah pada judul menunjukkan banyaknya Event yang
  cocok dengan pencarian saat itu. Pada Event Selesai, jumlah arsip ditampilkan
  bersama daftar hasil yang difilter.
- Pilih kartu untuk membuka detail Event. Detail menampilkan informasi acara
  dan **Pengisi Acara** yang dikelompokkan menurut peran, misalnya Special
  Show, Guest Star, Lineup, Juri, Opener, MC/Host, atau Lainnya. Jika terhubung
  ke profil Komika publik, kartu pengisi acara dapat dibuka untuk melihat
  profil tersebut.
- Untuk Event yang sudah selesai, poster/detail dapat membuka foto dokumentasi.
  Galeri dokumentasi dapat dibuka lebih lanjut untuk melihat album lengkap
  jika foto tersedia.
- Tombol bagikan di detail Event membagikan tautan Event dengan pesan yang
  menyesuaikan status: informasi/tiket untuk Event mendatang, atau ucapan dan
  tautan kenangan untuk Event selesai.

### Banner Merch di website publik

Admin Penuh dapat mengatur promosi dari **More → Merch**. Banner publik hanya
tersedia jika Admin mengaktifkannya dan konfigurasi lengkap: gambar, judul,
deskripsi, serta tautan toko yang valid. Jika belum diaktifkan atau ada
informasi wajib yang belum lengkap, pengunjung tidak melihat banner.

- Banner tidak langsung muncul saat halaman dibuka. Setelah pengunjung mulai
  menjelajahi website selama sekitar **17 detik**, banner dapat tampil.
- Banner tampil sekitar **7 detik**, lalu menghilang sendiri jika tidak ditutup
  atau diklik lebih dulu. Pengunjung juga dapat menutupnya dengan tombol **X**.
- Tombol **Beli Merchandise** membuka toko pada tab baru. Banner ini adalah
  promosi ringan, bukan bagian yang menghalangi navigasi utama website.
- Banner tidak ditampilkan pada halaman Akses Tiket dan dokumentasi Event.

### Alur mendaftar Open Mic

1. Pilih Open Mic mendatang yang pendaftarannya masih dibuka.
2. Buka detailnya, periksa jadwal, tempat, dan aturan, lalu isi formulir.
   Pengunjung umum mengisi data sendiri. Member dapat menggunakan data profil
   komikanya.
3. Kirim pendaftaran dan tunggu tinjauan Koordinator Open Mic.
4. Setelah dikonfirmasi, nama masuk ke **Lineup Sementara**. Konfirmasi belum
   berarti sudah dihitung tampil.
5. Setelah acara, Koordinator mencatat kehadiran. Penampilan baru tercatat
   sebagai tampil jika status kehadiran dicatat **Hadir**.

### Alur Event dan tiket

Pendaftaran peserta Event dan pembelian tiket adalah dua alur yang berbeda:

- **Daftar sebagai Peserta** mengirim data peserta kepada admin untuk ditinjau
  dan ditindaklanjuti.
- **Beli Tiket** memilih kategori tiket dan membuat pesanan. Pembeli mengisi
  data pemesan, membayar melalui metode yang tersedia, lalu menunggu
  pembayaran disetujui atau dikonfirmasi.
- Setelah tiket diterbitkan, pembeli membuka **Akses Tiket** menggunakan nomor
  WhatsApp pemesan dan Kode Akses dari email. QR pada tiket digunakan saat
  check-in Event.

### Contoh penjelasan singkat untuk presentasi

> “Di website publik, siapa pun bisa melihat Open Mic dan Event yang akan
> datang maupun arsip kegiatan yang sudah selesai. Di Open Mic Selesai, kita
> bisa mencari acara atau komika, membuka rincian riwayat tampil, dan
> membagikan gambar lineup. Di Event Selesai, pengunjung bisa mencari acara,
> melihat pengisi acara, dan membuka dokumentasi. Kalau Admin Penuh
> mengaktifkan promosi Merch dan melengkapi datanya, banner Beli Merchandise
> akan muncul setelah pengunjung menjelajahi website beberapa saat.”

## 3. Area Member

Navigasi Member berisi **Home**, **Open Mic**, **Buku Materi**, **Profile**,
**Evaluasi**, dan **More**.

| Menu | Fungsi dan hubungan |
|---|---|
| **Home** | Ringkasan aktivitas, Open Mic mendatang, serta jumlah dan ringkasan penampilan/pengalaman yang sudah tercatat. Kartu ringkasan mengarah ke fitur terkait. |
| **Open Mic** | Menjelajahi Open Mic, mendaftar, melihat lineup, dan melihat acara yang sudah selesai. Riwayat internal bergantung pada data kehadiran yang dicatat admin. |
| **Buku Materi** | Menulis, mencari, membaca, dan mengelola materi komedi. Materi dapat disusun menjadi **Setlist** dan diunduh sebagai PDF atau Word. Jumlah materi menunjukkan koleksi materi akun. |
| **Profile** | Mengelola profil komika, seperti nama panggung, foto, bio, WhatsApp, dan tautan sosial. Data profil membantu identifikasi saat mendaftar dan dapat ditampilkan pada halaman Komika publik sesuai pengaturan/status profil. |
| **Evaluasi** | Membaca skor dan masukan evaluator atas penampilan yang sudah dievaluasi. Evaluasi terkait dengan komika, Open Mic, dan pendaftaran yang tercatat hadir. |
| **Riwayat Pengalamanku** | Melihat rangkuman perjalanan panggung, termasuk Event dan pengalaman tampil yang tercatat. |
| **Riwayat Open Mic** | Melihat atau mengajukan riwayat penampilan dari luar sistem, serta aktivitas MC internal/eksternal. Pengajuan perlu ditinjau admin agar dihitung sebagai riwayat yang disetujui. |
| **More → Akun** | Mengatur informasi akun. |
| **More → Peran** | Melihat role yang aktif pada akun. |
| **More → Bantuan** | Membaca panduan menu dan FAQ Member serta menghubungi admin melalui WhatsApp. |
| **More → Evaluator** | Muncul untuk akun yang juga memiliki role Evaluator. |

### Bedakan status pendaftaran dan status tampil

- **Menunggu konfirmasi**: pendaftaran sudah dikirim, belum masuk lineup.
- **Terkonfirmasi**: nama masuk Lineup Sementara.
- **Hadir**: admin mencatat kehadiran; data ini menjadi dasar pencatatan
  penampilan internal dan dapat menjadi dasar Evaluator menilai.
- **Riwayat eksternal**: Member mengirim kegiatan yang berlangsung di luar
  pencatatan Open Mic internal. Admin meninjau pengajuan sebelum disetujui.
- **Evaluasi**: masukan dan skor dari Evaluator; berbeda dari bukti kehadiran
  atau riwayat tampil.

Dengan demikian, mendaftar atau masuk lineup saja tidak otomatis menambah
jumlah penampilan.

## 4. Area Evaluator

Evaluator masuk melalui menu **Evaluator** yang tersedia pada akun ber-role
Evaluator. Area ini menampilkan Open Mic yang ditugaskan kepada akun tersebut.

1. Buka tugas Open Mic yang sudah selesai.
2. Pilih komika yang tercatat hadir dan memenuhi cakupan evaluasi.
3. Isi skor aspek penampilan dan masukan.
4. Simpan sebagai draf jika belum selesai, atau kirim jika evaluasi siap.
5. Setelah dikirim, evaluasi dapat dilihat Member melalui menu **Evaluasi**.

Admin menghubungkan Evaluator dengan Open Mic melalui menu **Evaluator** di
Admin. Assignment dapat berlaku untuk Open Mic tertentu atau seluruh Open Mic.
Evaluator hanya mengakses tugas yang sesuai assignment aktifnya.

## 5. Area Admin

Admin menggunakan panel yang sama, tetapi navigasi dan pekerjaan operasional
dibagi menurut role. Nama dan susunan navigasi dapat berbeda di desktop dan
ponsel.

### Admin Penuh (`admin`)

Navigasi utama Admin Penuh saat ini berisi **Ringkasan**, **Komika**,
**Manajemen Akun**, **Partner**, dan **More**. Menu **Open Mic** dan **Events**
tidak tersedia di navigasi utama Admin Penuh, sehingga pengelolaan rutin kedua
fitur tersebut dilakukan dari workspace admin operasional masing-masing:
**Admin Open Mic** mengelola Open Mic dan **Admin Event** mengelola Event.

Menu Admin Penuh berfokus pada:

- **Dashboard**: ringkasan kegiatan, data komika/member, pendaftaran, Event,
  dan pesanan tiket.
- **Komika**: mengelola profil komika serta melihat ringkasan penampilan.
- **Manajemen Akun / Akun Member**: mengelola akun dan profil Member.
- **Akun Admin**: membuat dan mengelola akun operasional.
- **Partner**: mengelola data partner.
- **More**: mengakses jadwal CCS, pengajuan Gabung Komunitas, Annual Recap,
  Pengaturan Profil, Merch, dan Settings.

Jadi, jangan menyamakan role **Admin Penuh** dengan **Admin Open Mic** atau
**Admin Event**: kedua workspace operasional itu memiliki menu dan alur kerja
tersendiri.

### Admin Open Mic (`open_mic_admin`)

Fokus pada operasional Open Mic:

- Melihat Dashboard operasional Open Mic.
- Mengelola Open Mic dan publikasinya.
- Melihat daftar pendaftar, performer, dan riwayat Open Mic.
- Mengelola akun Member yang terkait dengan operasional.
- Mengatur assignment Evaluator.
- Mengelola jadwal CCS.
- Mengubah profil admin.

Role ini tidak memiliki akses umum ke pengelolaan Event, akun Admin, Merch,
atau seluruh pengaturan Admin Penuh.

### Admin Event (`event_admin`)

Fokus pada operasional Event dan komunitas:

- Melihat Dashboard Event.
- Mengelola Event, pendaftaran peserta, lineup, dokumentasi, dan partner.
- Melihat data penonton/peserta sesuai Event yang dapat diakses.
- Mengelola akun Admin Tiket dan Admin QR Scanner.
- Mengubah profil admin.

Pengelolaan kategori tiket dan transaksi secara rinci ditangani melalui
workspace ticketing sesuai hak aksesnya; tidak semua kontrol Admin Penuh
tersedia di akun Admin Event.

### Admin Tiket (`admin_ticket`)

Fokus pada penjualan dan administrasi tiket:

- Melihat ringkasan ticketing dan Event yang berada dalam cakupan akun.
- Meninjau pesanan, status pembayaran, dan tiket yang diterbitkan.
- Mengelola tiket/kategori, informasi pembayaran, biaya, dan voucher.
- Melihat laporan penjualan tiket dan mengelola pengaturan Gate.
- Mengubah profil admin.

### Admin QR Scanner (`admin_qr`)

Fokus pada validasi tiket saat acara:

- Melihat Event yang berada dalam cakupan akun.
- Memindai QR tiket untuk proses check-in.
- Melihat laporan check-in dan riwayat pemindaian.
- Mengubah profil admin.

Role ini berfokus pada pemindaian dan check-in, bukan pengelolaan umum akun,
Open Mic, atau pesanan tiket.

### Evaluator (`evaluator`)

Evaluator bukan role Admin Panel. Evaluator memakai **Evaluator Area** untuk
menilai Open Mic sesuai assignment. Akun Evaluator juga mendapat akses Member,
sehingga dapat membuka profil, materi, dan evaluasi seperti Member.

### Cakupan Event untuk Admin Tiket dan Admin QR

Akun Tiket/QR dapat diberi cakupan untuk semua Event atau Event tertentu.
Karena itu, daftar Event, order, tiket, dan pekerjaan scanner yang tampak bisa
berbeda antar akun. Jika Event yang dibutuhkan tidak muncul, mintalah Admin
Penuh atau Admin Event memeriksa cakupan akun.

## 6. Hubungan antarfitur

### Siklus Open Mic

```text
Admin Open Mic membuat & memublikasikan Open Mic
                 ↓
Publik/Member melihat detail dan mengirim pendaftaran
                 ↓
Admin Open Mic meninjau → pendaftaran dikonfirmasi → Lineup Sementara
                 ↓
Acara berlangsung → Admin Open Mic mencatat kehadiran
                 ↓
Hadir → riwayat/jumlah penampilan internal
                 ↓
Evaluator yang ditugaskan memberi evaluasi
                 ↓
Member membaca evaluasi di menu Evaluasi
```

### Siklus Event dan tiket

```text
Admin Event mengelola & memublikasikan Event
              ↓
Publik melihat detail Event
       ┌──────┴───────────────┐
       ↓                      ↓
Daftar sebagai peserta    Beli tiket
       ↓                      ↓
Admin Event meninjau      Admin Tiket / sistem pembayaran
                              ↓
                       Tiket diterbitkan
                              ↓
                   Pembeli membuka Akses Tiket
                              ↓
                    Admin QR memindai QR check-in
```

### Hubungan data komunitas

- Pengajuan **Gabung Komunitas** ditinjau Admin. Akun Member dan profil
  komika kemudian menjadi identitas untuk kegiatan Member.
- Profil komika yang ditampilkan publik dikelola dari data profil dan
  pengaturan publikasinya; Admin Penuh juga dapat membantu mengelola data
  komika.
- **Partners** adalah data partner. Hubungan partner dengan acara tertentu
  dikelola pada Event.
- **Annual Recap** disiapkan Admin, lalu versi yang dipublikasikan dibaca
  pengunjung publik dan Member.
- **Riwayat Open Mic eksternal** berasal dari pengajuan Member dan menjadi
  catatan yang disetujui setelah ditinjau admin.

## 7. Ringkasan siapa melakukan apa

| Kegiatan | Pengguna utama | Hasil yang terhubung |
|---|---|---|
| Melihat Open Mic/Event/Komika | Publik dan Member | Informasi yang sudah dipublikasikan |
| Mendaftar Open Mic | Publik atau Member | Pendaftaran → konfirmasi → lineup → pencatatan hadir |
| Mengelola Open Mic | Admin Open Mic | Pendaftaran, performer, kehadiran, dan evaluasi |
| Membuat materi dan setlist | Member | Koleksi materi pribadi dan setlist |
| Mengajukan riwayat eksternal | Member | Riwayat menunggu tinjauan admin |
| Mengirim evaluasi | Evaluator yang mendapat assignment | Masukan yang dapat dibaca Member |
| Mengelola Event dan peserta | Admin Event | Informasi Event, peserta, lineup, dokumentasi, partner |
| Mengelola order dan tiket | Admin Tiket | Status pembayaran dan penerbitan tiket |
| Memvalidasi tiket di lokasi | Admin QR Scanner | Status check-in dan laporan pemindaian |
| Meninjau pengajuan komunitas | Admin Penuh dan role operasional yang diberi akses | Proses keanggotaan komunitas |

**Catatan:** hak akses aktual ditentukan oleh role dan, untuk ticketing/scanner,
cakupan Event akun. Gunakan menu yang tampil pada akun sebagai panduan akses
operasional; hubungi Admin Penuh jika membutuhkan perubahan akses.
