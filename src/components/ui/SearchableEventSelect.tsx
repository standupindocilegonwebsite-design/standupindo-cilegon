import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

interface EventOption {
  id: string;
  title: string;
  subtitle?: string;
  poster?: string | null;
}

interface SearchableEventSelectProps {
  options: EventOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  ariaLabel: string;
}

export function SearchableEventSelect({ options, value, onChange, allLabel, ariaLabel }: SearchableEventSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.id === value);
  const selectedLabel = value === 'all' ? allLabel : selectedOption?.title ?? allLabel;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
    return options.filter((option) => !normalizedQuery
      || `${option.title} ${option.subtitle ?? ''}`.toLocaleLowerCase('id-ID').includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 sm:px-4 ${open ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-300 hover:border-blue-400'}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {selectedOption?.poster && <img src={selectedOption.poster} alt="" className="h-10 w-9 shrink-0 rounded-lg border border-slate-200 object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">{selectedLabel}</span>
          {selectedOption?.subtitle && <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{selectedOption.subtitle}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.2)]">
        <div className="border-b border-slate-100 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredOptions.length === 1) {
                  event.preventDefault();
                  choose(filteredOptions[0].id);
                }
              }}
              placeholder="Ketik nama Event..."
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15"
              aria-label={`Cari ${ariaLabel.toLocaleLowerCase('id-ID')}`}
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto overscroll-contain p-1.5" role="listbox" aria-label={ariaLabel}>
          <button
            type="button"
            role="option"
            aria-selected={value === 'all'}
            onClick={() => choose('all')}
            className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${value === 'all' ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <span>{allLabel}</span>{value === 'all' && <Check className="h-4 w-4 shrink-0" />}
          </button>
          {filteredOptions.map((option) => <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={value === option.id}
            onClick={() => choose(option.id)}
            className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition ${value === option.id ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            {option.poster
              ? <img src={option.poster} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" />
              : <span aria-hidden="true" className="h-12 w-10 shrink-0 rounded-lg border border-slate-200 bg-slate-100" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.title}</span>
              {option.subtitle && <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{option.subtitle}</span>}
            </span>{value === option.id && <Check className="h-4 w-4 shrink-0" />}
          </button>)}
          {!filteredOptions.length && <p className="px-3 py-4 text-center text-xs font-medium text-slate-500">Event tidak ditemukan.</p>}
        </div>
      </div>}
    </div>
  );
}
