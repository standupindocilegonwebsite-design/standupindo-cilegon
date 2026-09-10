# Standupindo City Website

Panduan ini menjelaskan audit, cloning komunitas ke kota lain, konfigurasi brand, Supabase, dan deployment dari nol sampai publish.

## 1. Verdict Audit

Status repository saat ini:

- Frontend: build-ready.
- TypeScript: lulus `npm run typecheck`.
- Production bundle: lulus `npm run build`.
- ESLint: lulus, dengan warning kompatibilitas versi TypeScript dari dependency ESLint.
- Router: client-side SPA, membutuhkan fallback rewrite pada hosting.
- Backend: Supabase wajib dikonfigurasi per komunitas/kota.

Belum boleh dianggap production-ready penuh sebelum dua hal berikut dibereskan:

1. Migration `20260903040009_create_admin_auth_user.sql` berisi akun dan password admin contoh. Jangan jalankan untuk production. Buat akun admin baru dari Supabase Auth dan hapus/isolasi migration seed tersebut pada baseline clone.
2. Beberapa policy admin lama memberi akses ke role `authenticated`, bukan hanya role `admin`. Hardening RLS wajib dilakukan sebelum ada user authenticated non-admin.

## 2. Struktur Penting

- `src/`: React pages, components, router, auth, Supabase client.
- `public/assets/images/`: logo dan aset gambar fallback.
- `supabase/migrations/`: schema, RLS, storage, branding, dan perubahan fitur.
- `public/.htaccess`: fallback route SPA untuk Apache/Hostinger.
- `.env.example`: template environment frontend.
- `DUPLICATE_DEPLOY_GUIDE.md`: dokumen ini.

## 3. Prasyarat Lokal

Install:

- Node.js LTS.
- npm.
- Git.
- Akun Supabase.
- Akses hosting, misalnya Hostinger.

Verifikasi:

```bash
node --version
npm --version
git --version
```

## 4. Clone Untuk Kota Baru

Jangan menimpa project Cilegon. Buat repository dan folder baru:

```bash
git clone <URL_REPOSITORY_SUMBER> standupindo-<kota>
cd standupindo-<kota>
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm install
Copy-Item .env.example .env
```

Pada Command Prompt, gunakan penghapusan folder yang sesuai. Jangan menyalin `.env` dari kota lain.

Buat checklist konfigurasi per kota:

- nama komunitas
- nama singkat header
- kota dan alamat
- logo utama
- warna brand
- WhatsApp admin
- Instagram, TikTok, YouTube
- website afiliasi dan logo afiliasi
- domain production
- akun admin

## 5. Environment Supabase

Isi `.env` lokal dan production build:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Aturan keamanan:

- Frontend hanya boleh memakai publishable/anon key.
- Jangan pernah memasukkan `service_role` key ke `.env` frontend.
- Jangan commit `.env`.
- Setiap perubahan `VITE_*` membutuhkan build ulang.
- Nilai `VITE_*` masuk ke bundle browser, jadi jangan isi secret.

## 6. Supabase Baru

Untuk setiap kota, gunakan project Supabase terpisah. Ini mencegah data pendaftar, storage, admin, dan settings tercampur.

Di Supabase:

1. Create new project.
2. Simpan Project URL dan publishable/anon key.
3. Buka SQL Editor.
4. Buat database dari migration schema.
5. Jalankan migration feature setelah schema.
6. Pastikan RLS aktif.
7. Buat bucket storage.
8. Buat akun Auth admin baru.
9. Set `raw_app_meta_data.role` ke `admin`.

### Urutan Migration Canonical

Repository memiliki dua rangkaian migration lama dan baru dengan isi yang sebagian duplikat. Untuk clone baru, jangan mengeksekusi semua file secara membabi buta. Gunakan satu baseline schema dan feature migration canonical berikut:

