# Panduan Clone Komunitas dari Nol sampai Online

Panduan ini ditujukan untuk pengelola komunitas yang tidak harus menjadi programmer. Tujuannya adalah membuat website komunitas baru dengan menu, fitur, role, dan perilaku yang sama seperti website sumber, tetapi memakai branding dan database sendiri.

Contoh: website sumber Standupindo Cilegon digunakan untuk membuat website Standupindo Serang, Pandeglang, atau komunitas lain.

## Gambaran singkat

Urutan besarnya:

```text
Siapkan identitas
  -> siapkan akun layanan
  -> buat repository clone
  -> minta AI/teknisi menyiapkan database
  -> uji migration dari nol
  -> masukkan branding
  -> deploy Edge Functions dan secrets
  -> deploy website ke Vercel
  -> hubungkan domain
  -> smoke test
  -> website siap digunakan
```

> **Peringatan penting:** pada status repository saat ini belum ada satu paket migration canonical yang terbukti berhasil dari database Supabase kosong. Jangan menjalankan semua file di folder `supabase/migrations`, jangan copy-paste SQL secara acak, dan jangan menyatakan website siap produksi sebelum teknisi menyelesaikan validasi migration.

## Aturan wajib: feature parity 100%

Clone **tidak boleh menjadi versi yang lebih sederhana** dari website sumber. Sebelum dinyatakan selesai, clone wajib memiliki:

- menu publik, member, evaluator, dan seluruh role admin yang sama;
- route, halaman, modal, tombol, form, filter, laporan, PDF, notifikasi, PWA, dan integrasi yang sama;
- hak akses dan batasan RLS yang sama;
- schema, kolom, RPC, trigger, Storage bucket/policy, Edge Functions, scheduler, dan secret dependency yang diperlukan fitur yang sama;
- alur Open Mic, Event, Komika, member, evaluasi, materi, ticketing, pembayaran, check-in, voucher, recap, push, dan email yang sama sesuai fitur source;
- akses yang tidak berkurang hanya karena komunitas baru belum memiliki data awal.

Yang boleh berbeda hanya:

- nama dan nama singkat komunitas;
- logo dan aset PWA;
- warna tema;
- kontak, sosial media, alamat, domain, dan email;
- data operasional komunitas;
- konfigurasi layanan dan secret milik komunitas baru.

**Jika satu menu, route, role, tombol, fungsi, atau alur tidak tersedia atau tidak dapat diakses, clone berstatus BLOCKED dan tidak boleh dipublish.** Jangan menghapus fitur dengan alasan “belum diperlukan”, “belum ada data”, atau “migration terlalu sulit”. Cari root cause dan solusi yang mempertahankan fitur tersebut.

### Matriks feature parity wajib

AI/teknisi harus membuat matriks sebelum rilis:

| Area | Fitur/route/menu source | Clone tersedia | Role yang dapat mengakses | Database/backend dependency | Hasil uji |
| --- | --- | --- | --- | --- | --- |
| Publik | Home, Open Mic, Event, Komika, tiket, dan halaman lain | Ya/Tidak | Anon | Tabel, policy, function | Lulus/Gagal |
| Member | Login, dashboard, profil, materi, riwayat, evaluasi | Ya/Tidak | Member | Auth, RLS, RPC | Lulus/Gagal |
| Evaluator | Tugas dan formulir evaluasi | Ya/Tidak | Evaluator | Assignment, RLS, notification | Lulus/Gagal |
| Admin | Settings, akun, Open Mic, Event, Komika, laporan, dan menu operasional | Ya/Tidak | Admin terkait | Role, RLS, Storage, RPC | Lulus/Gagal |
| Integrasi | Email, pembayaran, PDF, push, PWA, scheduler | Ya/Tidak | Sesuai fitur | Edge Function, secret, extension | Lulus/Gagal |

Matriks harus membandingkan source pada commit yang sama dengan clone. Build frontend yang berhasil **tidak cukup** untuk menyatakan feature parity.

## Tahap 1 — Tentukan identitas komunitas

Siapkan data berikut dalam satu dokumen sederhana:

- Nama resmi komunitas.
- Nama singkat untuk header.
- Kota dan alamat.
- Warna utama, warna hover, dan warna aksen dalam format HEX.
- Nomor WhatsApp admin.
- Nomor WhatsApp pendaftaran.
- Nomor WhatsApp partnership.
- Nomor WhatsApp tiket.
- Instagram, TikTok, dan YouTube.
- Deskripsi singkat komunitas.
- Informasi afiliasi Stand Up Indo.
- Domain yang ingin digunakan.
- Email pengirim untuk email tiket dan notifikasi.

Pastikan penulisan nama sudah final. Nama resmi dapat muncul pada SEO, PDF, email, laporan, dan halaman login.

## Tahap 2 — Siapkan aset branding

Siapkan file berikut:

1. Logo utama komunitas dengan latar transparan.
2. Logo versi persegi untuk favicon.
3. Logo PWA Public.
4. Logo PWA Member.
5. Logo PWA Admin.
6. Gambar Open Graph/share image jika ingin berbeda dari default.

Simpan nama file tanpa karakter aneh. Gunakan PNG, WebP, atau SVG sesuai kebutuhan aplikasi. Pastikan logo tetap terbaca pada ukuran kecil dan tidak memiliki hak penggunaan yang bermasalah.

## Tahap 3 — Buat akun dan resource komunitas

Semua resource harus dibuat atas nama komunitas baru, bukan memakai resource Cilegon.

### 3.1 GitHub — tempat menyimpan source code

1. Buat akun atau organisasi GitHub komunitas.
2. Buka **New repository**.
3. Isi nama repository, misalnya `standupindo-serang`.
4. Pilih **Private** jika website belum siap dipublikasikan.
5. Import source dari commit aplikasi yang sudah disetujui.
6. Pastikan repository clone memiliki `src`, `public`, `supabase`, `package.json`, dan lockfile.
7. Jangan menyalin folder `.git` dari repository sumber.
8. Jangan menyalin `.env`.
9. Jangan memasukkan password, token, atau secret ke repository.

**Yang diberikan kepada AI:** URL repository baru, branch yang digunakan, dan commit source yang disetujui. Jangan memberikan token GitHub melalui chat.

**Prompt AI GitHub siap-copas:**

```text
Periksa repository ini sebagai clone komunitas baru. Pastikan source berasal dari commit aplikasi yang disetujui, repository remote mengarah ke repository komunitas baru, dan tidak ada .env, service-role key, password, token, atau secret yang ikut ter-commit. Jangan mengubah fitur aplikasi. Laporkan struktur repository dan masalah yang ditemukan sebelum melakukan perubahan.
```

### 3.2 Supabase — database, Auth, Storage, dan backend

1. Buat organization/project Supabase baru.
2. Pilih region yang sesuai dengan komunitas dan catat region tersebut.
3. Buka **Project Settings → API**.
4. Salin **Project URL** dan **Publishable key/anon key** ke password manager.
5. Buka **Project Settings → Database** dan simpan database password dengan aman.
6. Jangan memakai project ref Cilegon.
7. Jangan memasukkan service-role key ke chat, frontend, GitHub, atau Vercel environment yang terekspos browser.
8. Jangan membuat tabel dengan menebak SQL sendiri.

**Tempat memasukkan konfigurasi Supabase:**

| Nilai | Tempat |
| --- | --- |
| Project URL | Vercel Environment Variables sebagai `VITE_SUPABASE_URL` |
| Publishable/anon key | Vercel Environment Variables sebagai `VITE_SUPABASE_ANON_KEY` |
| Database password | Password manager/CLI teknisi, bukan repository |
| Service-role key | Supabase Edge Function secret/Vault jika diperlukan |
| Auth Site URL | Supabase **Authentication → URL Configuration** |
| Redirect URL | Supabase **Authentication → URL Configuration** |

**Prompt AI Supabase siap-copas:**

```text
Siapkan repository ini untuk Supabase project baru. Audit dahulu kebutuhan schema, migration canonical, Auth, Storage, RLS, RPC, Edge Functions, extension, dan scheduler. Jangan menjalankan semua file supabase/migrations, jangan menebak urutan SQL, dan jangan memakai project sumber. Jika baseline migration belum terbukti berhasil dari database kosong, berhenti dan jelaskan blocker. Jika sudah tervalidasi, gunakan hanya baseline tersebut, lalu laporkan object database, role, bucket, function, secret name, dan hasil pengujiannya tanpa menampilkan nilai secret.
```

### 3.3 Supabase Auth — akun login

Setelah database canonical lulus:

