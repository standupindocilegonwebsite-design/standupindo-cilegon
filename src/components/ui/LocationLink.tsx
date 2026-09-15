import { ExternalLink, MapPin } from 'lucide-react';

interface LocationLinkProps {
  venue: string;
  location: string;
  mapsUrl?: string | null;
  className?: string;
}

export function LocationLink({ venue, location, mapsUrl, className = '' }: LocationLinkProps) {
  const content = (
    <>
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
      <span className="min-w-0">
        <span className="block truncate font-extrabold leading-5 text-slate-950 transition-colors group-hover:text-blue-800">{venue}</span>
        <span className="block truncate font-semibold leading-5 text-slate-800">{location}</span>
      </span>
    </>
  );

  if (!mapsUrl) {
    return <div className={`flex items-start gap-2 text-sm ${className}`}>{content}</div>;
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buka lokasi di Google Maps"
      title="Buka lokasi di Google Maps"
      className={`group flex max-w-full items-start gap-2 rounded-xl border border-blue-200/80 bg-white px-2.5 py-2 text-sm shadow-sm transition hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-md ${className}`}
    >
      {content}
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}
