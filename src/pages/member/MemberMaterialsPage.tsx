import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Clock3, ListPlus, Plus, Search, SearchX, SlidersHorizontal, Star, TimerReset } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Material } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const THEMES = ['Observasi', 'Percintaan', 'Keluarga', 'Pekerjaan', 'Kehidupan', 'Politik', 'Random', 'Lainnya'];

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function MemberMaterialsPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const isCreatePage = router.path === '/member/materials/new';
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState('all');
  const [themeFilterSearch, setThemeFilterSearch] = useState('');
  const [duration, setDuration] = useState('all');
  const [rating, setRating] = useState('all');
  const [showForm, setShowForm] = useState(isCreatePage);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState<'theme' | 'duration' | 'rating' | null>(null);
  const [form, setForm] = useState({ title: '', theme: '', estimated_duration: '', content: '' });
  const [error, setError] = useState('');

  async function loadMaterials() {
    if (!user?.id) return;
    setLoading(true);
    const { data, error: loadError } = await supabase.from('materials').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (loadError) setError('Materi belum dapat dimuat. Pastikan migration Buku Materi sudah dijalankan.');
    setMaterials((data as Material[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadMaterials(); }, [user?.id]);

  const filteredMaterials = useMemo(() => materials.filter((material) => {
    const query = search.trim().toLowerCase();
    const ratingText = material.rating ? `${material.rating} ${material.rating}/5 rating ${material.rating}/5` : 'belum dirating belum dinilai tanpa rating';
    const matchesSearch = !query || `${material.title} ${material.theme} ${material.content} ${ratingText}`.toLowerCase().includes(query);
    const matchesTheme = theme === 'all' || material.theme === theme;
    const matchesDuration = duration === 'all' || (duration === 'short' ? material.estimated_duration <= 5 : material.estimated_duration > 5);
    const matchesRating = rating === 'all' || (rating === 'unrated' ? !material.rating : material.rating === Number(rating));
    return matchesSearch && matchesTheme && matchesDuration && matchesRating;
  }), [duration, materials, rating, search, theme]);

  const availableThemes = useMemo(() => {
    const customThemes = materials.map((material) => material.theme.trim()).filter(Boolean);
    return Array.from(new Set([...THEMES, ...customThemes])).sort((a, b) => a.localeCompare(b, 'id'));
  }, [materials]);

  const matchingThemes = useMemo(() => {
    const query = form.theme.trim().toLowerCase();
    return availableThemes.filter((item) => !query || item.toLowerCase().includes(query));
  }, [availableThemes, form.theme]);

  function getEmptyState() {
    if (materials.length === 0) {
      return {
        icon: BookOpen,
        title: 'Belum ada materi sama sekali',
        description: 'Katanya komika, tapi isi bukunya cuma harapan.',
      };
    }
    if (search.trim()) {
      return {
        icon: SearchX,
        title: 'Hasil pencarian tidak ditemukan',
        description: 'Nggak ketemu. Kayaknya materi ini cuma ada di imajinasi.',
      };
    }
    if (rating !== 'all') {
      return {
        icon: Star,
        title: 'Filter rating tidak menemukan hasil',
        description: 'Nggak ada yang dapat rating segini. Kejam juga penontonnya.',
      };
    }
    if (duration !== 'all') {
      return {
        icon: TimerReset,
        title: 'Belum ada materi untuk durasi ini',
        description: 'Mau tampil singkat, tapi materinya belum sempat lahir.',
      };
    }
    return {
      icon: SlidersHorizontal,
      title: 'Belum ada materi yang cocok',
      description: 'Coba ubah filter-nya, siapa tahu punchline-nya nyasar.',
    };
  }

  function FilterDropdown({ kind, value, options, onChange, ratingOptions = false }: { kind: 'theme' | 'duration' | 'rating'; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ratingOptions?: boolean }) {
    const isOpen = filterMenuOpen === kind;
    const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label;
    const visibleOptions = kind === 'theme' && themeFilterSearch.trim() ? options.filter((option) => option.label.toLowerCase().includes(themeFilterSearch.trim().toLowerCase()) || option.value === 'all') : options;
    return (
      <div className="relative">
        <button type="button" onClick={() => setFilterMenuOpen(isOpen ? null : kind)} className={`input-field flex w-full items-center justify-between text-left ${isOpen ? 'border-blue-500 ring-2 ring-blue-100' : ''}`} aria-expanded={isOpen}>
          <span className="flex min-w-0 items-center truncate">{ratingOptions && value !== 'all' && value !== 'unrated' ? <span className="mr-2 shrink-0 tracking-wide text-amber-400">{'★'.repeat(Number(value))}{'☆'.repeat(5 - Number(value))}</span> : null}<span className={`truncate ${kind === 'theme' ? 'uppercase' : ''}`}>{selectedLabel}</span></span>
          <span className={`ml-3 shrink-0 text-xs text-slate-500 transition-transform ${isOpen ? 'rotate-180 text-blue-700' : ''}`}>▼</span>
        </button>
        {isOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
          {kind === 'theme' && <div className="relative mb-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus className="input-field h-10 pl-9 text-sm" placeholder="Cari tema..." value={themeFilterSearch} onChange={(event) => setThemeFilterSearch(event.target.value)} /></div>}
          {visibleOptions.map((option) => <button type="button" key={option.value} onClick={() => { onChange(option.value); setThemeFilterSearch(''); setFilterMenuOpen(null); }} className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${value === option.value ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}>{ratingOptions && option.value !== 'all' && option.value !== 'unrated' ? <span className="mr-2 tracking-wide text-amber-400">{'★'.repeat(Number(option.value))}{'☆'.repeat(5 - Number(option.value))}</span> : null}<span className={kind === 'theme' ? 'uppercase' : ''}>{option.label}</span></button>)}
          {!visibleOptions.length && <p className="px-3 py-2.5 text-sm text-slate-500">Tema tidak ditemukan.</p>}
        </div>}
      </div>
    );
  }

  async function saveMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.id) return;
    if (!form.title.trim() || !form.theme || !form.estimated_duration || !form.content.trim()) {
      setError('Judul, tema, durasi, dan materi wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('materials').insert({
      user_id: user.id,
      title: form.title.trim().toUpperCase(),
      theme: form.theme.trim().toUpperCase(),
      estimated_duration: Number(form.estimated_duration),
      content: form.content.trim(),
    });
    setSaving(false);
    if (saveError) {
      setError('Materi gagal disimpan. Pastikan migration Buku Materi sudah dijalankan.');
      return;
    }
    setForm({ title: '', theme: '', estimated_duration: '', content: '' });
    setThemeMenuOpen(false);
    if (isCreatePage) {
      await loadMaterials();
      setShowForm(false);
      router.navigate('/member/materials');
      return;
    }
    setShowForm(false);
    await loadMaterials();
  }

  return (
    <div className="animate-fade-in">
      {isCreatePage ? (
        <div className="border-b-2 border-blue-100 bg-white">
          <div className="container-app py-5">
            <button type="button" onClick={() => router.navigate('/member/materials')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 transition hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Kembali ke Buku Materi</button>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Tambah Materi</h1>
            <p className="mt-1.5 text-sm font-medium text-slate-600 sm:text-base">Simpan materi baru ke Buku Materi pribadi kamu.</p>
          </div>
        </div>
      ) : <PageHeader router={router} title="Buku Materi" subtitle="Kumpulan materi pribadi kamu." />}
      <div className="container-app space-y-5 py-6 sm:py-8">
        {!isCreatePage && <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Member Area</p><h1 className="mt-1 text-2xl font-black text-slate-950">Buku Materi</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.navigate('/member/materials/setlists')} className="btn-secondary !h-11 !w-11 !rounded-2xl !p-0" aria-label="Setlist materi"><ListPlus className="h-5 w-5" /></button>
            <button type="button" onClick={() => router.navigate('/member/materials/new')} className="btn-primary !h-11 !w-11 !rounded-2xl !p-0" aria-label="Tambah materi"><Plus className="h-5 w-5" /></button>
          </div>
        </div>}

        {(showForm || isCreatePage) && (
          <form onSubmit={saveMaterial} className="rounded-[26px] border border-blue-100 bg-blue-50/60 p-4 shadow-[0_10px_28px_rgba(37,99,235,0.08)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-extrabold text-slate-950">Tambah Materi</h2></div>
            <div className="space-y-4">
              <input className="input-field uppercase" placeholder="Judul materi" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value.toUpperCase() })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative">
                  <label htmlFor="material-theme" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Tema materi</label>
                  <div className="relative">
                    <input id="material-theme" className="input-field pr-10 uppercase" placeholder="Ketik atau pilih tema" value={form.theme} onFocus={() => setThemeMenuOpen(true)} onBlur={() => window.setTimeout(() => setThemeMenuOpen(false), 120)} onChange={(event) => { setForm({ ...form, theme: event.target.value.toUpperCase() }); setThemeMenuOpen(true); }} />
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setThemeMenuOpen((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-blue-700" aria-label="Buka pilihan tema"><span className={`text-xs transition-transform ${themeMenuOpen ? 'rotate-180' : ''}`}>▼</span></button>
                  </div>
                  {themeMenuOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                    {matchingThemes.map((item) => <button type="button" key={item} onMouseDown={(event) => event.preventDefault()} onClick={() => { setForm({ ...form, theme: item.toUpperCase() }); setThemeMenuOpen(false); }} className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold uppercase text-slate-700 transition hover:bg-blue-50 hover:text-blue-700">{item}</button>)}
                    {form.theme.trim() && !availableThemes.some((item) => item.toLowerCase() === form.theme.trim().toLowerCase()) && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setThemeMenuOpen(false)} className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-slate-100 px-3 py-2.5 text-left text-sm font-bold uppercase text-blue-700"><Plus className="h-4 w-4" /> Gunakan “{form.theme.trim()}”</button>}
                    {!matchingThemes.length && !form.theme.trim() && <p className="px-3 py-2.5 text-sm text-slate-500">Belum ada tema tersimpan.</p>}
                  </div>}
                  <p className="mt-1.5 text-xs text-slate-500">Tema baru yang kamu simpan akan menjadi pilihan pribadi di sini.</p>
                </div>
                <input className="input-field" type="number" min="1" placeholder="Estimasi durasi (menit)" value={form.estimated_duration} onChange={(event) => setForm({ ...form, estimated_duration: event.target.value })} />
              </div>
              <textarea className="input-field !min-h-[180px]" placeholder="Tulis materi kamu..." value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
              <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Menyimpan...' : 'Simpan Materi'}</button>
            </div>
          </form>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

        {!isCreatePage && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_180px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" placeholder="Cari judul materi..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <FilterDropdown kind="theme" value={theme} onChange={setTheme} options={[{ value: 'all', label: 'Semua Tema' }, ...availableThemes.map((item) => ({ value: item, label: item }))]} />
          <FilterDropdown kind="duration" value={duration} onChange={setDuration} options={[{ value: 'all', label: 'Semua Durasi' }, { value: 'short', label: 'Sampai 5 menit' }, { value: 'long', label: 'Di atas 5 menit' }]} />
          <FilterDropdown kind="rating" value={rating} onChange={setRating} ratingOptions options={[{ value: 'all', label: 'Semua Rating' }, { value: '5', label: '5 bintang' }, { value: '4', label: '4 bintang' }, { value: '3', label: '3 bintang' }, { value: '2', label: '2 bintang' }, { value: '1', label: '1 bintang' }, { value: 'unrated', label: 'Belum dirating' }]} />
        </div>}

        {!isCreatePage && (loading ? <div className="h-28 animate-pulse rounded-2xl bg-slate-100" /> : filteredMaterials.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-7 text-center sm:p-8">{(() => { const emptyState = getEmptyState(); const EmptyIcon: LucideIcon = emptyState.icon; return <><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true"><EmptyIcon className="h-5 w-5" strokeWidth={1.8} /></span><p className="mt-3 font-bold text-slate-800">{emptyState.title}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{emptyState.description}</p>{materials.length === 0 && <p className="mt-2 text-xs text-slate-400">Tekan tombol + untuk menyimpan materi pertamamu.</p>}</>; })()}</div>
        ) : (
          <div className="grid gap-3">
            {filteredMaterials.map((material) => <button type="button" key={material.id} onClick={() => router.navigate(`/member/materials/${material.id}`)} className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:px-4"><div className="min-w-0"><p className="truncate text-[9px] font-extrabold uppercase tracking-[0.14em] text-blue-700 uppercase">{material.theme}</p><h2 className="mt-0.5 line-clamp-2 break-words text-base font-extrabold leading-snug text-slate-950 uppercase sm:text-lg">{material.title}</h2></div><div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[11px] font-semibold text-slate-500"><div className="flex min-w-0 items-center gap-2"><span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"><Clock3 className="h-3.5 w-3.5 text-blue-600" /> ±{material.estimated_duration} mnt</span><span className="inline-flex shrink-0 items-center gap-0.5" aria-label={material.rating ? `Rating ${material.rating} dari 5` : 'Belum dirating'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-3.5 w-3.5 ${material.rating && value <= material.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}</span></div><span className="min-w-0 truncate text-right text-[10px] font-normal text-slate-400">Diperbarui {formatUpdated(material.updated_at)}</span></div></button>)}
          </div>
        ))}
      </div>
    </div>
  );
}