1. `20260903035848_create_standup_indo_cilegon_schema.sql`
2. `20260903035853_add_registration_seq_rpc.sql`
3. `20260903035858_add_maps_url_and_contacts.sql`
4. `20260903035903_add_social_affiliation_settings.sql`
5. `20260903035907_add_ticket_price_to_events.sql`
6. `20260903035912_extend_event_tickets_with_url_status_sort.sql`
7. `20260903035918_fix_open_mic_registrations_rls_protect_whatsapp.sql`
8. `20260903035924_create_media_storage_bucket.sql`
9. `20260903050000_add_branding_settings.sql`
10. `20260904090000_add_open_mic_attendance_status.sql`
11. `20260904100000_add_komika_joined_at.sql`
12. `20260910100000_add_full_name_to_komika.sql`
13. `20260910110000_link_open_mic_registrations_to_komika.sql`
14. `20260910120000_restrict_komika_private_columns.sql`
15. `20260910130000_public_event_lineup.sql`

Migration nomor 12 sampai 14 menambahkan data anggota dan privasi terbaru:

- `full_name` dan `whatsapp` pada `komika` untuk data internal anggota.
- `komika_id` nullable pada `open_mic_registrations`; null berarti pendaftar umum.
- pendaftar manual admin dapat dihubungkan ke profil Komika.
- statistik hanya menghitung relasi `komika_id` dengan `attendance_status = 'attended'`.
- anon tidak boleh membaca `komika.full_name` atau `komika.whatsapp`.
- lineup Event publik hanya membaca peserta Event berstatus `approved` dan kolom aman.

Migration berikut adalah legacy/duplikat dan sebaiknya tidak dipakai sebagai baseline baru:

- file dengan prefix `202608...`
- file `20260903023741...`
- file `20260903024408...`
- file `20260903040009_create_admin_auth_user.sql`

Jika memakai Supabase CLI, rapikan atau archive migration legacy dan migration seed admin dalam branch template sebelum menjalankan `supabase db push`. Jangan menghapus migration yang sudah pernah diterapkan pada database production tanpa prosedur migration resmi.

## 7. Data dan Fitur Database

Tabel utama:

- `site_settings`: identitas dan kontak satu komunitas.
- `open_mics`: jadwal Open Mic, poster, kapasitas, status, venue.
- `open_mic_registrations`: pendaftar online/manual, relasi opsional Komika, dan status kehadiran.
- `events`: event dan pembelian tiket.
- `event_tickets`: tier tiket.
- `komika`: profil anggota resmi, nama asli/kontak internal, status active/archived, dan `joined_at`.

Status penting:

- Open Mic/Event: `upcoming`, `completed`, `cancelled`.
- Pendaftaran: `pending`, `confirmed`, `rejected`, `cancelled`.
- Kehadiran: `unmarked`, `attended`, `absent`.
- Komika: `active`, `archived`.

Perilaku bisnis:

- Tanggal Open Mic/Event yang sudah lewat otomatis tampil sebagai `Selesai` di frontend.
- `Tidak Hadir` hanya menjadi catatan admin dan dikeluarkan dari lineup publik.
- Pendaftar manual admin disimpan sebagai `confirmed` dan `unmarked`.
- Admin dapat mengubah kehadiran menjadi `Hadir` atau `Tidak Hadir`.
- Kapasitas mencegah pendaftaran online baru; admin manual tetap dapat mencatat pengecualian di lapangan.

### Pendaftar umum versus anggota Komika

- Form publik selalu membuat pendaftar umum dengan `komika_id = NULL`.
- Admin manual memilih mode `Pendaftar Umum` atau `Anggota Komika`.
- Mode anggota mencari profil resmi dan mengisi nama, stage name, komunitas, Instagram, dan WhatsApp.
- Beralih ke mode umum mengosongkan seluruh field autofill untuk mencegah salah simpan.
- Pendaftar umum tetap masuk arsip acara, tetapi tidak masuk statistik anggota.

### Kehadiran dan riwayat anggota

- Pendaftaran baru dimulai sebagai `unmarked`.
- Admin mengubah status di detail Pendaftar Open Mic atau detail profil Komika.
- Hanya status `attended` yang menjadi kehadiran valid.
- Menu Komika menampilkan `x hadir` dan riwayat acara hanya dari relasi `komika_id`.
- Riwayat anggota dapat diubah, dihapus dengan modal konfirmasi, dan dicetak dari icon printer di header riwayat.
- Open Mic selesai di publik hanya menampilkan lineup yang `confirmed` dan `attended`.

