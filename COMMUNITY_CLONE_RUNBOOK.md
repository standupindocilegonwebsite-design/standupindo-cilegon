# Runbook Clone Mandiri Komunitas

Panduan ini untuk membuat website komunitas baru yang mandiri sepenuhnya dari Standupindo Cilegon. Contoh: Standupindo Serang, Standupindo Rangkasbitung, dan Standupindo Pandeglang.

## Ringkasan untuk pengelola komunitas

Tujuannya adalah memakai **fitur, alur, struktur database, aturan akses, dan fungsi backend yang sama** dengan Standupindo Cilegon, tetapi dengan identitas dan data komunitas sendiri: nama lengkap/nama singkat, logo, warna, kontak, domain, dan data komunitas. Migration clone harus mempertahankan kebutuhan fitur tersebut, tetapi tidak boleh membawa data, akun, credential, atau konfigurasi project Cilegon. Gunakan satu versi source code yang utuh; jangan mengambil beberapa halaman atau migration secara acak.

Yang bisa disiapkan tanpa kemampuan pemrograman:

1. Kumpulkan identitas dan aset komunitas pada checklist di bawah.
2. Buat akun layanan komunitas sendiri atau minta penanggung jawab komunitas membuatnya.
3. Ikuti bagian pengisian Settings, pengaturan hosting, dan pengujian setelah penanggung jawab teknis menyiapkan aplikasi dan database.

**Penting:** untuk kondisi repository yang diaudit pada 8 Oktober 2026, setup database dari nol belum memiliki paket migration lengkap yang sudah diuji. Karena itu, komunitas baru belum boleh menekan `db push` atau menjalankan SQL satu per satu sendiri. Minta pengelola teknis menyiapkan dan menguji paket database untuk clone terlebih dahulu. Instruksi ini mencegah database rusak atau fitur tertentu hilang; jangan melewati blocker ini demi membuat website cepat online.

### Yang disalin dan yang tidak

| Salin/pakai dari source Standupindo Cilegon | Jangan salin dari lingkungan Cilegon |
| --- | --- |
| Seluruh source code aplikasi dari satu commit yang disepakati, termasuk `src/`, `public/`, `supabase/functions/`, migration, dan file konfigurasi yang memang dilacak Git | `.env`, kredensial, API key, service-role key, password, token, atau isi password manager |
| Versi dependency yang ditetapkan manifest dan lockfile (`package.json`, `package-lock.json`) | Folder `.git`, `node_modules`, `dist`, log, backup, atau file lokal |
| Fitur dan alur aplikasi tanpa menghapus bagian yang tidak dikenal | Data database, pengguna/Auth, order, bukti pembayaran, data pendaftar/member, file Storage, dan subscription push Cilegon |
| Migration sebagai berkas sumber **untuk diperiksa dan diuji oleh penanggung jawab teknis** | Menjalankan semua SQL di folder migration secara langsung; termasuk migration seed akun admin |

Buat repository tujuan dan project layanan baru milik komunitas. Jangan melakukan perubahan langsung atau push ke repository Cilegon. Pengambilan source penuh tidak berarti backend/datanya ikut tersalin.

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

- Nama resmi (lengkap), nama singkat untuk header, kota, dan deskripsi komunitas.
- Logo berkualitas baik untuk header, favicon/PWA, serta gambar untuk pratinjau tautan/Open Graph.
- Warna utama, hover, aksen, dan netral (kode warna seperti `#123ABC`).
- Domain, akses DNS, akun hosting, dan nama penanggung jawab.
- Nomor WhatsApp untuk admin, pendaftaran, kerja sama, dan tiket; akun sosial dan alamat.
- Email pengirim serta domain email yang akan diverifikasi di Resend.
- Admin awal, email admin, dan password kuat yang disimpan di password manager.
- Penanggung jawab/pemilik akun Supabase dan metode pembayaran layanan.
- Fitur yang akan digunakan sejak peluncuran: Open Mic, Member, Evaluasi, Event, tiket, Gate/QR, email, dan push.