1. Buka **Authentication → Users**.
2. Klik **Add user**.
3. Masukkan email Admin Penuh komunitas baru.
4. Buat password kuat.
5. Simpan password di password manager.
6. Jangan membuat akun dengan SQL migration yang berisi password.
7. Atur role melalui prosedur server-side yang disetujui.
8. Uji login di halaman Admin.

**Prompt AI Auth siap-copas:**

```text
Siapkan akun Admin Penuh untuk komunitas baru menggunakan prosedur Auth yang aman. Jangan membuat atau menampilkan password di source code, SQL, prompt, log, atau commit. Periksa role berbasis database/RLS, uji login Admin, lalu uji bahwa member biasa tidak bisa melakukan operasi admin.
```

### 3.4 Supabase Storage — logo dan file media

1. Tunggu migration canonical selesai.
2. Buka **Storage** dan pastikan bucket yang dibutuhkan sudah dibuat oleh migration.
3. Jangan membuat nama bucket berbeda tanpa persetujuan teknis.
4. Upload logo melalui Settings aplikasi jika fitur tersebut tersedia.
5. Upload logo PWA ke lokasi yang ditetapkan template.
6. Uji URL logo pada browser mode incognito.
7. Uji upload, baca, update, dan hapus dengan role yang berbeda.

**Prompt AI Storage siap-copas:**

```text
Periksa Storage project komunitas baru. Pastikan bucket dan policy berasal dari baseline canonical, file publik hanya dapat dibaca sesuai kebutuhan, dan upload/update/delete dibatasi role yang benar. Hubungkan logo utama, logo PWA, poster, foto, QRIS, dan aset lain tanpa memakai Storage komunitas sumber. Uji anon, member, admin operasional, dan Admin Penuh.
```

### 3.5 Supabase Edge Functions dan secrets

1. Buka **Edge Functions**.
2. Deploy function dari commit aplikasi yang sama.
3. Buka **Project Settings → Edge Functions → Secrets** atau menu secrets yang setara.
4. Masukkan secret berdasarkan nama yang diminta function.
5. Jangan menaruh nilai secret di frontend.
6. Periksa log setelah function dipanggil.

