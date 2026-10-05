import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, Check, CheckCircle2, Clock3, Maximize2, Minimize2, QrCode, RefreshCw, SwitchCamera, Ticket, Trash2, XCircle } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { getEventStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { Modal } from '@/components/ui/Modal';

interface ScannerEvent { id: string; title: string; date: string; status: 'upcoming' | 'completed' | 'cancelled'; total: number; checked_in: number; }
interface RecentCheckIn {
  full_name: string;
  order_number: string | null;
  order_type: 'paid' | 'free_pass';
  sequence_no: number;
  checked_in_at: string;
}
interface ScannerSummary {
  events: ScannerEvent[];
  total_tickets: number;
  checked_in: number;
  not_checked_in: number;
  attendees?: RecentCheckIn[];
  attendees_event_id?: string;
}
interface ScanResult {
  ok: boolean;
  status: string;
  message: string;
  event_title?: string;
  checkin_start?: string;
  full_name?: string;
  ticket_category?: string;
  ticket_number?: number;
  order_number?: string | null;
  order_type?: 'paid' | 'free_pass';
  checked_in_at?: string;
  gate?: string;
  gate_name?: string;
  allowed_categories?: string[];
}
interface ScanHistoryEntry {
  id: string;
  scanned_at: string;
  event_title: string;
  result: ScanResult;
}
interface ScannerGate { id: string; name: string; categories?: string[]; }
interface ScannerSelection { event_id: string; gate_id: string; applied_gate_id: string; }
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement() {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

function scannerSelectionStorageKey(userId: string) {
  return `admin-qr-scanner-selection:${userId}`;
}

function readScannerSelection(userId: string | undefined): ScannerSelection | null {
  if (!userId) return null;
  try {
    const stored = localStorage.getItem(scannerSelectionStorageKey(userId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('event_id' in parsed)
      || typeof parsed.event_id !== 'string' || !('gate_id' in parsed) || typeof parsed.gate_id !== 'string'
      || !('applied_gate_id' in parsed) || typeof parsed.applied_gate_id !== 'string') {
      throw new Error('Format pilihan Event/Gate tersimpan tidak valid.');
    }
    return parsed as ScannerSelection;
  } catch (error) {
    console.error('Pilihan scanner tersimpan gagal dibaca.', error);
    return null;
  }
}

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
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraFrameRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanningRef = useRef(false);
  const scanHistoryRef = useRef<ScanHistoryEntry[]>([]);
  const [eventId, setEventId] = useState(() => readScannerSelection(user?.id)?.event_id ?? '');
  const [gateId, setGateId] = useState('');
  const [appliedGateId, setAppliedGateId] = useState('');
  const [gates, setGates] = useState<ScannerGate[]>([]);
  const [gatesEnabled, setGatesEnabled] = useState(false);
  const [gateSettingsLoaded, setGateSettingsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ScannerSummary | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  const [error, setError] = useState('');
  const recentCheckIns = useMemo(() => (summary?.attendees ?? [])
    .filter((attendee) => Boolean(attendee.checked_in_at))
    .sort((first, second) => Date.parse(second.checked_in_at) - Date.parse(first.checked_in_at))
    .slice(0, 3), [summary?.attendees]);
  const selectableEvents = useMemo(() => events
    .filter((event) => getEventStatus(event.status, event.date) !== 'completed')
    .map((event) => ({ id: event.id, title: event.title, subtitle: `${event.date} · ${event.venue}` })), [events]);
  const scanHistoryStorageKey = user?.id && eventId ? `admin-qr-scan-history:${user.id}:${eventId}` : '';

  const saveScannerSelection = useCallback((selection: ScannerSelection) => {
    if (!user?.id) return;
    try {
      localStorage.setItem(scannerSelectionStorageKey(user.id), JSON.stringify(selection));
    } catch (storageError) {
      setError(storageError instanceof Error ? `Pilihan Event/Gate gagal disimpan: ${storageError.message}` : 'Pilihan Event/Gate gagal disimpan di perangkat ini.');
    }
  }, [user?.id]);

  useEffect(() => {
    scanHistoryRef.current = [];
    setScanHistory([]);
    if (!scanHistoryStorageKey) return;
    try {
      const storedHistory = localStorage.getItem(scanHistoryStorageKey);
      if (!storedHistory) return;
      const parsed: unknown = JSON.parse(storedHistory);
      if (!Array.isArray(parsed) || parsed.some((entry) => !entry || typeof entry !== 'object'
        || typeof entry.id !== 'string' || typeof entry.scanned_at !== 'string'
        || !entry.result || typeof entry.result !== 'object')) {
        throw new Error('Format riwayat scan lokal tidak valid.');
      }
      const history = (parsed as ScanHistoryEntry[]).slice(0, 1);
      scanHistoryRef.current = history;
      setScanHistory(history);
      if (history.length !== parsed.length) localStorage.setItem(scanHistoryStorageKey, JSON.stringify(history));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Riwayat scan lokal gagal dibaca.');
    }
  }, [scanHistoryStorageKey]);

  const loadSummary = useCallback(async () => {
    const { data, error: summaryError } = await invokeScanner<ScannerSummary>({
      action: 'scanner-summary',
      scope_role: 'admin_qr',
      ...(eventId ? { event_id: eventId } : {}),
    });
    if (summaryError || !data) {
      setError(summaryError ?? 'Ringkasan scanner gagal dimuat.');
      return;
    }
    setSummary({ ...data, attendees_event_id: eventId });
  }, [eventId]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => {
    let active = true;
    setGates([]);
    setGateId('');
    setAppliedGateId('');
    setGatesEnabled(false);
    setGateSettingsLoaded(false);
    if (!eventId) return () => { active = false; };
    void invokeScanner<{ gates: ScannerGate[]; gates_enabled: boolean }>({ action: 'scanner-gates', event_id: eventId }).then(({ data, error: gateError }) => {
      if (!active) return;
      if (gateError || !data) {
        setError(gateError ?? 'Daftar Gate gagal dimuat.');
        return;
      }
      const availableGates = (data.gates ?? []).map((gate) => ({ ...gate, categories: gate.categories ?? [] }));
      const savedSelection = readScannerSelection(user?.id);
      const selectedGateId = availableGates.some((gate) => gate.id === savedSelection?.gate_id)
        ? savedSelection?.gate_id ?? ''
        : availableGates[0]?.id ?? '';
      const selectedAppliedGateId = data.gates_enabled && selectedGateId === savedSelection?.gate_id
        && selectedGateId === savedSelection?.applied_gate_id ? selectedGateId : '';
      setGates(availableGates);
      setGatesEnabled(data.gates_enabled);
      setGateId(selectedGateId);
      setAppliedGateId(selectedAppliedGateId);
      saveScannerSelection({
        event_id: eventId,
        gate_id: selectedGateId,
        applied_gate_id: selectedAppliedGateId,
      });
      setGateSettingsLoaded(true);
    });
    return () => { active = false; };
  }, [eventId, saveScannerSelection, user?.id]);
  useEffect(() => {
    const syncFullscreenState = () => setCameraFullscreen(getFullscreenElement() === cameraFrameRef.current);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
    };
  }, []);
  useEffect(() => {
    if (eventId && selectableEvents.length && !selectableEvents.some((event) => event.id === eventId)) {
      setEventId('');
      setGateId('');
      setAppliedGateId('');
      setGateSettingsLoaded(false);
      setResult(null);
      saveScannerSelection({ event_id: '', gate_id: '', applied_gate_id: '' });
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraActive(false);
    }
  }, [eventId, saveScannerSelection, selectableEvents]);
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase.channel(`ticket-checkins-${eventId}`)
      .on('broadcast', { event: 'check-in-updated' }, () => { void loadSummary(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [eventId, loadSummary]);
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
    const { data, error: scanError } = await invokeScanner<ScanResult>({
      action: 'check-in',
      event_id: eventId,
      gate_id: gatesEnabled ? appliedGateId : null,
      qr_token: token,
    });
    const scanResult: ScanResult = scanError || !data
      ? { ok: false, status: 'error', message: scanError ?? 'QR gagal divalidasi.' }
      : { ...data, gate_name: data.gate_name ?? gates.find((gate) => gate.id === appliedGateId)?.name };
    setResult(scanResult);
    saveScanHistory(scanResult);
    setBusy(false);
    stopCamera(false);
    void loadSummary();
    scanningRef.current = false;
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
      gate_id: gatesEnabled ? appliedGateId : null,
      order_number: manualOrderNumber.trim(),
    });
    setBusy(false);
    scanningRef.current = false;
    if (checkInError || !data) {
      const scanResult = { ok: false, status: 'error', message: checkInError ?? 'Check-in manual gagal.' };
      setResult(scanResult);
      saveScanHistory(scanResult);
      return;
    }
    setResult(data);
    saveScanHistory(data);
    if (data.ok) {
      setManualOrderNumber('');
    }
    void loadSummary();
  }

  function saveScanHistory(scanResult: ScanResult) {
    const scannedAt = new Date().toISOString();
    const entry: ScanHistoryEntry = {
      id: `${scannedAt}-${crypto.randomUUID()}`,
      scanned_at: scannedAt,
      event_title: selectableEvents.find((event) => event.id === eventId)?.title ?? 'Event',
      result: scanResult,
    };
    const nextHistory = [entry];
    scanHistoryRef.current = nextHistory;
    setScanHistory(nextHistory);
    if (!scanHistoryStorageKey) return;
    try {
      localStorage.setItem(scanHistoryStorageKey, JSON.stringify(nextHistory));
    } catch (historyError) {
      setError(historyError instanceof Error ? `Riwayat scan gagal disimpan: ${historyError.message}` : 'Riwayat scan gagal disimpan di perangkat ini.');
    }
  }

  function clearScanHistory() {
    scanHistoryRef.current = [];
    setScanHistory([]);
    if (!scanHistoryStorageKey) return;
    try {
      localStorage.removeItem(scanHistoryStorageKey);
    } catch (historyError) {
      setError(historyError instanceof Error ? `Riwayat scan gagal dihapus: ${historyError.message}` : 'Riwayat scan gagal dihapus dari perangkat ini.');
    }
  }

  function getScanHistoryTitle(status: string) {
    if (status === 'checked_in') return 'CHECK-IN BERHASIL';
    if (status === 'already_used') return 'SUDAH DIGUNAKAN';
    if (status === 'checkin_not_open') return 'CHECK-IN BELUM DIBUKA';
    if (status === 'checkin_closed') return 'CHECK-IN SUDAH DITUTUP';
    if (status === 'gate_mismatch') return 'AKSES GATE TIDAK SESUAI';
    if (status === 'error') return 'SCAN GAGAL';
    return 'TIKET TIDAK VALID';
  }

  function getScanHistoryTone(status: string) {
    if (status === 'checked_in') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    if (status === 'error') return 'border-amber-200 bg-amber-50 text-amber-900';
    return 'border-red-200 bg-red-50 text-red-900';
  }

  async function startCamera(cameraId = selectedCameraId) {
    if (!videoRef.current || !eventId || !gateSettingsLoaded || (gatesEnabled && (!gateId || appliedGateId !== gateId))) {
      setError(!eventId ? 'Pilih Event terlebih dahulu.' : gatesEnabled && (!gateId || appliedGateId !== gateId) ? 'Pilih Gate lalu tekan Gunakan Gate sebelum memulai scan.' : 'Pengaturan akses Event masih dimuat.');
      return;
    }
    setError('');
    setResult(null);
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints({
        video: cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: 'environment' } },
        audio: false,
      }, videoRef.current, (decoded) => {
        if (decoded && !scanningRef.current) void handleToken(decoded.getText());
      });
      setCameraActive(true);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        setVideoDevices(cameras);
        const activeDeviceId = (videoRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings().deviceId;
        if (activeDeviceId) setSelectedCameraId(activeDeviceId);
      } catch {
        setError('Kamera aktif, tetapi daftar perangkat kamera tidak dapat dimuat.');
      }
    } catch (cameraError) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setError(cameraError instanceof Error ? cameraError.message : 'Kamera tidak dapat dibuka. Pastikan izin kamera aktif.');
      setCameraActive(false);
    }
  }

  async function switchCamera() {
    if (videoDevices.length < 2 || busy) return;
    const activeIndex = videoDevices.findIndex((device) => device.deviceId === selectedCameraId);
    const nextCamera = videoDevices[activeIndex < 0 ? 1 : (activeIndex + 1) % videoDevices.length];
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    setError('');
    await startCamera(nextCamera.deviceId);
  }

  function stopCamera(exitFullscreen = true) {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    if (exitFullscreen && getFullscreenElement() === cameraFrameRef.current) {
      const fullscreenDocument = document as FullscreenDocument;
      const exitFullscreen = document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen;
      if (typeof exitFullscreen !== 'function') {
        setError('Mode layar penuh tidak dapat ditutup di browser ini.');
        return;
      }
      void Promise.resolve(exitFullscreen.call(document)).catch((fullscreenError: unknown) => {
        setError(fullscreenError instanceof Error ? fullscreenError.message : 'Mode layar penuh tidak dapat ditutup.');
      });
    }
  }

  async function toggleCameraFullscreen() {
    const cameraFrame = cameraFrameRef.current;
    if (!(cameraFrame instanceof HTMLElement)) {
      setError('Elemen kamera tidak tersedia untuk mode layar penuh.');
      return;
    }
    const fullscreenDocument = document as FullscreenDocument;
    try {
      if (getFullscreenElement() === cameraFrame) {
        const exitFullscreen = document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen;
        if (typeof exitFullscreen !== 'function') {
          setError('Mode layar penuh tidak dapat ditutup di browser ini.');
          return;
        }
        await exitFullscreen.call(document);
      } else {
        const fullscreenElement = cameraFrame as FullscreenElement;
        const requestFullscreen = cameraFrame.requestFullscreen ?? fullscreenElement.webkitRequestFullscreen;
        if (typeof requestFullscreen !== 'function') {
          setError('Mode layar penuh tidak tersedia di browser atau perangkat ini.');
          return;
        }
        await requestFullscreen.call(cameraFrame);
      }
    } catch (fullscreenError) {
      setError(fullscreenError instanceof Error ? fullscreenError.message : 'Mode layar penuh tidak tersedia di browser ini.');
    }
  }

  const resultTitle = result?.status === 'checked_in' ? 'TIKET VALID'
    : result?.status === 'already_used' ? 'SUDAH DIGUNAKAN'
      : result?.status === 'checkin_not_open' ? 'CHECK-IN BELUM DIBUKA'
        : result?.status === 'checkin_closed' ? 'CHECK-IN SUDAH DITUTUP'
          : result?.status === 'gate_mismatch' ? 'AKSES TIDAK SESUAI'
            : result?.status === 'error' ? 'SCAN GAGAL' : 'TIKET TIDAK VALID';
  const resultTone = result?.status === 'checked_in' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : result?.status === 'error' ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-red-200 bg-red-50 text-red-900';
  const checkedInAt = result?.checked_in_at ? new Date(result.checked_in_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '';

  function scanAgain() {
    setResult(null);
    void startCamera();
  }

  function ResultDetails() {
    if (!result) return null;
    const row = (label: string, value: string | number | null | undefined) => value !== null && value !== undefined && value !== ''
      ? <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0"><dt className="shrink-0 text-sm text-slate-500">{label}</dt><dd className="min-w-0 break-words text-right text-sm font-bold text-slate-900">{value}</dd></div>
      : null;
    const isInvalid = result.status === 'invalid';
    const checkinStart = result.checkin_start && !Number.isNaN(Date.parse(result.checkin_start))
      ? new Date(result.checkin_start).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
      : result.checkin_start;

    return (
      <div className={`rounded-2xl border p-4 ${resultTone}`}>
        <div className="mb-3 flex items-center gap-2">
          {result.status === 'checked_in' ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : <XCircle className="h-6 w-6 shrink-0" />}
          <h3 className="text-base font-black tracking-wide">{resultTitle}</h3>
        </div>
        {isInvalid ? <p className="text-sm leading-6">QR Code tidak ditemukan atau tiket tidak dapat digunakan.</p>
          : result.status === 'checkin_not_open' ? <div className="space-y-1 text-sm leading-6">
            {row('Event', result.event_title)}
            {row('Check-in dimulai', checkinStart)}
            <p className="pt-2">Tiket tetap aktif dan belum digunakan.</p>
          </div>
            : result.status === 'checkin_closed' ? <div className="space-y-1 text-sm leading-6">
              {row('Event', result.event_title)}
              <p>Periode check-in telah berakhir.</p>
            </div>
              : result.status === 'gate_mismatch' ? <div className="space-y-1 text-sm leading-6">
                {row('Tiket', result.ticket_category)}
                {row('Gate ini', result.allowed_categories?.join(', ') || result.gate_name)}
                <p>Silakan menuju gate yang sesuai.</p>
              </div>
                : result.status === 'checked_in' || result.status === 'already_used' ? <dl className="divide-y divide-slate-100 rounded-xl bg-white/80 px-3">
                  {row('Nama', result.full_name)}
                  {result.order_type === 'free_pass' && <div className="flex justify-end py-2"><span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-extrabold tracking-wide text-amber-900">FREE PASS</span></div>}
                  {row('Kategori', result.ticket_category)}
                  {row('Tiket', result.ticket_number ? `#${result.ticket_number}` : null)}
                  {result.status === 'checked_in' && row('Order', result.order_number)}
                  {row('Status', result.status === 'checked_in' ? 'CHECK-IN BERHASIL' : 'SUDAH DIGUNAKAN')}
                  {row(result.status === 'checked_in' ? 'Waktu Check-in' : 'Check-in sebelumnya', checkedInAt)}
                  {result.status === 'already_used' && row('Gate', result.gate)}
                </dl>
                  : <p className="text-sm leading-6">{result.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Scan Tiket" subtitle="Check-in divalidasi server-side dan hanya dapat digunakan satu kali." eyebrow="Admin QR Scanner" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Tiket diterbitkan</p><p className="mt-1 text-2xl font-black text-slate-950">{summary?.total_tickets ?? '—'}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Check-in</p><p className="mt-1 text-2xl font-black text-emerald-700">{summary?.checked_in ?? '—'}</p></div><div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1"><p className="text-xs text-slate-500">Belum check-in</p><p className="mt-1 text-2xl font-black text-blue-700">{summary?.not_checked_in ?? '—'}</p></div></div>
      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="space-y-2">
            <label className="label-field">Event</label>
            <SearchableEventSelect
              options={selectableEvents}
              value={eventId || 'all'}
              onChange={(value) => {
                const nextEventId = value === 'all' ? '' : value;
                if (nextEventId === eventId) return;
                stopCamera();
                setEventId(nextEventId);
                setGateId('');
                setAppliedGateId('');
                setGateSettingsLoaded(false);
                setResult(null);
                setError('');
                saveScannerSelection({ event_id: nextEventId, gate_id: '', applied_gate_id: '' });
              }}
              allLabel="Pilih Event"
              ariaLabel="Pilih Event untuk scan"
            />
          </div>
          <div className="space-y-2">
            <label className="label-field" htmlFor="scanner-gate">Gate</label>
            <select id="scanner-gate" value={gatesEnabled ? gateId : ''} onChange={(event) => { setGateId(event.target.value); setAppliedGateId(''); saveScannerSelection({ event_id: eventId, gate_id: event.target.value, applied_gate_id: '' }); setError(''); }} disabled={!eventId || !gateSettingsLoaded || !gatesEnabled || !gates.length || cameraActive || busy} className="input-field">
              {!eventId && <option value="">Pilih Event terlebih dahulu</option>}
              {eventId && !gateSettingsLoaded && <option value="">Memuat Gate...</option>}
              {gateSettingsLoaded && !gatesEnabled && <option value="">Semua kategori</option>}
              {gateSettingsLoaded && gatesEnabled && !gates.length && <option value="">Gate belum dikonfigurasi</option>}
              {eventId && gateSettingsLoaded && gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
            </select>
            {!eventId && <p className="text-xs text-slate-500">Pilih Event terlebih dahulu untuk melihat Gate yang tersedia.</p>}
            {eventId && !gateSettingsLoaded && <p className="text-xs text-slate-500">Sedang memuat pengaturan Gate untuk Event ini.</p>}
            {gateSettingsLoaded && !gatesEnabled && <p className="text-xs text-slate-500">Mode default menerima semua kategori tiket.</p>}
            {gateSettingsLoaded && gatesEnabled && !gates.length && <p className="text-xs text-amber-700">Gate dibatasi tetapi belum dikonfigurasi. Minta Admin Tiket mengatur Gate untuk Event ini.</p>}
            {gateSettingsLoaded && gatesEnabled && Boolean(gates.length) && (() => {
              const selectedGate = gates.find((gate) => gate.id === gateId);
              const gateIsApplied = Boolean(gateId) && appliedGateId === gateId;
              return <div className={`space-y-2.5 rounded-xl border px-3 py-2.5 ${gateIsApplied ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/80'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-600">Tiket yang boleh masuk</p>
                  {gateIsApplied && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-3.5 w-3.5" /> Siap untuk scan</span>}
                </div>
                {selectedGate?.categories?.length
                  ? <div className="flex flex-wrap gap-1.5">{selectedGate.categories.map((category) => <span key={category} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${gateIsApplied ? 'bg-white text-emerald-800' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{category}</span>)}</div>
                  : <p className="text-xs text-amber-800">Tidak ada kategori tiket aktif yang terdaftar pada Gate ini.</p>}
                {!gateIsApplied && <button type="button" onClick={() => { setAppliedGateId(gateId); saveScannerSelection({ event_id: eventId, gate_id: gateId, applied_gate_id: gateId }); setResult(null); setError(''); }} disabled={!gateId || !selectedGate?.categories?.length || cameraActive || busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                  <Check className="h-4 w-4" /> Gunakan Gate
                </button>}
              </div>;
            })()}
          </div>
          <div
            ref={cameraFrameRef}
            className={`${cameraFullscreen ? 'fixed inset-0 z-[100] flex items-center justify-center rounded-none border-0 p-3' : 'relative aspect-[4/3] w-full rounded-xl border sm:aspect-video'} overflow-hidden border-slate-800 bg-slate-950`}
          >
            <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
            {cameraActive && videoDevices.length > 1 && <button
              type="button"
              onClick={() => void switchCamera()}
              className="absolute right-3 top-16 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Ganti kamera depan atau belakang"
              title="Ganti kamera"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>}
            {cameraActive && <button
              type="button"
              onClick={() => void toggleCameraFullscreen()}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label={cameraFullscreen ? 'Keluar dari layar penuh' : 'Perbesar kamera ke layar penuh'}
              title={cameraFullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'}
            >
              {cameraFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>}
            {result && cameraFullscreen && <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="fullscreen-scan-result-title">
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
                <h2 id="fullscreen-scan-result-title" className="text-lg font-black text-slate-950">{resultTitle}</h2>
                <ResultDetails />
                <button type="button" onClick={scanAgain} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                  <RefreshCw className="h-4 w-4" /> Scan Lagi
                </button>
              </div>
            </div>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void startCamera()} disabled={cameraActive || busy || !eventId || !gateSettingsLoaded || (gatesEnabled && (!gateId || appliedGateId !== gateId))} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(29,78,216,0.24)] transition hover:from-blue-800 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">{cameraActive ? <><Camera className="h-4 w-4" /> Kamera Aktif</> : <><Camera className="h-4 w-4" /> Mulai Scan</>}</button>
            {cameraActive && <button type="button" onClick={() => stopCamera()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"><CameraOff className="h-4 w-4" /> Hentikan</button>}
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</p>}
          <form onSubmit={(event) => void handleManualCheckIn(event)} className="space-y-3 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-extrabold text-slate-900">Check-in Manual</h2>
            <label className="block text-xs font-semibold text-slate-600">Nomor order<input required value={manualOrderNumber} onChange={(event) => setManualOrderNumber(event.target.value.toUpperCase())} className="input-field mt-1" placeholder="ABC-123456" /></label>
            <p className="text-xs leading-5 text-slate-500">Jika order berisi beberapa tiket, setiap validasi akan check-in satu tiket berikutnya yang belum digunakan.</p>
            <button type="submit" disabled={busy || !eventId || !gateSettingsLoaded || (gatesEnabled && (!gateId || appliedGateId !== gateId))} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-800 bg-white px-4 py-3 text-sm font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">{busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" /> Memeriksa tiket...</> : <><CheckCircle2 className="h-4 w-4" /> Validasi & Check-in</>}</button>
          </form>
        </div>
        <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-slate-900">Hasil Scan</h2>
            <div className="flex items-center gap-1">
              {scanHistory.length > 0 && <button type="button" onClick={clearScanHistory} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label="Hapus riwayat hasil scan" title="Hapus riwayat"><Trash2 className="h-4 w-4" /></button>}
              <button type="button" onClick={() => { void loadSummary(); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh hasil"><RefreshCw className="h-4 w-4" /></button>
            </div>
          </div>
          {busy && <div className="flex min-h-20 items-center justify-center text-sm font-semibold text-slate-500"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />Memeriksa tiket...</div>}
          {scanHistory.length
            ? <div>
              {scanHistory.slice(0, 1).map((entry) => {
                const historyResult = entry.result;
                const statusTone = getScanHistoryTone(historyResult.status);
                return <article key={entry.id} className={`rounded-xl border p-3 ${statusTone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold">{getScanHistoryTitle(historyResult.status)}</p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-900">{historyResult.full_name || historyResult.message}</p>
                      {(historyResult.order_number || historyResult.ticket_number) && <p className="mt-0.5 truncate text-xs text-slate-600">{historyResult.order_number ? `Order ${historyResult.order_number}` : ''}{historyResult.order_number && historyResult.ticket_number ? ' · ' : ''}{historyResult.ticket_number ? `Tiket #${historyResult.ticket_number}` : ''}</p>}
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{entry.event_title}</p>
                    </div>
                    <time className="shrink-0 text-right text-[10px] font-medium text-slate-500">{new Date(entry.scanned_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </article>;
              })}
            </div>
            : !busy && <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500"><QrCode className="mb-2 h-8 w-8 text-slate-300" />Arahkan QR tiket ke kamera untuk memeriksa status.</div>}
          <div className="border-t border-slate-100 pt-3">
            <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4" /> Check-in Terakhir</h3>
            {!eventId
              ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Pilih Event untuk melihat histori check-in.</p>
              : summary?.attendees_event_id !== eventId
                ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Memuat histori check-in...</p>
              : recentCheckIns.length
                ? <div className="space-y-2">{recentCheckIns.map((checkIn) => <div key={`${checkIn.order_number}-${checkIn.sequence_no}-${checkIn.checked_in_at}`} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{checkIn.full_name}</p>
                    {checkIn.order_type === 'free_pass' && <span className="mt-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-amber-900">FREE PASS</span>}
                    <p className="mt-0.5 truncate text-xs text-slate-600">{checkIn.order_number ? `Order ${checkIn.order_number} · ` : ''}Tiket #${checkIn.sequence_no}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{summary?.events.find((event) => event.id === eventId)?.title ?? 'Event'}</p>
                  </div>
                  <time className="shrink-0 text-right text-[10px] font-medium text-slate-500">{new Date(checkIn.checked_in_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              </div>)}</div>
                : <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Belum ada check-in untuk Event ini.</p>}
          </div>
          <div className="border-t border-slate-100 pt-3"><h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Ticket className="h-4 w-4" /> Ringkasan per Event</h3><div className="space-y-2">{[...(summary?.events ?? [])]
            .filter((event) => !eventId || event.id === eventId)
            .sort((first, second) => second.date.localeCompare(first.date))
            .slice(0, 5)
            .map((event) => <div key={event.id} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold text-slate-700">{event.title}</span><div className="flex shrink-0 items-center gap-2"><StatusBadge status={getEventStatus(event.status, event.date)} /><span className="text-slate-500">{event.checked_in}/{event.total}</span></div></div>)}</div></div>
        </div>
      </section>
      <Modal open={Boolean(result) && !cameraFullscreen} onClose={() => setResult(null)} title={resultTitle} size="sm">
        <div className="space-y-4">
          <ResultDetails />
          <button type="button" onClick={scanAgain} disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> Scan Lagi
          </button>
        </div>
      </Modal>
    </div>
  );
}