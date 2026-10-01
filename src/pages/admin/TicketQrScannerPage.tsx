import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, CheckCircle2, Clock3, Maximize2, Minimize2, QrCode, RefreshCw, Ticket, XCircle } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { getEventStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

interface ScannerEvent { id: string; title: string; date: string; status: string; total: number; checked_in: number; }
interface ScannerSummary { events: ScannerEvent[]; total_tickets: number; checked_in: number; not_checked_in: number; }
interface ScanResult { ok: boolean; status: string; message: string; checked_in_at?: string; }

async function invokeScanner<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body });
  if (!error) return { data: data as T, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const result = await context.json() as { error?: string };
      return { data: result as T, error: result.error ?? error.message };
    } catch {
      return { data: null as T, error: error.message };
    }
  }
  return { data: null as T, error: error.message };
}

export function TicketQrScannerPage({ events }: { events: EventItem[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraFrameRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanningRef = useRef(false);
  const [eventId, setEventId] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ScannerSummary | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  const [error, setError] = useState('');
  const selectableEvents = useMemo(() => events
    .filter((event) => getEventStatus(event.status, event.date) !== 'completed')
    .map((event) => ({ id: event.id, title: event.title, subtitle: `${event.date} · ${event.venue}` })), [events]);

  const loadSummary = useCallback(async () => {
    const { data, error: summaryError } = await invokeScanner<ScannerSummary>({ action: 'scanner-summary', scope_role: 'admin_qr' });
    if (summaryError || !data) {
      setError(summaryError ?? 'Ringkasan scanner gagal dimuat.');
      return;
    }
    setSummary(data);
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const syncFullscreenState = () => setCameraFullscreen(document.fullscreenElement === cameraFrameRef.current);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);
  useEffect(() => {
    if (!selectableEvents.some((event) => event.id === eventId)) {
      setEventId(selectableEvents[0]?.id ?? '');
      setResult(null);
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraActive(false);
    }
  }, [eventId, selectableEvents]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void loadSummary(); }, 20000);
    return () => window.clearInterval(interval);
  }, [loadSummary]);
  useEffect(() => () => controlsRef.current?.stop(), []);

  async function handleToken(token: string) {
    if (!eventId || scanningRef.current) return;
    scanningRef.current = true;
    setBusy(true);
    setError('');
    const { data, error: scanError } = await invokeScanner<ScanResult>({ action: 'check-in', event_id: eventId, qr_token: token });
    if (scanError || !data) {
      setResult({ ok: false, status: 'error', message: scanError ?? 'QR gagal divalidasi.' });
    } else {
      setResult(data);
    }
    setBusy(false);
    stopCamera();
    void loadSummary();
    window.setTimeout(() => { scanningRef.current = false; }, 1500);
  }

  async function handleManualCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || busy || scanningRef.current) return;
    scanningRef.current = true;
    stopCamera();
    setBusy(true);
    setError('');
    setResult(null);
    const { data, error: checkInError } = await invokeScanner<ScanResult>({
      action: 'manual-check-in',
      event_id: eventId,
      order_number: manualOrderNumber.trim(),
    });
    setBusy(false);
    window.setTimeout(() => { scanningRef.current = false; }, 1500);
    if (checkInError || !data) {
      setResult({ ok: false, status: 'error', message: checkInError ?? 'Check-in manual gagal.' });
      return;
    }
    setResult(data);
    if (data.ok) {
      setManualOrderNumber('');
    }
    void loadSummary();
  }

  async function startCamera() {
    if (!videoRef.current || !eventId) {
      setError('Pilih Event terlebih dahulu.');
      return;
    }
    setError('');
    setResult(null);
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (decoded) => {
        if (decoded && !scanningRef.current) void handleToken(decoded.getText());
      });
      setCameraActive(true);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : 'Kamera tidak dapat dibuka. Pastikan izin kamera aktif.');
      setCameraActive(false);
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    if (document.fullscreenElement === cameraFrameRef.current) {
      void document.exitFullscreen().catch((fullscreenError: unknown) => {
        setError(fullscreenError instanceof Error ? fullscreenError.message : 'Mode layar penuh tidak dapat ditutup.');
      });
    }
  }

  async function toggleCameraFullscreen() {
    const cameraFrame = cameraFrameRef.current;
    if (!cameraFrame) return;
    try {
      if (document.fullscreenElement === cameraFrame) {
        await document.exitFullscreen();
      } else {
        await cameraFrame.requestFullscreen();
      }
    } catch (fullscreenError) {
      setError(fullscreenError instanceof Error ? fullscreenError.message : 'Mode layar penuh tidak tersedia di browser ini.');
    }
  }

  const statusTone = result?.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Scan Tiket" subtitle="Check-in divalidasi server-side dan hanya dapat digunakan satu kali." eyebrow="Admin QR Scanner" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Tiket terjual</p><p className="mt-1 text-2xl font-black text-slate-950">{summary?.total_tickets ?? '—'}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Check-in</p><p className="mt-1 text-2xl font-black text-emerald-700">{summary?.checked_in ?? '—'}</p></div><div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1"><p className="text-xs text-slate-500">Belum check-in</p><p className="mt-1 text-2xl font-black text-blue-700">{summary?.not_checked_in ?? '—'}</p></div></div>
      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="space-y-2">
            <label className="label-field">Event</label>
            <SearchableEventSelect
              options={selectableEvents}
              value={eventId || 'all'}
              onChange={(value) => { stopCamera(); setEventId(value === 'all' ? '' : value); setResult(null); }}
              allLabel="Pilih Event"
              ariaLabel="Pilih Event untuk scan"
            />
          </div>
          <div
            ref={cameraFrameRef}
            className={`${cameraFullscreen ? 'fixed inset-0 z-[100] flex items-center justify-center rounded-none border-0 p-3' : 'relative aspect-[4/3] w-full rounded-xl border sm:aspect-video'} overflow-hidden border-slate-800 bg-slate-950`}
          >
            <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
            {cameraActive && <button
              type="button"
              onClick={() => void toggleCameraFullscreen()}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label={cameraFullscreen ? 'Keluar dari layar penuh' : 'Perbesar kamera ke layar penuh'}
              title={cameraFullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'}
            >
              {cameraFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void startCamera()} disabled={cameraActive || busy || !eventId} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(29,78,216,0.24)] transition hover:from-blue-800 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">{cameraActive ? <><Camera className="h-4 w-4" /> Kamera Aktif</> : <><Camera className="h-4 w-4" /> Mulai Scan</>}</button>
            {cameraActive && <button type="button" onClick={stopCamera} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"><CameraOff className="h-4 w-4" /> Hentikan</button>}
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</p>}
          <form onSubmit={(event) => void handleManualCheckIn(event)} className="space-y-3 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-extrabold text-slate-900">Check-in Manual</h2>
            <label className="block text-xs font-semibold text-slate-600">Nomor order<input required value={manualOrderNumber} onChange={(event) => setManualOrderNumber(event.target.value.toUpperCase())} className="input-field mt-1" placeholder="ABC-123456" /></label>
            <p className="text-xs leading-5 text-slate-500">Jika order berisi beberapa tiket, setiap validasi akan check-in satu tiket berikutnya yang belum digunakan.</p>
            <button type="submit" disabled={busy || !eventId} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-800 bg-white px-4 py-3 text-sm font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">{busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" /> Memeriksa tiket...</> : <><CheckCircle2 className="h-4 w-4" /> Validasi & Check-in</>}</button>
          </form>
        </div>
        <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold text-slate-900">Hasil Scan</h2><button type="button" onClick={() => { setResult(null); void loadSummary(); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh hasil"><RefreshCw className="h-4 w-4" /></button></div>
          {busy ? <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-slate-500"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />Memeriksa tiket...</div> : result ? <div className={`rounded-xl border p-4 ${statusTone}`}><div className="flex items-center gap-2">{result.ok ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}<p className="font-extrabold">{result.message}</p></div>{result.checked_in_at && <p className="mt-2 inline-flex items-center gap-1.5 text-xs"><Clock3 className="h-3.5 w-3.5" />{new Date(result.checked_in_at).toLocaleString('id-ID')}</p>}</div> : <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500"><QrCode className="mb-2 h-8 w-8 text-slate-300" />Arahkan QR tiket ke kamera untuk memeriksa status.</div>}
          <div className="border-t border-slate-100 pt-3"><h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Ticket className="h-4 w-4" /> Ringkasan per Event</h3><div className="space-y-2">{summary?.events.filter((event) => !eventId || event.id === eventId).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold text-slate-700">{event.title}</span><div className="flex shrink-0 items-center gap-2"><StatusBadge status={getEventStatus(event.status, event.date)} /><span className="text-slate-500">{event.checked_in}/{event.total}</span></div></div>)}</div></div>
        </div>
      </section>
    </div>
  );
}