Nama secret yang umum dipakai:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
MIDTRANS_SECRET_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
PUSH_WEBHOOK_SECRET
TICKET_ACCESS_CODE_ENCRYPTION_KEY
TICKET_ACCESS_CODE_PEPPER
TICKET_ACCESS_RATE_LIMIT_PEPPER
```

Gunakan hanya secret yang benar-benar diminta oleh function pada commit tersebut. Buat nilai unik untuk setiap komunitas.

**Prompt AI Edge Functions siap-copas:**

```text
Inventarisasi semua Supabase Edge Functions yang dipakai aplikasi ini. Untuk setiap function, tampilkan hanya nama function, tujuan, dan NAMA secret yang diperlukan; jangan tampilkan nilai secret. Deploy function dari commit yang sama, periksa dependency schema/RPC, lalu uji endpoint dan log tanpa membocorkan token, password, kode akses, atau data pribadi.
```

### 3.6 Resend — email tiket dan notifikasi

1. Buat akun Resend baru atau gunakan akun organisasi komunitas.
2. Buka **Domains → Add Domain**.
3. Masukkan domain pengirim, misalnya `domainkomunitas.id`.
4. Salin record DNS yang diberikan Resend ke penyedia domain.
5. Tunggu status domain menjadi **Verified**.
6. Tentukan alamat pengirim, misalnya `noreply@domainkomunitas.id`.
7. Buka **API Keys → Create API Key**.
8. Simpan API key di password manager lalu masukkan ke secret `RESEND_API_KEY`.
9. Jangan menaruh API key di `.env` frontend, prompt, atau GitHub.
10. Uji email tiket dan notifikasi.

**Tempat memasukkan konfigurasi Resend:**

| Nilai | Tempat |
| --- | --- |
| Domain pengirim | Resend **Domains** dan DNS provider |
| Alamat `from` | konfigurasi Edge Function/setting email |
| `RESEND_API_KEY` | Supabase Edge Function secret |

**Prompt AI Resend siap-copas:**

```text
Konfigurasikan email komunitas baru menggunakan domain Resend yang sudah diverifikasi. Ganti sender name, alamat from, URL tiket, logo email, dan link email agar memakai komunitas baru. Jangan menampilkan atau commit RESEND_API_KEY. Kirim email uji dan laporkan hanya status berhasil/gagal serta error yang aman.
```

### 3.7 Domain dan DNS — alamat website dan email

1. Beli atau siapkan domain komunitas.
2. Pastikan akses DNS tersedia.
3. Tambahkan record yang diminta Vercel untuk website.
4. Tambahkan record yang diminta Resend untuk email.
5. Jangan menghapus record lama sebelum memahami kegunaannya.
6. Jangan menghubungkan domain baru ke hosting Cilegon.
7. Tunggu DNS propagasi.
8. HTTPS harus aktif sebelum production.

**Catatan:** record DNS website dan email bisa berbeda. Ikuti nilai persis dari dashboard Vercel dan Resend, bukan contoh dari komunitas lain.

**Prompt AI domain siap-copas:**

```text
Audit konfigurasi domain komunitas baru. Pastikan domain mengarah ke Vercel, HTTPS aktif, Supabase Auth Site URL dan redirect URL memakai domain baru, URL email/tiket memakai domain baru, dan tidak ada domain komunitas sumber yang tersisa. Jangan mengubah DNS tanpa menunjukkan record yang akan diubah terlebih dahulu.
```

### 3.8 Vercel — hosting website

1. Buat akun atau team Vercel komunitas.
2. Hubungkan repository GitHub baru.
3. Jangan mengimpor project Vercel Cilegon.
4. Environment Variable diisi pada project Vercel komunitas baru.
5. Pilih framework **Vite** jika diminta.
6. Build command: `npm run build`.
7. Output directory: `dist`.
8. Tambahkan environment variable untuk **Production, Preview, dan Development** sesuai kebutuhan.
9. Redeploy setelah environment variable berubah.

**Environment Variable Vercel:**

```text
VITE_SUPABASE_URL=https://PROJECT_REF_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=KEY_PUBLISHABLE_BARU
VITE_VAPID_PUBLIC_KEY=VAPID_PUBLIC_BARU
```

Hanya nilai `VITE_*` publik yang boleh berada di Vercel frontend. Secret backend tetap berada di Supabase/Resend/Midtrans.

**Prompt AI Vercel siap-copas:**

```text
Siapkan deployment Vercel untuk repository komunitas baru. Gunakan build command npm run build dan output dist. Periksa environment variable VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, dan VITE_VAPID_PUBLIC_KEY agar menunjuk project baru. Jangan memasukkan service-role key atau secret backend. Buat preview deployment, uji route SPA dan refresh langsung, lalu laporkan hasilnya.
```

## Tahap 4 — Berikan data awal kepada AI

Buka repository clone di AI coding assistant. Salin template berikut, lalu isi bagian dalam tanda kurung:

```text
Saya ingin menjadikan repository ini website komunitas baru.

Nama resmi: [NAMA RESMI]
Nama singkat header: [NAMA SINGKAT]
Kota/alamat: [KOTA DAN ALAMAT]
Warna utama: [HEX]
Warna hover: [HEX]
Warna aksen: [HEX]
Instagram: [URL]
TikTok: [URL]
YouTube: [URL]
WhatsApp admin: [NOMOR]
WhatsApp pendaftaran: [NOMOR]
WhatsApp partnership: [NOMOR]
WhatsApp tiket: [NOMOR]
Domain: [DOMAIN]
Supabase URL: [URL SUPABASE BARU]
Supabase publishable/anon key: [KEY PUBLIK]
Resend sender: [EMAIL PENGIRIM]
Lokasi logo: [PATH FILE LOGO]
Lokasi logo PWA Public: [PATH FILE]
Lokasi logo PWA Member: [PATH FILE]
Lokasi logo PWA Admin: [PATH FILE]

