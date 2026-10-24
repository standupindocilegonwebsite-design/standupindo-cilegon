import { useState } from 'react';
import { ChevronDown, ExternalLink, MapPin } from 'lucide-react';
import { LocationLink } from '@/components/ui/LocationLink';

interface Props {
  venue: string;
  location: string;
  mapsUrl?: string | null;
  title: string;
  completed: boolean;
  className?: string;
  locationClassName?: string;
}

export function LocationMapPanel({ venue, location, mapsUrl, title, completed, className = '', locationClassName = '' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent([venue, location].filter(Boolean).join(', '))}&output=embed`;

  if (!mapsUrl) {
    return (
      <LocationLink
        venue={venue}
        location={location}
        mapsUrl={mapsUrl}
        className={locationClassName}
      />
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <MapPin className="h-4 w-4 shrink-0 text-blue-700" />
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Buka lokasi di Google Maps" title="Buka lokasi di Google Maps" className="group flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-extrabold leading-5 text-slate-950">{venue}</span>
            <span className="block truncate font-semibold leading-5 text-slate-800">{location}</span>
          </span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
        {!completed && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-label={expanded ? 'Sembunyikan peta lokasi' : 'Tampilkan peta lokasi'}
            aria-expanded={expanded}
            aria-controls="event-location-map"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span>Maps</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {!completed && (
        <div id="event-location-map" hidden={!expanded} className="border-t border-slate-100 p-2.5">
          {expanded && (
            <iframe
              title={`Peta lokasi ${title}`}
              src={embedUrl}
              className="h-64 w-full rounded-xl border-0 sm:h-80"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          )}
        </div>
      )}
    </div>
  );
}
