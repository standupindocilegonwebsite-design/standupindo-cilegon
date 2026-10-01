import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { LOGO_URL } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

interface CheckInEventReport {
  id: string;
  title: string;
  date: string;
  venue: string;
  tickets_sold: number;
  checked_in: number;
  not_checked_in: number;
  attendance_percent: number;
}

interface CheckInTicketReport {
  full_name: string;
  whatsapp: string;
  ticket_category: string;
  status: 'Hadir' | 'Belum Hadir';
}

interface CheckInReportResponse {
  error?: string;
  events: CheckInEventReport[];
  available_events?: Pick<CheckInEventReport, 'id' | 'title' | 'date' | 'venue'>[];
  tickets: CheckInTicketReport[];
}

export function TicketCheckInReportPage({ onBack }: { onBack: () => void }) {
  const [eventFilter, setEventFilter] = useState('all');
  const [report, setReport] = useState<CheckInReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void supabase.functions.invoke<CheckInReportResponse>('ticketing-check-in-report', {
      body: {
        event_id: eventFilter === 'all' ? undefined : eventFilter,
      },
    }).then(({ data, error: requestError }) => {
      if (!active) return;
      setLoading(false);
      if (requestError || !data || data.error) {
        setReport(null);
        setError(requestError?.message ?? data?.error ?? 'Laporan check-in gagal dimuat.');
        return;
      }
      setReport(data);
    });
    return () => { active = false; };
  }, [eventFilter]);

  const selectedEvent = useMemo(
    () => report?.events.find((event) => event.id === eventFilter) ?? null,
    [eventFilter, report?.events],
  );
  const totals = useMemo(() => report?.events.reduce((sum, event) => ({
    tickets_sold: sum.tickets_sold + event.tickets_sold,
    checked_in: sum.checked_in + event.checked_in,
    not_checked_in: sum.not_checked_in + event.not_checked_in,
  }), { tickets_sold: 0, checked_in: 0, not_checked_in: 0 }) ?? {
    tickets_sold: 0,
    checked_in: 0,
    not_checked_in: 0,
  }, [report?.events]);
  const displayedSummary = selectedEvent ?? {
    tickets_sold: totals.tickets_sold,
    checked_in: totals.checked_in,
    not_checked_in: totals.not_checked_in,
    attendance_percent: totals.tickets_sold ? (totals.checked_in / totals.tickets_sold) * 100 : 0,
  };

  function printReport() {
    document.body.dataset.printMode = 'ticket-check-in-report';
    window.setTimeout(() => {
      window.print();
      delete document.body.dataset.printMode;
    }, 0);
  }

  const canPrint = !loading && !error && Boolean(report?.events.length);
  const printTitle = selectedEvent?.title ?? 'Semua Event dalam scope Admin QR Scanner';
  const printedAt = new Date().toLocaleString('id-ID');

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Laporan Check-in"
        subtitle="Rekap kehadiran tiket per Event berdasarkan status check-in."
        eyebrow="Admin QR Scanner"
        onBack={onBack}
        action={<button type="button" onClick={printReport} disabled={!canPrint} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Print laporan check-in" title="Print laporan check-in"><Printer className="h-4 w-4" /></button>}
      />
      <SearchableEventSelect
        options={(report?.available_events ?? report?.events)?.map((event) => ({ id: event.id, title: event.title, subtitle: `${formatDate(event.date)} · ${event.venue}` })) ?? []}
        value={eventFilter}
        onChange={setEventFilter}
        allLabel="Semua Event"
        ariaLabel="Pilih Event laporan check-in"
      />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Laporan gagal dimuat: {error}</p>}
      {loading
        ? <div className="h-28 skeleton rounded-2xl" />
        : report && <>
          <section className="space-y-3">
            {selectedEvent && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-extrabold text-slate-950">{selectedEvent.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{formatDate(selectedEvent.date)}{selectedEvent.venue ? ` · ${selectedEvent.venue}` : ''}</p>
            </div>}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Tiket Terjual', value: displayedSummary.tickets_sold, tone: 'text-blue-800' },
                { label: 'Hadir / Check-in', value: displayedSummary.checked_in, tone: 'text-emerald-700' },
                { label: 'Belum Hadir', value: displayedSummary.not_checked_in, tone: 'text-amber-700' },
                { label: 'Kehadiran', value: `${displayedSummary.attendance_percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`, tone: 'text-indigo-700' },
              ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{stat.label}</p>
                <p className={`mt-1 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
              </div>)}
            </div>
          </section>
          {eventFilter === 'all'
            ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-extrabold text-slate-900">Rekap per Event</h2></div>
              {report.events.length
                ? <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>
                      <th className="px-4 py-3">Event</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Tiket Terjual</th><th className="px-4 py-3 text-right">Hadir</th><th className="px-4 py-3 text-right">Tidak Hadir</th><th className="px-4 py-3 text-right">Kehadiran</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{report.events.map((event) => <tr key={event.id}>
                      <td className="px-4 py-3 font-bold text-slate-900">{event.title}</td><td className="px-4 py-3 text-slate-600">{formatDate(event.date)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{event.tickets_sold}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{event.checked_in}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">{event.not_checked_in}</td><td className="px-4 py-3 text-right font-extrabold tabular-nums text-blue-800">{event.attendance_percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</td>
                    </tr>)}</tbody>
                  </table>
                </div>
                : <p className="p-6 text-center text-sm text-slate-500">Belum ada Event dalam scope Admin QR Scanner.</p>}
            </section>
            : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-extrabold text-slate-900">Detail Tiket / Penonton</h2></div>
              {report.tickets.length
                ? <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>
                      <th className="w-14 px-4 py-3 text-right">No.</th><th className="px-4 py-3">Nama Pemesan</th><th className="px-4 py-3">WhatsApp</th><th className="px-4 py-3">Kategori Tiket</th><th className="px-4 py-3">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{report.tickets.map((ticket, index) => <tr key={`${ticket.full_name}-${ticket.ticket_category}-${index}`}>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-900">{ticket.full_name}</td><td className="px-4 py-3 font-mono text-slate-600">{ticket.whatsapp}</td><td className="px-4 py-3 text-slate-700">{ticket.ticket_category}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${ticket.status === 'Hadir' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ticket.status}</span></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                : <p className="p-6 text-center text-sm text-slate-500">Belum ada tiket lunas untuk Event ini.</p>}
            </section>}
        </>}
      <div className="print-sheet ticket-check-in-report-print">
        <div className="print-brand"><img src={LOGO_URL} alt="" /><div><h1>LAPORAN CHECK-IN</h1><p>Standupindo Cilegon</p></div></div>
        <div className="ticket-check-in-report-meta">
          <p><strong>Nama Event:</strong> {printTitle}</p>
          {selectedEvent && <p><strong>Tanggal:</strong> {formatDate(selectedEvent.date)}{selectedEvent.venue ? ` · ${selectedEvent.venue}` : ''}</p>}
          <p><strong>Periode/Laporan:</strong> {selectedEvent ? formatDate(selectedEvent.date) : 'Semua Event dalam scope Admin QR Scanner'}</p>
          <p><strong>Dicetak:</strong> {printedAt}</p>
        </div>
        <h2>Ringkasan</h2>
        <table className="ticket-check-in-summary-table"><thead><tr><th>Total Tiket Terjual</th><th>Total Hadir</th><th>Total Tidak Hadir</th><th>Persentase Kehadiran</th></tr></thead><tbody><tr>
          <td>{displayedSummary.tickets_sold}</td><td>{displayedSummary.checked_in}</td><td>{displayedSummary.not_checked_in}</td><td>{displayedSummary.attendance_percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</td>
        </tr></tbody></table>
        <h2>Tabel Data</h2>
        {eventFilter === 'all'
          ? <table><thead><tr><th>Event</th><th>Tanggal</th><th>Tiket Terjual</th><th>Hadir</th><th>Tidak Hadir</th><th>Kehadiran</th></tr></thead><tbody>{report?.events.map((event) => <tr key={event.id}>
            <td>{event.title}</td><td>{formatDate(event.date)}</td><td className="ticket-check-in-number">{event.tickets_sold}</td><td className="ticket-check-in-number">{event.checked_in}</td><td className="ticket-check-in-number">{event.not_checked_in}</td><td className="ticket-check-in-number">{event.attendance_percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</td>
          </tr>)}</tbody></table>
          : <table><thead><tr><th>No.</th><th>Nama Pemesan</th><th>WhatsApp</th><th>Kategori Tiket</th><th>Status</th></tr></thead><tbody>{report?.tickets.map((ticket, index) => <tr key={`${ticket.full_name}-${ticket.ticket_category}-${index}`}>
            <td className="ticket-check-in-number">{index + 1}</td><td>{ticket.full_name}</td><td>{ticket.whatsapp}</td><td>{ticket.ticket_category}</td><td>{ticket.status}</td>
          </tr>)}</tbody></table>}
      </div>
    </div>
  );
}