Pertahankan semua menu, fitur, role, alur, keamanan, ukuran, layout, dan perilaku aplikasi sumber.
Ubah hanya branding, warna, logo, URL, kontak, konfigurasi layanan, dan data komunitas.
Jangan menyalin data atau secret komunitas sumber.
Audit repository dan migration terlebih dahulu.
Jika migration canonical belum tervalidasi dari database kosong, berhenti dan jelaskan blocker.
Jangan menjalankan seluruh folder migration secara otomatis.
```

Untuk instruksi lengkap dan aturan keamanan, gunakan [COMMUNITY_BRANDING_CLONE_PROMPT.md](./COMMUNITY_BRANDING_CLONE_PROMPT.md).

## Tahap 4A — Urutan penggunaan AI

Jangan memberikan semua pekerjaan dalam satu prompt besar tanpa checkpoint. Gunakan urutan berikut dan tunggu laporan AI pada setiap tahap:

### Prompt 1 — Audit awal

```text
Audit repository ini untuk clone komunitas baru. Jangan mengubah file apa pun. Periksa package, environment, migration, Edge Functions, hardcode branding, domain, email, PWA, Storage, RLS, dan scheduler. Buat laporan: aman, perlu diganti, blocker, dan risiko. Jangan menjalankan SQL.
```

### Prompt 2 — Audit migration

```text
Audit seluruh migration untuk database clone. Jangan mengubah SQL dan jangan menjalankan migration. Temukan migration duplikat, seed data/akun, object yang dipakai sebelum dibuat, policy terlalu luas, extension, scheduler, dan dependency Edge Function. Buat daftar baseline canonical yang diperlukan agar fitur aplikasi tetap sama. Jika ada object yang belum memiliki migration pembuat, tandai sebagai blocker.
```

### Prompt 2A — Diagnosis dan pencarian solusi migration

```text
Sekarang lakukan diagnosis mendalam terhadap semua temuan migration, bukan hanya membuat daftar error.

Untuk setiap temuan:
1. Tulis nama file migration dan nomor baris/objek yang bermasalah.
2. Jelaskan error yang kemungkinan muncul pada database Supabase kosong.
3. Jelaskan dependency yang hilang atau urutan yang salah.
4. Cari semua migration, source code, Edge Function, dan query yang memakai objek tersebut.
5. Bandingkan dengan schema/function/policy/Storage/scheduler yang benar-benar diperlukan aplikasi saat ini.
6. Usulkan minimal satu solusi yang aman untuk clone.
7. Jelaskan apakah solusi berupa:
   - menggabungkan objek ke baseline canonical,
   - membuat migration prerequisite,
   - mengubah urutan melalui migration canonical baru,
   - membuat migration kompensasi,
   - menghapus seed dari paket clone,
   - atau menunda fitur sampai dependency tersedia.
8. Jangan mengubah migration production yang sudah pernah diterapkan.
9. Jangan mengisi migration ledger secara manual.
10. Jangan menyatakan solusi benar sebelum diuji pada staging Supabase kosong.

Khusus periksa:
- public.push_subscriptions dan seluruh pemakainya;
- urutan featured_order sebelum grant kolom;
- dua schema foundation dan pasangan migration duplikat;
- seed data serta seed akun/password Cilegon;
- policy RLS awal yang memakai USING (true);
- bucket Storage dan apakah rerun aman;
- pg_cron, pg_net, Vault, Edge Functions, dan scheduled jobs;
- seluruh hardcode Cilegon pada RPC, logo, email, push, dan ticketing.

Buat tabel:
Temuan | Penyebab | Dampak | Solusi yang diusulkan | File yang perlu disentuh | Cara uji | Status

Jangan melakukan perubahan file pada tahap ini.
```

### Prompt 3 — Validasi staging

```text
Gunakan Supabase staging kosong dan Docker/Podman untuk memvalidasi baseline canonical yang sudah disetujui. Jalankan reset/apply dari nol, bukan SQL copy-paste acak. Catat setiap error beserta migration dan object yang terdampak. Jangan lanjut ke production jika reset belum berhasil atau jika schema, RLS, Storage, RPC, extension, dan scheduler belum diverifikasi.
```

### Prompt 3A — Memperbaiki migration di branch clone

```text
Berdasarkan laporan diagnosis migration, siapkan perbaikan hanya di branch/repository clone atau folder baseline clone, bukan di database production sumber.

Sebelum mengedit:
1. Tampilkan rencana file yang akan dibuat/diubah.
2. Pastikan fitur aplikasi tetap tercakup.
3. Pastikan seed data Cilegon, akun/password, secret, dan data produksi dikeluarkan.
4. Pastikan setiap ALTER/GRANT/RPC memiliki prerequisite.
5. Pastikan bucket, policy, trigger, index, function, dan scheduler aman untuk apply dari database kosong.
6. Pastikan solusi tidak mengubah afiliasi Stand Up Indo.

