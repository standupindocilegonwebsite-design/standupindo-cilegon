import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, Clock3, Minus, Pencil, Plus, RotateCcw, Save, Star, Trash2, ZoomIn } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Material, MaterialNode } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

type DetailTab = 'current' | 'previous';

const RATING_LABELS = ['Cuma Niat', 'Maksa Lucu', 'Ada Bibit', 'Mulai Kena', 'Lumayan Pecah', 'Solid Ini'];

export function MemberMaterialDetailPage({ router, id }: { router: Router; id: string }) {
  const { user } = useAuth();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<DetailTab>('current');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', theme: '', estimated_duration: '', content: '', rating: '', personal_note: '' });
  const [nodes, setNodes] = useState<MaterialNode[]>([]);
  const [nodeForm, setNodeForm] = useState({ title: '', type: 'Ide', content: '' });
  const [nodeParentId, setNodeParentId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [canvasStart, setCanvasStart] = useState({ x: 0, y: 0 });

  async function loadMaterial() {
    if (!user?.id) return;
    setLoading(true);
    const { data, error: loadError } = await supabase.from('materials').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (loadError || !data) setError('Materi tidak ditemukan atau tidak dapat diakses.');
    const row = data as Material | null;
    setMaterial(row);
    if (row) setForm({ title: row.title, theme: row.theme, estimated_duration: String(row.estimated_duration), content: row.content, rating: row.rating ? String(row.rating) : '', personal_note: row.personal_note ?? '' });
    const { data: nodeData } = await supabase.from('material_nodes').select('*').eq('material_id', id).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setNodes((nodeData as MaterialNode[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadMaterial(); }, [id, user?.id]);

  async function saveChanges(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.id || !material) return;
    if (!form.title.trim() || !form.theme.trim() || !form.estimated_duration || !form.content.trim()) {
      setError('Judul, tema, durasi, dan materi wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    const contentChanged = form.content.trim() !== material.content;
    const payload = {
      title: form.title.trim(),
      theme: form.theme.trim(),
      estimated_duration: Number(form.estimated_duration),
      content: form.content.trim(),
      previous_content: contentChanged ? material.content : material.previous_content,
      previous_updated_at: contentChanged ? material.updated_at : material.previous_updated_at,
      rating: form.rating ? Number(form.rating) : null,
      personal_note: form.personal_note.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('materials').update(payload).eq('id', material.id).eq('user_id', user.id);
    setSaving(false);
    if (saveError) {
      setError(`Materi gagal disimpan: ${saveError.message}`);
      return;
    }
    setEditing(false);
    await loadMaterial();
  }

  async function deleteMaterial() {
    if (!user?.id || !material || !window.confirm('Hapus materi ini? Data materi akan dihapus permanen.')) return;
    const { error: deleteError } = await supabase.from('materials').delete().eq('id', material.id).eq('user_id', user.id);
    if (deleteError) {
      setError(`Materi gagal dihapus: ${deleteError.message}`);
      return;
    }
    router.navigate('/member/materials');
  }

  async function restorePrevious() {
    if (!user?.id || !material?.previous_content || !window.confirm('Pulihkan versi sebelumnya menjadi versi sekarang?')) return;
    setSaving(true);
    const { error: restoreError } = await supabase.from('materials').update({
      content: material.previous_content,
      previous_content: material.content,
      previous_updated_at: material.updated_at,
      updated_at: new Date().toISOString(),
    }).eq('id', material.id).eq('user_id', user.id);
    setSaving(false);
    if (restoreError) {
      setError(`Versi gagal dipulihkan: ${restoreError.message}`);
      return;
    }
    setTab('current');
    await loadMaterial();
  }

  function resetNodeForm(parentId: string | null = null) {
      setShowNodeForm(true);
      setNodeParentId(parentId);
      setEditingNodeId(null);
      setNodeForm({ title: '', type: 'Ide', content: '' });
    }

  function editNode(node: MaterialNode) {
      setShowNodeForm(true);
      setEditingNodeId(node.id);
      setNodeParentId(node.parent_id);
      setNodeForm({ title: node.title, type: node.type, content: node.content ?? '' });
    }

  async function saveNode(event: React.FormEvent) {
      event.preventDefault();
      if (!user?.id || !material || !nodeForm.title.trim()) return;
      setSaving(true);
      const payload = { title: nodeForm.title.trim(), type: nodeForm.type.trim() || 'Ide', content: nodeForm.content.trim() || null, updated_at: new Date().toISOString() };
      const result = editingNodeId
        ? await supabase.from('material_nodes').update(payload).eq('id', editingNodeId).eq('material_id', material.id)
        : await supabase.from('material_nodes').insert({ ...payload, material_id: material.id, parent_id: nodeParentId, sort_order: nodes.filter((node) => node.parent_id === nodeParentId).length });
      setSaving(false);
      if (result.error) {
        setError(`Mapping gagal disimpan: ${result.error.message}`);
        return;
      }
      resetNodeForm();
      setShowNodeForm(false);
      const { data } = await supabase.from('material_nodes').select('*').eq('material_id', material.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      setNodes((data as MaterialNode[]) ?? []);
    }

  async function deleteNode(node: MaterialNode) {
      if (!window.confirm(`Hapus node "${node.title}" beserta cabangnya?`)) return;
      const { error: deleteError } = await supabase.from('material_nodes').delete().eq('id', node.id).eq('material_id', material?.id);
      if (deleteError) {
        setError(`Node gagal dihapus: ${deleteError.message}`);
        return;
      }
      setNodes((current) => {
        const removed = new Set([node.id]);
        let changed = true;
        while (changed) {
          changed = false;
          current.forEach((item) => {
            if (item.parent_id && removed.has(item.parent_id) && !removed.has(item.id)) {
              removed.add(item.id);
              changed = true;
            }
          });
        }
        return current.filter((item) => !removed.has(item.id));
      });
    }

  const mindMap = useMemo(() => {
    const children = new Map<string | null, MaterialNode[]>();
    nodes.forEach((node) => children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]));
    const positions = new Map<string, { x: number; y: number }>();
    let cursor = 0;
    const place = (node: MaterialNode, depth: number): number => {
      const childNodes = children.get(node.id) ?? [];
      const childPositions = childNodes.map((child) => place(child, depth + 1));
      const x = childPositions.length > 0 ? childPositions.reduce((sum, value) => sum + value, 0) / childPositions.length : cursor++;
      positions.set(node.id, { x, y: depth });
      return x;
    };
    (children.get(null) ?? []).forEach((node) => {
      place(node, 0);
      cursor += 0.5;
    });
    const maxX = Math.max(1, ...Array.from(positions.values()).map((position) => position.x));
    const width = Math.max(620, (maxX + 1) * 190);
    const height = Math.max(260, (Math.max(0, ...Array.from(positions.values()).map((position) => position.y)) + 1) * 132 + 50);
    return { positions, width, height };
  }, [nodes]);

  function nodeTone(type: string) {
    const normalized = type.toLowerCase();
    if (normalized.includes('premis')) return 'border-blue-300 bg-blue-100';
    if (normalized.includes('observ')) return 'border-indigo-300 bg-indigo-100';
    if (normalized.includes('punch')) return 'border-amber-300 bg-amber-50';
    if (normalized.includes('setup')) return 'border-violet-300 bg-violet-100';
    return 'border-slate-200 bg-white';
  }

  function getRatingLabel(rating: string) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    return `${value}/5 — ${RATING_LABELS[value]}`;
  }

  function startCanvasDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button,input,textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingCanvas(true);
    setCanvasStart({ x: event.clientX - canvasOffset.x, y: event.clientY - canvasOffset.y });
  }

  function moveCanvas(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingCanvas) return;
    setCanvasOffset({ x: event.clientX - canvasStart.x, y: event.clientY - canvasStart.y });
  }

  function endCanvasDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingCanvas(false);
  }

  if (loading) return <div className="container-app py-8"><div className="h-64 animate-pulse rounded-[28px] bg-slate-100" /></div>;
  if (!material) return <div className="container-app py-8"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error || 'Materi tidak ditemukan.'}</div></div>;

  return (
    <div className="animate-fade-in">
      <div className="container-app py-6 sm:py-8">
        <button type="button" onClick={() => router.navigate('/member/materials')} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Kembali ke Buku Materi</button>
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(37,99,235,0.08)] sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><BookOpen className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Detail Materi</p>
                <h1 className="truncate text-xl font-black leading-tight text-slate-950 sm:text-2xl">{material.title}</h1>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3 text-blue-600" /> {material.theme}</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3 text-blue-600" /> ±{material.estimated_duration} menit</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 text-blue-600" /> {formatDate(material.updated_at.slice(0, 10))}</span>
            </div>
          </section>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {editing ? (
            <form onSubmit={saveChanges} className="space-y-4 rounded-[26px] border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <input className="input-field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2"><input className="input-field" value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value })} /><input className="input-field" type="number" min="1" value={form.estimated_duration} onChange={(event) => setForm({ ...form, estimated_duration: event.target.value })} /></div>
              <textarea className="input-field !min-h-[220px]" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
              <button type="submit" disabled={saving} className="btn-primary w-full"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Rewrite'}</button>
            </form>
          ) : (
            <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="mb-4 flex gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setTab('current')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${tab === 'current' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Versi Sekarang</button><button type="button" disabled={!material.previous_content} onClick={() => setTab('previous')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${tab === 'previous' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Versi Sebelumnya</button></div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{tab === 'current' ? 'Versi Sekarang' : 'Versi Sebelumnya'}</p>
              <div className="whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{tab === 'current' ? material.content : material.previous_content || 'Belum ada versi sebelumnya.'}</div>
              {tab === 'previous' && material.previous_content && <><p className="mt-2 text-xs text-slate-400">Versi sebelumnya disimpan saat rewrite terakhir.</p><button type="button" onClick={() => void restorePrevious()} disabled={saving} className="btn-secondary mt-3 w-full !py-2.5 text-sm">Pulihkan versi ini</button></>}
              {tab === 'current' && <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Kelola</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(true)} title="Edit / Rewrite Materi" aria-label="Edit atau rewrite materi" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={deleteMaterial} title="Hapus Materi" aria-label="Hapus materi" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>}
            </section>
          )}
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-slate-900">Kekuatan Materi</h2>
              <span className="text-[11px] font-semibold text-slate-500">{getRatingLabel(form.rating)}</span>
            </div>
            <div className="mt-1.5 flex gap-0.5">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setForm({ ...form, rating: Number(form.rating) === value ? '' : String(value) })} className="rounded-lg p-0.5" aria-label={Number(form.rating) === value ? `Hapus rating ${value}` : `Beri rating ${value}`}><Star className={`h-6 w-6 ${Number(form.rating) >= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}</div>
            <label className="mt-3 block text-xs font-bold text-slate-700">Catatan setelah dibawakan</label>
            <textarea className="input-field mt-1.5 !min-h-[76px] !py-2.5 text-sm" placeholder="Catatan pribadi kamu..." value={form.personal_note} onChange={(event) => setForm({ ...form, personal_note: event.target.value })} />
            <button type="button" onClick={() => void saveChanges({ preventDefault: () => undefined } as React.FormEvent)} className="btn-secondary mt-2 w-full !py-2 text-sm">Simpan Rating & Catatan</button>
          </section>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Struktur Materi</p><h2 className="mt-1 text-base font-extrabold text-slate-900">Mapping Materi</h2></div><button type="button" onClick={() => resetNodeForm()} className="btn-secondary !px-3 !py-2 text-xs"><Plus className="h-4 w-4" /> Node</button></div>
            {nodes.length === 0 && !editingNodeId && <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Belum ada node. Tambahkan premis, setup, punchline, atau ide pertama.</p>}
            <div
              className={`relative mt-4 min-h-[220px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 ${draggingCanvas ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={startCanvasDrag}
              onPointerMove={moveCanvas}
              onPointerUp={endCanvasDrag}
              onPointerCancel={endCanvasDrag}
              onWheel={(event) => {
                event.preventDefault();
                setCanvasScale((current) => Math.min(1.6, Math.max(0.65, current + (event.deltaY < 0 ? 0.08 : -0.08))));
              }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm">
                <button type="button" onClick={() => setCanvasScale((current) => Math.max(0.65, current - 0.1))} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
                <span className="min-w-[42px] text-center text-[11px] font-bold text-slate-500">{Math.round(canvasScale * 100)}%</span>
                <button type="button" onClick={() => setCanvasScale((current) => Math.min(1.6, current + 0.1))} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setCanvasScale(1); setCanvasOffset({ x: 0, y: 0 }); }} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Reset canvas"><RotateCcw className="h-4 w-4" /></button>
              </div>
              <div className="relative transition-transform duration-100" style={{ width: mindMap.width, height: mindMap.height, transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`, transformOrigin: 'top left' }}>
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" width={mindMap.width} height={mindMap.height} aria-hidden="true">
                  {nodes.map((node) => {
                    if (!node.parent_id) return null;
                    const parent = mindMap.positions.get(node.parent_id);
                    const child = mindMap.positions.get(node.id);
                    if (!parent || !child) return null;
                    const x1 = parent.x * 190 + 90;
                    const y1 = parent.y * 132 + 90;
                    const x2 = child.x * 190 + 90;
                    const y2 = child.y * 132 + 16;
                    const middle = (y1 + y2) / 2;
                    return <path key={`edge-${node.id}`} d={`M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`} fill="none" stroke="#94a3b8" strokeWidth="2" />;
                  })}
                </svg>
                {nodes.map((node) => {
                  const position = mindMap.positions.get(node.id);
                  if (!position) return null;
                  return (
                    <div key={node.id} className={`absolute w-[172px] rounded-2xl border-2 p-3 shadow-sm ${nodeTone(node.type)}`} style={{ left: position.x * 190 + 4, top: position.y * 132 + 16 }}>
                      <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-700">{node.type}</p>
                      <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{node.title}</p>
                      {node.content && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{node.content}</p>}
                      <div className="mt-2 flex justify-end gap-1">
                        <button type="button" onClick={() => resetNodeForm(node.id)} className="rounded-lg p-1 text-blue-600 hover:bg-white/70" aria-label={`Tambah anak ${node.title}`}><Plus className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => editNode(node)} className="rounded-lg p-1 text-slate-500 hover:bg-white/70" aria-label={`Edit ${node.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => void deleteNode(node)} className="rounded-lg p-1 text-red-600 hover:bg-white/70" aria-label={`Hapus ${node.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Geser canvas untuk melihat cabang. Gunakan + pada node untuk menambah anak, lalu zoom bila struktur materi semakin besar.</p>
            {(showNodeForm || nodes.length === 0) && <form onSubmit={saveNode} className="mt-4 space-y-3 rounded-2xl bg-blue-50/60 p-3"><p className="text-sm font-extrabold text-slate-900">{editingNodeId ? 'Edit Node' : nodeParentId ? 'Tambah Anak' : 'Tambah Node Utama'}</p><div className="grid gap-3 sm:grid-cols-2"><input className="input-field" placeholder="Judul node" value={nodeForm.title} onChange={(event) => setNodeForm({ ...nodeForm, title: event.target.value })} /><input className="input-field" placeholder="Jenis, contoh: Setup" value={nodeForm.type} onChange={(event) => setNodeForm({ ...nodeForm, type: event.target.value })} /></div><textarea className="input-field !min-h-[80px]" placeholder="Isi/catatan node (opsional)" value={nodeForm.content} onChange={(event) => setNodeForm({ ...nodeForm, content: event.target.value })} /><div className="flex gap-2"><button type="submit" disabled={saving || !nodeForm.title.trim()} className="btn-primary flex-1 !py-2.5 text-sm">{saving ? 'Menyimpan...' : editingNodeId ? 'Simpan Perubahan' : 'Tambah Node'}</button><button type="button" onClick={() => { setShowNodeForm(false); resetNodeForm(); }} className="btn-secondary !py-2.5 text-sm">Batal</button></div></form>}
          </section>
          <div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" /> Perubahan tersimpan hanya untuk akun kamu.</div>
        </div>
      </div>
    </div>
  );
}
