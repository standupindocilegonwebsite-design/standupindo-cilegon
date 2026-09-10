import { ArrowLeft } from 'lucide-react';
import type { Router } from '@/lib/router';

interface Props {
  router: Router;
  title?: string;
  subtitle?: string;
}

export function PageHeader({ router, title, subtitle }: Props) {
  return (
    <div className="border-b-2 border-blue-100 bg-white">
      <div className="container-app py-5">
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : router.navigate('/')}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        {title && <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>}
        {subtitle && <p className="mt-1.5 text-sm font-medium text-slate-600 sm:text-base">{subtitle}</p>}
      </div>
    </div>
  );
}
