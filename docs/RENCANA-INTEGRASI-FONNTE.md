# Rencana Teknis Integrasi Fonnte — Standupindo Cilegon

**Status:** Rencana saja — belum disetujui untuk implementasi  
**Cakupan:** Perencanaan pengiriman WhatsApp otomatis untuk tiket  
**Tanggal:** 27 Oktober 2026

Dokumen ini mencatat rencana teknis berdasarkan pemeriksaan read-only terhadap source code dan persyaratan yang diberikan. Dokumen ini bukan bukti bahwa konfigurasi Supabase atau migrasi sudah diterapkan di lingkungan mana pun. Implementasi, perubahan database/configuration, pemanggilan API, dan pengiriman pesan memerlukan persetujuan eksplisit terpisah.

## 1. Ringkasan rekomendasi

Tambahkan pengiriman otomatis sebagai jalur baru yang berdampingan dengan WhatsApp manual melalui `wa.me` dan email Resend yang sudah ada. Rekomendasi awal adalah **outbox transaksional di database dan worker Supabase Edge Function**:

1. RPC penerbitan tiket yang relevan mencatat satu pekerjaan WhatsApp dalam transaksi yang sama dengan penerbitan order, tiket, dan kode akses.
2. Worker terjadwal mengklaim pekerjaan secara atomik, membaca data order/event serta kode akses aktif dari sumber yang ada, lalu mengirim pesan dari backend.
3. Outbox memiliki idempotency key dan status tersendiri, terpisah dari catatan pengiriman manual.
4. Kegagalan WhatsApp tidak membatalkan Lunas, penerbitan tiket, atau email.
5. Semua tombol/tautan WhatsApp manual, pesan yang sudah dibuat, dan aksi admin menandai pesan manual tetap dipertahankan.

**Dasar terverifikasi:** beberapa RPC sudah menerbitkan kode akses dan tiket secara atomik; proyek memiliki migrasi yang menggunakan `pg_cron`, dan sebagian menggunakan `pg_net` untuk memanggil Edge Function. Ini menunjukkan pola kode yang dapat dipelajari, bukan bukti scheduler aktif pada project Supabase produksi.

**Belum dipastikan:** konfigurasi Fonnte, dukungan API untuk idempotency atau delivery callback, status scheduler di lingkungan aktif, limit akun, serta cakupan pesan untuk order yang telah Lunas sebelum fitur dirilis.

## 2. Diagram alur yang diusulkan

```text
Admin / Midtrans / OTS / Free Pass
                |
                v
Backend terotorisasi memvalidasi tindakan dan data
                |
                v
RPC penerbitan tiket dalam transaksi database
  - mengalokasikan Access Code aktif
  - menerbitkan satu QR token per tiket
  - menyimpan order/status
  - mencatat satu outbox job (unik per order + jenis notifikasi)
                |
       transaksi commit
          /          \
         v            v
   Email Resend    Outbox pending
   tetap berjalan       |
                        v
               pg_cron/pg_net pemicu worker
                        |
                        v
             Worker mengklaim job dengan lease
                        |
              validasi ulang order/kode/nomor
                        |
                        v
                 API Fonnte (backend)
                        |
         +--------------+----------------+
         |              |                |
     accepted         failed           unknown
  (API menerima)   (pasti gagal)   (timeout/hasil ambigu)
         |              |                |
         +--------------+----------------+
                        |
              status dicatat terpisah

Admin tetap dapat menggunakan wa.me dan menandai
pengiriman manual tanpa terikat pada status outbox.
```

Worker tidak menyatakan pesan sampai ke pembeli hanya berdasarkan HTTP/API success atau status accepted. Status delivery hanya boleh dicatat jika provider menyediakan bukti delivery yang sesuai dan callback/status tersebut telah diverifikasi.

## 3. Matriks integrasi empat jalur penerbitan

