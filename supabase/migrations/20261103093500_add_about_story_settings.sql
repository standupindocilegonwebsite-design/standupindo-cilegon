ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS about_story_title text,
  ADD COLUMN IF NOT EXISTS about_story_tagline text,
  ADD COLUMN IF NOT EXISTS about_story text;

UPDATE public.site_settings
SET
  about_story_title = COALESCE(about_story_title, 'Standupindo Cilegon: The Story'),
  about_story_tagline = COALESCE(about_story_tagline, 'Berawal dari tawa, tumbuh menjadi cerita.'),
  about_story = COALESCE(
    about_story,
    'November 2013 menjadi salah satu titik awal perjalanan Standupindo Cilegon. Saat itu, Adam Datau, Luthfi, dan Entus Bewok tampil membawakan stand-up comedy dalam acara Apresiasi Seni di SMPN 5 Cilegon. Sebuah penampilan sederhana yang mungkin tak pernah mereka bayangkan akan membuka jalan bagi sesuatu yang lebih besar.

Usai acara, Adam Datau mengunggah beberapa dokumentasi penampilan mereka ke Facebook. Respons pun berdatangan. Di antara banyaknya tanggapan, seorang pecinta stand-up comedy menawarkan kesempatan bagi mereka untuk tampil di Premiere Cafe.

Tawaran itu membawa mereka ke sebuah panggung baru. Malam itu, mereka kembali tampil, sekaligus berkenalan dengan teman-teman dari Standupindo BSC (Banten Serang Cilegon), komunitas yang dalam perjalanannya kemudian berganti nama menjadi Standupindo Serang.

Pertemuan tersebut menjadi bagian penting dari perjalanan mereka. Sebab, terkadang, sebuah perkenalan sederhana bisa membuka jalan menuju sesuatu yang sebelumnya tak pernah terpikirkan.

Sekitar seminggu setelah penampilan itu, Adam Datau dihubungi oleh Ray Koto. Keduanya kemudian bertemu di Premiere Cafe. Dari pertemuan tersebut, muncul sebuah gagasan untuk membangun komunitas stand-up comedy di Kota Cilegon.

Gagasan itu tidak berhenti sebagai percakapan di sebuah kafe. Open mic mulai digelar, promosi terus dilakukan, dan perlahan ruang bagi para pecinta stand-up comedy di Cilegon mulai terbentuk.

Hingga akhirnya, pada Januari 2014, Standupindo Cilegon muncul ke permukaan dan secara resmi menandai terbentuknya komunitas ini.

Waktu terus berjalan. Orang-orang datang dan pergi, pengalaman bertambah, dan banyak hal berubah. Namun, semangat yang mengawali perjalanan ini tetap menjadi bagian penting dari identitas Standupindo Cilegon.'
  )
WHERE id = 1;
