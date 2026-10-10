import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, FileText, Plus, Save, Sparkles } from 'lucide-react';
import { DEFAULT_RECAP_CLOSING, getRecapYears, type AnnualRecapRecord } from '@/lib/annual-recap';
import { supabase } from '@/lib/supabase';

export function AnnualRecapAdminPage({ onNotice, onBack }: { onNotice: (message: string) => void; onBack?: () => void }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [record, setRecord] = useState<AnnualRecapRecord | null>(null);
  const [closingNarrative, setClosingNarrative] = useState(DEFAULT_RECAP_CLOSING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const availableYears = useMemo(() => getRecapYears(), []);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('annual_recaps')
        .select('*')
        .eq('year', selectedYear)
        .maybeSingle();

      if (!active) return;

      const nextRecord = (data as AnnualRecapRecord | null) ?? null;
      setRecord(nextRecord);
      setClosingNarrative(nextRecord?.closing_narrative?.trim() || DEFAULT_RECAP_CLOSING);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedYear]);

  async function saveRecord(nextPublished = false) {
    setSaving(true);

    const payload = {
      year: selectedYear,
      published: nextPublished,
      closing_narrative: closingNarrative.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (record?.id) {
      const { error } = await supabase.from('annual_recaps').update(payload).eq('id', record.id);
      setSaving(false);
      if (error) {
        onNotice('Gagal menyimpan Annual Recap.');
        return;
      }
      setRecord({ ...record, ...payload });
      onNotice(nextPublished ? 'Annual Recap berhasil dipublikasikan.' : 'Draft Annual Recap berhasil disimpan.');
      return;
    }

    const { data, error } = await supabase.from('annual_recaps').insert(payload).select('*').maybeSingle();
    setSaving(false);
    if (error) {
      onNotice('Gagal menambahkan Annual Recap.');
      return;
    }

    setRecord((data as AnnualRecapRecord | null) ?? null);
    onNotice(nextPublished ? 'Annual Recap berhasil dibuat dan dipublikasikan.' : 'Draft Annual Recap berhasil dibuat.');
  }

  async function handlePublish() {
    setPublishing(true);
    await saveRecord(true);
    setPublishing(false);
  }

  async function handleUnpublish() {
    setPublishing(true);
    if (!record?.id) {
      setPublishing(false);
      onNotice('Recap belum dibuat untuk tahun ini.');
      return;
    }

    const { error } = await supabase.from('annual_recaps').update({ published: false, updated_at: new Date().toISOString() }).eq('id', record.id);
    setPublishing(false);
    if (error) {
      onNotice('Gagal membatalkan publikasi Annual Recap.');
      return;
    }

    setRecord({ ...record, published: false });
    onNotice('Publikasi Annual Recap dibatalkan.');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Admin Penuh</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Annual Recap</h1>
        </div>
        {onBack && (
          <button type="button" onClick={onBack} className="btn-secondary">Kembali</button>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Pilih Tahun</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="input-field">
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveRecord(false)} disabled={saving || loading} className="btn-secondary">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Draft'}
            </button>
            <button type="button" onClick={() => void handlePublish()} disabled={saving || publishing || loading} className="btn-primary">
              <CheckCircle2 className="h-4 w-4" /> {publishing ? 'Memproses...' : 'Publish'}
            </button>
            <button type="button" onClick={() => void handleUnpublish()} disabled={saving || publishing || loading || !record?.id} className="btn-secondary">
              <EyeOff className="h-4 w-4" /> Unpublish
            </button>
            <a href={`/recap/${selectedYear}`} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
              <Eye className="h-4 w-4" /> Preview
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-blue-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-[0.18em]">Narasi Penutup</span>
          </div>
          <textarea value={closingNarrative} onChange={(event) => setClosingNarrative(event.target.value)} className="input-field min-h-[160px]" placeholder="Tulis narasi penutup jika ingin mengganti default." />
          <p className="mt-2 text-xs text-slate-500">Kosongkan untuk menggunakan default narasi standar.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-black uppercase tracking-[0.18em]">Status</span>
          </div>

          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
              <span>Tahun</span>
              <strong className="text-slate-900">{selectedYear}</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
              <span>Publikasi</span>
              <strong className={record?.published ? 'text-emerald-700' : 'text-slate-500'}>{record?.published ? 'Published' : 'Draft'}</strong>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs leading-5 text-slate-500">
              Recap akan dipublikasikan hanya jika status <strong>Published</strong> dan data tersedia dalam route publik <strong>/recap/{selectedYear}</strong>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
