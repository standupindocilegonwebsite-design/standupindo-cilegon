import { Inbox } from 'lucide-react';

interface Props {
  title?: string;
  description?: string;
}

export function EmptyState({ title = 'Belum ada data', description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(37,99,235,0.05)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
    </div>
  );
}
