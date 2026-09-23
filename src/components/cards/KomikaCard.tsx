import type { Komika } from '@/lib/types';
import type { Router } from '@/lib/router';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { normalizeSpecialties } from '@/lib/format';

export function KomikaCard({ komika, router }: { komika: Komika; router: Router }) {
  const specialties = normalizeSpecialties(komika.specialties);

  return (
    <article
        onClick={() => router.navigate(`/komika/${komika.slug}`)}
        className="card card-hover group cursor-pointer overflow-hidden border-2 border-blue-200 bg-white shadow-[0_0_0_1px_rgba(59,130,246,0.16),0_10px_24px_rgba(59,130,246,0.14)]"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            router.navigate(`/komika/${komika.slug}`);
          }
        }}
      >
        <div className="relative overflow-hidden bg-slate-100">
          {komika.photo ? (
            <img src={komika.photo} alt={komika.stage_name} loading="lazy" className="pointer-events-none aspect-[4/4.5] w-full object-cover bg-slate-100 transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex aspect-[4/4.5] w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-50 text-3xl font-extrabold text-blue-600">
              {komika.stage_name.charAt(0)}
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="text-lg font-bold text-slate-900 transition group-hover:text-blue-700">{komika.stage_name}</h3>
          <div className="mt-2">
            <SocialIconButton instagram={komika.instagram_url} tiktok={komika.tiktok_url} youtube={komika.youtube_url} size="sm" />
          </div>
          {specialties.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {specialties.map((s) => (
                <span key={s} className="chip-neutral">{s}</span>
              ))}
            </div>
          )}
        </div>
      </article>
  );
}
