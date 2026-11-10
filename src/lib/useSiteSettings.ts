import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteSettings } from './types';
import { supabase } from './supabase';

const FALLBACK_SETTINGS: SiteSettings = {
  id: 1,
  site_name: 'Standupindo Cilegon',
  site_short_name: 'STANDUPINDO CILEGON',
  logo_url: '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png',
  brand_primary: '#2563eb',
  brand_hover: '#1d4ed8',
  brand_accent: '#f59e0b',
  whatsapp_admin: '',
  whatsapp_admin_name: '',
  whatsapp_registration: '',
  whatsapp_registration_name: '',
  whatsapp_partnership: '',
  whatsapp_partnership_name: '',
  whatsapp_ticket: '',
  whatsapp_ticket_name: '',
  instagram_url: 'https://instagram.com/standupindocilegon',
  tiktok_url: 'https://tiktok.com/@standupindocilegon',
  youtube_url: 'https://youtube.com/@standupindocilegon',
  address: 'Cilegon, Banten',
  short_description: 'Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.',
  home_hero_title: 'Komunitas Stand Up Comedy Cilegon',
  home_hero_description: 'Dari Tawa, Jadi Karya. Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.',
  footer_description: 'Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.',
  about_story_title: 'Standupindo Cilegon: The Story',
  about_story_tagline: 'Berawal dari tawa, tumbuh menjadi cerita.',
  about_story: `November 2013 menjadi salah satu titik awal perjalanan Standupindo Cilegon. Saat itu, Adam Datau, Luthfi, dan Entus Bewok tampil membawakan stand-up comedy dalam acara Apresiasi Seni di SMPN 5 Cilegon. Sebuah penampilan sederhana yang mungkin tak pernah mereka bayangkan akan membuka jalan bagi sesuatu yang lebih besar.

Usai acara, Adam Datau mengunggah beberapa dokumentasi penampilan mereka ke Facebook. Respons pun berdatangan. Di antara banyaknya tanggapan, seorang pecinta stand-up comedy menawarkan kesempatan bagi mereka untuk tampil di Premiere Cafe.

Tawaran itu membawa mereka ke sebuah panggung baru. Malam itu, mereka kembali tampil, sekaligus berkenalan dengan teman-teman dari Standupindo BSC (Banten Serang Cilegon), komunitas yang dalam perjalanannya kemudian berganti nama menjadi Standupindo Serang.

Pertemuan tersebut menjadi bagian penting dari perjalanan mereka. Sebab, terkadang, sebuah perkenalan sederhana bisa membuka jalan menuju sesuatu yang sebelumnya tak pernah terpikirkan.

Sekitar seminggu setelah penampilan itu, Adam Datau dihubungi oleh Ray Koto. Keduanya kemudian bertemu di Premiere Cafe. Dari pertemuan tersebut, muncul sebuah gagasan untuk membangun komunitas stand-up comedy di Kota Cilegon.

Gagasan itu tidak berhenti sebagai percakapan di sebuah kafe. Open mic mulai digelar, promosi terus dilakukan, dan perlahan ruang bagi para pecinta stand-up comedy di Cilegon mulai terbentuk.

Hingga akhirnya, pada Januari 2014, Standupindo Cilegon muncul ke permukaan dan secara resmi menandai terbentuknya komunitas ini.

Waktu terus berjalan. Orang-orang datang dan pergi, pengalaman bertambah, dan banyak hal berubah. Namun, semangat yang mengawali perjalanan ini tetap menjadi bagian penting dari identitas Standupindo Cilegon.`,
  affiliation_name: 'Standupindo',
  affiliation_website: 'https://standupindo.id/',
  affiliation_logo_url: '/assets/images/image.png',
  home_open_mic_ranking_enabled: true,
  merch_banner_image_url: null,
  merch_banner_title: '',
  merch_banner_description: '',
  merch_shop_url: '',
  merch_banner_enabled: false,
};

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshSettings = useCallback(async () => {
    const { data, error } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error) console.error('Gagal memuat pengaturan website.', error);
    if (mounted.current && data) setSettings({ ...FALLBACK_SETTINGS, ...(data as Partial<SiteSettings>) });
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => { void refreshSettings(); }, [refreshSettings]);

  return { settings, loading, refreshSettings };
}