## 8. Hardening RLS Wajib

Policy admin seharusnya memeriksa role, bukan hanya login. Pola condition yang direkomendasikan:

```sql
(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
```

Terapkan pada policy `INSERT`, `UPDATE`, `DELETE`, dan policy admin `SELECT` untuk:

- `open_mics`
- `open_mic_registrations`
- `events`
- `event_tickets`
- `komika`
- `site_settings`
- operasi upload/update/delete pada `storage.objects`

Public tetap hanya boleh:

- membaca record yang `published = true` sesuai kebutuhan halaman.
- membaca lineup confirmed yang tidak absent.
- insert registrasi publik dengan kolom yang memang diizinkan.
- tidak membaca WhatsApp pendaftar atau kolom internal admin.

Uji RLS memakai dua akun: admin role dan authenticated non-admin. Non-admin harus ditolak dari seluruh operasi management.

## 9. Admin Auth

Jangan gunakan password yang tertulis di migration seed. Di Supabase Dashboard:

1. Authentication > Users > Add user.
2. Buat email admin kota baru.
3. Set password kuat dan konfirmasi email.
4. Set `raw_app_meta_data` menjadi:

```json
{"role":"admin"}
```

5. Uji login di `/admin/login`.
6. Uji bahwa akun authenticated tanpa role admin ditolak.

Simpan password hanya di password manager. Jangan masukkan password ke source code, SQL migration, screenshot, atau commit.

## 10. Branding dan Brand Identity

### Nilai yang dikelola Admin Settings

- `site_name`: nama resmi komunitas.
- `site_short_name`: nama header mobile/desktop.
- `logo_url`: logo utama.
- `brand_primary`: warna utama.
- `brand_hover`: warna hover.
- `brand_accent`: warna aksen.
- `whatsapp_admin`: nomor admin.
- `whatsapp_admin_name`: nama penanggung jawab WhatsApp umum.
- `whatsapp_registration`: nomor untuk pendaftaran/Open Mic.
- `whatsapp_registration_name`: nama penanggung jawab pendaftaran/Open Mic.
- `whatsapp_partnership`: nomor untuk kerja sama.
- `whatsapp_partnership_name`: nama penanggung jawab kerja sama.
- `whatsapp_ticket`: nomor untuk pembelian tiket Event.
- `whatsapp_ticket_name`: nama penanggung jawab tiket Event.
- `instagram_url`, `tiktok_url`, `youtube_url`.
- `address`.
- `short_description`.
- `affiliation_name`, `affiliation_website`, `affiliation_logo_url`.

### Rekomendasi brand kit

Siapkan sebelum publish:

- logo PNG/WebP transparan untuk header dan footer.
- versi logo persegi untuk favicon.
- versi logo dengan kontras cukup untuk background terang.
- primary, hover, accent, dan neutral color.
- aturan penulisan nama komunitas.
- URL sosial lengkap dengan `https://`.
- nomor WhatsApp format internasional, contoh `62812...`.

Fallback source-specific Cilegon masih ada di:

- `src/lib/types.ts` untuk fallback logo.
- `src/lib/useSiteSettings.ts` untuk fallback settings.
- `src/pages/admin/AdminPage.tsx` untuk default location dan text form.
- `src/pages/public/HomePage.tsx` untuk copy hero dan kota.
- `src/pages/public/EventPage.tsx` dan `src/pages/public/KomikaPage.tsx` untuk copy halaman.
- `src/pages/public/ContactPage.tsx` untuk behavior link sosial.
- `index.html` untuk favicon, title, description, dan share image.
- migration seed untuk data contoh.

Untuk template kota baru, ganti semua fallback Cilegon atau pastikan `site_settings` selalu terisi sebelum publish.

### Contoh branding Serang

Branding utama dapat diubah melalui **Admin > Settings** setelah database aktif. Untuk provisioning otomatis, buat migration kota baru yang mengubah row `site_settings`:

```sql
UPDATE site_settings
SET site_name = 'Standupindo Serang',
    site_short_name = 'STANDUPINDO SERANG',
    logo_url = 'https://PROJECT_REF.supabase.co/storage/v1/object/public/standupindo-media/branding/serang-logo.png',
    brand_primary = '#D94841',
    brand_hover = '#B93832',
    brand_accent = '#F2B134',
    whatsapp_admin = '62812XXXXXXXX',
    whatsapp_registration = '62812XXXXXXXX',
    whatsapp_partnership = '62812XXXXXXXX',
    whatsapp_ticket = '62812XXXXXXXX',
    instagram_url = 'https://instagram.com/standupindoserang',
    tiktok_url = 'https://tiktok.com/@standupindoserang',
    youtube_url = 'https://youtube.com/@standupindoserang',
    address = 'Serang, Banten',
    short_description = 'Satu Panggung, Banyak Cerita.'
WHERE id = 1;
```

Ganti seluruh placeholder sebelum migration dijalankan. Logo sebaiknya diunggah lebih dulu atau diatur dari Admin Settings.

## 11. Aset Logo dan Media

Upload logo melalui Admin Settings setelah bucket tersedia. Upload poster/foto melalui form masing-masing.

Checklist aset:

- file logo dapat diakses publik.
- format hanya JPEG, PNG, atau WebP.
- ukuran file tidak lebih dari batas storage.
- poster Open Mic dan Event memiliki rasio konsisten.
- foto Komika tidak terpotong pada detail popup.
- favicon dan Open Graph image memakai aset kota baru.
- hapus atau ganti semua URL Pexels/seed Cilegon sebelum launch.

## 12. Konfigurasi dan Jalankan Lokal

```bash
npm install
npm run dev
```

Uji route utama:

- `/`
- `/open-mic`
- `/event`
- `/komika`
- `/more`
- `/admin/login`

## 13. Quality Gate Sebelum Deploy

Jalankan semua command berikut:

```bash
npm run typecheck
npm run lint
npm run build
```

`lint` saat audit terakhir lulus tanpa error dan memiliki dua warning non-blocking. Warning tersebut berada di `src/lib/auth.tsx` dan dependency effect di `src/pages/admin/AdminPage.tsx`; tetap sebaiknya dibersihkan sebelum template jangka panjang.

## 14. Deploy Hostinger Apache

1. Isi `.env` production.
2. Jalankan quality gate.
3. Jalankan `npm run build`.
4. Buka folder `dist` dan pastikan berisi `index.html`, `assets`, dan `.htaccess`.
5. Upload isi `dist` ke `public_html`, bukan folder `dist` sebagai subfolder.
6. Jangan upload `.env`, `node_modules`, atau source code jika tidak diperlukan.
7. Pastikan `public/.htaccess` ikut tercopy ke `dist/.htaccess`.
8. Aktifkan SSL/HTTPS.
9. Uji refresh langsung pada `/admin/login`, `/open-mic`, `/event`, `/komika`, dan detail slug.

