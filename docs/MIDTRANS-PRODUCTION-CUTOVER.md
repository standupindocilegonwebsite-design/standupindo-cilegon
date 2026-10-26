# Panduan Pindah Midtrans Sandbox ke Production

Panduan ini untuk digunakan setelah akun Midtrans bisnis disetujui dan kredensial Production tersedia. Integrasi saat ini masih menggunakan Midtrans Sandbox.

## Ringkasan

Perpindahan **bukan hanya mengganti Server Key dan URL Snap**. Aplikasi juga:

- Mencocokkan Merchant ID dari transaksi dan notifikasi.
- Memanggil API Status Midtrans untuk memverifikasi pembayaran.
- Memvalidasi domain redirect checkout di frontend.
- Memakai webhook yang sama untuk menerima notifikasi pembayaran.

Semua bagian tersebut harus berpindah ke lingkungan Production secara konsisten.

## Kredensial yang diperlukan

Ambil kredensial dari dashboard Midtrans pada lingkungan **Production**:

- **Merchant ID** — digunakan backend untuk memeriksa identitas transaksi.
- **Server Key** — digunakan Edge Functions untuk membuat checkout, memeriksa status, dan memvalidasi signature notifikasi.
- **Client Key** — saat ini tidak digunakan oleh alur checkout aplikasi karena pembeli diarahkan ke halaman Snap melalui `redirect_url`. Simpan untuk kebutuhan integrasi frontend mendatang; jangan menambahkannya ke aplikasi atau dokumentasi tanpa kebutuhan implementasi yang jelas.

Jangan mengirim atau menaruh nilai kredensial ke chat, dokumentasi, source control, file `.env` frontend, atau log. Masukkan langsung melalui pengaturan Secrets pada Supabase Dashboard. Nama secret yang saat ini dibaca backend adalah `MIDTRANS_SECRET_KEY` untuk Server Key. Merchant ID saat ini merupakan konstanta kode dan harus diganti ke Merchant ID Production dengan perubahan kode, atau terlebih dahulu dipindahkan ke Supabase secret jika implementasi masa depan mengubah pola konfigurasi.

## Titik perubahan kode

Periksa dan ubah bagian berikut saat melakukan cutover:

1. [`supabase/functions/_shared/midtrans.ts`](../supabase/functions/_shared/midtrans.ts)
   - `MIDTRANS_MERCHANT_ID`: ganti ke Merchant ID Production.
   - `MIDTRANS_SNAP_API_URL`: ubah ke `https://app.midtrans.com/snap/v1/transactions`.
   - `MIDTRANS_STATUS_API_BASE_URL`: ubah ke `https://api.midtrans.com/v2`.

2. [`src/pages/public/TicketOrderPage.tsx`](../src/pages/public/TicketOrderPage.tsx)
   - Validasi host redirect checkout saat ini hanya mengizinkan `app.sandbox.midtrans.com`.
   - Izinkan host Production `app.midtrans.com` sebelum frontend Production dirilis. Jangan menghapus validasi HTTPS dan host yang diizinkan.

3. Edge Functions yang memakai konfigurasi bersama:
   - [`supabase/functions/ticketing-public/index.ts`](../supabase/functions/ticketing-public/index.ts)
   - [`supabase/functions/midtrans-notification/index.ts`](../supabase/functions/midtrans-notification/index.ts)
   - Pastikan keduanya di-deploy setelah konfigurasi Production berubah. `ticketing-public` membuat checkout dan mengambil status; webhook memverifikasi signature dan mengambil status transaksi.

4. Notification URL pada dashboard Midtrans Production:
   - Atur Payment Notification URL ke `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/midtrans-notification`.
   - Gunakan URL project Supabase yang benar. Fungsi `midtrans-notification` memang harus tetap dapat menerima request tanpa JWT Supabase; autentikasi notifikasi dilakukan dengan signature Midtrans dan verifikasi Status API.

## Urutan cutover yang disarankan

1. **Pastikan akun Production aktif** dan kredensial yang disalin berasal dari lingkungan Production, bukan Sandbox.
2. **Jadwalkan waktu cutover** dan hentikan sementara pembuatan order Midtrans baru.
3. **Tinjau transaksi Sandbox yang masih tertunda.** Selesaikan atau tunggu sampai kedaluwarsa sebelum mengganti secret dan konfigurasi. Transaksi lama tidak boleh dianggap sebagai transaksi Production; jangan membuat ulang pembayaran untuk order lama tanpa memeriksa statusnya.
4. Ubah Merchant ID serta URL Snap dan Status API di file konfigurasi bersama.
5. Perbarui validasi host checkout pada frontend agar menerima `app.midtrans.com`.
6. Atur secret `MIDTRANS_SECRET_KEY` ke Server Key Production melalui Supabase Dashboard. Jangan menaruh key di Git atau mengirimkannya melalui chat.
7. Atur Payment Notification URL pada dashboard Midtrans Production ke endpoint webhook di atas.
8. Deploy fungsi `ticketing-public` dan `midtrans-notification` ke project Supabase yang benar.
9. Deploy frontend agar validasi host checkout Production ikut dirilis.
10. Jalankan typecheck, lint, dan build frontend; deploy juga perubahan source dan Edge Functions bersama dalam jendela cutover.
11. Aktifkan kembali pembuatan order Midtrans dan jalankan satu transaksi Production dengan nilai yang disetujui untuk pengujian. Verifikasi redirect, notifikasi, status **Lunas**, dan penerbitan tiket sebelum mengumumkan pembayaran aktif.

## Pemeriksaan setelah cutover

- Checkout mengarah ke host `app.midtrans.com`, bukan host Sandbox.
- Pembuatan Snap berhasil dengan Server Key Production.
- Status API memakai `https://api.midtrans.com/v2`.
- Merchant ID transaksi cocok dengan Merchant ID Production.
- Notifikasi Production mencapai endpoint Supabase tanpa error signature.
- Order berubah menjadi **Lunas** hanya setelah Status API memverifikasi transaksi berhasil.
- Tiket terbit satu kali dan nominal gross amount sama dengan total order.
- Cek log Edge Functions untuk error konfigurasi; jangan mencatat atau menyalin nilai secret ke log.

## Catatan rollback

Jika transaksi Production gagal, hentikan sementara order Midtrans baru. Jangan hanya mengembalikan satu URL: konfigurasi Merchant ID, Server Key, Snap API, Status API, host redirect frontend, dan Notification URL harus kembali konsisten ke satu lingkungan. Pertahankan data order/transaksi yang sudah tercatat untuk pemeriksaan; jangan menghapus transaksi atau mengubah status pembayaran secara manual tanpa verifikasi.