| Jalur | Fakta source code | Saat outbox direncanakan dibuat | Idempotensi dan syarat |
|---|---|---|---|
| Pembayaran manual | UI `TicketAdminOrdersPage` memanggil aksi `resolve-order`. Edge Function memvalidasi sesi, role, dan scope event, lalu memanggil RPC `resolve_ticket_order_payment`. RPC mengunci order, memvalidasi status dan jumlah bayar, menerbitkan Access Code/QR, dan mengubah status menjadi Lunas. Sesudah RPC sukses, fungsi mengirim email Resend. | Di dalam RPC yang sama, setelah order memenuhi syarat, Access Code terhubung dan instance tiket sesuai quantity tersedia. Pekerjaan hanya dibuat untuk transisi sah dari status review ke Lunas. | Unique key berbasis `order_id` + jenis pesan; pengulangan RPC untuk order Lunas memakai alokasi yang ada dan tidak membuat notifikasi baru. Periksa dan pertahankan guard `previousStatus` untuk email yang ada. |
| Midtrans | `midtrans-notification` memvalidasi signature serta Status API provider sebelum RPC `settle_midtrans_ticket_order`. RPC mengunci order/transaksi, membuat kode/QR, mengubah status dan allocation state. `ticketing-public` dapat merekonsiliasi status dengan memanggil fungsi webhook. Email mempunyai log unik per order dan `Idempotency-Key` Resend. | Di dalam RPC settlement yang sama, setelah alokasi berhasil. Panggilan webhook atau rekonsiliasi berulang tidak boleh menambah pekerjaan baru. | Unique key per order + jenis pesan; status allocation `issued` dan status order diperiksa. Kegagalan alokasi atau review provider tidak membuat outbox. |
| OTS | Aksi `issue-ots-sale` memanggil jalur RPC penerbitan OTS (termasuk wrapper pembayaran OTS yang ada). Order, Access Code, dan QR dibuat langsung; order dapat langsung Lunas. | Di dalam RPC penerbitan OTS utama ketika order dan QR berhasil dibuat. Aksi konfirmasi pembayaran OTS yang hanya mengubah status pembayaran OTS tidak membuat pesan kedua. | Pekerjaan harus terikat pada order yang diterbitkan, bukan pada perubahan status pembayaran OTS yang tidak menerbitkan ulang tiket. Unique key melindungi pengulangan. |
| Free Pass | Aksi `issue-free-pass` memanggil `issue_ticket_free_pass`, membuat order Lunas, Access Code dan QR; email dikirim bila alamat email diisi. UI menyediakan tautan WhatsApp manual. | Di dalam RPC penerbitan Free Pass ketika order, Access Code, dan semua QR tersimpan. | Unique key per order + jenis pesan; retry pengiriman email atau aksi baca ulang kode tidak boleh membuat pekerjaan tiket baru. |

**Satu pekerjaan per order dan jenis notifikasi** direkomendasikan karena satu kode akses terkait dengan order/penerima dan memberi akses ke seluruh tiket order. Quantity tiket tidak membuat pekerjaan WhatsApp per tiket; QR individual tetap dibuat dan ditampilkan seperti sekarang. Jika beberapa order memakai nomor WhatsApp yang sama, setiap order tetap memiliki notifikasi sendiri. Tidak ada perubahan pada format Access Code atau QR.

Order lama yang sudah Lunas tidak dimasukkan ke outbox secara massal. Pengiriman historis memerlukan keputusan dan proses backfill terpisah.

## 4. Desain antrean, idempotensi, worker, dan recovery

### Outbox

Rencanakan tabel baru khusus, misalnya `ticket_whatsapp_outbox`, dengan kolom konseptual:

- ID pekerjaan dan `ticket_order_id` sebagai relasi utama.
- Jenis notifikasi dan sumber penerbitan (`manual_payment`, `midtrans`, `ots`, `free_pass`) untuk audit operasional.
- Kunci idempotensi unik, misalnya kombinasi `ticket_order_id` + `notification_kind`.
- Status, jumlah percobaan, waktu percobaan berikutnya, waktu pembuatan/perubahan.
- Lease/claim owner dan `lease_expires_at` untuk pemulihan worker yang berhenti.
- Status HTTP/provider yang telah disanitasi, referensi provider bila aman disimpan, dan error code ringkas.
- Waktu ketika provider menerima permintaan dan waktu delivery terkonfirmasi, jika provider mendukung bukti tersebut.

Jangan simpan token Fonnte atau Access Code plaintext dalam outbox. Worker mengambil order/event dan kode terenkripsi dari tabel yang ada, memverifikasi kode aktif, lalu mendekripsinya di backend hanya pada saat menyusun pesan. Nomor penerima diambil dari order dan dinormalisasi saat pengiriman, bukan disalin ke banyak log.

### Transaksi dan idempotensi

