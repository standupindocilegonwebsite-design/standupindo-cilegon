# Rencana Navigasi Admin Penuh

## Tujuan dokumen

Dokumen ini merancang tampilan dan pembagian menu **Admin Penuh/Superadmin** secara lebih teratur, ringkas, dan mudah dipahami.

Ruang lingkup hanya mencakup **Admin Penuh/Superadmin**:

- Admin Open Mic tetap menangani seluruh pekerjaan operasional Open Mic.
- Admin Event tetap menangani seluruh pekerjaan operasional Event.
- Admin Tiket tetap menangani seluruh pekerjaan operasional tiket.
- Admin QR Scanner tetap menangani pemindaian dan check-in QR.
- Member tetap berada pada pengalaman dan menu Member yang sudah ada.
- Navigasi serta hak akses role lain tidak dirancang ulang dalam dokumen ini.

Dokumen ini belum merupakan instruksi implementasi dan belum mengubah kode apa pun.

---

## Prinsip utama

Admin Penuh tidak perlu menjadi “akses tambahan” yang membuka ulang workspace role lain.

1. **Admin Penuh mengawasi dan mengatur sistem secara menyeluruh.**
2. **Admin operasional mengerjakan pekerjaan harian pada domainnya.**
3. **Tidak ada menu operasional yang sama persis muncul sebagai shortcut ganda di Admin Penuh.**
4. **Ringkasan Admin Penuh boleh menampilkan status lintas role, tetapi bukan workspace pengganti role tersebut.**
5. **Perubahan ini hanya mengatur navigasi dan pengelompokan menu yang sudah ada.**
6. **Bottom navigation Admin Penuh dibatasi maksimal 6 menu utama.**
7. **Menu penting tidak dikumpulkan semuanya ke dalam Lainnya.**

---

# Struktur Admin Penuh yang disarankan

Bottom navigation Admin Penuh terdiri dari 6 kategori berikut:

1. Ringkasan
2. Akun
3. Komunitas
4. Konten
5. Pengaturan
6. Lainnya

Urutan di atas perlu dipertahankan karena bersifat progresif: kondisi sistem, kepemilikan akun, data komunitas, konten publik, konfigurasi global, lalu utilitas jarang digunakan.

---

## 1. Ringkasan

### Fungsi

Ringkasan adalah halaman pertama dan dashboard pengawasan Admin Penuh. Halaman ini menjawab pertanyaan: “Bagaimana kondisi keseluruhan website saat ini?”

Ringkasan **bukan halaman kerja Open Mic, Event, Tiket, atau Scanner**. Statistik dan status dapat ditampilkan lintas modul, tetapi detail operasional tetap berada pada Admin terkait.

### Isi yang dapat ditampilkan

#### Kondisi Open Mic

- jumlah Open Mic mendatang;
- jumlah Open Mic selesai;
- jumlah pendaftaran atau antrean yang perlu diperhatikan;
- jumlah pengajuan riwayat tampil/MC yang menunggu;
- status jadwal CCS yang mendatang.

Angka atau shortcut ini bersifat ringkasan. Pengelolaan pendaftar, lineup, performer, evaluator, dan status Open Mic tetap berada pada Admin Open Mic.

#### Kondisi Event

- jumlah Event mendatang;
- jumlah Event selesai;
- jumlah peserta atau perubahan status yang perlu diperhatikan;
- status Event yang sedang aktif atau mendekati pelaksanaan.

Pengelolaan Event dan peserta tetap berada pada Admin Event.

#### Kondisi tiket

- jumlah pesanan aktif;
- jumlah pesanan lunas;
- pesanan yang menunggu pembayaran;
- jumlah tiket terjual;
- ringkasan pendapatan atau pembelian jika sudah tersedia di dashboard saat ini.

Pengelolaan pesanan, pembayaran, voucher, biaya, dan laporan tetap berada pada Admin Tiket.

#### Kondisi komunitas

- jumlah Komika;
- jumlah Member aktif;
- pengajuan Gabung Komunitas yang menunggu;
- pengajuan riwayat Member yang menunggu.

#### Kondisi akun dan sistem

- jumlah Admin aktif;
- Admin yang memiliki role tertentu;
- status website atau pengumuman maintenance;
- informasi perubahan terbaru yang penting bagi Superadmin.

### Aktivitas terbaru

