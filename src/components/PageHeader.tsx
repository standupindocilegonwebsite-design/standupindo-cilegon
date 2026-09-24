import { ArrowLeft } from 'lucide-react';
import type { Router } from '@/lib/router';

interface Props {
  router: Router;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
}

export function PageHeader({ router, title, subtitle, showBack = true, backTo }: Props) {
  const isMember = router.path.startsWith('/member');
  const isEvaluator = router.path.startsWith('/evaluator');
  const isRoleArea = isMember || isEvaluator;
  return (
    <div className={`border-b-2 ${isRoleArea ? 'border-blue-100 bg-slate-50' : 'border-blue-100 bg-white'}`}>
      <div className={`container-app ${isRoleArea && title ? 'py-3 sm:py-4' : 'py-5'}`}>
        <div className={isRoleArea && title ? 'rounded-[22px] border border-blue-500 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)] sm:p-5' : ''}>
        {showBack && <button
            onClick={() => backTo ? router.navigate(backTo) : window.history.length > 1 ? window.history.back() : router.navigate('/')}
            className={`mb-3 inline-flex items-center gap-1.5 text-sm font-bold transition ${isRoleArea && title ? 'text-white hover:text-blue-100' : 'text-slate-700 hover:text-blue-700'}`}
          >
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>}
        {isEvaluator && title && <p className="!text-blue-100 mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em]">Evaluator Area</p>}
        {title && <h1 className={`text-2xl font-extrabold tracking-tight sm:text-3xl ${isRoleArea ? 'text-white' : 'text-slate-900'}`}>{title}</h1>}
        {subtitle && <p className={`mt-1.5 text-sm font-medium sm:text-base ${isRoleArea ? 'text-blue-50' : 'text-slate-600'}`}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
