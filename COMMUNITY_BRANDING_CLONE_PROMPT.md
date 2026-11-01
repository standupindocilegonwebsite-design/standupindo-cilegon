# Prompt Clone dan Branding Komunitas

Dokumen ini dapat disalin seluruhnya ke AI coding assistant setelah repository clone dan akun layanan komunitas baru siap. Untuk panduan klik-per-klik dari nol, gunakan [COMMUNITY_CLONE_START_TO_FINISH.md](./COMMUNITY_CLONE_START_TO_FINISH.md).

## Sebelum menjalankan prompt

Komunitas harus sudah menyiapkan:

- Supabase project baru.
- Resend dan domain pengirim yang sudah diverifikasi.
- Domain website dan HTTPS.
- Repository GitHub baru.
- Project Vercel baru.
- Logo komunitas utama.
- Logo/aset PWA Public, Member, dan Admin jika digunakan.
- Data nama, warna, kontak, sosial media, alamat, dan afiliasi.

Isi bagian `[ ... ]` terlebih dahulu. Jangan memasukkan service-role key, password, Resend API key, VAPID private key, webhook secret, atau secret lain ke prompt/chat.

## Prompt siap-copas

```text
Anda adalah AI coding assistant untuk menyiapkan clone mandiri dari website komunitas sumber ini.

TUJUAN UTAMA
Jadikan repository ini website komunitas [NAMA KOMUNITAS] dengan fitur, menu, route, role, alur, keamanan, dan perilaku yang sama persis seperti versi aplikasi sumber. Targetnya adalah feature parity 100%. Jangan mengurangi, menyembunyikan, mengganti placeholder, atau menghapus fitur hanya karena komunitas ini baru atau belum memiliki data.

IDENTITAS KOMUNITAS BARU
- Nama resmi: [NAMA RESMI]
- Nama singkat/header: [NAMA SINGKAT]
- Kota/alamat: [KOTA DAN ALAMAT]
- Warna utama: [HEX]
- Warna hover: [HEX]
- Warna aksen: [HEX]
- WhatsApp admin: [NOMOR]
- WhatsApp pendaftaran: [NOMOR]
- WhatsApp partnership: [NOMOR]
- WhatsApp tiket: [NOMOR]
- Instagram: [URL]
- TikTok: [URL]
- YouTube: [URL]
- Deskripsi singkat: [DESKRIPSI]
- Afiliasi: Stand Up Indo
- Logo komunitas: [PATH ATAU URL FILE LOGO]
- Logo PWA Public: [PATH ATAU URL]
- Logo PWA Member: [PATH ATAU URL]
- Logo PWA Admin: [PATH ATAU URL]
- Domain production: [DOMAIN]
- Supabase URL: [URL PROJECT SUPABASE BARU]
- Supabase publishable/anon key: [KEY PUBLIK SAJA]

ATURAN KEAMANAN
1. Jangan pernah meminta, menampilkan, menyalin, atau commit service-role key, password, Resend API key, VAPID private key, webhook secret, Midtrans secret, atau secret lain.
2. Jangan memakai Supabase project, database, Storage, Auth user, domain, Resend, Vercel, GitHub secret, atau data dari komunitas sumber.
3. Jangan menyalin data produksi komunitas sumber: member, komika, pendaftar, event, order, bukti pembayaran, file Storage, atau push subscription.
4. Jangan menjalankan seluruh folder migration secara membabi buta.
5. Jangan menjalankan SQL manual yang belum dinyatakan sebagai bagian dari paket migration canonical.
6. Jangan mengubah atau menghapus fitur aplikasi untuk menyederhanakan clone.
7. Jangan mengubah identitas afiliasi Stand Up Indo menjadi nama komunitas baru.

URUTAN KERJA
1. Audit repository, migration, Edge Functions, environment, domain, dan referensi branding lama terlebih dahulu.
2. Baca COMMUNITY_CLONE_RUNBOOK.md. Ikuti hanya baseline migration canonical yang dinyatakan sudah diuji.
3. Jika baseline canonical belum tersedia, atau staging/database kosong belum berhasil divalidasi, BERHENTI dan jelaskan blocker. Jangan menebak urutan migration.
4. Hubungkan frontend hanya ke Supabase project baru menggunakan environment variable publik milik komunitas baru.
5. Terapkan migration canonical yang sudah tervalidasi. Pastikan schema, function/RPC, trigger, RLS, Storage, extension, dan scheduler sesuai versi aplikasi sumber.
6. Buat akun Admin Penuh komunitas baru melalui prosedur Auth yang aman. Jangan membuat akun melalui password yang tertanam di migration.
7. Deploy Edge Functions dari commit yang sama dengan aplikasi. Isi secrets hanya di Supabase/Vercel/Resend sesuai tempat yang diperlukan.
8. Isi branding melalui Settings: nama, nama singkat, logo, warna, kontak, sosial media, alamat, dan deskripsi.
9. Ganti referensi branding statis yang memang belum berasal dari Settings, termasuk SEO, email ticketing, API server-side, Service Worker, push notification, PWA assets, favicon, Open Graph, dan domain.
10. Pastikan ukuran, layout, spacing, dan perilaku UI tetap sama. Perubahan hanya boleh pada identitas, warna, logo, URL, kontak, dan data komunitas baru.
11. Jalankan typecheck, lint, build, dan smoke test publik, member, evaluator, admin operasional, Admin Event, Admin Tiket, dan Admin Penuh.
12. Verifikasi tidak ada URL Supabase, domain, email, logo, nama, kontak, secret, atau scheduler yang masih menunjuk komunitas sumber.
13. Buat matriks feature parity source-versus-clone untuk setiap menu, route, halaman, modal, tombol, form, filter, laporan, PDF, notifikasi, PWA, integrasi, role, dan alur.
14. Laporkan file yang diubah, migration yang dijalankan, environment yang dibutuhkan, test yang berhasil/gagal, perbedaan akses, dan blocker yang belum terselesaikan.

KRITERIA SELESAI
Clone dinyatakan selesai hanya jika:
- 100% fitur, menu, route, role, akses, dan alur sama dengan aplikasi sumber.
- Matriks feature parity seluruhnya lulus.
- Tidak ada satu pun fitur yang hilang, disembunyikan, dinonaktifkan, atau diganti placeholder.
- Database dan Storage benar-benar milik komunitas baru.
- RLS menolak akses yang tidak sesuai role.
- Branding komunitas baru tampil di seluruh area branding aktif.
- Afiliasi Stand Up Indo tetap benar.
- Tidak ada data atau secret komunitas sumber yang ikut terbawa.
- Typecheck, lint, build, dan smoke test berhasil.

Jika menemukan konflik, migration gagal, atau informasi kurang, jangan membuat fallback diam-diam. Jelaskan masalahnya, file/objek yang terdampak, risiko, dan tindakan yang diperlukan.
```