Ringkasan dapat menampilkan daftar ringkas seperti:

- pendaftaran Member terbaru;
- pengajuan komunitas terbaru;
- pengajuan riwayat terbaru;
- pesanan baru;
- perubahan status pada Event;
- aktivitas Admin yang relevan, jika data aktivitas tersebut sudah tersedia.

Aktivitas tidak perlu ditampilkan sebagai tempat mengubah data. Tombol dari ringkasan sebaiknya hanya membawa pengguna ke halaman laporan atau menampilkan detail singkat.

### Perilaku peninjauan

Admin Penuh diperbolehkan melihat:

- status keseluruhan;
- indikator jumlah pengajuan;
- ringkasan perubahan;
- informasi lintas modul yang diperlukan untuk pengawasan.

Admin Penuh tidak perlu mengelola ulang:

- jadwal atau pendaftar Open Mic dari dashboard;
- Event atau penonton dari dashboard;
- pesanan atau pembayaran tiket dari dashboard;
- pemindaian QR dari dashboard;
- verifikasi harian riwayat Member.

---

## 2. Akun

Kategori Akun memusatkan seluruh pengelolaan identitas dan hak akses yang memang menjadi tanggung jawab Admin Penuh.

### A. Akun Admin

#### Tujuan

Mengatur akun yang memiliki akses ke admin panel serta pemberian role.

#### Menu yang sudah ada dan dipertahankan

- daftar Akun Admin;
- pencarian atau filter akun;
- informasi role pada setiap akun;
- status aktif atau nonaktif;
- penambahan akun Admin;
- pemberian role Admin.

#### Role yang dapat dikelola

- Admin Penuh/Superadmin;
- Admin Open Mic;
- Admin Event;
- Admin Tiket;
- Admin QR Scanner.

#### Detail halaman

Halaman perlu menampilkan sedikitnya:

- nama atau identitas Admin;
- email akun;
- role aktif;
- status akun;
- tanggal dibuat atau diperbarui, jika sudah tersedia;
- aksi edit atau nonaktifkan.

#### Yang tidak perlu menjadi duplikat

- Pengelolaan Akun Admin tidak perlu ada di dalam semua workspace role.
- Admin Event tidak perlu memiliki kategori role yang sama persis di halaman lain jika kebutuhan utamanya sudah dicakup oleh Akun Admin milik Superadmin.

### B. Akun Member

#### Tujuan

Mengelola identitas Member secara menyeluruh.

#### Isi halaman

- daftar Akun Member;
- pencarian berdasarkan nama atau akun;
- informasi profil Member;
- hubungan akun Member dengan profil Komika;
- status aktif atau nonaktif akun;
- perubahan identitas yang memang diperbolehkan oleh sistem.

#### Detail yang dapat ditampilkan

- nama akun;
- nama lengkap;
- nama panggung Komika;
- email;
- status keanggotaan;
- profil yang terkait;
- akses atau status aktivitas.

Akun Member tetap dapat dilihat Superadmin, tetapi aktivitas administrasi harian Open Mic tetap dibatasi pada Admin Open Mic.

### C. Gabung Komunitas

#### Tujuan

Memproses pengajuan orang yang ingin bergabung ke komunitas.

#### Isi halaman

- daftar pengajuan;
- status:
  - Menunggu;
  - Disetujui;
  - Ditolak;
- pencarian dan filter pengajuan;
- detail data pemohon;
- catatan admin;
- proses persetujuan atau penolakan.

Halaman ini adalah milik Admin Penuh. Admin lain tidak perlu memiliki versi duplikat bila mereka tidak bertanggung jawab atas proses penerimaan anggota.

### Posisi menu Akun

Dalam kategori Akun, urutan yang disarankan:

1. Akun Admin
2. Akun Member
3. Gabung Komunitas

Urutan tersebut menempatkan akun yang memiliki akses sistem paling dulu, lalu Member, lalu proses perekrutan anggota.

---

## 3. Komunitas

Kategori Komunitas berisi master data dan riwayat komunitas. Category ini bukan workspace operasional Open Mic.

### A. Komika

#### Tujuan

Mengelola profil Komika sebagai identitas komunitas.

#### Isi halaman

- daftar Komika;
- pencarian Komika;
- nama panggung;
- nama lengkap;
- foto profil atau gambar yang sudah ada;
- profil publik;
- akun Member yang terkait;
- status Komika;
- tindakan tambah, ubah, atau nonaktifkan sesuai fitur yang tersedia.

