# Standupindo Community Website

Website komunitas Standupindo Cilegon berbasis React, Vite, TypeScript, dan Supabase.

Project ini sudah dapat dideploy sebagai static website dan dapat diclone untuk komunitas Standupindo di kota lain.

Panduan lengkap audit, cloning multi-kota, Supabase, branding, dan publish tersedia di [DUPLICATE_DEPLOY_GUIDE.md](DUPLICATE_DEPLOY_GUIDE.md).

> Untuk membuat versi komunitas lain, gunakan project Supabase dan akun admin terpisah. Ikuti bagian **Urutan Migration Canonical**, **Branding**, **Admin Auth**, dan **Deploy Hostinger Apache** di panduan tersebut. Jangan memakai migration seed akun admin atau `.env` milik Cilegon.

## Jalankan Lokal

```bash
npm install
npm run dev
```

Validasi production:

```bash
npm run typecheck
npm run lint
npm run build
```

## Checklist Clone Komunitas Baru

### 1. Duplikasi project

- Copy repository atau buat repository baru dari project ini.
- Jangan menyalin folder `node_modules` atau `dist`.
- Buat project Supabase baru untuk komunitas tersebut, kecuali memang ingin berbagi database.

### 2. Environment Supabase

Buat file `.env` di root project:

```env
VITE_SUPABASE_URL=https://project-baru.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-key-project-baru
```

Gunakan publishable/anon key saja di frontend. Jangan masukkan `service_role` key ke frontend atau hasil build.

### 3. Database dan Storage

- Jalankan migration schema di `supabase/migrations` pada project Supabase baru.
- Jalankan migration branding `20260903050000_add_branding_settings.sql`.
- Pastikan bucket `standupindo-media` dan policy upload aktif.
- Buat akun Auth admin dan konfirmasi emailnya.
- Set `raw_app_meta_data.role` menjadi `admin` untuk setiap admin.
- Ganti email dan password admin seed sebelum production.
- Jangan menjalankan migration seed Cilegon pada database yang sudah berisi data komunitas lain.

### 4. Branding melalui Admin Settings

Setelah login ke `/admin/settings`, ubah:

- Nama komunitas dan nama singkat header
- Logo utama
- Warna utama, hover, dan aksen
- WhatsApp, Instagram, TikTok, dan YouTube
- Alamat dan deskripsi singkat
- Afiliasi serta logo afiliasi

Branding tersimpan di tabel `site_settings` dan diterapkan ke tombol, link, badge, navigasi, hero, halaman About, dan login admin.

### 5. Data kota

Hapus atau ganti data seed sebelum launch:

- Open Mic, Event, dan Komika
- Venue, alamat, dan deskripsi kota
- Nomor WhatsApp event
- Poster dan foto

Data tersebut dapat dikelola dari Admin Panel setelah migration selesai.

### 6. Default source yang masih spesifik Cilegon

Untuk clone cepat, nilai berikut dapat diganti lewat Admin Panel. Untuk template netral, ubah juga:

- `src/lib/useSiteSettings.ts`: fallback nama, sosial media, alamat, dan deskripsi.
- `src/pages/admin/AdminPage.tsx`: lokasi default form Open Mic/Event.
- `src/pages/public/HomePage.tsx`, `EventPage.tsx`, dan `KomikaPage.tsx`: teks kota.
- `src/pages/public/ContactPage.tsx`: deep link YouTube.
- `src/lib/types.ts`: fallback logo.
- `index.html`: favicon, Open Graph image, title, dan description.
- Migration seed: data contoh, URL sosial, lokasi, dan pesan WhatsApp.

### 7. Deploy Hostinger tanpa VPS

Jalankan build setelah `.env` diisi:

```bash
npm run build
```

Di Hostinger File Manager:

1. Buka folder `public_html`.
2. Hapus file default Hostinger.
3. Upload **isi folder `dist`**, bukan folder `dist`-nya.
4. Pastikan `index.html`, `.htaccess`, dan folder `assets` berada langsung di `public_html`.
5. Buka domain dan uji semua route.

`.htaccess` diperlukan agar `/admin`, `/komika`, `/event`, dan `/open-mic/...` tidak menjadi 404 saat dibuka langsung.

Setelah domain aktif, tambahkan domain production di Supabase pada `Authentication > URL Configuration > Site URL`.

Setiap perubahan `.env` membutuhkan build ulang dan upload ulang `dist` karena nilai `VITE_*` masuk ke bundle saat build.

### 8. Pengujian sebelum launch

- Halaman publik dan semua route.
- Login admin dan logout.
- User tanpa role admin ditolak.
- Upload logo dan poster.
- Registrasi Open Mic dari browser publik.
- Badge notifikasi pendaftar pending.
- Konfirmasi, penolakan, dan penghapusan pendaftar.
- Refresh langsung pada route detail dan admin.
- Tampilan desktop dan mobile.
- Nomor WhatsApp pendaftar tidak tampil ke publik.
- HTTPS, domain, favicon, dan preview share image.

## Rencana Banten Comedy Network

Untuk tahap awal, setiap kota dapat memakai project Supabase dan website sendiri. Banten Comedy Network kemudian membaca data publik melalui API read-only.

Data agregator minimal:

```text
community_id
community_name
city
event_id
title
slug
date
venue
status
published
updated_at
```

Sebelum integrasi API, siapkan standar ID sumber, timezone, pagination, filter kota/tanggal, API key per komunitas, rate limit, CORS, dan aturan agar data pribadi pendaftar tidak ikut teragregasi.

## Catatan Keamanan

- Publishable/anon key boleh terlihat di frontend.
- `service_role` key hanya boleh dipakai di backend atau server function.
- RLS Supabase harus tetap aktif.
- Policy admin idealnya memeriksa role admin di database, bukan hanya status authenticated.
- Backup database sebelum migration besar.