Jangan meminta atau menyimpan password, API key, service-role key, atau token orang lain di repository, chat, atau dokumen ini.

## Tahap 1 — Buat repository dan salinan kode

1. Minta pengelola source menetapkan commit yang akan dijadikan versi awal.
2. Buat repository baru milik organisasi/pengelola komunitas, lalu salin seluruh file source yang dilacak Git dari commit tersebut.
3. Pastikan `src/`, `public/`, `supabase/functions/`, migration, `package.json`, dan `package-lock.json` tersedia di repository baru.
4. Jangan salin `.env`, `.git`, `node_modules`, `dist`, log, backup, atau file kredensial lokal.
5. Pastikan remote Git mengarah ke repository komunitas baru sebelum melakukan push. Jika proses ini dikerjakan melalui GitHub, periksa nama repository tujuan sebelum menekan tombol **Create repository** atau **Push**.
6. Catat URL repository sumber dan commit yang disalin agar versi fitur awal dapat ditelusuri.

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

### Status migration saat audit

Jangan menjalankan seluruh file dalam `supabase/migrations` secara membabi buta dan jangan langsung menjalankan `supabase db push` terhadap project baru berdasarkan urutan yang ada sekarang.

Audit daftar berkas menemukan rangkaian schema awal yang berulang/duplikat, migration seed akun admin, dan banyak migration fitur sesudah baseline lama. Berkas terbaru yang terdaftar saat audit adalah `20261008120000_add_komika_card_photo.sql`. Daftar ini menunjukkan source memuat fitur baru, tetapi **bukan** urutan yang aman untuk database kosong. Nama dan timestamp berkas saja tidak membuktikan urutan, dependensi, keamanan, atau bahwa migration bisa dijalankan pada project baru.

Migration seed admin berikut tidak boleh dijalankan untuk produksi:

```text
20260903040009_create_admin_auth_user.sql
```

Panduan arsip `DUPLICATE_DEPLOY_GUIDE.md` pernah mencantumkan urutan yang hanya mencakup baseline/fitur lama. **Jangan menyalin urutan itu** untuk project baru saat ini; itu belum mencakup seluruh fitur terbaru, termasuk ticketing, push, materi, sesi akun, serta foto kartu Komika.

### Yang wajib disiapkan penanggung jawab teknis

1. Siapkan satu baseline migration bersih dan berurutan dari **seluruh fitur yang akan dipakai**, bukan hanya schema awal.
2. Periksa dependensi, tabel/kolom yang diasumsikan ada, policy RLS/Storage, seed/demo, trigger/RPC, dan fungsi yang memanggil layanan eksternal.
3. Hapus dari paket produksi credential seed dan semua URL/key milik Cilegon; jangan melonggarkan policy untuk mempermudah setup.
4. Jalankan urutan tersebut pada database Supabase staging baru yang kosong. Uji dari nol; jangan memakai database Cilegon sebagai percobaan.
5. Uji RLS (anon, member, role operasional, admin), Storage, RPC, Edge Functions, dan alur aplikasi untuk seluruh fitur terpilih.
6. Simpan urutan migration yang lolos, hasil pengujian, dan commit paketnya. Setelah itu barulah pengelola dapat mengikuti instruksi migration yang spesifik pada paket tersebut untuk project production.
7. Deploy Edge Functions yang cocok dengan commit aplikasi dan set secret milik komunitas. Jangan mengaktifkan job push sebelum secrets dan endpoint project baru benar.

**Status praktis pada audit 8 Oktober 2026:** dependency migration sudah ditelusuri dan urutan kandidat di bawah disusun untuk membantu penanggung jawab teknis. Namun urutan itu **belum diuji/diaplikasikan pada database kosong** dan bukan perintah deploy siap pakai. Saya juga menemukan migration prasyarat yang tidak tersedia dan policy yang perlu ditinjau. Tahan deployment publik sampai blocker tersebut dibereskan dan seluruh paket lolos uji.

### Urutan kandidat hasil telaah dependensi

