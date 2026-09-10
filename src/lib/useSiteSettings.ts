import { useEffect, useState } from 'react';
import type { SiteSettings } from './types';
import { supabase } from './supabase';

const FALLBACK_SETTINGS: SiteSettings = {
  id: 1,
  site_name: 'Standupindo Cilegon',
  site_short_name: 'STANDUPINDO CILEGON',
  logo_url: '/assets/images/Standupindo_CIlegon_Logo.jpeg',
  brand_primary: '#2563eb',
  brand_hover: '#1d4ed8',
  brand_accent: '#f59e0b',
  whatsapp_admin: '6282240154499',
  whatsapp_admin_name: '',
  whatsapp_registration: '6282240154499',
  whatsapp_registration_name: '',
  whatsapp_partnership: '6282240154499',
  whatsapp_partnership_name: '',
  whatsapp_ticket: '6282240154499',
  whatsapp_ticket_name: '',
  instagram_url: 'https://instagram.com/standupindocilegon',
  tiktok_url: 'https://tiktok.com/@standupindocilegon',
  youtube_url: 'https://youtube.com/@standupindocilegon',
  address: 'Cilegon, Banten',
  short_description: 'Satu Panggung, Banyak Cerita.',
  affiliation_name: 'Standupindo',
  affiliation_website: 'https://standupindo.id/',
  affiliation_logo_url: '/assets/images/image.png',
};

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle();
      if (active && data) setSettings({ ...FALLBACK_SETTINGS, ...(data as Partial<SiteSettings>) });
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', settings.brand_primary);
    document.documentElement.style.setProperty('--brand-hover', settings.brand_hover);
    document.documentElement.style.setProperty('--brand-accent', settings.brand_accent);
  }, [settings.brand_primary, settings.brand_hover, settings.brand_accent]);

  return { settings, loading };
}
