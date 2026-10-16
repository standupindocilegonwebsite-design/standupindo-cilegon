import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import { ArrowDownToLine, CalendarDays, ChevronDown, Share2 } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type {
  RecapHistorySubmission,
  RecapOfficialLineup,
  RecapOpenMic,
  RecapRegistration,
  RecapSources,
  RecapStageExperience,
} from '@/lib/komika-recap';
import { buildKomikaYearRecap, getKomikaRecapYears } from '@/lib/komika-recap';

interface QueryPage {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface RecapProfile {
  stageName: string;
}

const PAGE_SIZE = 1000;

async function getAllRows(fetchPage: (from: number, to: number) => PromiseLike<QueryPage>) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function getJakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function formatReceiptRange() {
  return '01 Januari - 31 Desember';
}

const RECEIPT_LOGO_URL = '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png';
const RECEIPT_TEXTURE_URL = '/assets/images/receipt-paper-texture.svg?v=4';

function createGrayscaleLogo(source: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Logo hitam putih tidak dapat disiapkan di perangkat ini.'));
        return;
      }
      context.filter = 'grayscale(1) contrast(1.35)';
      context.drawImage(image, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Logo hitam putih gagal dibuat.'));
      }
    };
    image.onerror = () => reject(new Error('Logo struk gagal dimuat.'));
    image.src = source;
  });
}

async function createReceiptImage(receipt: HTMLElement) {
  await Promise.all([
    document.fonts.load('400 12px "IBM Plex Mono"'),
    document.fonts.load('700 12px "IBM Plex Mono"'),
  ]);
  const previousBackgroundImage = receipt.style.backgroundImage;
  const previousBackgroundColor = receipt.style.backgroundColor;
  receipt.style.backgroundImage = 'none';
  receipt.style.backgroundColor = 'transparent';
  let receiptCanvas: HTMLCanvasElement;
  try {
    receiptCanvas = await html2canvas(receipt, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });
  } finally {
    receipt.style.backgroundImage = previousBackgroundImage;
    receipt.style.backgroundColor = previousBackgroundColor;
  }
  const paperTexture = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Tekstur kertas struk gagal dimuat.'));
    image.src = RECEIPT_TEXTURE_URL;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Gambar struk tidak dapat dibuat di perangkat ini.');
  context.drawImage(paperTexture, 0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / receiptCanvas.width, canvas.height / receiptCanvas.height);
  const width = receiptCanvas.width * scale;
  const height = receiptCanvas.height * scale;
  context.drawImage(receiptCanvas, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Gambar struk gagal dibuat.')), 'image/png');
  });
}

