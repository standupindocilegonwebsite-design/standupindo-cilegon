import { useEffect, useState } from 'react';
import { Handshake, ArrowRight } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Partner, SiteSettings } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { waLink } from '@/lib/format';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { supabase } from '@/lib/supabase';

const TYPES = [
  'Sponsorship',
  'Brand Collaboration',
  'Event Collaboration',
  'Venue Partnership',
  'Media Partnership',
];

function PartnerMarqueeStrip({ partners, category }: { partners: Partner[]; category: 'sponsor' | 'support' | 'media_partner' }) {
  if (partners.length === 0) return null;

  const labels = {
    sponsor: 'Sponsor',
    support: 'Support',
    media_partner: 'Media Partner',
  } as const;

  const sizeMap = {
    sponsor: {
      logo: 'h-20 w-20 sm:h-24 sm:w-24',
      item: 'min-w-[170px] sm:min-w-[210px]',
      name: 'text-base',
    },
    support: {
      logo: 'h-14 w-14 sm:h-16 sm:w-16',
      item: 'min-w-[140px] sm:min-w-[170px]',
      name: 'text-sm',
    },
    media_partner: {
      logo: 'h-12 w-12 sm:h-14 sm:w-14',
      item: 'min-w-[130px] sm:min-w-[150px]',
      name: 'text-xs',
    },
  } as const;

  const leading = partners.length > 1 ? [...partners, ...partners] : partners;

  return (
    <div className="rounded-[28px] border border-white/50 bg-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-sm sm:p-4">
      <div className="mb-3 flex items-center justify-center">
        <span className="rounded-full border border-white/50 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700 sm:text-[11px]">
          {labels[category]}
        </span>
      </div>

      <div className="partner-marquee-shell">
        <div className="partner-marquee-track">
          {leading.map((partner, index) => (
            <div key={`${partner.id}-${category}-${index}`} className={`partner-marquee-item ${sizeMap[category].item}`}>
              <div className={`partner-marquee-logo ${sizeMap[category].logo}`}>
                {partner.logo_url ? (
                  <img src={partner.logo_url} alt={partner.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-black text-slate-600 sm:text-xs">{partner.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <p className={`partner-marquee-name ${sizeMap[category].name}`}>{partner.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PartnershipPage({ router, settings }: { router: Router; settings: SiteSettings }) {
  const [logoLightbox, setLogoLightbox] = useState(false);
  const [partnersByCategory, setPartnersByCategory] = useState<Record<'sponsor' | 'support' | 'media_partner', Partner[]>>({ sponsor: [], support: [], media_partner: [] });
  const message = 'Halo Admin Standupindo Cilegon, saya ingin mengajukan kerja sama.';
  const logoSrc = settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg';

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('partners')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      const grouped: Record<'sponsor' | 'support' | 'media_partner', Partner[]> = { sponsor: [], support: [], media_partner: [] };
      (data as Partner[] | null)?.forEach((partner) => {
        grouped[partner.category].push(partner);
      });

      setPartnersByCategory(grouped);
    })();
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Kerja Sama" />
      <div className="container-app py-10">
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_35%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-[0_10px_25px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="flex items-center gap-4">
                <button onClick={() => setLogoLightbox(true)} aria-label="Lihat logo Standupindo Cilegon" className="group relative block shrink-0">
                  <div className="absolute -inset-1 rounded-[24px] bg-gradient-to-br from-blue-200/80 to-yellow-100/80 blur-sm opacity-80" />
                  <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-[0_12px_28px_rgba(29,94,219,0.1)] transition-transform duration-200 group-hover:scale-[1.02]">
                    <img src={logoSrc} alt={`Logo ${settings.site_name}`} className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Partnership</p>
                  <h1 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900 sm:text-2xl">
                    {settings.site_name}
                  </h1>
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 shadow-inner ring-1 ring-blue-100">
                  <Handshake className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 rounded-[20px] bg-slate-50 p-4 sm:p-5">
                <h2 className="text-lg font-black tracking-[-0.03em] text-slate-900">
                  Mari berkolaborasi dengan komunitas kami.
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">
                  Kami terbuka untuk berbagai bentuk kerja sama yang positif dan saling menguntungkan. Hubungi kami untuk menjajaki peluang kolaborasi.
                </p>
              </div>

              <div className="mt-6">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Potensi Kerja Sama</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TYPES.map((t) => <span key={t} className="chip">{t}</span>)}
                </div>
              </div>

              <div className="mt-8 space-y-4">
                {(['sponsor', 'support', 'media_partner'] as const).map((category) => (
                  <PartnerMarqueeStrip key={category} partners={partnersByCategory[category]} category={category} />
                ))}
              </div>

              <a href={waLink(settings.whatsapp_partnership || settings.whatsapp_admin, message)} target="_blank" rel="noopener noreferrer" className="btn-primary mt-8 w-full !py-3.5 text-base">
                Hubungi Kami <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={logoSrc} alt={`Logo ${settings.site_name}`} open={logoLightbox} onClose={() => setLogoLightbox(false)} closeAriaLabel="Tutup logo" />
    </div>
  );
}
