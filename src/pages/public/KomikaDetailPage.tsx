import { useEffect, useState } from 'react';
import type { Router } from '@/lib/router';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ShareButton } from '@/components/ui/ShareButton';

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
      const { data } = await supabase.from('komika').select('id, full_name, stage_name, slug, photo, bio, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at').eq('slug', slug).eq('published', true).maybeSingle();
      const k = data as Komika | null;
      setKomika(k);

      if (k) {
        const pageUrl = `${window.location.origin}/komika/${k.slug}`;
        setOgTags(
          `${k.stage_name} — Standupindo Cilegon`,
          `Kenali ${k.stage_name}, komika dari Standupindo Cilegon.`,
          k.photo ?? `${window.location.origin}/assets/images/Standupindo_CIlegon_Logo.jpeg`,
          pageUrl,
        );
      }
      setLoading(false);
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

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={komika.stage_name} />

      <div className="container-app py-6 sm:py-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(11,60,93,0.05)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
            <div className="overflow-hidden rounded-[22px] bg-slate-100 ring-1 ring-slate-200">
              {komika.photo ? (
                <button onClick={() => setLightbox(true)} aria-label={`Lihat foto ${komika.stage_name}`} className="block h-full w-full">
                  <img src={komika.photo} alt={komika.stage_name} className="aspect-[4/4.5] w-full object-cover transition-transform duration-500 hover:scale-105" />
                </button>
              ) : (
                <div className="flex aspect-[4/4.5] w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-50 text-5xl font-extrabold text-blue-600">
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

              {komika.specialties.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {komika.specialties.map((s) => <span key={s} className="chip">{s}</span>)}
                </div>
              )}

              {komika.bio && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Tentang</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line sm:text-base">{komika.bio}</p>
                </div>
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