#### Batasan kepemilikan

Admin Penuh mengelola data identitas Komika, tetapi Admin Open Mic tetap mengelola:

- pendaftar pada sesi Open Mic;
- performer pada sesi;
- evaluator;
- verifikasi pengajuan riwayat.

Halaman Komika tidak perlu menampilkan ulang fungsi pendaftaran atau lineup Open Mic.

### B. Riwayat Komunitas

#### Tujuan yang disarankan

Nama ini lebih jelas daripada “Riwayat Member” di halaman Superadmin. Isinya adalah ringkasan rekam jejak aktivitas Komika yang sudah disetujui.

#### Isi ringkasan

- riwayat tampil Open Mic yang disetujui;
- riwayat MC internal yang disetujui;
- riwayat MC eksternal yang disetujui;
- Komika yang memiliki riwayat;
- jumlah riwayat pada setiap Komika;
- filter berdasarkan Komika, jenis kegiatan, atau periode.

#### Batasan yang penting

**Verifikasi pengajuan Menunggu, Disetujui, atau Ditolak tetap menjadi fungsi Admin Open Mic.**

Admin Penuh dapat memiliki versi ringkasan atau read-only agar dapat mengawasi data komunitas, tetapi tidak perlu menampilkan ulang workspace review yang sama persis dengan Admin Open Mic.

Dengan demikian, menu “Riwayat Member” sebaiknya tidak menjadi menu operasional utama Admin Penuh. Di workspace Admin Open Mic, label “Riwayat” atau “Riwayat Member” dapat tetap dipertahankan sesuai kebutuhan peran tersebut.

### Urutan kategori Komunitas

1. Komika
2. Riwayat Komunitas

---

## 4. Konten

Kategori Konten berisi data publik yang mendukung identitas dan dokumentasi Standupindo Cilegon.

### A. Partner

#### Tujuan

Mengelola daftar partner sebagai data konten atau identitas organisasi.

#### Isi halaman

- daftar Partner;
- pencarian partner;
- logo atau aset partner yang sudah ada;
- nama dan deskripsi partner;
- status tampil atau tersembunyi;
- urutan penampilan;
- tautan partner jika tersedia.

#### Hubungan dengan Admin Event

Partner juga dapat digunakan pada Event. Hubungan partner dengan Event dapat tetap sepenuhnya dikelola oleh Admin Event.

Pembagian yang dianjurkan:

- Admin Penuh mengelola **master data partner** dan status global;
- Admin Event mengelola **keterkaitan partner dengan Event tertentu**.

Halaman Admin Penuh tidak perlu menampilkan ulang modul pengelolaan partnership per Event jika Admin Event sudah memiliki workspace untuk itu.

### B. Annual Recap

#### Tujuan

Menampilkan atau mengatur ringkasan tahunan komunitas.

#### Isi halaman

- pemilihan periode tahunan;
- ringkasan kegiatan tahunan;
- konten Annual Recap yang sudah ada;
- publikasi atau status tampilan sesuai fungsi saat ini;
- hasil data tahunan yang ingin ditinjau.

Annual Recap jarang digunakan secara operasional dan karena itu cocok berada pada kategori Konten.

### Urutan kategori Konten

1. Partner
2. Annual Recap

---

## 5. Pengaturan

Kategori Pengaturan memusatkan konfigurasi yang memengaruhi akun Admin atau website secara keseluruhan.

### A. Pengaturan Profil

#### Tujuan

Mengelola profil akun Admin yang sedang login.

#### Isi halaman

- nama profil;
- foto profil, jika sudah tersedia;
- email akun;
- password atau keamanan akun sesuai mekanisme yang sudah ada;
- informasi akun yang dapat diperbarui oleh pengguna.

Menu ini tetap dipertahankan untuk setiap role, tetapi hanya perlu satu halaman bersama sesuai kebutuhan akun masing-masing.

### B. Settings

#### Tujuan

Mengatur konfigurasi global website.

#### Isi halaman

Halaman ini hanya berisi pengaturan yang benar-benar memengaruhi website secara global, misalnya:

- nama atau identitas website;
- logo dan aset global;
- informasi kontak;
- tautan sosial media;
- pengaturan publikasi global;
- konfigurasi lain yang sudah tersedia pada Settings saat ini.

