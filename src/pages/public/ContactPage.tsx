import { Instagram, MessageCircle, Youtube } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { waLink } from '@/lib/format';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.33 6.33 0 0 0-.86-.06A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 11.94-3V8.4a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.26-.83z" />
    </svg>
  );
}

interface SocialItem {
  label: string;
  href: string;
  ariaLabel: string;
  icon: ReactNode;
  nativeAppUrl?: string;
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function openYouTube(event: React.MouseEvent<HTMLAnchorElement>, webUrl: string): void {
  if (!isMobileDevice()) {
    event.preventDefault();
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  event.preventDefault();
  const nativeUrl = `youtube://www.youtube.com/@standupindocilegon`;
  window.location.href = nativeUrl;
  window.setTimeout(() => {
    if (!document.hidden) window.location.href = webUrl;
  }, 900);
}

export function ContactPage({ router, settings }: { router: Router; settings: SiteSettings }) {
  const itemsWithEmpty: (SocialItem | null)[] = [
    (settings.whatsapp_registration || settings.whatsapp_admin)
      ? {
          label: 'WhatsApp',
          href: waLink(settings.whatsapp_registration || settings.whatsapp_admin),
          ariaLabel: 'Hubungi Standupindo Cilegon melalui WhatsApp',
          icon: <MessageCircle className="h-8 w-8" strokeWidth={1.8} />,
        }
      : null,
    settings.instagram_url
      ? {
          label: 'Instagram',
          href: settings.instagram_url,
          ariaLabel: 'Kunjungi Instagram Standupindo Cilegon',
          icon: <Instagram className="h-8 w-8" strokeWidth={1.8} />,
        }
      : null,
    settings.tiktok_url
      ? {
          label: 'TikTok',
          href: settings.tiktok_url,
          ariaLabel: 'Kunjungi TikTok Standupindo Cilegon',
          icon: <TikTokIcon className="h-8 w-8" />,
        }
      : null,
    settings.youtube_url
      ? {
          label: 'YouTube',
          href: settings.youtube_url,
          ariaLabel: 'Kunjungi YouTube Standupindo Cilegon',
          icon: <Youtube className="h-8 w-8" strokeWidth={1.8} />,
          nativeAppUrl: settings.youtube_url,
        }
      : null,
  ];
  const items = itemsWithEmpty.filter((item): item is SocialItem => item !== null);

  const hasAffiliation = Boolean(
    settings.affiliation_name && settings.affiliation_website && settings.affiliation_logo_url,
  );

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Kontak & Sosial Media" />
      <div className="container-app py-10 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.12),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="rounded-[24px] border border-blue-100 bg-white/90 p-5 text-center shadow-[0_10px_25px_rgba(37,99,235,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Stay connected</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">Kontak & Sosial Media</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Temukan kabar terbaru dan hubungi Standupindo Cilegon melalui kanal resmi kami.</p>
            </div>

            {items.length > 0 && (
              <div className="mx-auto mt-4 grid max-w-xl grid-cols-2 gap-3 sm:gap-4">
              {items.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.ariaLabel}
                  onClick={item.nativeAppUrl ? (event) => openYouTube(event, item.nativeAppUrl as string) : undefined}
                  className="group flex min-h-[140px] flex-col items-center justify-center rounded-[20px] border border-slate-200 bg-white/90 px-4 py-6 text-center shadow-[0_8px_22px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-blue-100 hover:shadow-[0_12px_24px_rgba(29,94,219,0.08)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 shadow-inner ring-1 ring-blue-100 transition-colors group-hover:from-blue-200 group-hover:to-blue-100">
                    {item.icon}
                  </span>
                  <span className="mt-4 text-sm font-bold text-slate-900">{item.label}</span>
                </a>
              ))}
              </div>
            )}

            {hasAffiliation && (
              <section className="mt-6 border-t border-slate-200 pt-6 text-center" aria-labelledby="affiliation-title">
              <h2 id="affiliation-title" className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Bagian Dari</h2>
              <a
                href={settings.affiliation_website as string}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kunjungi website Standupindo"
                className="group mx-auto mt-6 inline-flex max-w-[250px] items-center justify-center rounded-xl p-3 transition hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <img
                  src={settings.affiliation_logo_url as string}
                  alt={settings.affiliation_name as string}
                  className="h-auto max-h-28 w-auto max-w-full object-contain transition duration-200 group-hover:scale-[1.02]"
                />
              </a>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
