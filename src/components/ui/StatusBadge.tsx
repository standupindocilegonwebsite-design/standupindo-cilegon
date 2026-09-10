interface StatusBadgeProps {
  status: string;
  variant?: 'open' | 'closed' | 'upcoming' | 'completed' | 'cancelled' | 'pending' | 'confirmed' | 'rejected' | 'published' | 'draft';
}

const STYLES: Record<string, string> = {
  open: 'bg-green-50 text-green-700 ring-green-200',
  closed: 'bg-red-50 text-red-700 ring-red-200',
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-slate-200 text-slate-700 ring-slate-300',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-300',
  confirmed: 'bg-green-50 text-green-700 ring-green-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  approved: 'bg-green-50 text-green-700 ring-green-200',
  published: 'bg-green-50 text-green-700 ring-green-200',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const LABELS: Record<string, string> = {
  open: 'Pendaftaran Dibuka',
  closed: 'Pendaftaran Ditutup',
  upcoming: 'Mendatang',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  pending: 'Menunggu Konfirmasi',
  confirmed: 'Terkonfirmasi',
  rejected: 'Ditolak',
  approved: 'Disetujui',
  published: 'Published',
  draft: 'Draft',
};

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const key = variant ?? status;
  const style = STYLES[key] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  const label = LABELS[key] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>
      {label}
    </span>
  );
}