Ini adalah daftar file yang tampak membentuk jalur fitur source saat ini, disusun ulang bila suatu migration memakai kolom yang ditambahkan migration sesudahnya. Daftar bukan instruksi untuk paste ke SQL Editor, dan belum membuktikan bahwa tiap file berhasil pada project Supabase kosong.

**A. Fondasi, Open Mic, profil, dan event**

```text
20260903035848_create_standup_indo_cilegon_schema.sql
20260903035853_add_registration_seq_rpc.sql
20260903035858_add_maps_url_and_contacts.sql
20260903035903_add_social_affiliation_settings.sql
20260903035907_add_ticket_price_to_events.sql
20260903035912_extend_event_tickets_with_url_status_sort.sql
20260903035918_fix_open_mic_registrations_rls_protect_whatsapp.sql
20260903035924_create_media_storage_bucket.sql
20260903050000_add_branding_settings.sql
20260904090000_add_open_mic_attendance_status.sql
20260904100000_add_komika_joined_at.sql
20260904110000_add_context_whatsapp_settings.sql
20260904120000_add_whatsapp_contact_names.sql
20260909100000_add_community_and_event_participants.sql
20260910100000_add_full_name_to_komika.sql
20260910110000_link_open_mic_registrations_to_komika.sql
20260910120000_restrict_komika_private_columns.sql
20260910130000_public_event_lineup.sql
20260912010000_add_komika_featured_order.sql
20260912000000_restore_public_select_grants.sql
20260912020000_add_event_rules_to_events.sql
20260913000000_add_partners_and_event_partnerships.sql
20260913010000_add_partner_event_pic_columns.sql
```

`20260912010000_add_komika_featured_order.sql` sengaja ditempatkan sebelum `20260912000000_restore_public_select_grants.sql`: migration grant memberi akses kolom `featured_order`, sehingga kolom itu harus sudah ada.

**B. Tiket awal, member, evaluator, dan role admin**

```text
20260913110000_create_ticket_orders.sql
20260913120000_add_email_to_ticket_orders.sql
20260913130000_add_order_number_to_ticket_orders.sql
20260915000000_add_evaluator_assignment_and_evaluation.sql
20260915100000_extend_member_profile_and_notifications.sql
20260915110000_harden_member_rls_and_profile_updates.sql
20260915120000_close_authenticated_public_registration.sql
20260915130000_support_global_evaluator_assignments.sql
20260915140000_allow_global_evaluator_assignments.sql
20260915150000_member_read_evaluations_by_profile.sql
20260916100000_add_operational_admin_roles.sql
20260917100000_register_member_open_mic_rpc.sql
20260917110000_prevent_duplicate_member_open_mic_registration.sql
20260917120000_register_public_open_mic_rpc.sql
20260917130000_allow_open_mic_admin_read_komika.sql
20260918000000_add_member_notification_reads.sql
20260921150000_allow_open_mic_admin_manage_evaluator_assignments.sql
20260921152000_add_karya_url_to_komika.sql
20260921153000_create_private_materials.sql
20260921154000_create_private_material_nodes.sql
20260921155000_create_private_material_setlists.sql
20260921160000_create_member_open_mic_history_submissions.sql
20260921170000_fix_public_open_mic_lineup_access.sql
20260922000000_restore_public_komika_read_access.sql
20260923100000_allow_members_delete_rejected_open_mic_history.sql
20261001090000_add_material_premis.sql
```

**C. Ticketing V1, Gate, push, dokumentasi Event, dan penyempurnaan**