Setelah rencana disetujui:
1. Buat baseline/migration canonical baru dengan urutan yang jelas.
2. Jangan mengedit atau menghapus migration production historis.
3. Jangan menyalin data atau secret.
4. Jalankan formatter/check SQL yang tersedia.
5. Laporkan semua file yang diubah dan alasan setiap perubahan.
6. Jangan menyatakan selesai sebelum reset/apply staging berhasil.
```

### Prompt 3B — Validasi ulang dan regresi migration

```text
Validasi perbaikan migration pada Supabase staging kosong dan, bila tersedia, staging yang menyerupai kondisi production.

Wajib dibuktikan:
- reset/apply dari database kosong berhasil;
- seluruh tabel, kolom, sequence, index, function, RPC, trigger, grant, dan policy tersedia;
- tidak ada object dipakai sebelum dibuat;
- push_subscriptions dibuat sebelum migration isolasi push;
- featured_order dibuat sebelum grant publik;
- seed Cilegon dan akun/password tidak ada;
- Storage bucket dan policy sesuai role;
- RLS diuji dengan anon, member, evaluator, admin operasional, Admin Event/Tiket, dan Admin Penuh;
- Edge Functions dapat terhubung ke schema final;
- pg_cron/pg_net/Vault hanya aktif jika dependency dan secret tersedia;
- ticketing, pembayaran, email, PDF, Open Mic, Event, lineup, materi, evaluasi, notifikasi, PWA, dan push diuji sesuai fitur aplikasi;
- penerapan ulang pada staging baru menghasilkan struktur yang sama.

Jika gagal, jangan melakukan trial-and-error acak. Kembali ke diagnosis: tulis error, dependency, akar masalah, solusi kandidat, dan bukti pengujian.
```

### Prompt 4 — Konfigurasi layanan

```text
Setelah staging lulus, siapkan konfigurasi Supabase, Auth, Storage, Edge Functions, Resend, domain, dan Vercel komunitas baru. Gunakan hanya URL/key publik di frontend. Jangan tampilkan nilai secret. Laporkan nama secret yang dibutuhkan, lokasi pengisian, hasil deploy, dan error yang aman.
```

### Prompt 5 — Branding

```text
Terapkan branding komunitas baru dari data yang saya berikan. Ubah nama, nama singkat, logo, warna, kontak, URL sosial, SEO, email, PWA, favicon, Open Graph, PDF, laporan, dan URL ticketing yang masih statis. Pertahankan ukuran, layout, spacing, fitur, dan perilaku. Jangan mengubah afiliasi Stand Up Indo, data historis, atau fitur aplikasi.
```

### Prompt 6 — Uji dan serah terima

```text
Jalankan typecheck, lint, build, dan smoke test semua role serta alur aplikasi. Uji publik, member, evaluator, Admin Event, Admin Tiket, dan Admin Penuh; termasuk Auth, RLS, Storage, Open Mic, Event, ticketing, email, PDF, push, PWA, dan responsive.

Buat matriks feature parity yang membandingkan commit source dan clone. Pastikan setiap menu, route, halaman, modal, tombol, form, filter, laporan, PDF, notifikasi, integrasi, role, dan alur dapat diakses dengan role yang benar. Pastikan tidak ada fitur yang hilang, sengaja dihapus, dibatasi, atau gagal karena migration/database belum lengkap.

