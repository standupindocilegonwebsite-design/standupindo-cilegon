import { useState } from 'react';
import { Mic, CalendarDays, Users, Handshake } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

const ACTIVITIES = [
  { icon: Mic, label: 'Open Mic' },
  { icon: CalendarDays, label: 'Event' },
  { icon: Users, label: 'Community' },
  { icon: Handshake, label: 'Collaboration' },
];

export function AboutPage({ router, settings }: { router: Router; settings: SiteSettings }) {
  const [logoLightbox, setLogoLightbox] = useState(false);
  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Tentang Komunitas" />
      <div className="container-app py-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.12),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="rounded-[24px] border border-blue-100 bg-white/90 p-5 shadow-[0_10px_25px_rgba(37,99,235,0.06)]">
              <button onClick={() => setLogoLightbox(true)} aria-label="Lihat logo Standupindo Cilegon" className="group mx-auto block">
                <div className="relative mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-[26px] border border-blue-100 bg-white shadow-[0_12px_28px_rgba(29,94,219,0.12)] transition-transform duration-200 group-hover:scale-[1.02]">
                  <img src={settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg'} alt={`Logo ${settings.site_name}`} className="h-16 w-16 object-contain" />
                </div>
              </button>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Community</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">{settings.site_name}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">{settings.short_description}</p>
              <button onClick={() => router.navigate('/more/gabung')} className="btn-primary mt-5 w-full">Gabung Komunitas</button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ACTIVITIES.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.label} className="rounded-[20px] border border-slate-200 bg-white/90 p-4 shadow-[0_8px_22px_rgba(15,23,42,0.03)]">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 shadow-inner ring-1 ring-blue-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="mt-2 block text-sm font-semibold text-slate-700">{a.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg'} alt={`Logo ${settings.site_name}`} open={logoLightbox} onClose={() => setLogoLightbox(false)} closeAriaLabel="Tutup logo" />
    </div>
  );
}
