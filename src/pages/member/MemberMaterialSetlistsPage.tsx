import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, Clock3, Download, FileText, FileType2, ListPlus, Moon, Pencil, Plus, Search, Star, Sun, Trash2, X, AlertTriangle } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Material, MaterialSetlist, MaterialSetlistItem } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { parseMaterialContent } from '@/lib/material-content';
import { PageHeader } from '@/components/PageHeader';
import { downloadSetlistDocx, downloadSetlistPdf } from '@/lib/material-setlist-export';

export function MemberMaterialSetlistsPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [setlists, setSetlists] = useState<MaterialSetlist[]>([]);
  const [setlistItems, setSetlistItems] = useState<Record<string, MaterialSetlistItem[]>>({});
  const [expandedSetlist, setExpandedSetlist] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const [setlistSearch, setSetlistSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingSetlistId, setEditingSetlistId] = useState<string | null>(null);
  const [readingSetlist, setReadingSetlist] = useState<MaterialSetlist | null>(null);
  const [readingTheme, setReadingTheme] = useState<'light' | 'dark'>('light');
  const [exportSetlist, setExportSetlist] = useState<MaterialSetlist | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaterialSetlist | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ setlistId: string; itemId: string } | null>(null);

  async function loadData() {
    if (!user?.id) return;
    setLoading(true);
    const [materialsResult, setlistsResult, itemsResult] = await Promise.all([
      supabase.from('materials').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('material_setlists').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('material_setlist_items').select('*, material:materials(*)').order('sort_order', { ascending: true }),
    ]);
    if (materialsResult.error || setlistsResult.error || itemsResult.error) setError('Setlist belum dapat dimuat. Pastikan migration Setlist sudah dijalankan.');
    setMaterials((materialsResult.data as Material[]) ?? []);
    setSetlists((setlistsResult.data as MaterialSetlist[]) ?? []);
    const grouped = ((itemsResult.data as MaterialSetlistItem[]) ?? []).reduce<Record<string, MaterialSetlistItem[]>>((result, item) => {
      result[item.setlist_id] = [...(result[item.setlist_id] ?? []), item];
      return result;
    }, {});
    setSetlistItems(grouped);
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, [user?.id]);
  const selectedDuration = useMemo(() => materials.filter((material) => selected.includes(material.id)).reduce((total, material) => total + material.estimated_duration, 0), [materials, selected]);
  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    if (!query) return materials;
    return materials.filter((material) => `${material.title} ${material.theme} ${material.content}`.toLowerCase().includes(query));
  }, [materials, materialSearch]);
  const dropdownMaterials = useMemo(() => {
    if (materialSearch.trim()) return filteredMaterials;
    return filteredMaterials.filter((material) => !selected.includes(material.id));
  }, [filteredMaterials, materialSearch, selected]);
  const filteredSetlists = useMemo(() => {
    const query = setlistSearch.trim().toLowerCase();
    if (!query) return setlists;
    return setlists.filter((setlist) => setlist.name.toLowerCase().includes(query));
  }, [setlists, setlistSearch]);

  async function createSetlist(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.id || !name.trim() || selected.length === 0) {
      setError('Nama setlist dan minimal satu materi wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    const targetSetlistId = editingSetlistId;
    const { data, error: setlistError } = targetSetlistId
      ? { data: { id: targetSetlistId }, error: null }
      : await supabase.from('material_setlists').insert({ user_id: user.id, name: name.trim() }).select().single();
    if (setlistError || !data) {
      setSaving(false);
      setError(`Setlist gagal ${targetSetlistId ? 'diperbarui' : 'dibuat'}: ${setlistError?.message ?? 'Data tidak tersedia.'}`);
      return;
    }
    if (targetSetlistId) await supabase.from('material_setlists').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', targetSetlistId).eq('user_id', user.id);
    if (targetSetlistId) await supabase.from('material_setlist_items').delete().eq('setlist_id', targetSetlistId);
    const { error: itemsError } = await supabase.from('material_setlist_items').insert(selected.map((materialId, index) => ({ setlist_id: data.id, material_id: materialId, sort_order: index })));
    setSaving(false);
    if (itemsError) {
      if (!targetSetlistId) await supabase.from('material_setlists').delete().eq('id', data.id).eq('user_id', user.id);
      setError(`Materi setlist gagal disimpan: ${itemsError.message}`);
      return;
    }
    setName('');
    setSelected([]);
    setEditingSetlistId(null);
    setBuilderOpen(false);
    setMaterialSearch('');
    setMaterialDropdownOpen(false);
    await loadData();
  }

  async function deleteSetlist(setlist: MaterialSetlist) {
    if (!user?.id) return;
    const { error: deleteError } = await supabase.from('material_setlists').delete().eq('id', setlist.id).eq('user_id', user.id);
    if (deleteError) setError(`Setlist gagal dihapus: ${deleteError.message}`);
    else {
      setSetlists((current) => current.filter((item) => item.id !== setlist.id));
      setSetlistItems((current) => {
        const next = { ...current };
        delete next[setlist.id];
        return next;
      });
    }
  }

  function startEditingSetlist(setlist: MaterialSetlist) {
    setEditingSetlistId(setlist.id);
    setName(setlist.name);
    setSelected(getItems(setlist).map((item) => item.material_id));
    setMaterialSearch('');
    setMaterialDropdownOpen(false);
    setBuilderOpen(true);
  }

  function startCreatingSetlist() {
    setEditingSetlistId(null);
    setName('');
    setSelected([]);
    setMaterialSearch('');
    setMaterialDropdownOpen(false);
    setBuilderOpen(true);
  }

  function cancelSetlistBuilder() {
    setBuilderOpen(false);
    setEditingSetlistId(null);
    setName('');
    setSelected([]);
    setMaterialSearch('');
    setMaterialDropdownOpen(false);
    setError('');
  }

  async function reorderSetlistItems(setlistId: string, fromItemId: string, toItemId: string) {
    const currentItems = setlistItems[setlistId] ?? [];
    const fromIndex = currentItems.findIndex((item) => item.id === fromItemId);
    const toIndex = currentItems.findIndex((item) => item.id === toItemId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextItems = [...currentItems];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    setSetlistItems((current) => ({ ...current, [setlistId]: nextItems }));
    const updates = await Promise.all(nextItems.map((item, index) => supabase.from('material_setlist_items').update({ sort_order: index }).eq('id', item.id).eq('setlist_id', setlistId)));
    if (updates.some((result) => result.error)) {
      setError('Urutan materi gagal disimpan. Coba lagi.');
      await loadData();
    }
  }

  function getItems(setlist: MaterialSetlist) {
    return setlistItems[setlist.id] ?? [];
  }

  function exportSetlistFile(format: 'pdf' | 'docx') {
    if (!exportSetlist) return;
    try {
      const items = getItems(exportSetlist);
      if (format === 'pdf') downloadSetlistPdf(exportSetlist.name, items);
      else downloadSetlistDocx(exportSetlist.name, items);
      setExportSetlist(null);
    } catch (exportError) {
      setError(`File gagal dibuat: ${exportError instanceof Error ? exportError.message : 'Terjadi kesalahan tidak diketahui.'}`);
    }
  }

  function moveSelected(materialId: string, direction: -1 | 1) {
    setSelected((current) => {
      const index = current.indexOf(materialId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Setlist Materi" subtitle="Gabungkan beberapa materi untuk persiapan tampil." backTo="/member/materials" />
      <div className="container-app space-y-5 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Member Area</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Setlist Materi</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-950">Setlist Saya</h2>
            <p className="mt-0.5 text-xs text-slate-500">{setlists.length} setlist tersimpan</p>
          </div>
          <button type="button" onClick={startCreatingSetlist} className="btn-primary !min-h-10 !px-3 !py-2 text-xs sm:text-sm"><Plus className="h-4 w-4" /> Buat Setlist</button>
        </div>
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-900">Setlist Tersimpan</h2><span className="text-[11px] font-semibold text-slate-500">{filteredSetlists.length} dari {setlists.length}</span></div>
          {setlists.length > 0 && <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input-field !py-2.5 pl-9 pr-9 text-sm" placeholder="Cari nama setlist..." value={setlistSearch} onChange={(event) => setSetlistSearch(event.target.value)} />
            {setlistSearch && <button type="button" onClick={() => setSetlistSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian setlist"><X className="h-4 w-4" /></button>}
          </div>}
          {setlists.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><ListPlus className="mx-auto h-7 w-7 text-blue-500" /><p className="mt-2 text-sm font-bold text-slate-800">Belum ada setlist</p><p className="mt-1 text-xs text-slate-500">Gabungkan beberapa materi jadi satu urutan tampil.</p><button type="button" onClick={startCreatingSetlist} className="btn-primary mt-4 !min-h-10 !px-3 !py-2 text-xs"><Plus className="h-4 w-4" /> Buat Setlist Pertama</button></div> : filteredSetlists.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">Setlist tidak ditemukan.</p> : filteredSetlists.map((setlist) => {
            const items = getItems(setlist);
            const total = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
            const isExpanded = expandedSetlist === setlist.id;
            return <article key={setlist.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExpandedSetlist(isExpanded ? null : setlist.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isExpanded}><ChevronDown className={`h-4 w-4 shrink-0 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{setlist.name}</strong><small className="text-[11px] text-slate-500">{items.length} materi · ±{total} menit</small></span></button>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => startEditingSetlist(setlist)} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700" aria-label={`Edit ${setlist.name}`} title="Edit setlist"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setReadingSetlist(setlist)} className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100" aria-label={`Mode Baca Setlist ${setlist.name}`} title="Mode Baca Setlist"><BookOpen className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setExportSetlist(setlist)} className="rounded-lg bg-indigo-50 p-1.5 text-indigo-700 hover:bg-indigo-100" aria-label={`Unduh ${setlist.name}`} title="Unduh PDF atau Word"><Download className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setDeleteTarget(setlist)} className="rounded-lg bg-red-50 p-1.5 text-red-700 hover:bg-red-100" aria-label={`Hapus ${setlist.name}`} title="Hapus"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {isExpanded && <div className="mt-3 border-t border-slate-100 pt-2">{items.length === 0 ? <p className="text-xs text-slate-500">Isi setlist belum tersedia.</p> : <div className="space-y-1.5">{items.map((item, index) => <div key={item.id} draggable onDragStart={() => setDraggedItem({ setlistId: setlist.id, itemId: item.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedItem?.setlistId === setlist.id) void reorderSetlistItems(setlist.id, draggedItem.itemId, item.id); setDraggedItem(null); }} className="rounded-xl border border-slate-100 p-2.5 transition hover:border-blue-200"><div className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{item.material?.title ?? 'Materi'}</p><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="text-[11px] text-slate-500">{item.material?.theme} · ±{item.material?.estimated_duration} menit</p><span className="inline-flex items-center gap-0.5" aria-label={item.material?.rating ? `Rating ${item.material.rating} dari 5` : 'Belum dirating'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-3 w-3 ${item.material?.rating && value <= item.material.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}</span></div></div><div className="flex shrink-0 gap-0.5"><button type="button" onClick={() => { const previous = items[index - 1]; if (previous) void reorderSetlistItems(setlist.id, item.id, previous.id); }} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Naikkan ${item.material?.title ?? 'materi'}`} title="Naikkan"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { const next = items[index + 1]; if (next) void reorderSetlistItems(setlist.id, item.id, next.id); }} disabled={index === items.length - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Turunkan ${item.material?.title ?? 'materi'}`} title="Turunkan"><ArrowDown className="h-3.5 w-3.5" /></button></div></div></div>)}</div>}</div>}
            </article>;
          })}
        </section>
      </div>
      <Modal
        open={builderOpen}
        onClose={() => { if (!saving) cancelSetlistBuilder(); }}
        title={editingSetlistId ? 'Edit Setlist' : 'Buat Setlist'}
        size="lg"
      >
        <form id="setlist-builder" onSubmit={createSetlist} className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><ListPlus className="h-5 w-5" /></span>
            <div><p className="text-[15px] font-extrabold tracking-tight text-slate-900">Susun materi penampilanmu</p><p className="mt-1 text-[13px] leading-5 text-slate-600">Beri nama, pilih materi, lalu atur urutannya.</p></div>
          </div>
          <label className="block text-[13px] font-bold text-slate-700">
            Nama setlist
            <input className="input-field mt-1.5 !py-3 text-[15px]" placeholder="Contoh: Set 5 Menit Jumat" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <section className="space-y-2.5" aria-label="Pilih materi untuk setlist">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">1. Pilih materi</h4>
                <p className="mt-0.5 text-xs text-slate-500">Cari lalu tambahkan materi satu per satu.</p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{selected.length} dipilih</span>
            </div>
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMaterialDropdownOpen(false);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field !py-3 pl-10 pr-10 text-[15px] shadow-sm"
                placeholder="Cari judul, tema, atau isi materi..."
                value={materialSearch}
                onFocus={() => setMaterialDropdownOpen(true)}
                onChange={(event) => {
                  setMaterialSearch(event.target.value);
                  setMaterialDropdownOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && materialDropdownOpen) {
                    event.stopPropagation();
                    setMaterialDropdownOpen(false);
                  }
                }}
                aria-label="Cari materi untuk setlist"
                aria-expanded={materialDropdownOpen}
                aria-controls="setlist-material-options"
                role="combobox"
                aria-autocomplete="list"
              />
              {materialSearch && <button type="button" onClick={() => { setMaterialSearch(''); setMaterialDropdownOpen(true); }} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian materi"><X className="h-4 w-4" /></button>}
              {materialDropdownOpen && <div id="setlist-material-options" aria-label="Daftar materi" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-52 space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
                {loading ? <div className="h-20 animate-pulse rounded-lg bg-slate-100" /> : materials.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Belum ada materi untuk dipilih.</p> : filteredMaterials.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Materi tidak ditemukan. Coba kata kunci lain.</p> : dropdownMaterials.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Semua materi sudah ditambahkan. Cari judul materi untuk melihat statusnya.</p> : dropdownMaterials.map((material) => {
                  const checked = selected.includes(material.id);
                  return <button
                    type="button"
                    key={material.id}
                    disabled={checked}
                    onClick={() => {
                      setSelected((current) => current.includes(material.id) ? current : [...current, material.id]);
                      setMaterialSearch('');
                      setMaterialDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-bold text-slate-900">{material.title}</strong>
                      <small className="mt-0.5 block text-xs text-slate-500">{material.theme}</small>
                      <span className="mt-0.5 inline-flex items-center gap-0.5" aria-label={material.rating ? `Rating ${material.rating} dari 5` : 'Belum dirating'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-3 w-3 ${material.rating && value <= material.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold text-slate-500">±{material.estimated_duration} mnt</span>
                      <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${checked ? 'bg-blue-100 text-blue-700' : 'bg-blue-600 text-white'}`}>
                        {checked ? <><Check className="h-3.5 w-3.5" /> Ditambahkan</> : <><Plus className="h-3.5 w-3.5" /> Tambah</>}
                      </span>
                    </span>
                  </button>;
                })}
              </div>}
            </div>
            <p className="text-xs font-medium text-slate-500">{filteredMaterials.length} materi {materialSearch ? 'ditemukan' : 'tersedia'}</p>
          </section>
          {selected.length > 0 && <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-blue-900">2. Urutan tampil</h4><p className="mt-0.5 text-xs text-slate-600">Atur posisi materi dengan tombol panah.</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-800 shadow-sm">{selected.length} materi</span></div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-0.5">
              {selected.map((materialId, index) => {
                const material = materials.find((item) => item.id === materialId);
                if (!material) return null;
                return <div key={material.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-extrabold text-blue-800">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">{material.title}</span>
                  <button type="button" onClick={() => moveSelected(material.id, -1)} disabled={index === 0} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Naikkan ${material.title}`}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => moveSelected(material.id, 1)} disabled={index === selected.length - 1} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Turunkan ${material.title}`}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setSelected((current) => current.filter((id) => id !== material.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Keluarkan ${material.title}`}><X className="h-4 w-4" /></button>
                </div>;
              })}
            </div>
          </div>}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-700"><Clock3 className="h-4 w-4 text-blue-600" /> ±{selectedDuration} menit <span className="text-slate-300">·</span> {selected.length} materi</span>
            <div className="flex gap-2 sm:order-2">
              <button type="button" onClick={cancelSetlistBuilder} disabled={saving} className="btn-secondary flex-1 !min-h-11 !px-4 !py-2.5 text-sm sm:flex-none">Batal</button>
              <button type="submit" disabled={saving || loading} className="btn-primary flex-1 !min-h-11 !px-4 !py-2.5 text-sm sm:flex-none"><Check className="h-4 w-4" /> {saving ? 'Menyimpan...' : editingSetlistId ? 'Simpan Perubahan' : 'Simpan Setlist'}</button>
            </div>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(readingSetlist)}
        onClose={() => setReadingSetlist(null)}
        title={readingSetlist?.name ?? 'Mode Baca Setlist'}
        titleEyebrow="Mode Baca Setlist"
        size="lg"
        headerContent={readingSetlist && (() => {
          const items = getItems(readingSetlist);
          const total = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
          const dark = readingTheme === 'dark';
          return (
            <div className="flex items-center justify-between gap-3">
              <p className={`min-w-0 text-xs font-bold ${dark ? 'text-slate-600' : 'text-slate-500'}`}>Setlist Materi · {items.length} materi · ±{total} menit</p>
              <button type="button" onClick={() => setReadingTheme(dark ? 'light' : 'dark')} aria-pressed={dark} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${dark ? 'bg-slate-800 text-amber-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`} aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'} title={dark ? 'Mode terang' : 'Mode gelap'}>
                {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>
          );
        })()}
      >
        {readingSetlist && (() => {
          const items = getItems(readingSetlist);
          const total = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
          const dark = readingTheme === 'dark';
          return (
            <div className={`space-y-4 rounded-2xl p-3 transition-colors sm:p-4 ${dark ? 'bg-slate-950' : 'bg-white'}`}>
              <div className={`rounded-2xl border p-3 text-center sm:p-4 ${dark ? 'border-slate-700 bg-slate-900' : 'border-amber-100 bg-[#fffdf7]'}`}>
                <p className={`text-xs font-bold ${dark ? 'text-slate-300' : 'text-slate-500'}`}>Setlist Materi · {items.length} materi · ±{total} menit</p>
              </div>
              {items.length === 0 ? (
                <p className={`rounded-xl border border-dashed p-6 text-center text-sm ${dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`}>Isi setlist belum tersedia.</p>
              ) : items.map((item, index) => (
                <article key={item.id} className={`overflow-hidden rounded-2xl border ${dark ? 'border-slate-700 bg-slate-900' : 'border-amber-100 bg-[#fffdf7]'}`}>
                  <header className={`border-b px-4 py-3 ${dark ? 'border-slate-700' : 'border-amber-100'}`}>
                    <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${dark ? 'text-sky-400' : 'text-blue-700'}`}>Materi {index + 1}</p>
                    <h3 className={`mt-1 text-base font-bold leading-snug ${dark ? 'text-slate-100' : 'text-slate-900'}`}>{item.material?.title ?? 'Materi'}</h3>
                    <p className={`mt-1 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{item.material?.theme} · ±{item.material?.estimated_duration} menit</p>
                    {item.material?.premis && <p className={`mt-3 text-sm leading-6 ${dark ? 'text-slate-300' : 'text-slate-700'}`}><span className="font-bold">Premis:</span> {item.material.premis}</p>}
                  </header>
                  <div className={`space-y-4 px-4 py-5 font-serif text-[16px] leading-8 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {parseMaterialContent(item.material?.content ?? '').map((block, blockIndex) => block.type === 'text' ? (
                      <p key={`text-${blockIndex}`} className="whitespace-pre-line break-words">{block.text || 'Belum ada isi materi.'}</p>
                    ) : (
                      <div key={`table-${blockIndex}`} className={`overflow-x-auto rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                        <table className="w-full border-collapse text-left text-sm">
                          <tbody>{block.rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`} className={`border-b last:border-b-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>{row.map((cell, cellIndex) => <td key={`cell-${cellIndex}`} className={`border-r p-2 align-top last:border-r-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>{cell || '\u00a0'}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          );
        })()}
      </Modal>
      <Modal open={Boolean(exportSetlist)} onClose={() => setExportSetlist(null)} title="Unduh Setlist" titleEyebrow={exportSetlist?.name} size="sm">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-600">Pilih format file. PDF siap dibaca atau dicetak, sedangkan Word bisa diedit kembali.</p>
          <button type="button" onClick={() => exportSetlistFile('pdf')} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><FileText className="h-5 w-5" /></span>
            <span><strong className="block text-sm text-slate-900">PDF</strong><small className="mt-0.5 block text-xs text-slate-500">Tampilan tetap rapi saat dibuka atau dicetak</small></span>
          </button>
          <button type="button" onClick={() => exportSetlistFile('docx')} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileType2 className="h-5 w-5" /></span>
            <span><strong className="block text-sm text-slate-900">Word (.docx)</strong><small className="mt-0.5 block text-xs text-slate-500">Bisa dibuka dan diedit di Microsoft Word</small></span>
          </button>
          <button type="button" onClick={() => setExportSetlist(null)} className="btn-secondary w-full">Batal</button>
        </div>
      </Modal>
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="YAKIN HAPUS SETLIST?" titleEyebrow="KONFIRMASI HAPUS" size="sm">
        {deleteTarget && <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 bg-red-700 px-4 py-3 text-white">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-xs font-extrabold uppercase tracking-[0.1em]">Tindakan ini permanen</p>
            </div>
            <p className="px-4 py-4 text-sm leading-6 text-slate-700">Setlist <strong className="break-words text-slate-950">{deleteTarget.name}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 !border-slate-300 !text-slate-800">Batal</button>
            <button type="button" onClick={() => { const target = deleteTarget; setDeleteTarget(null); if (target) void deleteSetlist(target); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"><Trash2 className="h-4 w-4" /> Hapus Setlist</button>
          </div>
        </div>}
      </Modal>
      <Modal open={Boolean(error)} onClose={() => setError('')} title="Setlist">
        <div className="space-y-4"><div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{error}</div><button type="button" onClick={() => setError('')} className="btn-primary w-full">Mengerti</button></div>
      </Modal>
    </div>
  );
}
