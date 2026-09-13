import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const COMMUNITY_OPTIONS_SOURCE = [
  'Umum',
  'Standupindo Kuningan', 'Standupindo Pekalongan', 'Standupindo Bekasi', 'Standupindo Bojong Gede', 'Standupindo Jombang', 'Standupindo Sorong', 'Standupindo Duri', 'Standupindo Pasuruan', 'Standupindo Kab. Tangerang', 'Standupindo Bone', 'Standupindo Balangan', 'Standupindo Bengkulu', 'Standupindo Malinau', 'Standupindo Cianjur', 'Standupindo Gowa', 'Standupindo Pati', 'Standupindo Bulungan', 'Standupindo Jakarta Pusat', 'Standupindo Malang', 'Standupindo Kediri', 'Standupindo Jakarta Timur', 'Standupindo Purwakarta', 'Standupindo Pandeglang', 'Standupindo Berau', 'Standupindo Bali', 'Standupindo Labuan Bajo', 'Standupindo Ciparay', 'Standupindo Solo', 'Standupindo Batam', 'Standupindo Jayapura', 'Standupindo Bogor Barat', 'Standupindo Merauke', 'Standupindo Banjar Patroman', 'Standupindo Serang', 'Standupindo Bandung Selatan', 'Standupindo Kudus', 'Standupindo Banjarnegara', 'Standupindo Jakarta Utara', 'Standupindo Lombok', 'Standupindo Palembang', 'Standupindo Probolinggo', 'Standupindo Sumedang', 'Standupindo Tanjung', 'Standupindo Subang', 'Standupindo Salatiga', 'Standupindo Rangkasbitung', 'Standupindo New York City', 'Standupindo Metro', 'Standupindo Ternate', 'Standupindo Blitar', 'Standupindo Ciamis', 'Standupindo Semarang', 'Standupindo Manado', 'Standupindo Purbalingga', 'Standupindo Jakarta Barat', 'Standupindo Jogja', 'Standupindo Magelang', 'Standupindo Jambi', 'Standupindo Kulon Progo', 'Standupindo Kendari', 'Standupindo Madiun', 'Standupindo Sampit', 'Standupindo Purwokerto', 'Standupindo Bandung', 'Standupindo Gresik', 'Standupindo Pekanbaru', 'Standupindo Rantauprapat', 'Standupindo Kendal', 'Standupindo Rembang', 'Standupindo Rimbo', 'Standupindo Klaten', 'Standupindo Bogor', 'Standupindo Tebing Tinggi', 'Standupindo Gorontalo', 'Standupindo Tangerang Selatan', 'Standupindo Tanbu', 'Standupindo Lombok Timur', 'Standupindo Sukabumi', 'Standupindo Majalengka', 'Standupindo Morowali', 'Standupindo Samarinda', 'Standupindo Dumai', 'Standupindo Parungpanjang', 'Standupindo Sidoarjo', 'Standupindo Kemenkeu', 'Standupindo Bojonegoro', 'Standupindo Purworejo', 'Standupindo Kab. Cilacap', 'Standupindo Cikarang', 'Standupindo Ambon', 'Standupindo Payakumbuh', 'Standupindo Timika', 'Standupindo Tokyo', 'Standupindo Jember', 'Standupindo Bitung', 'Standupindo Buton', 'Standupindo Sangatta', 'Standupindo Tegal', 'Standupindo Manokwari', 'Standupindo Jakarta Selatan', 'Standupindo Siantar', 'Standupindo Palangkaraya', 'Standupindo Tanjungpinang', 'Standupindo Wonosobo', 'Standupindo Balikpapan', 'Standupindo Tasikmalaya', 'Standupindo Cilegon', 'Standupindo Kuala Tungkal', 'Standupindo Palu',
] as const;

export const COMMUNITY_OPTIONS = [
  COMMUNITY_OPTIONS_SOURCE[0],
  ...COMMUNITY_OPTIONS_SOURCE.slice(1).sort((left, right) => left.localeCompare(right, 'id', { sensitivity: 'base' })),
];

interface CommunityComboboxProps {
  id: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export function CommunityCombobox({ id, value, onChange, required, placeholder, ariaLabel }: CommunityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    return query ? COMMUNITY_OPTIONS.filter((option) => option.toLowerCase().includes(query)) : [...COMMUNITY_OPTIONS];
  }, [value]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function selectOption(option: string) {
    onChange({ target: { value: option } } as ChangeEvent<HTMLInputElement>);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" aria-hidden="true" />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => { onChange(event); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          required={required}
          className="input-field !pr-11 !pl-10"
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={`${id}-options`}
          aria-expanded={open}
          autoComplete="off"
        />
        <button type="button" onClick={() => setOpen((current) => !current)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600" aria-label="Buka pilihan komunitas" aria-expanded={open}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180 text-blue-600' : ''}`} />
        </button>
      </div>

      {open && (
        <div id={`${id}-options`} role="listbox" className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeIndex === index ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'} ${value === option ? 'font-bold' : 'font-medium'}`}
            >
              <span className="truncate">{option}</span>
              {value === option && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
            </button>
          )) : (
            <p className="px-3 py-3 text-sm text-slate-500">Tidak ada pilihan yang cocok. Teks kamu tetap bisa digunakan.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CommunityOptions(_props: { id: string }) { return null; }