#### Pengaturan yang tidak perlu masuk Settings

- jadwal CCS;
- pengaturan Gate;
- konfigurasi voucher atau biaya;
- evaluator Open Mic;
- profil akun per pengguna;
- pengaturan partner pada Event tertentu.

Fitur-fitur tersebut sudah berada pada domain Admin operasional dan tidak perlu dipindahkan ke pengaturan global.

### Urutan kategori Pengaturan

1. Pengaturan Profil
2. Settings

---

## 6. Lainnya

Kategori Lainnya hanya memuat fitur yang jarang digunakan atau tidak cocok ke dalam lima kategori utama. Lainnya tidak boleh menjadi tempat penyimpanan menu penting yang hanya belum dikelompokkan.

### Isi yang dipertahankan pada Lainnya

#### A. Jadwal CCS

Jadwal Cilegon Comedy Sharing adalah program rutin yang jarang dibuka dibanding pengelolaan operasional harian.

Halaman yang dipertahankan dapat berisi:

- jadwal rutin CCS;
- tanggal dan status jadwal;
- pengaturan program yang sudah ada;
- publikasi jadwal.

Pembuatan, perubahan, dan pemantauan CCS dapat tetap menjadi tanggung jawab Admin Open Mic. Admin Penuh hanya membutuhkan akses pengawasan atau penyelarasan lintas sistem.

Admin Penuh tidak perlu membuat sidebar atau aksi duplikat yang mengulang workspace Admin Open Mic.

#### B. Maintenance Penonton

“Maintenance” pada sistem saat ini bukan maintenance teknis website. Berdasarkan implementasi yang ada, halaman ini merupakan fasilitas komunikasi dengan penonton.

##### Fungsi yang tersedia

- memilih database penonton dari satu Event atau semua Event;
- memilih pembeli atau penonton;
- membuat pesan WhatsApp;
- memilih jenis aktivitas:
  - ucapan terima kasih;
  - pemberitahuan Event mendatang;
  - promosi Event;
- membentuk pesan dari template atau mengedit pesan manual;
- membuka WhatsApp secara manual;
- mencatat bahwa pesan sudah dikirim;
- melihat riwayat aktivitas dan status pengiriman.

##### Kepemilikan yang disarankan

Admin Event dapat tetap memiliki akses karena penggunaannya berhubungan dengan penonton Event.

Admin Penuh dapat mempertahankan akses sebagai fungsi lintas Event, dengan catatan bahwa ini bukan pemindaian atau operasional tiket harian dan tidak perlu menjadi menu utama.

#### C. Menu jarang digunakan lainnya

Menu tambahan pada kategori ini hanya boleh dimasukkan jika benar-benar sudah ada atau dibutuhkan, misalnya:

- log aktivitas Admin;
- riwayat perubahan penting;
- halaman pemulihan atau sinkronisasi yang memang tersedia;
- arsip konfigurasi;
- utilitas teknis khusus Admin Penuh.

Fitur baru tidak perlu dibuat hanya untuk mengisi menu Lainnya.

### Menu yang tidak boleh tetap di Lainnya

Menu penting berikut sebaiknya dipindahkan ke kategori utama atau role operasional yang benar:

- Akun Admin → Akun;
- Akun Member → Akun;
- Gabung Komunitas → Akun;
- Pengaturan Profil → Pengaturan;
- Settings → Pengaturan;
- Partner → Konten;
- Annual Recap → Konten;
- Evaluator → Admin Open Mic;
- Riwayat Member → Admin Open Mic;
- Jadwal CCS → dipertimbangkan sebagai utilitas lintas Open Mic, bukan menu utama Superadmin;
- Pengaturan Gate → Admin Tiket;
- Informasi Pembayaran → Admin Tiket;
- Voucher dan biaya → Admin Tiket;
- Laporan Tiket → Admin Tiket;
- Laporan Check-in → Admin QR Scanner;
- Riwayat Scan → Admin QR Scanner;
- Data Penonton → Admin Tiket atau ringkasan pengawasan Superadmin.

---

# Kategori yang dikeluarkan dari bottom menu Admin Penuh

Agar Admin Penuh tidak mengulang role lain, menu operasional berikut tidak perlu menjadi bottom menu Admin Penuh.

