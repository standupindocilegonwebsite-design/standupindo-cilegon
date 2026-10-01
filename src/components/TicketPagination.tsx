interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function TicketPagination({ page, pageSize, total, onPageChange }: Props) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Navigasi halaman ticketing" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{firstItem}-{lastItem} dari {total}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="btn-secondary !min-h-9 !px-3 !py-1.5 text-xs disabled:opacity-50">Sebelumnya</button>
        <span className="self-center text-xs font-semibold text-slate-600">Halaman {page} dari {pageCount}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} className="btn-secondary !min-h-9 !px-3 !py-1.5 text-xs disabled:opacity-50">Berikutnya</button>
      </div>
    </nav>
  );
}
