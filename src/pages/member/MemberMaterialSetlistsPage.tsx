import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Clock3, Download, FileText, ListPlus, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Material, MaterialSetlist, MaterialSetlistItem } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

export function MemberMaterialSetlistsPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [setlists, setSetlists] = useState<MaterialSetlist[]>([]);
  const [setlistItems, setSetlistItems] = useState<Record<string, MaterialSetlistItem[]>>({});
  const [expandedSetlist, setExpandedSetlist] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [setlistSearch, setSetlistSearch] = useState('');
  const [visibleMaterialLimit, setVisibleMaterialLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingSetlistId, setEditingSetlistId] = useState<string | null>(null);
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
  useEffect(() => { setVisibleMaterialLimit(5); }, [materialSearch]);

  const selectedDuration = useMemo(() => materials.filter((material) => selected.includes(material.id)).reduce((total, material) => total + material.estimated_duration, 0), [materials, selected]);
  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    if (!query) return materials;
    return materials.filter((material) => `${material.title} ${material.theme} ${material.content}`.toLowerCase().includes(query));
  }, [materials, materialSearch]);
  const visibleMaterials = useMemo(() => filteredMaterials.slice(0, visibleMaterialLimit), [filteredMaterials, visibleMaterialLimit]);
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
    await loadData();
  }

  async function deleteSetlist(setlist: MaterialSetlist) {
    if (!user?.id || !window.confirm(`Hapus setlist "${setlist.name}"?`)) return;
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
    window.setTimeout(() => document.getElementById('setlist-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
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

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  }

  function exportMarkup(setlist: MaterialSetlist) {
    const items = getItems(setlist);
    const total = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
    return `<html><head><meta charset="utf-8"><title>${escapeHtml(setlist.name)}</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:32px}h1{color:#1746d1}p{white-space:pre-wrap;line-height:1.6}.meta{color:#64748b;font-size:13px}.item{border-bottom:1px solid #dbe3f0;padding:16px 0}.number{color:#1746d1;font-weight:bold}</style></head><body><h1>${escapeHtml(setlist.name)}</h1><p class="meta">Setlist Materi · ${items.length} materi · Total ±${total} menit</p>${items.map((item, index) => `<div class="item"><div class="number">${index + 1}. ${escapeHtml(item.material?.title ?? 'Materi')}</div><p class="meta">${escapeHtml(item.material?.theme ?? '')} · ±${item.material?.estimated_duration ?? 0} menit</p><p>${escapeHtml(item.material?.content ?? '')}</p></div>`).join('')}</body></html>`;
  }

  function exportWord(setlist: MaterialSetlist) {
    const blob = new Blob([exportMarkup(setlist)], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${setlist.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'setlist-materi'}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf(setlist: MaterialSetlist) {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      setError('Export PDF diblokir browser. Izinkan popup untuk halaman ini lalu coba lagi.');
      return;
    }
    printWindow.document.write(`${exportMarkup(setlist)}<script>window.onload=function(){window.print();};</script>`);
    printWindow.document.close();
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
      <div className="border-b-2 border-blue-100 bg-white">
        <div className="container-app py-3.5 sm:py-4">
          <button type="button" onClick={() => router.navigate('/member/materials')} className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Buku Materi</button>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Setlist Materi</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-600 sm:text-sm">Gabungkan beberapa materi untuk persiapan tampil.</p>
        </div>
      </div>
      <div className="container-app space-y-4 py-4 sm:py-6">
        <form id="setlist-builder" onSubmit={createSetlist} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><ListPlus className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-extrabold text-slate-950">{editingSetlistId ? 'Edit Setlist' : 'Buat Setlist'}</h2></div>{editingSetlistId && <button type="button" onClick={() => { setEditingSetlistId(null); setName(''); setSelected([]); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Batal edit setlist" title="Batal"><X className="h-4 w-4" /></button>}</div>
          <input className="input-field mt-3 !py-2.5 text-sm" placeholder="Nama setlist, contoh: Set 5 Menit Jumat" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input-field !py-2.5 pl-9 pr-9 text-sm" placeholder="Cari materi berdasarkan judul, tema, atau isi..." value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} />
            {materialSearch && <button type="button" onClick={() => setMaterialSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian materi"><X className="h-4 w-4" /></button>}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-500"><span>{filteredMaterials.length} materi tersedia</span><span>{selected.length} dipilih</span></div>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {loading ? <div className="h-20 animate-pulse rounded-xl bg-white" /> : materials.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Belum ada materi untuk dipilih.</p> : filteredMaterials.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Materi tidak ditemukan. Coba kata kunci lain.</p> : visibleMaterials.map((material) => {
              const checked = selected.includes(material.id);
              return <button type="button" key={material.id} onClick={() => setSelected((current) => checked ? current.filter((id) => id !== material.id) : [...current, material.id])} className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${checked ? 'border-blue-400 bg-white ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200'}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3 w-3" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{material.title}</strong><small className="block text-[11px] text-slate-500">{material.theme}</small><span className="mt-0.5 inline-flex items-center gap-0.5" aria-label={material.rating ? `Rating ${material.rating} dari 5` : 'Belum dirating'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-3 w-3 ${material.rating && value <= material.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}</span></span><span className="text-[11px] font-bold text-slate-500">±{material.estimated_duration} mnt</span></button>;
            })}
          </div>
          {selected.length > 0 && <div className="mt-3 rounded-xl border border-blue-100 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-blue-700">Urutan Setlist</p><span className="text-[11px] text-slate-400">Atur urutan tampil/export</span></div>
            <div className="space-y-1.5">
              {selected.map((materialId, index) => {
                const material = materials.find((item) => item.id === materialId);
                if (!material) return null;
                return <div key={material.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{material.title}</span>
                  <button type="button" onClick={() => moveSelected(material.id, -1)} disabled={index === 0} className="rounded-md p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Naikkan ${material.title}`}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => moveSelected(material.id, 1)} disabled={index === selected.length - 1} className="rounded-md p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Turunkan ${material.title}`}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setSelected((current) => current.filter((id) => id !== material.id))} className="rounded-md p-1 text-red-500 hover:bg-red-50" aria-label={`Keluarkan ${material.title}`}><X className="h-3.5 w-3.5" /></button>
                </div>;
              })}
            </div>
          </div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Clock3 className="h-3.5 w-3.5 text-blue-600" /> ±{selectedDuration} menit · {selected.length} materi</span><button type="submit" disabled={saving || loading} className="btn-primary !px-3 !py-2 text-xs"><Plus className="h-3.5 w-3.5" /> {saving ? 'Menyimpan...' : editingSetlistId ? 'Simpan Perubahan' : 'Simpan Setlist'}</button></div>
        </form>
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-900">Setlist Tersimpan</h2><span className="text-[11px] font-semibold text-slate-400">{filteredSetlists.length}/{setlists.length}</span></div>
          {setlists.length > 0 && <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input-field !py-2.5 pl-9 pr-9 text-sm" placeholder="Cari nama setlist..." value={setlistSearch} onChange={(event) => setSetlistSearch(event.target.value)} />
            {setlistSearch && <button type="button" onClick={() => setSetlistSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian setlist"><X className="h-4 w-4" /></button>}
          </div>}
          {setlists.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">Belum ada setlist tersimpan.</p> : filteredSetlists.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">Setlist tidak ditemukan.</p> : filteredSetlists.map((setlist) => {
            const items = getItems(setlist);
            const total = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
            const isExpanded = expandedSetlist === setlist.id;
            return <article key={setlist.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExpandedSetlist(isExpanded ? null : setlist.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isExpanded}><ChevronDown className={`h-4 w-4 shrink-0 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{setlist.name}</strong><small className="text-[11px] text-slate-500">{items.length} materi · ±{total} menit</small></span></button>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => startEditingSetlist(setlist)} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700" aria-label={`Edit ${setlist.name}`} title="Edit setlist"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => exportWord(setlist)} className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100" aria-label={`Export Word ${setlist.name}`} title="Export Word"><FileText className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => exportPdf(setlist)} className="rounded-lg bg-indigo-50 p-1.5 text-indigo-700 hover:bg-indigo-100" aria-label={`Export PDF ${setlist.name}`} title="Export PDF"><Download className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void deleteSetlist(setlist)} className="rounded-lg bg-red-50 p-1.5 text-red-700 hover:bg-red-100" aria-label={`Hapus ${setlist.name}`} title="Hapus"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {isExpanded && <div className="mt-3 border-t border-slate-100 pt-2">{items.length === 0 ? <p className="text-xs text-slate-500">Isi setlist belum tersedia.</p> : <div className="space-y-1.5">{items.map((item, index) => <div key={item.id} draggable onDragStart={() => setDraggedItem({ setlistId: setlist.id, itemId: item.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedItem?.setlistId === setlist.id) void reorderSetlistItems(setlist.id, draggedItem.itemId, item.id); setDraggedItem(null); }} className="rounded-xl border border-slate-100 p-2.5 transition hover:border-blue-200"><div className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{item.material?.title ?? 'Materi'}</p><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="text-[11px] text-slate-500">{item.material?.theme} · ±{item.material?.estimated_duration} menit</p><span className="inline-flex items-center gap-0.5" aria-label={item.material?.rating ? `Rating ${item.material.rating} dari 5` : 'Belum dirating'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-3 w-3 ${item.material?.rating && value <= item.material.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}</span></div></div><div className="flex shrink-0 gap-0.5"><button type="button" onClick={() => { const previous = items[index - 1]; if (previous) void reorderSetlistItems(setlist.id, item.id, previous.id); }} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Naikkan ${item.material?.title ?? 'materi'}`} title="Naikkan"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { const next = items[index + 1]; if (next) void reorderSetlistItems(setlist.id, item.id, next.id); }} disabled={index === items.length - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`Turunkan ${item.material?.title ?? 'materi'}`} title="Turunkan"><ArrowDown className="h-3.5 w-3.5" /></button></div></div></div>)}</div>}</div>}
            </article>;
          })}
        </section>
      </div>
      <Modal open={Boolean(error)} onClose={() => setError('')} title="Setlist">
        <div className="space-y-4"><div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{error}</div><button type="button" onClick={() => setError('')} className="btn-primary w-full">Mengerti</button></div>
      </Modal>
    </div>
  );
}