Tambahkan insert outbox di RPC penerbitan yang menjadi sumber kebenaran untuk empat jalur. Dengan demikian, order/tiket dan pekerjaan dibuat bersama-sama atau sama-sama rollback. `INSERT ... ON CONFLICT DO NOTHING` bersama unique constraint dapat mencegah duplikasi saat RPC/webhook diulang. Jangan gunakan trigger generik pada perubahan kolom status saja: OTS dan Free Pass mulai sebagai Lunas dan tidak setiap update Lunas berarti penerbitan baru yang memenuhi syarat.

RPC yang baru/diubah harus menjaga izin yang sudah ada, `search_path` aman, validasi input, urutan lock, dan aturan RLS. Review khusus diperlukan agar insert outbox berada pada transaksi yang sama dan tidak menciptakan deadlock dengan lock event, ticket, order, dan Access Code.

Idempotency key lokal membatasi pekerjaan duplikat, tetapi tidak menjamin pengiriman tepat satu kali ke WhatsApp. Jika Fonnte menerima permintaan namun respons hilang, sistem mungkin tidak dapat membuktikan apakah pesan telah diproses. Job tersebut harus menjadi `unknown` atau status setara untuk pemeriksaan, bukan langsung dikirim ulang tanpa batas.

### Klaim pekerjaan dan lease

Gunakan RPC claim berprivilege minimum yang memilih sejumlah kecil job `pending`/eligible dan mengambil lock baris dengan `FOR UPDATE SKIP LOCKED`. RPC mengubah status menjadi `processing`, mengisi lease dan mencatat percobaan sebelum mengembalikan identitas job kepada worker. Dua worker paralel tidak boleh mengklaim baris yang sama. Pengiriman API dilakukan setelah transaksi claim berakhir, bukan ketika transaksi database masih terbuka.

Jika proses berhenti, lease yang kedaluwarsa menjadikan job layak diperiksa lagi. Bila pemanggilan provider mungkin sudah terjadi, status dipindahkan ke `unknown` untuk rekonsiliasi, bukan dianggap sebagai kegagalan pasti. Retry otomatis hanya untuk kegagalan transient yang terbukti aman untuk diulang, dengan batas percobaan, exponential backoff, jitter, dan penghentian/eskalasi setelah batas tercapai. Kegagalan permanen tidak diulang otomatis.

### Pemicu dan recovery worker

Migrasi proyek menunjukkan pemakaian `pg_cron`; satu pola otomasi memakai `pg_net` untuk memanggil Edge Function dan mengambil URL serta kunci pemanggil dari Supabase Vault. Rancangan ini bisa menjadi dasar worker terjadwal (misalnya polling periodik), tetapi konfigurasi, ekstensi, Vault, job aktif, kuota, dan kompatibilitas project produksi perlu diperiksa di dashboard sebelum dipilih final.

Pemicu langsung sesudah transaksi dapat mengurangi latensi, tetapi tidak boleh menjadi satu-satunya jalur karena runtime dapat berhenti setelah commit. Gunakan scheduler sebagai recovery berkala. Endpoint worker harus memerlukan autentikasi server-to-server dan tidak boleh menjadi fungsi publik tanpa proteksi; detail autentikasi dan nilai secret perlu disetujui serta diverifikasi pada konfigurasi Supabase aktual.

## 5. Tabel dan migration yang direncanakan

**Belum dibuat.** Rancangan berikut adalah kandidat cakupan migration, bukan instruksi menjalankan migration:

1. **Tabel outbox baru** dengan FK ke order, check constraint status, unique constraint per order/jenis notifikasi, lease, retry metadata, waktu, dan error tersanitasi.
2. **Indeks antrean** pada status/waktu percobaan berikutnya dan lease, dengan predikat yang sesuai agar klaim job efisien.
3. **RLS dan grants**: tidak ada akses `anon`/`authenticated`; operasi hanya melalui fungsi backend berprivilege minimum. Jika service role dipakai untuk worker, akses tetap dibatasi oleh implementasi server dan tidak diekspos ke browser.
4. **RPC pencatatan/claim/update job**: fungsi klaim atomik dan fungsi menyimpan hasil transisi, dengan `search_path`, validasi status, lock, dan `REVOKE/GRANT` eksplisit.
5. **Perubahan empat RPC penerbitan**: `resolve_ticket_order_payment`, `settle_midtrans_ticket_order`, RPC OTS utama, dan `issue_ticket_free_pass` menulis outbox pada transaksi penerbitan.
6. **Scheduler**: bila dipilih, migration menambah/menjadwalkan pemanggilan worker melalui pola `pg_cron`/`pg_net` yang sesuai dengan konfigurasi rahasia aktual. Perubahan `config.toml` hanya jika fungsi worker membutuhkan deklarasi khusus; tidak mengubah konfigurasi webhook Midtrans tanpa alasan.