## Tidak perlu menjadi menu Admin Penuh

### Operasional Open Mic

- daftar jadwal Open Mic;
- pendaftar;
- performer;
- lineup;
- evaluator;
- verifikasi riwayat Member;
- pengelolaan Open Mic harian.

### Operasional Event

- daftar Event harian;
- peserta Event;
- penonton Event;
- pengaturan partner pada Event tertentu;
- status operasional Event.

### Operasional tiket

- pesanan;
- penerimaan pembayaran;
- pembelian tiket;
- biaya tambahan;
- voucher;
- laporan penjualan;
- pengaturan gate.

### Operasional scanner

- pemindaian QR;
- proses check-in;
- riwayat scan;
- laporan check-in.

Akses Superadmin terhadap modul ini dapat tetap ada melalui hak akses teknis jika diperlukan, tetapi fokus bottom menu, sidebar utama, dan alur kerja harian Admin Penuh sebaiknya tidak menampilkannya sebagai pekerjaan Admin Penuh.

---

# Pemetaan menu Admin Penuh sebelum dan sesudah

## Tetap dipertahankan, tetapi dipindah kategori

| Menu yang ada | Posisi yang disarankan |
|---|---|
| Akun Admin | Akun |
| Akun Member | Akun |
| Gabung Komunitas | Akun |
| Komika | Komunitas |
| Riwayat Member | Ringkasan atau review ringkas Superadmin; operasional tetap di Admin Open Mic |
| Partner | Konten |
| Annual Recap | Konten |
| Pengaturan Profil | Pengaturan |
| Settings | Pengaturan |
| Jadwal CCS | Lainnya atau pengawasan Open Mic |
| Maintenance Penonton | Lainnya |

## Tidak dipertahankan sebagai menu utama Admin Penuh

| Menu | Pemilik operasional |
|---|---|
| Open Mic dan pendaftar | Admin Open Mic |
| Performer | Admin Open Mic |
| Evaluator | Admin Open Mic |
| Event dan peserta | Admin Event |
| Partner per Event | Admin Event |
| Pesanan dan data penonton | Admin Tiket |
| Informasi Pembayaran | Admin Tiket |
| Voucher dan biaya | Admin Tiket |
| Pengaturan Gate | Admin Tiket |
| Scan QR dan Check-in | Admin QR Scanner |
| Laporan Scanner | Admin QR Scanner |

---

# Prinsip pengalihan halaman

Jika jumlah menu di bottom navigation Admin Penuh dikurangi, halaman lama tidak perlu dihapus.

Struktur yang aman adalah:

1. Navigasi utama hanya menampilkan kategori yang disarankan.
2. Halaman lama tetap tersedia pada URL atau route yang sudah ada.
3. Admin Open Mic, Admin Event, Admin Tiket, dan QR Scanner tetap diarahkan ke halaman lama milik role masing-masing.
4. Superadmin dapat melihat ringkasan melalui data yang sudah ada.
5. Tidak ada pembuatan salinan komponen Admin baru hanya untuk Superadmin.
6. Tidak ada workspace operasional yang diduplikasi secara UI.

---

# Batasan yang perlu dijaga

Perubahan ini tidak boleh:

- menghapus data atau riwayat yang sudah ada;
- mengubah hak akses Admin Open Mic, Event, Tiket, atau Scanner;
- mengubah menu dan halaman Member;
- mengubah route atau URL lama secara sembarangan;
- memindahkan data antardatabase;
- membuat role baru;
- menambah modul baru untuk mengisi kategori;
- membuat ulang fungsi verifikasi atau laporan yang sudah ada;
- memaksa Admin Penuh mengoperasikan pekerjaan harian role lain.

---

# Pendekatan implementasi minimal untuk mempermudah pembelajaran

## Tingkat kerumitan

Perubahan navigasi Admin Penuh seharusnya tidak memerlukan pembangunan ulang sistem. Tingkat kerumitan utama terletak pada pengaturan menu dan pemetaan halaman yang sudah ada, bukan pada database, role, atau pembuatan fitur baru.

Perubahan minimal yang dianjurkan adalah:

- hanya mengubah konfigurasi navigasi Admin Penuh;
- tetap memakai halaman, komponen, data, dan route yang sudah ada;
- tidak mengubah hak akses teknis role lain;
- tidak memindahkan atau menyalin database;
- tidak mengubah halaman Member;
- tidak membuat komponen operasional baru untuk Admin Penuh;
- melanjutkan penggunaan halaman lama agar URL dan alur kerja yang sudah dikenal tidak berubah.

