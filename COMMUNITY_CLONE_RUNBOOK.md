# Runbook Clone Mandiri Komunitas

Panduan ini untuk membuat website komunitas baru yang mandiri sepenuhnya dari Standupindo Cilegon. Contoh: Standupindo Serang, Standupindo Rangkasbitung, dan Standupindo Pandeglang.

## Prinsip isolasi

Setiap komunitas mengelola dan membayar layanannya sendiri. Jangan menggunakan kredensial atau resource produksi komunitas lain.

| Resource | Yang disiapkan untuk setiap komunitas |
| --- | --- |
| Source code | Repository Git sendiri; fitur awal sama, perubahan berikutnya dikelola sendiri |
| Domain | Domain dan akses registrar/DNS sendiri |
| Hosting | Akun hosting dan deployment sendiri |
| Supabase | Organization/project, database, Auth, Storage, Edge Functions, secrets, dan backup sendiri |
| Email | Akun Resend, domain pengirim terverifikasi, API key, dan pengelola sendiri |
| Push notification | VAPID key, webhook secret, konfigurasi Vault, dan jadwal sendiri jika fitur push diaktifkan |
| Operasional | Admin, password manager, metode pembayaran layanan, dan penanggung jawab sendiri |

Satu orang boleh membantu mengelola beberapa komunitas jika memang dipilih, tetapi itu tidak membuat akun, billing, database, atau kredensial menjadi terpisah. Untuk kepemilikan mandiri sungguhan, buat akun/organisasi layanan atas nama pengelola komunitas masing-masing dan undang pihak lain dengan role seperlunya.

## Sebelum mulai

Tentukan dan kumpulkan:

- Nama resmi dan nama singkat komunitas.
- Logo header, favicon/PWA, dan gambar Open Graph.
- Palet warna utama, hover, aksen, dan warna netral.
- Domain, akses DNS, akun hosting, dan kontak penanggung jawab.
- Nomor WhatsApp per keperluan, akun sosial, alamat, dan copy profil.
- Email pengirim dan domain yang akan diverifikasi di Resend.
- Admin awal, alamat email admin, serta password kuat yang disimpan di password manager.
- Pemilik Supabase dan metode pembayaran/penagihan untuk layanan terpisah.

Jangan meminta atau menyimpan password, API key, service-role key, atau token orang lain di repository, chat, atau dokumen ini.

## Tahap 1 — Buat repository dan salinan kode

1. Buat repository baru milik organisasi/pengelola komunitas.
2. Salin source code aplikasi, bukan data produksi Cilegon.
3. Jangan salin `.env`, `.git`, `node_modules`, `dist`, log, backup, atau file kredensial lokal.
4. Pastikan remote Git mengarah ke repository komunitas baru sebelum melakukan push.
5. Catat commit sumber agar versi awal dapat ditelusuri.

Contoh nama repository:

```text
standupindo-serang
standupindo-rangkasbitung
standupindo-pandeglang
```

Salinan repository berdiri sendiri. Perbaikan bug dan fitur baru di repository Cilegon tidak otomatis masuk; pengelola perlu memilih dan menerapkan perubahan tersebut sendiri.

## Tahap 2 — Buat layanan mandiri

Lakukan untuk setiap komunitas:

1. Buat domain dan hosting atas nama/pengelolaan komunitas tersebut.
2. Buat Supabase project baru. Jangan menghubungkan situs baru ke URL/key Cilegon.
3. Buat akun Resend dan verifikasi domain email pengirim milik komunitas tersebut.
4. Buat secret push/VAPID sendiri bila push notification akan digunakan.
5. Catat URL, key publik, project ref, domain, dan status setup di password manager atau inventaris privat. Jangan memasukkan secret ke Git.

Email frontend hanya memakai `VITE_SUPABASE_URL` dan publishable/anon key milik project baru. Service-role key, Resend API key, VAPID private key, dan secret webhook hanya berada di server/Supabase Secrets/Vault.

## Tahap 3 — Periksa branding yang tertanam di kode

Admin Settings dapat mengubah sebagian branding database, tetapi bukan semua teks/assets statis. Sebelum build, cari dan putuskan nilai komunitas untuk:

- `index.html`: title, description, favicon, Open Graph/Twitter image, dan theme color.
- `src/lib/types.ts`, `src/lib/useSiteSettings.ts`: fallback nama, logo, sosial media, dan alamat.
- Halaman publik serta formulir admin yang memiliki teks/lokasi default Cilegon.
- Footer di `src/components/AppShell.tsx`: copyright memakai nama situs dari Settings; periksa teks deskripsi dan informasi/footer statis lain agar sesuai dengan komunitas baru. `src/components/AppCredit.tsx` memuat kredit pembuat tetap—tentukan apakah kredit itu dipertahankan atau diganti sesuai kebutuhan clone.
- `public/`: logo, ikon PWA, manifest, service worker, dan gambar fallback.
- Supabase Edge Functions: template email, nama pengirim, URL tiket, pesan push/WhatsApp.
- Seed SQL: nama, lokasi, URL, dan data contoh.