### Dampak data lama, RLS, dan rollback

- Tabel baru tidak perlu mengubah order lama dan tidak perlu backfill. Default rollout adalah hanya penerbitan baru setelah fitur diaktifkan.
- Data lama tidak dikirim otomatis massal. Jika backfill kemudian disetujui, tentukan eligibility, deduplikasi, batas laju, dan preview sebelum membuat job.
- Akses riwayat job harus dibatasi untuk backend dan admin yang memang memerlukan status. RLS/grants perlu diuji dengan role anon, authenticated, admin, dan service role.
- Rollback operasional dimulai dengan menghentikan scheduler dan mencegah claim baru; job yang sedang `processing` direkonsiliasi lebih dulu. Kemudian kembalikan definisi RPC ke versi terdahulu melalui migration forward/rollback yang ditinjau, dan baru pertimbangkan pengarsipan/penghapusan tabel setelah riwayat yang dibutuhkan diamankan.
- Jangan drop tabel saat ada pekerjaan belum terselesaikan; jangan hapus catatan delivery/error yang dibutuhkan audit. Migration produksi dan kondisi database aktif belum diverifikasi.

## 6. Edge Function dan file yang mungkin terpengaruh

Daftar ini adalah perkiraan dampak berdasarkan source sekarang, bukan daftar perubahan yang sudah dilakukan.

### Backend

- `supabase/functions/ticketing-admin/index.ts`: jalur `resolve-order`, penerbitan OTS/Free Pass, dan pembacaan status operasional bila UI perlu menampilkannya. Sender Fonnte dapat menjadi helper bersama atau fungsi terpisah; rencana ini merekomendasikan worker terpisah agar kegagalan provider tidak memperlambat transaksi pembayaran.
- `supabase/functions/midtrans-notification/index.ts`: tidak perlu mengirim WhatsApp langsung bila RPC settlement mencatat outbox. Pertahankan validasi signature, Status API, alokasi tiket, dan email.
- `supabase/functions/ticketing-public/index.ts`: pemeriksaan status Midtrans meneruskan rekonsiliasi ke fungsi webhook; unique outbox harus menahan pengulangan. Hindari pengiriman dari endpoint publik pemeriksaan order.
- Edge Function baru, misalnya `ticketing-whatsapp-worker`, untuk claim job, validasi ulang status/kode/nomor, memanggil API provider dan memperbarui status.
- Fungsi SQL yang relevan akan mendapat perubahan bersama migration yang direview.

### Frontend dan pesan manual

- `src/pages/admin/TicketAdminOrdersPage.tsx`: tampilan ringkas status otomatis dan aksi refresh/recovery yang disetujui, tanpa menghapus atau menonaktifkan tautan `wa.me`, kode akses, atau tombol tandai manual.
- `src/pages/admin/TicketAdminTicketsPage.tsx`: pertahankan alur OTS dan Free Pass yang menampilkan pesan/tautan WhatsApp manual. Status otomatis dapat ditampilkan terpisah jika UI ini memang dipilih sebagai tempat pengelolaan.
- `src/lib/whatsapp.ts`: tidak ada kebutuhan untuk mengubah generator pesan manual kecuali ada keputusan eksplisit; perubahan minimal sebaiknya menghindari file ini.
- Template pesan otomatis backend sebaiknya memiliki teks khusus/teruji tetapi tidak mengubah pesan manual yang sudah ada.
- `src/lib/format.ts` dan `supabase/functions/_shared/ticketing.ts` sudah menormalisasi nomor Indonesia. Utamakan pola yang sudah ada dan tambahkan validasi ketat server-side untuk input pengiriman.

## 7. Keamanan dan pengelolaan token

