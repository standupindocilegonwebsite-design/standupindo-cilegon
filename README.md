# Standupindo Community Website

Website komunitas Standupindo Cilegon berbasis React, Vite, TypeScript, dan Supabase.

Project ini sudah dapat dideploy sebagai static website dan dapat diclone untuk komunitas Standupindo di kota lain.

Panduan clone mandiri untuk komunitas baru tersedia di [COMMUNITY_CLONE_RUNBOOK.md](COMMUNITY_CLONE_RUNBOOK.md). Panduan lama [DUPLICATE_DEPLOY_GUIDE.md](DUPLICATE_DEPLOY_GUIDE.md) hanya arsip historis dan jangan dipakai sebagai urutan deploy database.

> Setiap komunitas harus memakai repository, domain, hosting, Supabase, Resend, akun admin, dan secrets sendiri. Jangan memakai migration seed admin, `.env`, atau kredensial milik Cilegon.

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

## Push Notification Multi-PWA

Public, Admin, dan Member memakai subscription Web Push terpisah pada Service Worker scope masing-masing. Subscription lama dipertahankan sebagai Public. Subscription Admin/Member hanya dapat dibuat oleh akun dengan role yang sesuai. Push reminder menggunakan sender dan subscription Web Push yang sama; tidak ada provider baru.

> Catatan untuk clone baru: bagian ini menjelaskan komponen push pada aplikasi, bukan urutan setup database dari nol. Ikuti [COMMUNITY_CLONE_RUNBOOK.md](COMMUNITY_CLONE_RUNBOOK.md); migration harus berasal dari baseline yang sudah diuji untuk database kosong.

1. Pastikan secret Edge Function `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` sudah dikonfigurasi seperti pengiriman Push Notification yang ada.
2. Simpan Project URL dan service-role key di Supabase Vault dengan nama `event_open_mic_push_project_url` dan `event_open_mic_push_service_role_key`. Gunakan URL project Supabase dan service-role key dari project tersebut; jangan menyimpan service-role key di repository atau frontend.
3. Jalankan migration berurutan `20261003050000_automate_event_open_mic_push_notifications.sql` dan `20261004090000_isolate_pwa_push_subscriptions.sql`.
4. Deploy fungsi `manage-push-subscription`, `send-web-push`, dan `automate-public-event-push`.

Migration menjadwalkan pemeriksaan setiap 15 menit. Pengiriman Event/Open Mic publik, reminder Event untuk Admin/QR, tugas evaluasi untuk Evaluator, dan setiap target perangkat dicatat terpisah agar scheduler berulang tidak mengirim tahap yang sama dua kali. Waktu reminder mengikuti WIB. Push saat publish tetap memakai jalur pengiriman langsung yang ada. Reminder Open Mic sebelum acara hanya dikirim saat pendaftaran masih terbuka; notifikasi lineup H+1 menunggu data komika berstatus tampil (`confirmed` dan `attended`).

## Harga dan Voucher Tiket

Admin Tiket mengelola pengaturan biaya per Event dan voucher dari menu **Lainnya**. Pengaturan biaya tidak aktif secara default. Harga, diskon, biaya, serta snapshot order dihitung di database; angka dari browser tidak digunakan sebagai sumber nilai pembayaran. Voucher khusus dibatasi lagi dengan daftar nomor WhatsApp yang diizinkan, bukan hanya dengan kode yang tidak dipublikasikan.

Kuota voucher dicadangkan ketika order dibuat. Reservasi mengikuti status order ticketing: berakhir ketika order kedaluwarsa atau pembayaran ditolak, tetap dicadangkan selama verifikasi pembayaran, dan menjadi penggunaan final setelah order lunas. Order OTS dan Free Pass tetap memakai alur lama dan tidak menerima biaya atau diskon otomatis.

Daftar voucher khusus dicocokkan dengan nomor WhatsApp yang dimasukkan saat checkout. Kepemilikan nomor tidak diverifikasi dengan OTP pada saat voucher dipakai; gunakan alur verifikasi identitas terpisah bila kebijakan bisnis mensyaratkan pembatasan berdasarkan nomor yang sudah diverifikasi.

Migration [20261021120000_ticket_pricing_vouchers.sql](./supabase/migrations/20261021120000_ticket_pricing_vouchers.sql) bersifat additive dan menerapkan scope role `admin_ticket` secara eksplisit. Terapkan dan uji migration ini terlebih dahulu di staging sesuai prosedur database proyek, lalu deploy perubahan aplikasi/Edge Function. Jangan menjalankan migration atau deploy production sebelum backup, pemeriksaan schema, serta persetujuan dan verifikasi staging.

## Clone komunitas

Untuk tahapan membuat salinan mandiri—termasuk akun dan resource terpisah, migration, branding, build, hosting, keamanan, dan smoke test—gunakan [COMMUNITY_CLONE_RUNBOOK.md](COMMUNITY_CLONE_RUNBOOK.md). Jangan mengikuti panduan clone historis yang menginstruksikan menjalankan seluruh folder migration.

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
