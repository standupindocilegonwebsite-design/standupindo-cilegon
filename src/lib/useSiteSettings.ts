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
  affiliation_name: 'Standupindo',
  affiliation_website: 'https://standupindo.id/',
  affiliation_logo_url: '/assets/images/image.png',
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