- Simpan token API Fonnte hanya sebagai Supabase Edge Function secret/server-side secret; nama konseptual yang dapat ditetapkan saat implementasi misalnya `FONNTE_TOKEN`. Jangan gunakan `VITE_*`, bundle, tabel client-readable, respons API, chat, source code, atau log.
- Gunakan header/metode/API endpoint sesuai dokumentasi resmi Fonnte yang berlaku **setelah diverifikasi**. Dokumen ini sengaja tidak menetapkan kontrak endpoint, field response, callback, maupun arti setiap status karena belum diverifikasi terhadap dokumentasi resmi akun yang akan digunakan.
- Worker hanya mengambil job dengan fungsi claim dan membaca data minimum. Jangan membuka tabel outbox langsung ke browser.
- Endpoint worker harus memiliki autentikasi server-to-server. Pilih mekanisme setelah menilai gateway Edge Function, scheduler, Supabase Vault, dan konfigurasi project aktif. Jangan menganggap `verify_jwt = false` aman atau tidak aman tanpa menguji autentikasi aktual.
- Validasi ulang order benar-benar termasuk salah satu jalur yang disetujui, sudah diterbitkan, memiliki `access_code_id` aktif, event yang sesuai, nomor valid, dan data pesan yang lengkap.
- Log harus menghindari token, kode akses, isi pesan penuh, dan data pribadi berlebih. Simpan hanya error code/provider reference yang dibutuhkan; sanitasi body provider sebelum persist.
- Periksa retensi data, kebijakan akses admin, rate limit/kuota akun Fonnte, dan prosedur rotasi token sebelum produksi.
- Batasi request burst dan pertimbangkan circuit breaker/backoff ketika perangkat atau provider tidak tersedia.

## 8. Format nomor, retry, dan status pengiriman

### Nomor WhatsApp

Checkout memvalidasi format Indonesia dan menerima pola `08…`, `628…`, serta input `+62…` melalui penghapusan karakter non-digit. SQL dan helper backend menormalkan menjadi angka dengan kode negara `62`; constraint nomor kode akses membatasi 10–15 digit. Di worker, gunakan nilai kanonis itu dan validasi ulang panjang serta prefiks yang diizinkan. Normalisasi bukan bukti nomor terdaftar atau dapat menerima pesan.

### Status yang disarankan

Gunakan status internal yang membedakan fakta, misalnya:

- `pending`: pekerjaan tercatat dan menunggu claim.
- `processing`: worker memegang lease dan sedang memproses.
- `accepted`: API/provider mengonfirmasi penerimaan/antrean saja; bukan delivery ke penerima.
- `failed`: kegagalan definitif yang diketahui dan tersimpan.
- `unknown`: timeout/putus koneksi setelah request mungkin diterima, atau hasil tidak dapat dipastikan.
- `delivered`: hanya jika callback/status provider memberi bukti delivery yang tervalidasi.
- Status terminal seperti `manual_review`/`exhausted` dapat dipilih untuk hasil ambigu yang perlu tindakan admin.

Satu skema akhir harus disepakati setelah dokumentasi Fonnte diperiksa. UI dan laporan tidak boleh menyebut `accepted` sebagai “terkirim”.

### Retry dan disconnect

- Retry terbatas dengan backoff hanya untuk kelas error yang dipastikan aman dan dapat diulang.
- `unknown` tidak di-retry membabi buta. Rekonsiliasi lewat status/callback provider jika tersedia; jika tidak, eskalasi kepada admin untuk keputusan.
- Respons penolakan yang definitif disimpan sebagai `failed` dengan informasi tersanitasi.
- Perangkat WhatsApp terputus/kuota habis ditangani sebagai kegagalan atau kondisi tertunda sesuai kontrak resmi yang diverifikasi; status order dan email tetap berjalan.
- Jika database gagal mencatat hasil setelah API dipanggil, job berpotensi berada di `processing`/lease habis dan hasil eksternal menjadi ambigu. Recovery harus mengutamakan rekonsiliasi, bukan pengiriman ulang otomatis tanpa bukti.
- Batas retry, backoff, lease, ambang job macet, frekuensi scheduler, dan prosedur manual perlu disepakati sebelum produksi.

## 9. Perubahan UI minimum — jalur manual tetap utuh

UI admin dapat menampilkan status outbox per order: menunggu, diproses, diterima provider, gagal, tidak diketahui, atau delivery terkonfirmasi jika dapat dibuktikan. Pesan error harus ringkas dan tidak memuat token/kode.

Pertahankan tanpa perubahan perilaku:

- Tombol/tautan `wa.me` untuk order reguler, OTS, dan Free Pass.
- Isi pesan manual serta prefill kode akses dan petunjuk tiket yang telah ada.
- Aksi `mark-access-code-sent` dan metadata manual `last_sent_at`, `send_count`, `last_sent_by`.
- Admin dapat mengirim manual ketika otomatis gagal/tidak diketahui dan tetap boleh mengirim manual setelah otomatis accepted/delivered.
- Status manual dan otomatis ditampilkan/diolah terpisah; catatan manual bukan bukti delivery otomatis, dan catatan otomatis bukan alasan memblokir pengiriman manual.

UI manual hanya boleh diubah bila benar-benar diperlukan untuk menampilkan status baru; tidak boleh mengganti, mengunci, atau menghapus jalur `wa.me`.

## 10. Konfigurasi dashboard yang kelak diperlukan

Tidak ada perubahan konfigurasi yang dilakukan. Sebelum implementasi/produksi, operator perlu:

1. Memastikan kontrak API Fonnte dari dokumentasi resmi untuk akun yang digunakan: URL, POST/header Authorization, format payload, respons, error code, batas/rate, timeout yang disarankan, serta dukungan status/callback.
2. Menghubungkan dan memverifikasi perangkat WhatsApp Fonnte di lingkungan/akun yang disetujui; memastikan proses saat perangkat disconnected.
3. Menyimpan token melalui secret manager Supabase untuk lingkungan yang tepat. Jangan mengirim token ke chat atau memasukkannya ke source/log.
4. Memverifikasi pada dashboard bahwa `pg_cron` dan `pg_net` tersedia/aktif, job terjadwal berjalan, dan akses Vault tersedia bila pola itu dipakai.
5. Menetapkan URL project serta autentikasi pemanggil scheduler ke Edge Function tanpa mengekspos secret ke client.
6. Memeriksa kuota/biaya Edge Function, `pg_cron`, `pg_net`, Vault, database, serta volume pengiriman dan rate limit Fonnte.
7. Mengatur callback/status delivery hanya bila didukung dan cara verifikasinya didokumentasikan.
8. Mengatur secrets dan deployment terpisah untuk staging dan produksi; tidak menaruh konfigurasi rahasia dalam `.env.example`.

Repo berisi migrasi yang membuat jadwal `pg_cron`; satu otomasi event menggunakan `pg_net` dan Supabase Vault. Ini adalah bukti pola sumber kode saja, bukan status dashboard production. `config.toml` saat ini hanya memiliki override `verify_jwt = false` untuk `midtrans-notification`; integrasi baru tidak boleh menyalin pengaturan itu tanpa analisis keamanan.

## 11. Pengujian dan rollback

### Pengujian sebelum produksi

Gunakan unit/integration test dengan provider stub/mock dan environment sandbox yang disetujui. Jangan mengirim pesan ke pembeli nyata.

- Pembayaran manual berhasil, gagal validasi, ditolak, dan aksi admin berulang.
- Midtrans settlement berhasil; webhook berulang dan rekonsiliasi status berulang hanya menghasilkan satu outbox job.
- OTS dan Free Pass menghasilkan satu job sesudah seluruh tiket/kode tersedia; konfirmasi OTS terpisah tidak menambah job.
- Dua worker mencoba claim bersamaan; satu job hanya dipegang satu worker.
- Worker berhenti sebelum request, selama request, setelah provider menerima tetapi sebelum hasil tercatat, dan restart setelah lease habis.
- Provider menerima lalu respons timeout; pastikan status ambigu tidak memicu retry duplikat otomatis.
- Provider menolak request, perangkat terputus, rate limit, timeout, malformed response, serta error database saat pencatatan hasil.
- Nomor `08…`, `628…`, `+628…`, nomor kosong/tidak valid, kode tidak aktif, event/order tidak eligible.
- Email gagal secara independen; WhatsApp gagal tidak mengubah status Lunas/tiket/email.
- Jalur manual dapat dibuka dan digunakan saat otomatis gagal, tidak diketahui, accepted, atau delivered.
- Pengiriman manual tidak mengubah status outbox; keberhasilan otomatis tidak menghalangi aksi manual.
- Tidak ada backfill massal otomatis untuk order Lunas sebelum release.
- Quantity, QR unik per tiket, kapasitas/kuota, voucher, harga, alur pembayaran, email, serta UI tiket tetap berperilaku seperti sebelumnya.
- Uji RLS/grants, akses endpoint worker, autentikasi scheduler, kebocoran secret/kode di log, dan hak admin terhadap status.

