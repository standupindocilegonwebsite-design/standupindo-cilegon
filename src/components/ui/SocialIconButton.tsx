import { Instagram, Youtube } from 'lucide-react';

interface Props {
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  size?: 'sm' | 'md';
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.33 6.33 0 0 0-.86-.06A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 11.94-3V8.4a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.26-.83z" />
    </svg>
  );
}

export function SocialIconButton({ instagram, tiktok, youtube, size = 'md' }: Props) {
  const sz = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const items: { url: string; label: string; icon: React.ReactNode; className: string }[] = [];
  if (instagram) items.push({ url: instagram, label: 'Instagram', icon: <Instagram className={sz} />, className: 'bg-pink-100 text-pink-600 hover:bg-pink-500 hover:text-white' });
  if (tiktok) items.push({ url: tiktok, label: 'TikTok', icon: <TikTokIcon className={sz} />, className: 'bg-slate-200 text-slate-800 hover:bg-slate-800 hover:text-white' });
  if (youtube) items.push({ url: youtube, label: 'YouTube', icon: <Youtube className={sz} />, className: 'bg-red-100 text-red-600 hover:bg-red-600 hover:text-white' });

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={it.label}
          className={`${box} inline-flex items-center justify-center rounded-full transition-all ${it.className}`}
        >
          {it.icon}
        </a>
      ))}
    </div>
  );
}