Contoh: template ticketing saat ini memiliki branding/pengirim email tertentu di kode Edge Function. Domain dan akun Resend baru saja tidak otomatis mengganti `from`, logo, atau copy HTML. Pastikan semua nilai memakai branding komunitas baru sebelum deploy.

Perubahan hanya untuk identitas dan konfigurasi layanan. Jangan menghapus atau mengubah fitur aplikasi saat melakukan proses branding.

## Tahap 4 — Siapkan database baru dengan migration yang tervalidasi

### Peringatan migration repository saat ini

Jangan menjalankan seluruh file dalam `supabase/migrations` secara membabi buta dan jangan langsung menjalankan `supabase db push` terhadap project baru berdasarkan urutan yang ada sekarang.

Repository memiliki rangkaian legacy/duplikat, seed akun admin dengan kredensial contoh, serta migration fitur lanjutan yang tidak tercakup dalam urutan canonical lama. Karena itu, daftar migration yang siap dipakai untuk database kosong **belum boleh dianggap tervalidasi hanya dari nama/timestamp file**. Migration seed admin berikut tidak boleh dijalankan untuk produksi:

```text
20260903040009_create_admin_auth_user.sql
```

Panduan lama pernah mencantumkan baseline sampai fitur September, tetapi belum merupakan paket lengkap semua fitur saat ini. Migration ticketing dan push juga memiliki prasyarat konfigurasi serta memerlukan validasi terhadap database kosong.

### Prosedur wajib sebelum membuat database production

1. Buat/siapkan branch template yang berisi migration baseline bersih dan lengkap untuk semua fitur yang akan diaktifkan.
2. Tinjau setiap migration: dependency, tabel/kolom yang diasumsikan sudah ada, policy lama yang harus dihapus, seed/demo data, serta fungsi/trigger yang memanggil layanan eksternal.
3. Pastikan tidak ada password/credential seed, URL/key milik Cilegon, atau policy permissive yang tertinggal.
4. Uji seluruh migration secara berurutan pada database lokal kosong atau Supabase staging baru; mulai dari schema kosong, bukan database Cilegon.
5. Setelah migration selesai, jalankan pemeriksaan RLS, policies Storage, fungsi RPC, serta smoke test backend. Simpan daftar urutan dan commit paket migration yang lolos uji.
6. Hanya gunakan paket yang telah diuji itu untuk project production komunitas baru.

**Status praktis:** sebelum paket migration bersih tersebut tersedia dan lolos uji dari nol, tahap database adalah blocker; jangan publish ke pengguna dan jangan mengarang urutan dengan memilih timestamp sendiri.

**Hasil pemeriksaan source 7 Oktober 2026:** `npm run build` berhasil, tetapi `npm run typecheck` dan `npm run lint` masih gagal pada source saat ini. Selesaikan atau tinjau error tersebut terlebih dahulu; jangan melewati quality gate hanya karena bundle dapat dibangun.

### CLI atau SQL Editor?

- **Rekomendasi: Supabase CLI** setelah paket migration bersih tersedia. CLI menyimpan/mengecek riwayat migration dan mengurangi risiko file dijalankan salah urut.
- SQL Editor dapat dipakai hanya jika pengelola mengikuti daftar migration tervalidasi yang sama, satu per satu, memeriksa setiap hasil, dan mencatat file yang sudah diterapkan.
- Jangan menerapkan migration manual di SQL Editor lalu kemudian menjalankan `db push` tanpa menyelaraskan migration history. CLI dapat menganggap file belum diterapkan dan mengulangnya.
- CLI tidak membuat migration yang berantakan menjadi aman; tetap wajib uji database kosong dahulu.

Jangan memasukkan data komunitas Cilegon ke database baru. Buat admin baru melalui Supabase Auth dan tetapkan `raw_app_meta_data` role admin menggunakan prosedur yang telah diuji. Jangan gunakan seed admin/password yang ada di migration.

## Tahap 5 — Konfigurasi Supabase dan Edge Functions

Setelah schema lolos validasi dan diterapkan ke project baru:

1. Atur Auth Site URL dan redirect URL ke domain HTTPS komunitas baru.
2. Periksa RLS untuk semua tabel serta policy `storage.objects`. Pastikan anon hanya mendapat akses publik yang memang diperlukan, dan operasi admin benar-benar dibatasi dengan role.
3. Buat bucket/policy sesuai migration tervalidasi. Jangan menggunakan bucket atau Storage project lain.
4. Masukkan secrets Edge Function ke Supabase Secrets/Vault project ini, bukan `.env` frontend.
5. Deploy Edge Functions yang digunakan aplikasi, termasuk fungsi auth/admin, ticketing, dan push jika fitur terkait diaktifkan.
6. Untuk push automation, migration menjadwalkan job dan memerlukan extension/configuration serta URL dan service-role key project ini di Vault. Gunakan VAPID dan webhook secret khusus komunitas.
7. Periksa log function setelah deploy. Jangan mengaktifkan scheduler sebelum secrets dan endpoint target telah benar.

Daftar nama secret harus diinventarisasi dari `Deno.env.get(...)` di setiap function yang akan dideploy. Masukkan hanya secret yang memang diperlukan fungsi tersebut, dan simpan nilainya secara privat.

### Fitur terbaru yang perlu disiapkan pada clone

Fitur di bawah sudah ada pada source saat runbook ini diperbarui. Jika fitur dipakai di komunitas baru, masukkan migration dan konfigurasinya ke baseline bersih yang telah diuji; jangan menyalin data atau secrets produksi Cilegon.

| Fitur | Yang wajib disesuaikan atau diuji |
| --- | --- |
| Login lintas perangkat | Migration `20261007134000_add_account_active_sessions.sql` membuat catatan perangkat aktif, RLS, dan Realtime. Sertakan dalam paket migration tervalidasi dan terapkan sebelum frontend yang memakai fitur ini. Uji login Admin dan Member di dua browser/perangkat, pilihan batal dan pindah, serta logout. Realtime mengeluarkan sesi aplikasi lama; Supabase tidak dapat membatalkan access JWT yang sudah diterbitkan sebelum masa berlakunya habis. |
| Email dan akses tiket | `ticketing-admin` saat ini memakai `noreply@standupindocilegon.id` dan tautan `https://standupindocilegon.id/tiket` secara hardcode. Ganti keduanya dengan domain komunitas clone, verifikasi domain di Resend, dan set `RESEND_API_KEY` milik komunitas. Buat nilai rahasia unik untuk `TICKET_ACCESS_CODE_ENCRYPTION_KEY`, `TICKET_ACCESS_CODE_PEPPER`, dan `TICKET_ACCESS_RATE_LIMIT_PEPPER` sesuai kebutuhan `ticketing-admin`/`ticketing-public`; jangan gunakan ulang nilai Cilegon. |
| Ketersediaan tiket | Uji kategori yang kuotanya benar-benar habis (tidak dapat dipesan dan tidak ditawarkan sebagai tiket tersedia) terpisah dari kategori yang kuotanya sedang tertahan order belum selesai (tetap terlihat tetapi pemesanan nonaktif). Pastikan pemeriksaan server pada `ticketing-public` tetap menjadi otoritas, bukan hanya status UI. |
| Notifikasi Admin dan Member | Buat order tiket uji dan pastikan notifikasi Admin Tiket menampilkan nama pembeli, event, dan kategori/status yang tepat. Pastikan badge mengikuti menu tujuan untuk setiap role Admin dan Member, bukan hanya total lonceng. Uji perubahan status/realtime dan hak akses tiap role. |
| Popup Instagram | Isi `instagram_url` pada Settings dengan URL HTTPS Instagram komunitas baru. Popup hanya untuk pengunjung yang belum login, menunggu sekitar 4 detik, dan tidak tampil di halaman tiket/pendaftaran. Batas saat ini maksimal 3 kali per 30 hari, minimal jeda 1 hari, jeda 7 hari setelah ditutup, dan 30 hari setelah follow. Status tersimpan di browser, bukan di akun; uji tampil/tutup/follow pada browser bersih. |

## Tahap 6 — Isi data dan branding

1. Login menggunakan akun admin baru.
2. Isi Settings: nama komunitas, logo, warna, kontak, sosial, alamat, dan afiliasi.
3. Ganti semua seed Open Mic/Event/Komika dengan data komunitas baru sebelum publikasi.
4. Upload logo/favicons/PWA assets ke lokasi project baru dan perbarui aset yang masih spesifik Cilegon.
5. Konfigurasikan penerima pembayaran/QRIS serta kebijakan tiket komunitas tersebut.
6. Verifikasi email Resend memakai `from` yang telah diverifikasi dan template/tautan menampilkan identitas komunitas yang tepat.

Jangan menyalin order, bukti pembayaran, nomor WhatsApp pendaftar, akun Auth, subscription push, atau data pribadi komunitas lama.

