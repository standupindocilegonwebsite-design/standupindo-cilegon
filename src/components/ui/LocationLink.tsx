import { MapPin } from 'lucide-react';

interface LocationLinkProps {
  venue: string;
  location: string;
  mapsUrl?: string | null;
  className?: string;
}

export function LocationLink({ venue, location, mapsUrl, className = '' }: LocationLinkProps) {
  const content = (
    <>
      <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-700">{venue}</span>
        <span className="block truncate font-medium text-slate-700">{location}</span>
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
      className={`group flex items-start gap-2 text-sm transition hover:text-blue-700 ${className}`}
    >
      {content}
    </a>
  );
}