Jika seluruh rencana ingin dilaksanakan sekaligus, kemungkinan besar perubahan paling banyak terjadi pada [AdminPage.tsx](../src/pages/admin/AdminPage.tsx). Komponen halaman lain seharusnya dapat dipakai ulang tanpa perubahan.

## Prinsip: relokasi menu, bukan menu baru

Perubahan yang diminta adalah **penataan ulang navigasi Admin Penuh**, bukan pembangunan fitur baru.

Semua menu dan halaman yang dipindahkan harus berasal dari daftar menu Admin yang sudah ada sekarang. Tidak ada menu baru yang dibuat hanya untuk mengisi kategori.

Perubahan yang dimaksud:

- menu lama dipindahkan ke bottom menu atau kategori lain yang lebih tepat;
- tampilan daftar More disederhanakan;
- halaman yang sudah ada tetap membuka komponen yang sama;
- label dapat disederhanakan jika halaman sudah jelas;
- urutan menu diatur agar mudah dipelajari;
- halaman lama tidak dihapus atau dibuat ulang;
- tidak ada halaman atau modul baru khusus Admin Penuh.

Contoh yang dimaksud:

```text
Menu lama "Akun Admin" tetap berupa halaman Akun Admin yang sama.
Menu tersebut hanya dipindahkan posisinya ke kategori "Akun".
```

Contoh lain:

```text
Menu lama "Pengaturan Gate" tetap berupa halaman Pengaturan Gate milik Admin Tiket.
Menu tersebut tidak dipindahkan sebagai menu utama Admin Penuh.
```

## Pemetaan relokasi menu Admin Penuh

Sebelum implementasi, gunakan pemetaan sederhana berikut:

| Bottom menu Admin Penuh | Menu yang dipindahkan ke sana | Halaman/komponen lama yang tetap dipakai |
|---|---|---|
| Ringkasan | Dashboard Ringkasan | Dashboard Admin yang sudah ada |
| Akun | Akun Admin, Akun Member, Gabung Komunitas | Halaman akun dan aplikasi komunitas yang sudah ada |
| Komunitas | Komika, Riwayat Member atau ringkasan riwayat | Halaman Komika dan review riwayat yang sudah ada |
| Konten | Partner, Annual Recap | Halaman Partner dan Annual Recap yang sudah ada |
| Pengaturan | Pengaturan Profil, Settings | Halaman profil Admin dan Settings yang sudah ada |
| Lainnya | Maintenance Penonton, Jadwal CCS, utilitas yang sudah ada | Halaman maintenance dan CCS yang sudah ada |

Pemetaan ini memastikan tidak ada fungsi yang diganti, dikurangi, atau dibuat ulang.

## Tampilan yang ideal dilakukan dengan pengelompokan menu lama

Admin Penuh tidak perlu memiliki versi baru dari setiap halaman. Saat membuka kategori Akun, misalnya, ia dapat melihat daftar **menu lama yang sudah ada**:

```text
Akun
  - Akun Admin
  - Akun Member
  - Gabung Komunitas
```

Begitu pengguna memilih “Akun Admin”, halaman yang terbuka adalah halaman Akun Admin lama. Tidak ada salinan atau halaman baru bernama sama.

Demikian pula untuk kategori lain:

```text
Komunitas
  - Komika
  - Riwayat Member
```

```text
Konten
  - Partner
  - Annual Recap
```

```text
Pengaturan
  - Pengaturan Profil
  - Settings
```

Halaman kategori dapat berupa daftar menu dalam bentuk daftar atau kartu, tetapi daftar tersebut hanya mengarah ke halaman yang sudah ada.

## Apa yang sebaiknya tidak dibuat baru

Pada tahap perubahan ini, hindari:

- membuat menu yang belum pernah ada hanya untuk memenuhi kategori;
- membuat halaman dashboard baru khusus setiap kategori;
- membuat ulang Dashboard Admin yang sama;
- membuat database baru;
- membuat tabel konfigurasi navigasi baru;
- membuat role baru;
- membuat halaman versi Superadmin untuk Open Mic, Event, Tiket, atau Scanner;
- menyalin komponen Admin Open Mic atau Admin Event ke komponen Superadmin;
- mengubah URL atau route lama;
- memindahkan hak akses role lain;
- mengubah tampilan Member.

