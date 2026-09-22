import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ShareButton } from '@/components/ui/ShareButton';
import { normalizeSpecialties, safeExternalUrl } from '@/lib/format';

interface Props {
  router: Router;
  slug: string;
}

function setOgTags(title: string, description: string, image: string, url: string) {
  const set = (prop: string, val: string) => {
    let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  set('og:title', title);
  set('og:description', description);
  set('og:image', image);
  set('og:url', url);
}

export function KomikaDetailPage({ router, slug }: Props) {
  const [loading, setLoading] = useState(true);
  const [komika, setKomika] = useState<Komika | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: slugData } = await supabase
          .from('komika')
          .select('id, full_name, stage_name, slug, photo, bio, karya_url, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at')
          .eq('slug', slug);

        let k = (slugData as Komika[] | null)?.find((item) => item.slug === slug) ?? null;

        if (!k) {
          const { data: fallbackData } = await supabase
            .from('komika')
            .select('id, full_name, stage_name, slug, photo, bio, karya_url, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at')
            .limit(200);

          const rows = (fallbackData as Komika[] | null) ?? [];
          k = rows.find((item) => item.slug === slug && item.published && item.status === 'active') ?? null;
        }

        if (!k || k.published !== true || k.status !== 'active') {
          setKomika(null);
          setLoading(false);
          return;
        }

        setKomika(k);

        const pageUrl = `${window.location.origin}/komika/${k.slug}`;
        setOgTags(
          `${k.stage_name} — Standupindo Cilegon`,
          `Kenali ${k.stage_name}, komika dari Standupindo Cilegon.`,
          k.photo ?? `${window.location.origin}/assets/images/Standupindo_CIlegon_Logo.jpeg`,
          pageUrl,
        );
      } catch (error) {
        console.error('KomikaDetailPage query crashed', error);
        setKomika(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!komika) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Komika tidak ditemukan" />
        <div className="container-app py-8"><EmptyState title="Komika tidak ditemukan" /></div>
      </div>
    );
  }

  const pageUrl = `${window.location.origin}/komika/${komika.slug}`;
  const karyaUrl = safeExternalUrl(komika.karya_url);
  const specialties = normalizeSpecialties(komika.specialties);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={komika.stage_name} />

      <div className="container-app py-6 sm:py-8">
        <div data-scroll-reveal className="scroll-reveal rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(11,60,93,0.05)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
            <div className="max-h-[16rem] overflow-hidden rounded-[22px] bg-slate-100 ring-1 ring-slate-200 sm:max-h-[20rem] lg:max-h-none">
              {komika.photo ? (
                <button onClick={() => setLightbox(true)} aria-label={`Lihat foto ${komika.stage_name}`} className="block h-full w-full">
                  <img src={komika.photo} alt={komika.stage_name} className="aspect-[4/3] max-h-[16rem] w-full object-contain bg-slate-100 transition-transform duration-500 hover:scale-105 sm:aspect-[4/4.5] sm:max-h-[20rem] lg:max-h-none" />
                </button>
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-50 text-5xl font-extrabold text-blue-600 sm:aspect-[4/4.5]">
                  {komika.stage_name.charAt(0)}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Komika</p>
                  <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-slate-900 sm:text-3xl">{komika.stage_name}</h1>
                </div>
                <ShareButton
                  title={`${komika.stage_name} — Standupindo Cilegon`}
                  text={`Kenali ${komika.stage_name}, komika dari Standupindo Cilegon.`}
                  url={pageUrl}
                  image={komika.photo}
                  className="!rounded-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <SocialIconButton instagram={komika.instagram_url} tiktok={komika.tiktok_url} youtube={komika.youtube_url} />
              </div>

              {specialties.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {specialties.map((s) => <span key={s} className="chip">{s}</span>)}
                </div>
              )}

              {komika.bio && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Tentang</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line sm:text-base">{komika.bio}</p>
                </div>
              )}

              {karyaUrl && (
                <a
                  href={karyaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-3.5 shadow-[0_8px_20px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_12px_24px_rgba(37,99,235,0.14)] sm:p-4"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_6px_14px_rgba(37,99,235,0.25)]">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-600">Karya Saya</span>
                      <span className="mt-0.5 block truncate text-sm font-extrabold text-slate-900 sm:text-base">Lihat Karyaku</span>
                    </span>
                  </span>
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-blue-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {komika.photo && (
        <ImageLightbox src={komika.photo} alt={komika.stage_name} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