### Rollback

Siapkan deployment bertahap dengan worker/scheduler dapat dimatikan terpisah dari penerbitan tiket. Jika terjadi masalah:

1. Hentikan scheduler/claim baru dan nonaktifkan sender, tanpa mengubah status order.
2. Biarkan email serta WhatsApp manual tetap tersedia.
3. Klasifikasikan job `processing`/`unknown`; jangan mengirim ulang sebelum hasilnya dipahami.
4. Pulihkan versi Edge Function/RPC sebelumnya melalui prosedur migration yang direview.
5. Pertahankan outbox dan histori sampai semua job tertangani; jangan menghapus tabel sebagai langkah rollback awal.
6. Setelah penyebab diperbaiki dan persetujuan diperoleh, lanjutkan job yang aman diproses.

## 12. Kompleksitas, ketergantungan, dan risiko

**Kompleksitas: menengah–tinggi.** Perubahan bukan hanya panggilan API: empat jalur penerbitan berada di beberapa RPC, diperlukan operasi outbox transaksional, worker aman, status dan recovery, pengujian konkurensi, serta UI admin.

**Ketergantungan utama:** dokumentasi resmi dan perilaku akun Fonnte; dashboard Supabase aktif (scheduler, Vault, fungsi, secrets, kuota); keputusan autentikasi worker; migrasi/RPC produksi yang benar-benar terpasang; dan definisi status delivery.

**Risiko utama:** duplikasi pada timeout ambigu, job tidak pulih setelah runtime berhenti, perubahan RPC mengganggu issuance/kuota, kebocoran kode/token, salah menyatakan pesan sudah diterima, dan perubahan UX yang mengganggu jalur manual. Unique constraint/outbox, lease dan recovery, server-side secrets, status konservatif, serta pengujian jalur penerbitan mengurangi risiko, tetapi tidak menjanjikan exactly-once delivery ke WhatsApp.

Tidak ditetapkan estimasi kalender sebelum akses lingkungan, dokumentasi Fonnte, serta keputusan operasi worker diketahui.

## 13. Keputusan yang memerlukan persetujuan

Sebelum implementasi, minta persetujuan eksplisit untuk:

1. Arsitektur outbox + worker terjadwal dan kandidat pemanfaatan `pg_cron`/`pg_net`/Vault.
2. Status outbox, lease, batas retry/backoff, perlakuan `unknown`, dan tindakan admin untuk hasil ambigu.
3. Satu notifikasi otomatis per order/penerima dan jenis notifikasi, bukan per tiket.
4. Pesan yang dikirim, domain/link tiket, bahasa, dan apakah pesan memasukkan kode akses plaintext melalui WhatsApp.
5. Tampilan status otomatis yang ditambahkan ke UI admin.
6. Akses/RLS, retensi histori, autentikasi worker, secrets, dan kebijakan rotasi token.
7. Perilaku callback/status Fonnte setelah dokumentasi resmi dan fitur akun diperiksa.
8. Apakah order Lunas lama tetap dikecualikan permanen atau memerlukan backfill terpisah yang dibatasi.
9. Kebijakan pengiriman untuk empat jalur, khususnya dampak penerbitan OTS/Free Pass dan batas rate.
10. Jadwal dan urutan rollout staging, produksi, observability, dan rollback.

## Status pemeriksaan dokumen ini

- **Fakta:** ditelusuri pada source code dan migrasi yang ada di workspace; referensi file di atas belum membuktikan konfigurasi database production.
- **Rekomendasi:** rancangan outbox transaksional, worker terpisah, idempotency key lokal, status delivery konservatif, dan pemisahan catatan manual.
- **Asumsi:** migrasi baru dapat ditinjau dan diterapkan melalui prosedur proyek setelah persetujuan; konfigurasi Fonnte akan tersedia di secret manager server-side.
- **Belum dapat diverifikasi:** token/akun dan perangkat Fonnte, limit/kontrak API aktual, callback delivery, status job cron/Vault di project aktif, dan migrasi yang terpasang di production.
- **Perubahan implementasi, database, konfigurasi, API, dan pengiriman pesan:** tidak dilakukan sebagai bagian dari penyusunan rencana ini.