## Tahapan relokasi yang paling aman

### Tahap 1: bottom navigation

Mulai dengan mengubah konfigurasi bottom navigation Admin Penuh menjadi enam item:

1. Ringkasan
2. Akun
3. Komunitas
4. Konten
5. Pengaturan
6. Lainnya

Tidak ada item baru yang ditambahkan ke sistem. Keenam item ini hanya menjadi wadah untuk menu yang sudah ada.

### Tahap 2: pengelompokan menu dalam kategori

Relokasikan menu lama ke kategori yang sesuai:

- Akun Admin, Akun Member, dan Gabung Komunitas ke Akun;
- Komika dan riwayat yang disetujui ke Komunitas;
- Partner dan Annual Recap ke Konten;
- Pengaturan Profil dan Settings ke Pengaturan;
- CCS dan Maintenance Penonton ke Lainnya.

Jika diperlukan satu tampilan pembuka kategori, tampilannya hanya berupa daftar tombol menuju menu lama.

### Tahap 3: pemetaan “Lainnya”

Kumpulkan hanya utilitas yang benar-benar jarang digunakan, misalnya:

- Jadwal CCS;
- Maintenance Penonton;
- utilitas jarang dipakai yang sudah tersedia.

Menu penting seperti Akun, Komika, Partner, Settings, dan Pengaturan Profil tidak disimpan di Lainnya.

### Tahap 4: ringkasan Superadmin

Jaga Dashboard Ringkasan sebagai pengawasan lintas sistem.

Dashboard dapat menampilkan jumlah atau status lintas modul dengan mengacu pada data yang sudah ada, tetapi tidak perlu menyalin tombol pengelolaan dari workspace role lain. Shortcut yang sudah ada dapat dipindahkan atau disembunyikan agar tidak membuat duplikasi workflow.

### Tahap 5: verifikasi role lain

Setelah navigasi Admin Penuh berubah, pastikan role berikut tetap berjalan seperti semula:

- Admin Open Mic tetap membuka Open Mic, pendaftar, performer, evaluator, dan riwayat.
- Admin Event tetap membuka Event, peserta, penonton, partner, dan maintenance yang menjadi kewenangannya.
- Admin Tiket tetap membuka pesanan, tiket, pembayaran, biaya, voucher, dan laporan.
- Admin QR Scanner tetap membuka scan, Event, check-in, dan laporan.
- Member tetap menggunakan seluruh menu dan halaman Member tanpa perubahan.

## Konfigurasi kode yang paling mungkin diubah

Perubahan navigasi seharusnya difokuskan pada mekanisme yang sudah ada, terutama:

- `NAV`;
- `BOTTOM_NAV`;
- `getWorkspaceNav`;
- `getWorkspaceBottomNav`;
- `isMoreNavigationActive`;
- `canAccessSection` pada bagian Admin Penuh;
- `MorePage`;
- pemetaan route antarsection.

Pengelompokan sebaiknya dilakukan dengan mengubah struktur navigasi, bukan dengan menyebarkan perubahan ke banyak komponen bisnis.

## Bagian yang membutuhkan kehati-hatian

Meskipun perubahan ini tidak memerlukan pembangunan ulang besar, beberapa bagian perlu diperiksa secara teliti:

### Menu aktif

Ketika Superadmin membuka halaman “Akun Member” dari kategori Akun, item bottom menu yang aktif harus tetap “Akun”, bukan tampak seperti item lain atau “Lainnya”.

### URL lama

Halaman lama sebaiknya tetap dapat dibuka dari URL lama. Pengubahan kategori harus menjadi pengubahan tampilan navigasi, bukan penghapusan route lama.

### Hak akses

Perubahan tampilan tidak boleh memperluas atau mengurangi hak akses role lain secara tidak sengaja. Terutama pemeriksaan pada:

- `isAdmin`;
- `isOpenMicAdmin`;
- `isEventAdmin`;
- `isTicketAdmin`;
- `isQrScanner`;
- `canAccessSection()`.

### Placeholder atau item kosong

Satu kategori tidak boleh menampilkan subitem kosong. Jika halaman belum tersedia atau belum disetujui, kategorinya belum perlu ditambahkan sampai kepemilikannya jelas.

