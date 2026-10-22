import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ChevronDown, Eye, EyeOff, FileText, Music2, Save, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { AnnualRecapStory } from '@/pages/public/AnnualRecapStoryView';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';
import { DEFAULT_RECAP_CLOSING, loadAnnualRecapStats, loadHistoricalArchiveYears, type AnnualRecapRecord, type AnnualRecapStats } from '@/lib/annual-recap';
import { supabase } from '@/lib/supabase';

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

export function AnnualRecapAdminPage({ onNotice }: { onNotice: (message: string) => void }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInput, setYearInput] = useState(String(currentYear));
  const [yearSearch, setYearSearch] = useState('');
  const [records, setRecords] = useState<AnnualRecapRecord[]>([]);
  const [archiveYears, setArchiveYears] = useState<number[]>([]);
  const [archiveYearsError, setArchiveYearsError] = useState(false);
  const [record, setRecord] = useState<AnnualRecapRecord | null>(null);
  const [closingNarrative, setClosingNarrative] = useState(DEFAULT_RECAP_CLOSING);
  const [musicUrl, setMusicUrl] = useState('');
  const [stats, setStats] = useState<AnnualRecapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const validYearInput = /^\d{4}$/.test(yearInput)
    && Number(yearInput) >= 1900
    && Number(yearInput) <= currentYear;
  const availableYears = [...new Set([currentYear, selectedYear, ...archiveYears, ...records.map((item) => item.year)])]
    .sort((first, second) => second - first);
  const filteredRecords = records.filter((item) => String(item.year).includes(yearSearch.trim()));

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data, error } = await supabase.from('annual_recaps').select('*').order('year', { ascending: false });
      if (!active) return;
      if (error) {
        onNotice('Daftar Annual Recap gagal dimuat. Pastikan database Annual Recap sudah disiapkan.');
      } else {
        setRecords((data as AnnualRecapRecord[]) ?? []);
      }
      setRecordsLoading(false);
    })();

    return () => { active = false; };
  }, [onNotice]);

  useEffect(() => {
    let active = true;

    void loadHistoricalArchiveYears().then((years) => {
      if (active) setArchiveYears(years);
    }).catch((error: unknown) => {
      console.error('Tahun arsip untuk Annual Recap gagal dimuat.', error);
      if (active) setArchiveYearsError(true);
    });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setLoadError(false);
      setStatsError(false);
      setRecord(null);
      setStats(null);
      setMusicUrl('');

      const { data, error } = await supabase
        .from('annual_recaps')
        .select('*')
        .eq('year', selectedYear)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const nextRecord = (data as AnnualRecapRecord | null) ?? null;
      setRecord(nextRecord);
      setClosingNarrative(nextRecord?.closing_narrative?.trim() || DEFAULT_RECAP_CLOSING);
      setMusicUrl(nextRecord?.music_url ?? '');

      try {
        const nextStats = await loadAnnualRecapStats(selectedYear);
        if (active) setStats(nextStats);
      } catch {
        if (active) setStatsError(true);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedYear]);

  function updateRecordList(nextRecord: AnnualRecapRecord) {
    setRecords((current) => [nextRecord, ...current.filter((item) => item.year !== nextRecord.year)]
      .sort((first, second) => second.year - first.year));
  }

  async function saveRecord(nextPublished?: boolean) {
    if (!validYearInput || saving || musicUploading) return;
    setSaving(true);

    const payload: { closing_narrative: string | null; music_url?: string | null; updated_at: string; published?: boolean } = {
      closing_narrative: closingNarrative.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if ((record && 'music_url' in record) || musicUrl.trim()) payload.music_url = musicUrl.trim() || null;
    if (nextPublished !== undefined) payload.published = nextPublished;

    if (record?.id) {
      const { data, error } = await supabase.from('annual_recaps').update(payload).eq('id', record.id).select('*').single();
      setSaving(false);
      if (error) {
        onNotice('Gagal menyimpan Annual Recap.');
        return;
      }
      const savedRecord = data as AnnualRecapRecord;
      setRecord(savedRecord);
      updateRecordList(savedRecord);
      onNotice(nextPublished ? 'Annual Recap berhasil dipublikasikan.' : 'Perubahan Annual Recap berhasil disimpan.');
      return;
    }

    const { data, error } = await supabase.from('annual_recaps').insert({
      year: selectedYear,
      published: nextPublished ?? false,
      closing_narrative: payload.closing_narrative,
      music_url: payload.music_url,
    }).select('*').single();
    setSaving(false);
    if (error) {
      onNotice('Gagal menambahkan Annual Recap.');
      return;
    }

    const createdRecord = data as AnnualRecapRecord;
    setRecord(createdRecord);
    updateRecordList(createdRecord);
    onNotice(nextPublished ? 'Annual Recap berhasil dibuat dan dipublikasikan.' : 'Draft Annual Recap berhasil dibuat.');
  }

  async function handleMusicUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const contentType = AUDIO_CONTENT_TYPES[extension];
    if (!contentType) {
      onNotice('Format musik harus MP3, M4A, AAC, OGG, WAV, atau WebM.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      onNotice('Ukuran musik maksimal 25 MB.');
      return;
    }

    setMusicUploading(true);
    try {
      const path = `${selectedYear}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('annual-recap-audio').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });
      if (error) throw error;
      setMusicUrl(supabase.storage.from('annual-recap-audio').getPublicUrl(path).data.publicUrl);
      onNotice('Musik berhasil diunggah. Simpan perubahan untuk menerapkannya.');
    } catch {
      onNotice('Musik gagal diunggah. Pastikan bucket audio Annual Recap sudah disiapkan.');
    } finally {
      setMusicUploading(false);
    }
  }

  async function handlePublish() {
    if (statsError) {
      onNotice('Data Annual Recap belum dapat diverifikasi. Coba lagi sebelum publish.');
      return;
    }
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

    const updatedRecord = { ...record, published: false, updated_at: new Date().toISOString() };
    setRecord(updatedRecord);
    updateRecordList(updatedRecord);
    onNotice('Publikasi Annual Recap dibatalkan.');
  }

  function openSelectedYear() {
    if (!validYearInput) return;
    setSelectedYear(Number(yearInput));
  }

  if (previewOpen && stats) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950">
        <AnnualRecapStory
          year={selectedYear}
          stats={stats}
          closingNarrative={closingNarrative}
          musicUrl={musicUrl || null}
          onClose={() => setPreviewOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 sm:space-y-6">
      <WorkspacePageHeader eyebrow="Menu Lainnya" title="Annual Recap" subtitle="Kelola cerita dan publikasi recap per tahun." />

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="annual-recap-year-heading">
        <div>
          <p className="text-[10px] font-extrabold uppercase text-blue-600">Pengaturan</p>
          <h2 id="annual-recap-year-heading" className="mt-1 text-lg font-extrabold text-slate-900">Pilih tahun recap</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="annual-recap-year" className="label-field">Buka tahun lain</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input id="annual-recap-year" type="text" inputMode="numeric" list="annual-recap-year-options" maxLength={4} value={yearInput} onChange={(event) => setYearInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className="input-field min-w-0 text-base" aria-describedby="annual-recap-year-help" />
              <button type="button" onClick={openSelectedYear} disabled={!validYearInput || loading} className="btn-secondary px-3">Buka</button>
            </div>
            <datalist id="annual-recap-year-options">{availableYears.map((year) => <option key={year} value={year} />)}</datalist>
            <p id="annual-recap-year-help" className="text-xs text-slate-500">Masukkan tahun 4 digit, maksimal {currentYear}.</p>
            {archiveYearsError && <p role="alert" className="text-xs font-semibold text-amber-700">Daftar tahun arsip belum dapat dimuat. Tahun tetap bisa dibuka dengan mengetik langsung.</p>}
          </div>

          <label className="block space-y-1.5">
            <span className="label-field">Pilih recap tersimpan</span>
            <select value={selectedYear} onChange={(event) => { const year = Number(event.target.value); setSelectedYear(year); setYearInput(String(year)); }} className="input-field text-base">
              {availableYears.map((year) => <option key={year} value={year}>{year}{records.some((item) => item.year === year) ? ` · ${records.find((item) => item.year === year)?.published ? 'Published' : 'Draft'}` : ' · Belum dibuat'}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-4">
          <p className="text-xs font-bold text-slate-700">Aksi recap</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void saveRecord()} disabled={saving || publishing || musicUploading || loading || !validYearInput} className="btn-secondary w-full justify-center px-2">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : record?.published ? 'Simpan perubahan' : 'Simpan draft'}
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} disabled={loading || statsError || !stats} className="btn-secondary w-full justify-center px-2">
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button type="button" onClick={() => void handlePublish()} disabled={saving || publishing || musicUploading || loading || statsError || !validYearInput} className="btn-primary col-span-2 w-full justify-center">
              <CheckCircle2 className="h-4 w-4" /> {publishing ? 'Memproses...' : record?.published ? 'Simpan & publish' : 'Publish recap'}
            </button>
            {record?.published && <button type="button" onClick={() => void handleUnpublish()} disabled={saving || publishing || loading} className="btn-secondary col-span-2 w-full justify-center"><EyeOff className="h-4 w-4" />Unpublish recap</button>}
          </div>
        </div>
        {(loadError || statsError) && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError ? 'Data database Annual Recap gagal dimuat.' : 'Sumber statistik gagal dibaca; preview dan publish dinonaktifkan.'}</p>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Musik Annual Recap">
        <details className="group" open={Boolean(musicUrl)}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Music2 className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">Musik Story</span>
                <span className="block truncate text-xs text-slate-500">{musicUrl ? 'Musik terpasang' : 'Opsional · belum ada musik'}</span>
              </span>
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-slate-200 px-4 py-4">
            <p className="text-xs leading-5 text-slate-500">MP3, M4A, AAC, OGG, WAV, atau WebM · Maks. 25 MB. Musik berhenti setelah Story selesai.</p>
            <input ref={musicInputRef} type="file" accept=".mp3,.m4a,.aac,.ogg,.wav,.webm,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm" onChange={(event) => void handleMusicUpload(event)} className="hidden" />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => musicInputRef.current?.click()} disabled={loading || musicUploading} className="btn-secondary w-full justify-center sm:w-auto"><Upload className="h-4 w-4" />{musicUploading ? 'Mengunggah musik...' : musicUrl ? 'Ganti musik' : 'Upload musik'}</button>
              {musicUrl && <button type="button" onClick={() => { setMusicUrl(''); onNotice('Musik dihapus dari perubahan. Simpan untuk menerapkan.'); }} disabled={musicUploading} className="btn-secondary w-full justify-center sm:w-auto"><Trash2 className="h-4 w-4" />Hapus musik</button>}
            </div>
            {musicUrl && <audio controls preload="metadata" src={musicUrl} className="h-10 w-full" />}
          </div>
        </details>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="annual-recap-closing-heading">
          <div className="mb-3 flex items-center gap-2 text-blue-700">
            <Sparkles className="h-4 w-4" />
            <h2 id="annual-recap-closing-heading" className="text-sm font-bold">Narasi penutup</h2>
          </div>
          <textarea value={closingNarrative} onChange={(event) => setClosingNarrative(event.target.value)} disabled={loading || loadError} className="input-field min-h-[180px] text-base leading-relaxed" placeholder="Tulis narasi penutup jika ingin mengganti default." />
          <p className="mt-2 text-xs leading-5 text-slate-500">Kosongkan untuk menggunakan narasi standar.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="annual-recap-status-heading">
          <div className="mb-3 flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 id="annual-recap-status-heading" className="text-sm font-bold">Status recap</h2>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Tahun</dt><dd className="font-bold text-slate-900">{selectedYear}</dd></div>
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Publikasi</dt><dd><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record?.published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{record?.published ? 'Published' : 'Draft'}</span></dd></div>
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Penampilan terverifikasi</dt><dd className="font-bold text-slate-900">{stats?.appearanceCount.toLocaleString('id-ID') ?? '—'}</dd></div>
          </dl>
          <p className="mt-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Simpan perubahan tidak mengubah status publikasi. Gunakan Publish atau Unpublish untuk mengaturnya.</p>
        </section>
      </div>

      <section className="space-y-3" aria-label="Semua Annual Recap">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Semua tahun</h2>
            <p className="mt-0.5 text-xs text-slate-500">Pilih tahun tersimpan untuk mengedit.</p>
          </div>
          {recordsLoading && <span className="text-xs text-slate-500">Memuat...</span>}
        </div>
        {records.length > 0 && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" inputMode="numeric" value={yearSearch} onChange={(event) => setYearSearch(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Cari tahun, mis. 2025" aria-label="Cari tahun recap tersimpan" className="input-field pl-10" />
          </label>
        )}
        {filteredRecords.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredRecords.map((item) => (
              <button key={item.id ?? item.year} type="button" onClick={() => { setSelectedYear(item.year); setYearInput(String(item.year)); }} aria-current={selectedYear === item.year ? 'true' : undefined} className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${selectedYear === item.year ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="font-bold">{item.year}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.published ? 'Published' : 'Draft'}</span>
              </button>
            ))}
          </div>
        ) : !recordsLoading && records.length > 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Tidak ada recap untuk tahun tersebut.</p>
        ) : !recordsLoading && !loadError ? (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada Annual Recap tersimpan.</p>
        ) : null}
      </section>
    </div>
  );
}