Cari sisa URL/nama/logo/domain komunitas sumber. Laporkan file berubah, test berhasil/gagal, blocker, perbedaan source-versus-clone, dan langkah manual yang masih diperlukan. Jangan menyatakan production-ready jika ada satu saja perbedaan fitur, menu, akses role, backend dependency, atau blocker.
```

AI harus memberikan laporan setelah setiap prompt. Jika AI menemukan error migration, jangan meminta AI “coba cara lain” secara acak; minta diagnosis, nama object, penyebab, dan perubahan resmi yang diperlukan.

### Format laporan AI yang wajib diminta

Untuk setiap error atau blocker, minta AI mengisi format berikut:

```text
ID:
Severity: BLOCKER / HIGH / MEDIUM / LOW
File migration:
Nomor baris atau objek:
Error:
Kondisi pemicu:
Root cause:
Dependency yang hilang/salah:
Fitur aplikasi yang terdampak:
Solusi kandidat:
Solusi yang dipilih:
File yang akan dibuat/diubah:
Risiko kompatibilitas:
Cara uji di staging kosong:
Hasil uji:
Status: OPEN / FIXED / BLOCKED
```

AI harus membedakan tiga hal:

1. **Error SQL yang dapat diperbaiki** — misalnya object belum dibuat, urutan grant salah, atau migration tidak idempotent.
2. **Perbedaan historis production** — schema production mungkin memiliki hasil SQL manual yang tidak tercermin di file.
3. **Blocker operasional** — Docker, Supabase staging, extension, secret, domain, atau Edge Function belum tersedia.

Ketiganya tidak boleh diselesaikan dengan cara yang sama. Jangan meminta AI mengubah production hanya karena migration gagal di staging.

## Tahap 5 — Pemeriksaan pertama oleh AI/teknisi

AI/teknisi harus memeriksa:

- Versi commit source yang digunakan.
- Semua folder migration.
- Migration yang duplikat.
- Seed data dan akun lama.
- Function/RPC, trigger, policy, Storage, extension, dan scheduler.
- Edge Functions serta daftar secret yang dibutuhkan.
- Referensi nama, logo, domain, email, dan URL komunitas sumber.

Minta laporan tertulis sebelum database dibuat. Jangan lanjut jika AI hanya mengatakan “sepertinya aman” tanpa daftar file dan risiko.

## Tahap 6 — Siapkan database dengan cara yang benar

### 6.1 Yang tidak boleh dilakukan

- Jangan menjalankan 122 migration lokal langsung.
- Jangan menjalankan migration lama dan baru sekaligus.
- Jangan menjalankan file seed akun Admin.
- Jangan copy-paste SQL dari chat tanpa catatan.
- Jangan mengisi tabel migration ledger secara manual.
- Jangan menggunakan database production Cilegon sebagai tempat trial-and-error.

### 6.2 Yang harus dilakukan teknisi

1. Buat Supabase staging project kosong.
2. Pastikan Docker/Podman dan Supabase CLI tersedia.
3. Susun satu baseline migration canonical.
4. Hilangkan seed Cilegon, data demo, credential, dan URL sumber.
5. Pastikan semua tabel yang digunakan aplikasi dibuat, termasuk tabel push.
6. Pastikan seluruh kolom final, RPC, trigger, RLS, Storage policy, extension, dan scheduler tersedia.
7. Terapkan baseline dari database kosong.
8. Jalankan `supabase db reset` atau proses equivalent yang terdokumentasi.
9. Perbaiki error sampai berhasil tanpa copy-paste manual di luar paket.
10. Simpan hasil, commit, dan daftar migration canonical.

### 6.3 Standar lulus migration

Migration baru boleh disebut tervalidasi jika:

- Database kosong berhasil dibuat dari nol.
- Tidak ada tabel atau function yang dipakai sebelum dibuat.
- Tidak ada seed akun/password.
- Tidak ada data Cilegon.
- RLS aktif dan policy sesuai role.
- Storage upload/read/delete sesuai role.
- Push hanya aktif setelah tabel, function, secret, dan scheduler siap.
- Ticketing, pembayaran, email, dan check-in dapat diuji.
- Migration dapat diterapkan ulang pada staging baru dengan hasil yang sama.

## Tahap 7 — Buat akun Admin Penuh

Setelah database lulus:

1. Buat user melalui Supabase Auth/Dashboard.
2. Gunakan email komunitas baru.
3. Gunakan password kuat dari password manager.
4. Berikan role Admin Penuh melalui prosedur server-side yang disetujui.
5. Uji login di halaman Admin.
6. Jangan menyimpan password di SQL, prompt, screenshot, atau GitHub.

## Tahap 8 — Deploy Edge Functions dan secrets

Deploy hanya function dari commit aplikasi yang sama.

Teknisi harus:

1. Membuat daftar function yang benar-benar digunakan.
2. Membuat daftar nama secret tanpa membagikan nilainya.
3. Mengisi secret di Supabase/Vercel/Resend sesuai kebutuhan.
4. Membuat VAPID baru jika push digunakan.
5. Membuat secret ticket access baru.
6. Mengisi Midtrans baru jika pembayaran digunakan.
7. Menunda scheduler sampai function dan secret diuji.
8. Memeriksa log tanpa membocorkan token atau data pribadi.

## Tahap 9 — Isi branding melalui Settings

Login sebagai Admin Penuh, lalu isi:

- Nama komunitas.
- Nama singkat header.
- Logo utama.
- Warna tema.
- Kontak WhatsApp.
- Sosial media.
- Alamat.
- Deskripsi.
- Logo afiliasi jika memang diperlukan.

Setelah disimpan, periksa header, footer, login, halaman publik, member, admin, PDF, laporan, popup, SEO, dan tiket.

## Tahap 10 — Konfigurasi frontend dan Vercel

Pada Vercel project baru, isi hanya environment publik:

```text
VITE_SUPABASE_URL=https://PROJECT_REF_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=KEY_PUBLISHABLE_BARU
VITE_VAPID_PUBLIC_KEY=VAPID_PUBLIC_BARU
```

Jangan memasukkan service-role key, Resend API key, VAPID private key, webhook secret, atau Midtrans secret ke environment frontend.

Build command:

```text
npm run build
```

Pastikan deployment memakai repository dan branch komunitas baru.

## Tahap 11 — Hubungkan domain

1. Tambahkan domain di Vercel.
2. Ikuti instruksi DNS Vercel.
3. Pastikan HTTPS aktif.
4. Atur Supabase Auth Site URL ke domain baru.
5. Tambahkan redirect URL yang diperlukan.
6. Pastikan email tiket mengarah ke domain baru.
7. Pastikan API sitemap dan URL share memakai domain baru.

## Tahap 12 — Smoke test sebelum diumumkan

### Publik

- Home tampil dengan nama, logo, dan warna baru.
- Header/footer benar.
- Open Mic dan Event dapat dibuka.
- Pendaftaran publik berhasil.
- Data pribadi pendaftar tidak terlihat publik.
- Tiket dan halaman order memakai domain baru.
- PDF memakai logo/nama baru.

### Member

- Login dan logout berhasil.
- Profil dapat dibuka.
- Riwayat dan materi sesuai role.
- Member tidak dapat mengakses menu admin.

### Evaluator

- Evaluator hanya melihat tugas yang ditugaskan.
- Evaluasi dapat disimpan.
- Data internal member tidak bocor.

### Admin

- Admin Penuh dapat mengelola Settings.
- Admin Event hanya mendapat scope Event.
- Admin Tiket hanya mendapat scope Tiket.
- Upload Storage sesuai role.
- Laporan, check-in, voucher, dan pembayaran bekerja jika digunakan.

### Push dan email

- Push Public, Member, dan Admin tidak tercampur.
- Email berasal dari domain komunitas baru.
- Link email menuju domain komunitas baru.
- Scheduler tidak mengirim pesan duplikat.

### Responsive

Uji minimal pada mobile 360–390px, tablet sekitar 768px, dan desktop 1280px atau lebih.

## Tahap 13 — Serah terima

Simpan di tempat aman:

- URL website.
- Repository GitHub.
- Vercel project.
- Supabase project.
- Resend account/domain.
- Daftar Admin.
- Commit production.
- Daftar Edge Functions.
- Nama secret yang digunakan tanpa nilai secret.
- Bukti migration lulus.
- Hasil smoke test.
- Prosedur backup dan pemulihan.

Jangan simpan password atau secret di dokumen ini.

## Jika terjadi error

Jangan mencoba memperbaiki secara acak. Catat:

- Tahap error.
- Pesan error lengkap.
- Nama migration/function/table.
- Commit yang sedang dipakai.
- Perintah yang dijalankan.
- Apakah perintah dijalankan lewat CLI atau SQL Editor.
- Apakah database kosong atau sudah pernah diubah.

Kemudian kirim laporan itu kepada AI/teknisi dan minta diagnosis sebelum menjalankan perintah berikutnya.

## Definisi selesai

Clone dianggap berhasil jika:

- Website online di domain komunitas baru.
- **100% fitur, menu, route, role, akses, dan alur source tetap tersedia dan dapat digunakan.**
- Tidak ada fitur yang dikurangi, disembunyikan, diganti placeholder, atau dinonaktifkan tanpa persetujuan eksplisit.
- Database, Auth, Storage, Edge Functions, email, dan secrets milik komunitas baru.
- Branding baru tampil konsisten.
- Afiliasi Stand Up Indo tetap benar.
- Tidak ada data Cilegon yang terbawa.
- RLS dan role sudah diuji.
- Migration lulus dari database kosong.
- Matriks feature parity source-versus-clone seluruhnya berstatus lulus.
- Typecheck, lint, build, dan smoke test lulus.