### Menu yang lebih dari enam

Bottom navigation Superadmin tidak boleh lebih dari enam menu utama. Enam item tetap dipertahankan meskipun beberapa kategori memiliki beberapa halaman di dalamnya.

## Urutan pengujian paling kecil

Pengujian implementasi navigasi sebaiknya dimulai dari skenario paling kecil dan ditambah secara bertahap:

1. Login sebagai Admin Penuh dan cek keenam bottom menu.
2. Buka setiap kategori satu per satu.
3. Pastikan setiap kartu/tautan mengarah ke halaman lama yang benar.
4. Pastikan item bottom yang aktif tetap sesuai kategori.
5. Pastikan Akun Admin dapat membuka akun Admin yang sudah ada.
6. Pastikan Akun Member dapat membuka daftar Member yang sudah ada.
7. Pastikan Gabung Komunitas membuka review yang sudah ada.
8. Pastikan Komika dan riwayat memiliki tujuan halaman yang benar.
9. Pastikan Partner dan Annual Recap tetap berfungsi.
10. Pastikan Pengaturan Profil dan Settings tetap berfungsi.
11. Pastikan Lainnya hanya berisi menu yang benar-benar jarang digunakan.
12. Login sebagai Admin Open Mic dan pastikan menu serta aksesnya tidak berubah.
13. Login sebagai Admin Event dan pastikan menu serta aksesnya tidak berubah.
14. Login sebagai Admin Tiket dan pastikan menu serta aksesnya tidak berubah.
15. Login sebagai Admin QR Scanner dan pastikan menu serta aksesnya tidak berubah.
16. Login sebagai Member dan pastikan navigasi serta seluruh halaman Member tidak berubah.
17. Pastikan tidak ada error route, menu kosong, atau submenu yang membuka halaman role lain secara tidak sengaja.

## Dampak terhadap jumlah perubahan kode

Perubahan ini dapat dibatasi pada tingkat navigasi dan pengelompokan UI apabila implementasi dilakukan bertahap.

Perubahan yang tidak perlu dilakukan:

- relasi database;
- migration;
- tabel baru;
- Edge Function baru;
- perubahan endpoint;
- perubahan jenis role;
- perubahan Member.

Perubahan yang diperlukan hanya mencakup:

- konfigurasi menu Superadmin;
- tampilan daftar kategori yang mengarah ke menu lama, jika diperlukan;
- pemetaan section aktif;
- penempatan tautan ke komponen lama;
- pengujian setiap role.

Dengan pembatasan ini, Admin Penuh dapat dipelajari dengan mudah dan perubahan teknisnya dapat dilakukan dengan risiko serta jumlah file yang seminimal mungkin.

---

# Urutan persetujuan sebelum implementasi

Rekomendasi implementasi setelah dokumen ini disetujui:

1. Konfirmasi nama dan urutan keenam bottom menu.
2. Konfirmasi apakah “Riwayat Member” di Admin Penuh berupa ringkasan atau dihapus sepenuhnya dari navigasi Superadmin.
3. Konfirmasi kepemilikan Maintenance Penonton.
4. Konfirmasi apakah Jadwal CCS ditampilkan sebagai pengawasan Superadmin atau tetap sepenuhnya ada pada Admin Open Mic.
5. Konfirmasi apakah Partner dan Annual Recap ditulis ulang labelnya atau mempertahankan nama yang sudah ada.
6. Konfirmasi halaman mana yang dapat menjadi ringkasan read-only dan mana yang harus tetap operasional pada role lain.
7. Baru setelah itu disusun mapping teknis dari menu lama ke kategori baru tanpa mengubah kode lain.

---

# Hasil yang diharapkan

Setelah struktur ini diterapkan, Admin Penuh menjadi workspace yang:

- fokus pada pengawasan dan konfigurasi;
- memiliki maksimal enam bottom menu;
- tidak mengulang menu Open Mic, Event, Tiket, dan Scanner milik role lain;
- memiliki kategori akun, komunitas, konten, dan pengaturan yang jelas;
- hanya menampilkan utilitas jarang digunakan pada Lainnya;
- tetap mempertahankan hak akses teknis dan pekerjaan operasional semua role lain;
- mudah dipelajari karena halaman lama tetap digunakan, hanya pengelompokannya yang ditata ulang.