## Tahap 7 — Environment dan build frontend

Buat `.env` lokal baru dari placeholder, jangan menyalin `.env` komunitas lain:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_VAPID_PUBLIC_KEY=YOUR_COMMUNITY_PUBLIC_VAPID_KEY
```

`VITE_*` dimasukkan ke bundle dan dapat dilihat di browser. Isinya hanya boleh berupa konfigurasi publik; jangan masukkan `service_role`, Resend API key, VAPID private key, atau secret webhook.

Jalankan quality gate dari repository komunitas baru:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

Jangan publish bila perintah wajib gagal atau konfigurasi masih menunjuk ke project/domain komunitas lain.

## Tahap 8 — Deploy hosting dan domain

1. Arahkan DNS domain ke hosting komunitas baru dan aktifkan HTTPS.
2. Upload isi folder `dist` ke web root hosting (misalnya `public_html`), bukan folder `dist` sebagai subfolder.
3. Pastikan `index.html`, aset, dan aturan SPA fallback tersedia. Untuk Apache, pastikan `.htaccess` dari `public/` ikut masuk hasil deploy.
4. Jangan mengunggah `.env`, `node_modules`, service-role key, file lokal, atau source jika hosting hanya membutuhkan static build.
5. Pastikan konfigurasi Supabase Auth memakai domain baru.
6. Uji refresh langsung pada halaman publik, admin, member, event, dan Open Mic.

Perubahan `.env` frontend memerlukan build dan upload ulang `dist`.

## Tahap 9 — Uji sebelum diumumkan

### Isolasi layanan

- Domain mengarah ke hosting yang benar.
- Frontend memakai URL/key publishable milik Supabase project komunitas tersebut.
- Auth user, database, Storage, dan Edge Functions berada di project komunitas tersebut.
- Resend memakai akun/domain pengirim komunitas ini.
- Push memakai VAPID/webhook/Vault sendiri jika aktif.
- Tidak ada nama, logo, kontak, link, poster, email pengirim, atau URL tiket komunitas lain.

### Keamanan dan fitur

- Pengunjung publik tidak dapat membaca data pribadi pendaftar, bukti pembayaran, atau kolom internal.
- User login non-admin tidak dapat menjalankan operasi admin.
- Role operasional dibatasi pada scope yang benar.
- Uji registrasi publik/member, kapasitas, approval/attendance, event, order tiket, pembayaran, email, QR/check-in, expiry, dan upload sesuai fitur yang digunakan.
- Uji login/logout, reset/auth redirect, HTTPS, pembatasan Storage, serta error Edge Function.
- Periksa log tanpa menampilkan token, password, kode akses, nomor pembayaran, atau data pribadi.
- Uji desktop dan mobile serta route langsung/refresh.

## Tahap 10 — Operasional berkelanjutan

- Setiap pengelola bertanggung jawab atas biaya, billing, rotasi secret, admin, backup, dan incident response resource-nya.
- Aktifkan backup database dan dokumentasikan pemulihan.
- Batasi admin hanya kepada orang yang perlu; cabut akses ketika tidak lagi bertugas.
- Catat versi/commit yang sedang live per komunitas.
- Terapkan security update dan perbaikan bug secara terpisah ke setiap repository mandiri.

## Checklist ringkas per komunitas

- [ ] Repository baru dan remote Git sudah benar.
- [ ] Domain, DNS, hosting, dan HTTPS mandiri.
- [ ] Supabase organization/project/database mandiri.
- [ ] Paket migration lengkap telah diuji pada database kosong.
- [ ] RLS dan Storage policies sudah diuji dengan anon, non-admin, dan admin.
- [ ] Admin baru dibuat; migration seed credential tidak dijalankan.
- [ ] Resend account, domain, sender, dan API key mandiri.
- [ ] Push secrets/VAPID/Vault mandiri jika push diaktifkan.
- [ ] Secrets ticket-access unik; sender email dan tautan tiket tidak lagi menunjuk ke Cilegon.
- [ ] Login lintas perangkat diuji setelah migration aktif dan sebelum frontend dirilis.
- [ ] Ketersediaan tiket, notifikasi pembeli, serta badge per-menu diuji untuk role terkait.
- [ ] Popup Instagram memakai URL komunitas baru dan aturan tampilnya diuji.
- [ ] Branding statis dan dinamis sudah diperiksa.
- [ ] `.env` hanya berisi URL/key publik dari project baru dan tidak di-commit.
- [ ] `npm run typecheck`, `npm run lint`, dan `npm run build` lulus.
- [ ] Smoke test isolasi dan fitur lulus sebelum pengumuman.