File `public/.htaccess` yang ada di repository menangani fallback SPA:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
```

Jika hosting bukan Apache, gunakan aturan history fallback yang setara pada server tersebut.

### Deploy dari Windows ke Hostinger

```powershell
Copy-Item .env.example .env
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env
npm install
npm run typecheck
npm run lint
npm run build
```

Di Hostinger:

1. Buka **Websites > Manage > File Manager**.
2. Masuk ke `public_html` domain komunitas baru.
3. Upload **isi** folder `dist`, termasuk `.htaccess`; jangan upload folder `dist` sebagai subfolder.
4. Pastikan `index.html` berada langsung di `public_html`.
5. Aktifkan SSL dan paksa HTTPS.
6. Atur DNS domain sesuai instruksi Hostinger.
7. Uji root dan refresh langsung semua route SPA.

Hostinger shared hosting hanya menyajikan hasil build statis. Supabase tetap menjadi backend database, auth, storage, dan RLS. Jangan upload `.env`, `node_modules`, `src`, atau `service_role` key.

## 15. Domain dan Supabase Auth

Setelah domain aktif:

1. Supabase Dashboard > Authentication > URL Configuration.
2. Set Site URL ke domain production.
3. Tambahkan redirect URL jika flow auth membutuhkannya.
4. Pastikan URL memakai HTTPS.
5. Build ulang jika environment URL berubah.

## 16. Smoke Test Pasca Publish

### Publik

- Header logo dan nama kota benar.
- Hero, Open Mic, Event, Komika, More tampil.
- Auto-slide Home berjalan di mobile dan dapat digeser manual.
- Detail Open Mic dan Event dapat dibuka saat refresh langsung.
- Status tanggal yang lewat menjadi Selesai.
- Pendaftar Tidak Hadir tidak tampil di lineup publik.
- Form pendaftaran memvalidasi nama, WhatsApp opsional, Instagram, dan review popup.
- WhatsApp hanya menerima angka.
- Nama Lengkap otomatis kapital per kata.
- Tidak ada nomor WhatsApp pendaftar di halaman publik.
- Link Instagram, TikTok, YouTube, Maps, dan WhatsApp mengarah benar.

### Admin

- Login admin berhasil.
- Non-admin ditolak.
- Upload logo/poster/foto berhasil.
- CRUD Open Mic, Event, Komika berhasil.
- Search Open Mic, Event, dan Komika berhasil.
- Folder Komika Aktif dan Archived terpisah.
- Folder Open Mic Mendatang, Selesai, dan Dibatalkan terpisah.
- Tambah pendaftar manual membuat registration ID.
- Popup pendaftar dapat menandai Hadir/Tidak Hadir.
- Popup Komika menampilkan foto utuh, specialties, bio, Bergabung, dan ikon sosial.
- Detail Komika admin menampilkan total hadir dan riwayat Open Mic anggota.
- Icon printer pada riwayat Komika menghasilkan laporan identitas dan riwayat kehadiran.
- Tombol hapus riwayat meminta konfirmasi modal.
- Tambah Manual memiliki mode Pendaftar Umum dan Anggota Komika dengan pencarian responsif.
- Checkbox `Tandai hadir semua` hanya mengubah pendaftar berstatus `confirmed`.
- Tidak Hadir hilang dari lineup publik setelah refresh.
- Logout berhasil.

### Responsive

Uji minimal pada:

- mobile 360-390px.
- tablet sekitar 768px.
- desktop 1280px atau lebih.

Periksa overflow horizontal, popup yang dapat scroll, footer, bottom navigation, poster, dan tombol.

## 17. Rollback dan Backup

Sebelum migration:

- export database.
- simpan konfigurasi environment di password manager.
- buat backup storage metadata dan aset penting.
- catat commit yang sedang live.

Rollback aplikasi static:

1. Checkout commit sebelumnya.
2. Isi environment yang sesuai.
3. Jalankan quality gate.
4. Build.
5. Upload ulang isi `dist`.

Rollback database tidak dilakukan dengan menghapus migration secara manual. Gunakan migration kompensasi atau restore backup setelah impact dianalisis.

## 18. Rekomendasi Arsitektur Multi-Kota

Untuk fase awal gunakan satu repository dan satu Supabase project per kota. Ini paling mudah dipisahkan dan paling kecil risikonya.

Untuk fase berikutnya, buat template repository dengan:

- migration baseline tunggal tanpa seed credential.
- seed data demo terpisah dan opt-in.
- semua fallback copy netral.
- brand config terdokumentasi.
- RLS role-based yang sudah hardened.
- CI menjalankan typecheck, lint, build.
- checklist domain dan Supabase per kota.

Jangan membuat database agregator sebelum ada aturan:

- community ID.
- city dan timezone.
- pagination dan rate limit.
- API key per komunitas.
- CORS.
- status event yang baku.
- larangan agregasi data pribadi pendaftar.

## 19. Ringkasan Publish

Urutan praktis:

```text
Clone repository
  -> buat Supabase project baru
  -> rapikan migration baseline
  -> jalankan schema dan feature migrations
  -> buat admin baru dan role admin
  -> isi .env
  -> install dependencies
  -> ganti brand, logo, kontak, dan seed kota
  -> npm run typecheck
  -> npm run lint
  -> npm run build
  -> upload isi dist ke public_html
  -> aktifkan HTTPS dan Supabase Site URL
  -> smoke test publik dan admin
  -> backup dan catat commit live
```

Project ini layak dijadikan basis duplikasi setelah migration seed credential diisolasi dan RLS role-based diterapkan. Secara frontend dan build, hasil audit saat ini sudah siap untuk proses staging.
