import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { MATERIAL_DURATION_OPTIONS } from '@/lib/material-duration';

interface MaterialDurationInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  extraOption?: number | null;
}

export function MaterialDurationInput({ id, value, onChange, extraOption }: MaterialDurationInputProps) {
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState(288);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = extraOption != null && !MATERIAL_DURATION_OPTIONS.includes(extraOption)
    ? [...MATERIAL_DURATION_OPTIONS, extraOption].sort((left, right) => left - right)
    : MATERIAL_DURATION_OPTIONS;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const mobileMaxHeight = 148;
      const preferredHeight = Math.min(window.matchMedia('(max-width: 639px)').matches ? mobileMaxHeight : 288, window.innerHeight * 0.45);
      const roomBelow = window.innerHeight - bounds.bottom;
      const shouldOpenAbove = roomBelow < preferredHeight + 44 && bounds.top > roomBelow;
      const availableSpace = shouldOpenAbove ? bounds.top : roomBelow;
      setOpenAbove(shouldOpenAbove);
      setListMaxHeight(Math.max(72, Math.min(preferredHeight, availableSpace - 44)));
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    updatePosition();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !value) return;
    const selectedOption = listRef.current?.querySelector<HTMLElement>(`[data-duration="${CSS.escape(value)}"]`);
    selectedOption?.scrollIntoView({ block: 'nearest' });
  }, [open, value]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          id={id}
          className="input-field !px-3 !py-2 pr-20"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Belum ditentukan"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              listRef.current?.querySelector<HTMLButtonElement>('[data-duration]')?.focus();
            }
          }}
          aria-autocomplete="list"
          aria-controls={`${id}-options`}
          aria-expanded={open}
        />
        <span className="pointer-events-none absolute inset-y-0 right-10 flex items-center text-sm font-medium text-slate-400">menit</span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          aria-label={open ? 'Tutup pilihan durasi' : 'Buka pilihan durasi'}
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className={`absolute left-0 right-0 z-40 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] ${openAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`flex min-h-8 w-full items-center justify-between px-2.5 text-left text-xs transition ${value === '' ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <span>Belum ditentukan</span>{value === '' && <Check className="h-4 w-4" />}
          </button>
          <div id={`${id}-options`} ref={listRef} role="listbox" aria-label="Pilihan durasi dalam menit" style={{ maxHeight: `${listMaxHeight}px` }} className="overflow-y-auto overscroll-contain border-t border-slate-100 p-1">
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                role="option"
                aria-selected={value === String(minutes)}
                data-duration={minutes}
                onClick={() => { onChange(String(minutes)); setOpen(false); }}
                className={`flex min-h-7 w-full items-center justify-between rounded-lg px-2 text-left text-xs transition ${value === String(minutes) ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span>{minutes} menit</span>{value === String(minutes) && <Check className="h-4 w-4 text-blue-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
