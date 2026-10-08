import type { Komika } from '@/lib/types';
import type { Router } from '@/lib/router';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { normalizeSpecialties } from '@/lib/format';

export function KomikaCard({ komika, router }: { komika: Komika; router: Router }) {
  const specialties = normalizeSpecialties(komika.specialties);
  const cardPhoto = komika.photo_card || komika.photo;

  return (
    <article
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) return;
        router.navigate(`/komika/${komika.slug}`);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.navigate(`/komika/${komika.slug}`);
        }
      }}
      className="komika-card-light-leak group relative isolate aspect-[3/5] min-w-0 cursor-pointer overflow-hidden rounded-[22px] border-[3px] border-violet-200/80 bg-slate-900 shadow-[inset_2px_0_8px_rgba(255,255,255,0.55),inset_-2px_0_10px_rgba(192,132,252,0.62),inset_0_-3px_12px_rgba(167,139,250,0.48),0_0_12px_rgba(168,85,247,0.28),0_10px_22px_rgba(76,29,149,0.2)] ring-1 ring-violet-300/60 transition-[transform,box-shadow] duration-300 active:scale-[0.98] hover:-translate-y-1 hover:shadow-[inset_2px_0_10px_rgba(255,255,255,0.68),inset_-2px_0_12px_rgba(216,180,254,0.74),inset_0_-3px_14px_rgba(196,181,253,0.58),0_0_20px_rgba(168,85,247,0.52),0_16px_30px_rgba(76,29,149,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      role="button"
      tabIndex={0}
      aria-label={`Lihat profil ${komika.stage_name}`}
    >
      {cardPhoto ? (
        <img
          src={cardPhoto}
          alt={komika.stage_name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-300 via-blue-600 to-indigo-950 text-6xl font-black text-white">
          {komika.stage_name.charAt(0)}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(30,64,175,0.02)_18%,rgba(29,78,216,0.2)_48%,rgba(30,58,138,0.82)_72%,rgba(15,23,80,0.98)_100%)]" />

      <div className="absolute inset-x-0 bottom-0 min-w-0 p-3 text-white sm:p-4">
        <h3 className="line-clamp-2 break-words text-lg font-black leading-tight tracking-[-0.025em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-xl">
          {komika.stage_name}
        </h3>
        <div className="mt-2 scale-90 origin-left [&_a]:drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">
          <SocialIconButton instagram={komika.instagram_url} tiktok={komika.tiktok_url} youtube={komika.youtube_url} size="sm" iconOnly />
        </div>
        {specialties.length > 0 && (
          <div className="mt-2 border-t border-blue-200/30 pt-2 text-[11px] font-semibold leading-relaxed text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.9)] sm:text-sm">
            {specialties.join(' · ')}
          </div>
        )}
      </div>
    </article>
  );
}
