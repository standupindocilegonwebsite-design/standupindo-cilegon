import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface AdminFormSelectProps {
  id: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function AdminFormSelect({ id, value, options, onChange, ariaLabel }: AdminFormSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? 'Pilih';

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        id={id}
        type="button"
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 sm:px-4 ${open ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-300 hover:border-blue-400'}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180 text-blue-700' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.2)]">
          <div role="listbox" aria-label={ariaLabel}>
            {options.map(([optionValue, label]) => {
              const selected = value === optionValue;
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(optionValue);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span>{label}</span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-blue-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
