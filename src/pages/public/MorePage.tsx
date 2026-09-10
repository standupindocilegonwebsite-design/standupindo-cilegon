import { useState } from 'react';
import { Info, Handshake, MessageCircle, Users } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

const ITEMS = [
  { to: '/more/gabung', label: 'Gabung Komunitas', description: 'Jadi bagian dari komunitas Cilegon.', icon: Users },
  { to: '/more/tentang', label: 'Tentang Komunitas', description: 'Kenali Standupindo Cilegon.', icon: Info },
  { to: '/more/kerja-sama', label: 'Kerja Sama', description: 'Mari berkolaborasi bersama kami.', icon: Handshake },
  { to: '/more/kontak', label: 'Kontak / Sosmed', description: 'Hubungi dan ikuti kami.', icon: MessageCircle },
];

export function MorePage({ router, settings }: { router: Router; settings: SiteSettings }) {
  const [logoLightbox, setLogoLightbox] = useState(false);
  const logoSrc = settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg';

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="More" subtitle="Informasi komunitas, kerja sama, dan kontak." />

      <div className="container-app py-6 sm:py-8">
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.12),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="mb-5 rounded-[24px] border border-blue-100 bg-white/80 p-4 shadow-[0_10px_25px_rgba(37,99,235,0.06)] backdrop-blur-sm sm:p-5">
              <div className="flex items-center gap-4">
                <button onClick={() => setLogoLightbox(true)} aria-label="Lihat logo Standupindo Cilegon" className="group relative block shrink-0">
                  <div className="absolute -inset-1 rounded-[22px] bg-gradient-to-br from-blue-200/80 to-sky-100/80 blur-sm opacity-80" />
                  <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-[0_12px_28px_rgba(29,94,219,0.12)] transition-transform duration-200 group-hover:scale-[1.02]">
                    <img src={logoSrc} alt={`Logo ${settings.site_name}`} className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Community</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900 sm:text-2xl">{settings.site_name}</h2>
                  <p className="mt-1 text-sm text-slate-500">Standup, kreativitas, dan kolaborasi di Cilegon.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => router.navigate(item.to)}
                    className="group flex w-full items-center gap-4 rounded-[20px] border border-slate-200 bg-white/90 p-4 text-left shadow-[0_8px_22px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white hover:shadow-[0_12px_24px_rgba(29,94,219,0.08)]"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 shadow-inner ring-1 ring-blue-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold tracking-[-0.02em] text-slate-900">{item.label}</h3>
                      <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                    </div>
                    <div className="text-slate-300 transition group-hover:text-blue-600">›</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ImageLightbox src={logoSrc} alt={`Logo ${settings.site_name}`} open={logoLightbox} onClose={() => setLogoLightbox(false)} closeAriaLabel="Tutup logo" />
    </div>
  );
}