```text
20261002100000_ticketing_v1_access_foundation.sql
20261002110000_ticketing_v1_core_schema.sql
20261002120000_ticketing_v1_order_rpcs.sql
20261002130000_ticketing_v1_lifecycle_rpcs.sql
20261002140000_grant_authenticated_ticket_order_rpc.sql
20261002150000_limit_ticket_order_quantity_to_10.sql
20261002160000_allow_legacy_sudah_bayar_payment_review.sql
20261002170000_restrict_event_ticket_crud_to_scoped_ticket_admins.sql
20261002180000_fix_ticket_access_session_expiry_ambiguity.sql
20261002190000_ticketing_checkout_drafts_until_proof.sql
20261002200000_reset_ticket_login_limits_on_success.sql
20261002210000_scope_ticket_login_limits.sql
20261002220000_ticket_gates_checkin_windows.sql
20261002230000_optional_ticket_gate_restrictions.sql
20261002235500_default_checkin_event_day.sql
20261003000000_preserve_disabled_gate_config.sql
20261003020000_enable_ticket_order_notifications.sql
20261003030000_ticket_payment_email_logs.sql
20261003050000_automate_event_open_mic_push_notifications.sql
20261004090000_isolate_pwa_push_subscriptions.sql
20261004100000_add_event_documentation_photos.sql
20261004110000_ensure_event_documentation_schema.sql
20261004114000_ticketing_free_pass.sql
20261004120000_reuse_ticket_payment_methods.sql
20261004130000_clear_default_whatsapp_contact_numbers.sql
20261006100000_add_ots_ticket_sales.sql
20261006110000_auto_deactivate_event_payment_methods.sql
20261006120000_add_mc_member_history.sql
20261007082000_fix_ticket_order_payment_assignment_lookup.sql
20261007083000_default_ticket_payment_method.sql
20261007134000_add_account_active_sessions.sql
20261008120000_add_komika_card_photo.sql
```

Urutan terakhir penting: setelah model pembayaran Event dipindah ke tabel assignment oleh `20261004120000_reuse_ticket_payment_methods.sql`, migration penjualan OTS mengganti fungsi order, lalu `20261007082000_fix_ticket_order_payment_assignment_lookup.sql` memperbaiki fungsi itu agar membaca assignment. Checkout publik jangan diaktifkan sebelum fungsi final ini dan smoke test pembayaran berhasil.

### Blocker dan perubahan wajib sebelum urutan kandidat dapat disahkan

| Temuan | Dampak / tindakan |
| --- | --- |
| `20260903035848_create_standup_indo_cilegon_schema.sql` bukan schema-only: ia memasukkan contoh Komika/Open Mic/Event/tiket Cilegon dan memberi policy awal `authenticated` yang luas. Beberapa migration berikut juga menulis kontak/branding Cilegon. | Buat baseline clone netral tanpa seed/data Cilegon; set identitas baru setelah migration yang memodifikasi Settings selesai. Jangan bawa data atau akun produksi. |
| Tidak ditemukan migration yang membuat `public.push_subscriptions`, tetapi `20261004090000_isolate_pwa_push_subscriptions.sql` langsung mengubah tabel itu. | Tambahkan/temukan migration dasar yang membuat tabel tersebut dan uji prasyaratnya sebelum migration isolasi push; kalau tidak, urutan gagal. |
| `20261004110000_ensure_event_documentation_schema.sql` mengulang kolom/constraint dari `20261004100000_add_event_documentation_photos.sql`. | Keduanya tampak idempotent, tetapi pilih satu sumber definisi di baseline bersih atau buktikan keduanya berjalan berurutan. Jangan menghapus migration dari ledger database yang sudah berjalan. |
| `20260903035924_create_media_storage_bucket.sql` mengizinkan semua role `authenticated` upload, update, dan hapus media; migration hardening tabel tidak mengganti policy Storage ini. | Buat policy Storage yang membatasi tindakan ke role operasional yang sesuai dan uji akun member/evaluator biasa. |
| `20260917100000_register_member_open_mic_rpc.sql` dan `20261006120000_add_mc_member_history.sql` berisi teks komunitas Cilegon di fungsi SQL. | Jadikan nama komunitas konfigurasi/brand baru, atau pastikan fungsi tersebut diganti pada paket clone dan dites. |
| Migration push menggunakan `pg_cron`, `pg_net`, schema Vault, dan secret URL/service-role di Vault. Ticketing juga memakai job cron dan secrets Edge Function. | Pastikan extension tersedia, secrets project baru diset, dan job baru diaktifkan setelah function ter-deploy serta dites. Jangan salin secrets atau job dari project lain. |
| Policy awal beberapa tabel memberi akses kepada semua `authenticated`. Migration `20260915110000_harden_member_rls_and_profile_updates.sql` dan `20260916100000_add_operational_admin_roles.sql` menggantinya untuk sebagian besar tabel, termasuk community applications dan partners. | Kedua migration role tersebut wajib ada sebelum akun non-admin dibuat. Verifikasi policy final seluruh tabel—khususnya Storage dan tabel yang tidak disentuh migration tersebut—dengan akun member/evaluator biasa. |