## Prompt tambahan khusus jika migration error

```text
Jangan mencoba memperbaiki error migration secara acak. Lakukan diagnosis terstruktur:

1. Tampilkan file migration, nomor baris, objek, dan pesan error.
2. Jelaskan root cause dan dependency yang belum tersedia.
3. Cari semua migration, source code, Edge Function, RPC, trigger, policy, Storage, dan scheduler yang memakai objek tersebut.
4. Bandingkan kebutuhan fitur aplikasi dengan schema aktual.
5. Usulkan solusi aman untuk baseline clone, termasuk file yang perlu dibuat/diubah dan alasan teknisnya.
6. Jangan mengedit atau menghapus migration production historis.
7. Jangan menyalin data, credential, secret, Auth user, atau Storage dari komunitas sumber.
8. Uji solusi pada Supabase staging kosong dengan Docker/Podman sebelum menyatakan fixed.
9. Uji RLS, Storage, RPC, extension, scheduler, Edge Functions, dan fitur aplikasi yang terdampak.
10. Laporkan hasil dengan format:

ID:
Severity:
File/objek:
Error:
Root cause:
Dependency:
Solusi kandidat:
Solusi dipilih:
File diubah:
Cara uji:
Hasil uji:
Status OPEN/FIXED/BLOCKED:

Jika staging, Docker/Podman, extension, secret, atau data pembanding belum tersedia, tandai BLOCKED. Jangan mengklaim migration benar hanya karena satu SQL berhasil dijalankan di SQL Editor.
```

## Setelah AI selesai

Minta pengelola teknis menunjukkan:

1. Commit aplikasi yang digunakan.
2. Paket migration canonical dan bukti pengujian dari database kosong.
3. Daftar Edge Functions dan secrets tanpa menampilkan nilai rahasia.
4. Hasil typecheck, lint, build, dan smoke test.
5. Konfirmasi bahwa seluruh URL, domain, email, logo, dan database sudah milik komunitas baru.

AI tidak boleh menyatakan clone siap produksi hanya karena build frontend berhasil. Database, RLS, Storage, Auth, Edge Functions, pembayaran, email, scheduler, dan push harus ikut tervalidasi.

## Jika menggunakan AI secara bertahap

Untuk pengelola non-programmer, lebih aman mengirim pekerjaan dalam urutan ini:

1. **Audit awal** — minta AI membaca repository tanpa mengubah file.
2. **Audit migration** — minta AI memetakan dependency dan blocker.
3. **Validasi staging** — minta teknisi menjalankan baseline pada database kosong.
4. **Konfigurasi layanan** — masukkan URL publik dan secret pada dashboard yang benar.
5. **Branding** — minta AI mengganti identitas komunitas tanpa mengubah layout/fitur.
6. **Testing** — minta AI menjalankan quality gate dan smoke test semua role.

Jangan lanjut ke tahap berikutnya jika tahap sebelumnya memiliki blocker. Bila AI meminta secret, password, atau menyarankan menjalankan semua SQL migration sekaligus, hentikan proses dan minta penjelasan yang aman.