function ReceiptRow({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 font-mono ${subtle ? 'text-[11px] sm:text-xs' : 'text-xs font-bold sm:text-sm'}`}>
      <span className="shrink-0">{label}</span>
      <span aria-hidden="true" className="min-w-2 flex-1 overflow-hidden whitespace-nowrap text-center text-zinc-400">{'. '.repeat(24)}</span>
      <strong className="shrink-0 text-right">{value}</strong>
    </div>
  );
}

function ReceiptMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 font-mono text-xs leading-6 sm:text-[13px]">
      <span className="relative flex min-w-0 justify-between">
        <strong className="whitespace-nowrap font-bold">{label}</strong>
        <strong aria-hidden="true" className="font-bold">:</strong>
      </span>
      {label === 'Nama Panggung' ? <strong className="min-w-0 break-words font-bold">{value}</strong> : <span className="min-w-0 break-words">{value}</span>}
    </div>
  );
}

export function MemberKomikaRecapPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const receiptRef = useRef<HTMLElement | null>(null);
  const [receiptLogo, setReceiptLogo] = useState(RECEIPT_LOGO_URL);
  const [receiptLogoError, setReceiptLogoError] = useState('');
  const [profile, setProfile] = useState<RecapProfile | null>(null);
  const [sources, setSources] = useState<RecapSources | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [yearInputError, setYearInputError] = useState('');
  const [yearOptionsOpen, setYearOptionsOpen] = useState(false);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareImage, setShareImage] = useState<{ year: number; blob: Blob } | null>(null);
  const [shareImageError, setShareImageError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const [receiptLogoReady, setReceiptLogoReady] = useState(false);
  useEffect(() => {
    let active = true;
    void createGrayscaleLogo(RECEIPT_LOGO_URL).then((grayscaleLogo) => {
      if (active) {
        setReceiptLogo(grayscaleLogo);
        setReceiptLogoReady(true);
      }
    }).catch((logoError: unknown) => {
      console.error('Logo hitam putih gagal disiapkan.', logoError);
      if (active) setReceiptLogoError(logoError instanceof Error ? logoError.message : 'Logo struk gagal disiapkan.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setLoading(false);
      setError('Sesi member tidak tersedia. Silakan masuk kembali.');
      return () => { active = false; };
    }

    void (async () => {
      setLoading(true);
      setError('');
      setProfile(null);
      setSources(null);
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('komika')
          .select('id, stage_name')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle();
        if (profileError) throw new Error('Profil member gagal dimuat.');
        if (!profileData) {
          if (active) {
            setProfile(null);
            setSources(null);
            setLoading(false);
          }
          return;
        }

        const currentDate = getJakartaToday();
        const currentYear = Number(currentDate.slice(0, 4));
        const [registrationRows, historyRows, lineupRows, experienceRows] = await Promise.all([
          getAllRows((from, to) => supabase.from('open_mic_registrations')
            .select('id, open_mic_id, status, attendance_status')
            .eq('komika_id', profileData.id)
            .eq('attendance_status', 'attended')
            .order('id')
            .range(from, to)),
          getAllRows((from, to) => supabase.from('member_open_mic_history_submissions')
            .select('id, activity_type, internal_open_mic_id, title, event_date, venue, city, status')
            .eq('komika_id', profileData.id)
            .eq('status', 'approved')
            .order('event_date')
            .order('id')
            .range(from, to)),
          getAllRows((from, to) => supabase.from('event_lineups')
            .select('id, event_id, role_category, role_title, event:events!inner(id, title, date, status, published, venue, location)')
            .eq('komika_id', profileData.id)
            .eq('events.published', true)
            .order('event_id')
            .range(from, to)),
          getAllRows((from, to) => supabase.from('member_stage_experiences')
            .select('id, event_date, event_name, role, custom_role, city')
            .eq('komika_id', profileData.id)
            .order('event_date')
            .order('id')
            .range(from, to)),
        ]);

        const registrations = registrationRows as unknown as RecapRegistration[];
        const openMicIds = [...new Set(registrations.map((item) => item.open_mic_id))];
        const openMics: RecapOpenMic[] = [];
        for (let offset = 0; offset < openMicIds.length; offset += 200) {
          const ids = openMicIds.slice(offset, offset + 200);
          const { data, error: openMicError } = await supabase.from('open_mics')
            .select('id, title, date, venue, location, status')
            .in('id', ids);
          if (openMicError) throw new Error('Tanggal Open Mic gagal dimuat.');
          openMics.push(...((data ?? []) as RecapOpenMic[]));
        }

        const recapSources: RecapSources = {
          registrations,
          openMics,
          history: historyRows as unknown as RecapHistorySubmission[],
          lineups: (lineupRows as unknown as RecapOfficialLineup[]).map((item) => ({
            ...item,
            event: Array.isArray(item.event) ? item.event[0] ?? null : item.event,
          })),
          experiences: experienceRows as unknown as RecapStageExperience[],
        };
        if (!active) return;
        setProfile({ stageName: profileData.stage_name?.trim() || 'NAMA PANGGUNG BELUM DIATUR' });
        setSources(recapSources);
        setToday(currentDate);
        setYears(getKomikaRecapYears(recapSources, currentYear, currentDate));
        setYear(currentYear);
        setYearInput(String(currentYear));
      } catch (loadError) {
        if (active) {
          console.error('Komika Recap gagal dimuat.', loadError);
          setError(loadError instanceof Error ? loadError.message : 'Data recap gagal dimuat. Coba lagi.');
          setSources(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user?.id, reloadToken]);

  const recap = useMemo(() => sources && today ? buildKomikaYearRecap(sources, year, today) : null, [sources, today, year]);
  const hasIncompleteLinks = Boolean(sources && (sources.lineups.some((item) => !item.event) || (recap?.missingOpenMicDetails ?? 0) > 0));

  useEffect(() => {
    let active = true;
    setShareImage(null);
    setShareImageError('');
    if (!recap || !profile || !receiptLogoReady || !receiptRef.current) return () => { active = false; };

    void createReceiptImage(receiptRef.current).then((blob) => {
      if (active) setShareImage({ year, blob });
    }).catch((imageError: unknown) => {
      console.error('Gambar recap untuk berbagi gagal disiapkan.', imageError);
      if (active) setShareImageError(imageError instanceof Error ? imageError.message : 'Gambar recap gagal disiapkan.');
    });
    return () => { active = false; };
  }, [profile, recap, receiptLogoReady, year]);

  function handleYearInput(value: string) {
    const nextValue = value.replace(/\D/g, '').slice(0, 4);
    setYearInput(nextValue);
    if (nextValue.length < 4) {
      setYearInputError('');
      return;
    }
    const nextYear = Number(nextValue);
    if (years.includes(nextYear)) {
      setYear(nextYear);
      setYearInputError('');
    } else {
      setYearInputError(`Belum ada data recap untuk ${nextValue}. Pilih tahun yang tersedia.`);
    }
  }

  function resetYearInput() {
    if (yearInputError || yearInput.length !== 4) setYearInput(String(year));
    setYearInputError('');
  }

  function selectYear(selectedYear: number) {
    setYear(selectedYear);
    setYearInput(String(selectedYear));
    setYearInputError('');
    setYearOptionsOpen(false);
  }

  async function makeImage() {
    if (!recap || !profile || !receiptRef.current) throw new Error('Data recap belum siap.');
    return createReceiptImage(receiptRef.current);
  }

  async function downloadReceipt() {
    if (sharing) return;
    setSharing(true);
    setShareMessage('');
    try {
      const blob = await makeImage();
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `komika-recap-${year}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1500);
      setShareMessage('Unduhan struk dimulai oleh browser.');
    } catch (downloadError) {
      setShareMessage(downloadError instanceof Error ? downloadError.message : 'Gambar struk gagal dibuat.');
    } finally {
      setSharing(false);
    }
  }

  async function shareReceipt() {
    if (sharing) return;
    if (!shareImage || shareImage.year !== year) {
      setShareMessage(shareImageError || 'Gambar recap sedang disiapkan. Coba lagi sebentar.');
      return;
    }
    const file = new File([shareImage.blob], `komika-recap-${year}.png`, { type: 'image/png' });
    const downloadForSharing = () => {
      const imageUrl = URL.createObjectURL(shareImage.blob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1500);
      setShareMessage('Berbagi langsung tidak didukung browser ini. Gambar diunduh; lampirkan dari galeri atau unduhan ke WhatsApp, Instagram, TikTok, atau aplikasi lain.');
    };
    if (typeof navigator.share !== 'function' || (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] }))) {
      downloadForSharing();
      return;
    }
    setSharing(true);
    setShareMessage('');
    try {
      await navigator.share({ title: `Komika Recap ${year}`, text: `Komika Recap ${year}`, files: [file] });
      setShareMessage('Pilih WhatsApp, Instagram, TikTok, atau aplikasi lain dari menu berbagi perangkat jika tersedia.');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      console.error('Native share sheet gagal dibuka.', shareError);
      downloadForSharing();
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Komika Recap" subtitle="My year on stage." />
      <div className="container-app max-w-3xl space-y-4 py-5 sm:py-7">
        <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_8px_24px_rgba(37,99,235,0.07)] sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-slate-900">Tahun Recap</h2>
              <p className="text-xs text-slate-500">Pilih dari daftar atau ketik tahun yang tersedia.</p>
            </div>
          </div>
          {recap && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button type="button" onClick={() => void downloadReceipt()} disabled={sharing || !receiptLogoReady} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> {receiptLogoReady ? 'Unduh Struk' : 'Menyiapkan...'}</button>
              <button type="button" onClick={() => void shareReceipt()} disabled={sharing || !receiptLogoReady || !shareImage || shareImage.year !== year} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"><Share2 className="h-4 w-4" /> {shareImageError ? 'Tidak siap' : shareImage && shareImage.year === year ? 'Bagikan' : 'Menyiapkan...'}</button>
            </div>
          )}
          {recap && <p className="mt-2 text-right text-[11px] text-slate-500">Bagikan membuka menu aplikasi yang mendukung gambar di perangkat Anda.</p>}
          {receiptLogoError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{receiptLogoError} Unduhan dan berbagi struk dinonaktifkan.</p>}
          {shareImageError && <p role="alert" className="mt-2 text-xs font-semibold text-amber-800">Gambar untuk berbagi belum siap: {shareImageError} Gunakan Unduh Struk.</p>}
          <div
            className="relative mt-3"
            onBlur={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setYearOptionsOpen(false);
                resetYearInput();
              }
            }}
          >
            <div className="flex gap-2">
              <input
                id="komika-recap-year"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={yearOptionsOpen}
                aria-controls="komika-recap-year-options"
                value={yearInput}
                onFocus={() => setYearOptionsOpen(true)}
                onChange={(event) => handleYearInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setYearOptionsOpen(false);
                  if (event.key === 'ArrowDown') setYearOptionsOpen(true);
                }}
                disabled={loading || years.length === 0}
                placeholder="Ketik tahun"
                className="input-field min-w-0 flex-1 !py-2.5 text-base font-bold"
                aria-describedby={yearInputError ? 'komika-recap-year-error' : 'komika-recap-year-help'}
              />
              <button
                type="button"
                aria-label={yearOptionsOpen ? 'Tutup pilihan tahun' : 'Buka pilihan tahun'}
                aria-expanded={yearOptionsOpen}
                aria-controls="komika-recap-year-options"
                onClick={() => setYearOptionsOpen((open) => !open)}
                disabled={loading || years.length === 0}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronDown className={`h-5 w-5 transition-transform ${yearOptionsOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {yearOptionsOpen && years.length > 0 && (
              <div id="komika-recap-year-options" role="listbox" aria-label="Tahun recap yang tersedia" className="absolute inset-x-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {years.map((availableYear) => (
                  <button
                    key={availableYear}
                    type="button"
                    role="option"
                    aria-selected={year === availableYear}
                    onClick={() => selectYear(availableYear)}
                    className={`min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold transition ${year === availableYear ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {availableYear}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p id={yearInputError ? 'komika-recap-year-error' : 'komika-recap-year-help'} className={`mt-1.5 text-[11px] font-medium ${yearInputError ? 'text-amber-800' : 'text-slate-500'}`} role={yearInputError ? 'alert' : undefined}>{yearInputError || 'Tahun hanya bisa dipilih jika datanya tersedia.'}</p>
        </section>

        {shareMessage && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">{shareMessage}</p>}
        {loading ? (
          <div className="mx-auto h-[34rem] max-w-md animate-pulse bg-white shadow-sm" aria-label="Memuat Komika Recap" />
        ) : error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><span>{error}</span><button type="button" onClick={() => setReloadToken((current) => current + 1)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">Coba lagi</button></div>
        ) : !profile || !sources ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">Profil komika belum terhubung dengan akun member ini.</div>
        ) : recap ? (
          <>
            <article ref={receiptRef} className="komika-recap-receipt relative mx-auto w-full max-w-md bg-[#fffefa] px-5 py-6 font-mono text-[11px] text-black sm:px-7 sm:text-xs" style={{ backgroundImage: `url("${RECEIPT_TEXTURE_URL}")`, backgroundSize: '100% 100%' }}>
              <header className="text-center">
                <img src={receiptLogo} alt="" crossOrigin="anonymous" data-receipt-logo className="mx-auto mb-2 h-14 w-auto object-contain" />
                <p className="text-xs font-extrabold tracking-wide sm:text-sm">STANDUPINDO CILEGON</p>
                <div aria-hidden="true" className="mt-2 border-y border-dashed border-zinc-500 py-0.5" />
                <h1 className="mt-3 text-base font-black sm:text-lg">MY YEAR ON STAGE · {recap.year}</h1>
                <p className="mt-1 text-[10px] font-bold tracking-[0.16em]">COMEDIAN RECAP</p>
              </header>
              <div className="my-5 space-y-1.5 border-y border-dashed border-zinc-400 py-4">
                <ReceiptMetaRow label="Nama Panggung" value={profile.stageName.toLocaleUpperCase('id-ID')} />
                <ReceiptMetaRow label="Riwayat" value={formatReceiptRange()} />
                <ReceiptMetaRow label="Tahun" value={String(recap.year)} />
              </div>

              <section aria-label="Statistik Open Mic" className="space-y-2">
                <ReceiptRow label="TOTAL OPEN MIC" value={`${recap.openMicTotal} kali`} />
                <ReceiptRow label="Open Mic Internal" value={`${recap.openMicInternal} kali`} subtle />
                <ReceiptRow label="Open Mic Eksternal" value={`${recap.openMicExternal} kali`} subtle />
              </section>
              <div className="my-3 border-t border-dashed border-zinc-400" />
              <section aria-label="Statistik Perjalanan Panggung" className="space-y-2">
                <ReceiptRow label="PERJALANAN PANGGUNG" value={`${recap.journeyTotal} kali`} />
                <ReceiptRow label="Event Internal" value={`${recap.journeyInternal} kali`} subtle />
                <ReceiptRow label="Event Eksternal" value={`${recap.journeyExternal} kali`} subtle />
              </section>

              <div className="my-4 border-t-2 border-dashed border-zinc-700" />
              <section aria-label="Penampilan terbaru" className="recap-recent-stages">
                <h2 className="text-xs font-black tracking-wide">RECENT STAGES</h2>
                {recap.recentStages.length === 0 ? (
                  <p className="mt-3 text-[10px] text-zinc-600">Belum ada penampilan tercatat pada {recap.year}.</p>
                ) : (
                  <ol className="mt-2 space-y-3.5">
                    {recap.recentStages.map((stage, index) => (
                      <li key={stage.id} className="border-b border-dashed border-zinc-300 pb-2 last:border-0">
                        <p className="break-words text-sm font-bold">{index + 1}. {stage.title}</p>
                        <p className="mt-1 text-right text-xs text-zinc-600">{formatReceiptDate(stage.date)}{stage.roles.length ? ` · ${stage.roles.join(' / ')}` : ''}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <div className="mb-1 mt-5 border-t-2 border-dashed border-zinc-700" />
              <div className="flex items-baseline justify-between py-1 font-mono text-sm font-black">
                <span>TOTAL STAGES</span>
                <span>{recap.totalStages} STAGES</span>
              </div>
              <div className="mt-7 space-y-0 text-center text-[10px] font-normal leading-4 text-zinc-700">
                <p>TERIMA KASIH SUDAH BERANI TAMPIL.</p>
                <p className="font-bold">*NO REFUNDS ON BAD JOKES*</p>
                <p>PANGGUNG BERIKUTNYA SUDAH MENANTI.</p>
                <p className="pt-3">SAMPAI JUMPA DI PANGGUNG BERIKUTNYA!</p>
              </div>
              <div className="mt-6 border-t border-dashed border-zinc-400 pt-3 text-center font-mono text-[9px] leading-4 text-zinc-500">BASED ON RECORDED MEMBER DATA</div>
              <a href={window.location.origin} target="_blank" rel="noopener noreferrer" className="mt-1 block text-center font-mono text-[10px] font-normal text-zinc-700 underline decoration-dotted underline-offset-2">{window.location.host}</a>
              <div aria-hidden="true" className="mt-2 border-t border-dashed border-zinc-300" />
            </article>
            <div data-receipt-exclude="true" className="mx-auto max-w-md space-y-1.5 text-[11px] leading-5 text-slate-600">
              <p>Open Mic dihitung dari kehadiran yang tercatat. Riwayat panggung masuk setelah disetujui dan tersimpan.</p>
              <p>Recap ini mengikuti data yang tercatat di akun Anda. Hubungi admin jika ada kegiatan yang belum muncul.</p>
              {hasIncompleteLinks && <p className="font-semibold text-amber-800">Beberapa data acara belum terhubung, jadi recap mungkin belum lengkap. Hubungi admin untuk bantuan.</p>}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