### File yang dikecualikan dari paket clone baru

Berkas berikut merupakan baseline/patch lama yang duplikat, perubahan untuk memperbaiki Auth yang dibuat manual, atau seed Cilegon. Jangan jalankan sebagai tambahan setelah jalur kandidat di atas:

```text
20260826072748_create_standup_indo_cilegon_schema.sql
20260826073021_add_registration_seq_rpc.sql
20260826080529_revision_add_maps_url_and_contacts.sql
20260827044933_20260827090000_add_social_affiliation_settings.sql.sql
20260828023943_20260828091000_fix_auth_users_null_columns.sql.sql
20260828025351_20260828092000_set_admin_app_role.sql.sql
20260829015642_20260828100000_create_media_storage_bucket.sql.sql
20260902014716_add_ticket_price_to_events.sql
20260903023741_extend_event_tickets_with_url_status_sort.sql
20260903024408_fix_open_mic_registrations_rls_protect_whatsapp.sql
20260903040009_create_admin_auth_user.sql
```

Catatan: migration Auth lama bukan pengganti pembuatan admin melalui Supabase Auth API. Jangan membuat akun dengan password SQL yang tertanam di source.

Sebelum label status di bagian ini diubah menjadi “tervalidasi”, penanggung jawab teknis perlu membuat Supabase staging kosong, menyusun baseline netral, menjalankan seluruh urutan terpilih dari nol, memverifikasi schema/policies/RPC/extensions/functions, dan mencatat hasilnya. Repository saat ini tidak menyertakan `supabase/config.toml`, sehingga belum ada konfigurasi Supabase CLI lokal yang siap dipakai untuk membuktikan `db reset` dari source ini.

### Supabase CLI atau SQL Editor?

- **Pilihan yang disarankan setelah paket tervalidasi tersedia:** minta penanggung jawab teknis memakai Supabase CLI sesuai instruksi paket. CLI membantu menyimpan riwayat migration.
- SQL Editor hanya boleh dipakai oleh orang yang diberi urutan SQL hasil validasi; jalankan sesuai urutan, satu langkah per satu langkah, dan catat hasilnya.
- Jangan campur SQL Editor dengan `db push` tanpa menyelaraskan riwayat migration. Hal ini dapat membuat migration terulang atau status riwayat tidak sesuai.
- CLI bukan pengganti pengujian. Bila paket belum diuji dari database kosong, kedua cara tetap berisiko.

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

Source saat audit menyediakan Edge Functions berikut; deploy hanya versi dari repository clone yang sama dan ikuti inventaris secret per fungsi:

| Fungsi | Kegunaan |
| --- | --- |
| `admin-create-member`, `admin-manage-members`, `admin-manage-admins` | Pembuatan dan pengelolaan akun |
| `ticketing-public`, `ticketing-admin`, `ticketing-check-in-report` | Alur tiket publik, administrasi tiket, dan laporan check-in |
| `manage-push-subscription`, `send-web-push`, `automate-public-event-push` | Subscription dan pengiriman/jadwal push bila fitur push digunakan |

Jangan menyalin/deploy folder `_shared` sebagai function terpisah; itu adalah kode bersama. Penanggung jawab teknis harus memeriksa perubahan fungsi, dependensi database, dan secret wajib sebelum deploy.

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
