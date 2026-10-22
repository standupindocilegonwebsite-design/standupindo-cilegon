import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, ChevronRight, Circle, RefreshCw, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export interface NotificationInboxItem {
  id: string;
  source: string;
  title: string;
  description: string;
  targetPath: string;
  createdAt: string;
  readAt: string | null;
}

interface NotificationInboxProps {
  items: NotificationInboxItem[];
  unreadCount: number;
  loading?: boolean;
  error?: string;
  canDelete?: boolean;
  inverse?: boolean;
  label: string;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onClearAll: () => Promise<void>;
  onDeleteRead: (id: string) => Promise<void>;
  onClearRead: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onNavigate: (path: string) => void;
}

type NotificationFilter = 'all' | 'unread' | 'read';
type DeleteConfirmation = { type: 'all' | 'read' } | { type: 'single'; id: string; title: string } | null;

export function NotificationInbox({
  items,
  unreadCount,
  loading = false,
  error,
  canDelete = true,
  inverse = false,
  label,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onDeleteRead,
  onClearRead,
  onRetry,
  onNavigate,
}: NotificationInboxProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>(null);
  const [actionError, setActionError] = useState('');
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number; maxHeight: number; mobile: boolean } | null>(null);
  const readCount = items.filter((item) => item.readAt).length;
  const visibleItems = useMemo(() => items.filter((item) => (
    filter === 'all' || (filter === 'unread' ? !item.readAt : Boolean(item.readAt))
  )), [filter, items]);
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const button = bellButtonRef.current;
      if (!button) return;

      const bounds = button.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      const width = mobile ? viewportWidth : Math.min(416, viewportWidth - 32);
      const top = Math.ceil(bounds.bottom + 8);
      const left = mobile
        ? 0
        : Math.max(16, Math.min(bounds.right - width, viewportWidth - width - 16));

      setPanelPosition({
        top,
        left,
        width,
        maxHeight: Math.max(0, viewportHeight - top - 8),
        mobile,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open]);

  async function markRead(id: string) {
    setActionError('');
    try {
      await onMarkRead(id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Status notifikasi gagal diperbarui.');
    }
  }

  async function openNotification(item: NotificationInboxItem) {
    if (!item.readAt) await markRead(item.id);
    setOpen(false);
    onNavigate(item.targetPath);
  }

  async function markAllRead() {
    setActionError('');
    try {
      await onMarkAllRead();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Notifikasi gagal ditandai sudah dibaca.');
    }
  }

  async function clearAll() {
    setActionError('');
    try {
      await onClearAll();
      setDeleteConfirmation(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Notifikasi gagal dikosongkan.');
    }
  }

  async function clearRead() {
    setActionError('');
    try {
      await onClearRead();
      setDeleteConfirmation(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Notifikasi yang sudah dibaca gagal dihapus.');
    }
  }

  async function deleteRead(id: string) {
    setActionError('');
    try {
      await onDeleteRead(id);
      setDeleteConfirmation(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Notifikasi gagal dihapus.');
    }
  }

  return (
    <div className="relative">
      <button
        ref={bellButtonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition ${inverse ? (open ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15') : (open ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700')}`}
        title={label}
        aria-label={`${label}${unreadCount ? `, ${badge} belum dibaca` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">{badge}</span>}
      </button>

      {open && panelPosition && createPortal(<div role="dialog" aria-label={label} style={{ position: 'fixed', top: panelPosition.top, left: panelPosition.left, width: panelPosition.width, maxHeight: panelPosition.maxHeight }} className={`z-[60] overflow-hidden bg-white shadow-[0_16px_36px_rgba(15,23,42,0.24)] ring-1 ring-slate-900/10 ${panelPosition.mobile ? 'rounded-b-2xl' : 'rounded-2xl'}`}>
        <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-extrabold leading-6 text-slate-900 sm:text-lg">Notifikasi</h3>
            {canDelete && (filter === 'read' && readCount > 0
              ? <button type="button" onClick={() => setDeleteConfirmation({ type: 'read' })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 sm:text-sm"><Trash2 className="h-4 w-4" />Hapus Dibaca</button>
              : items.length > 0 && <button type="button" onClick={() => setDeleteConfirmation({ type: 'all' })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 sm:text-sm"><Trash2 className="h-4 w-4" />Hapus Semua</button>)}
          </div>
          <div role="tablist" aria-label="Filter notifikasi" className="mt-4 grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {([
                { id: 'all', label: 'Semua' },
                { id: 'unread', label: 'Belum Dibaca' },
                { id: 'read', label: 'Sudah Dibaca' },
              ] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={filter === tab.id} onClick={() => setFilter(tab.id)} className={`flex min-h-10 min-w-0 items-center justify-center rounded-lg px-1 py-2 text-[11px] font-bold leading-tight transition sm:px-2 sm:text-xs ${filter === tab.id ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-white/70 hover:text-slate-900'}`}>{tab.label}</button>)}
          </div>
          {unreadCount > 0 && <div className="mt-2 flex justify-end"><button type="button" onClick={() => void markAllRead()} className="min-h-9 rounded-lg px-2 text-xs font-bold text-blue-800 transition hover:bg-blue-50 sm:text-sm">Tandai Semua Sudah Dibaca</button></div>}
        </div>

        <div className="border-b border-slate-200" />
        {actionError && <p role="alert" className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{actionError}</p>}
        {loading ? <div className="px-5 py-9 text-center"><span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" /><p className="mt-3 text-sm font-semibold text-slate-600">Memuat notifikasi...</p></div>
          : error ? <div className="px-5 py-8 text-center"><p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>{onRetry && <button type="button" onClick={() => void onRetry()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-900"><RefreshCw className="h-4 w-4" />Coba Lagi</button>}</div>
            : visibleItems.length === 0 ? <div className="px-5 py-8 text-center sm:py-9"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-800"><Bell className="h-5 w-5" /></span><p className="mt-3 text-sm font-bold text-slate-900">{filter === 'read' ? 'Belum ada notifikasi yang dibaca.' : filter === 'unread' ? 'Tidak ada notifikasi belum dibaca.' : 'Belum ada notifikasi'}</p><p className="mt-1 text-xs text-slate-500">{filter === 'read' ? 'Notifikasi yang dibaca akan muncul di sini.' : filter === 'unread' ? 'Notifikasi yang belum dibaca akan muncul di sini.' : 'Notifikasi yang masuk akan muncul di sini.'}</p></div>
              : <div className="max-h-[min(22rem,calc(100dvh-13rem))] overflow-y-auto px-3 py-2 sm:px-4">
              {visibleItems.map((item) => <div key={item.id} className="flex items-start gap-2 border-b border-slate-100 px-2 py-3 last:border-b-0">
                <button type="button" onClick={() => void openNotification(item)} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-1 text-left hover:bg-slate-50">
                  <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-800'}`}>{item.readAt ? <Bell className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.readAt ? 'font-semibold text-slate-700' : 'font-extrabold text-slate-900'}`}>{item.title}</span>
                    <span className="mt-0.5 block break-words text-xs text-slate-600">{item.description}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString('id-ID')}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </button>
                {!item.readAt
                  ? <button type="button" onClick={() => void markRead(item.id)} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-800 transition hover:bg-blue-100" aria-label="Tandai sudah dibaca" title="Tandai sudah dibaca"><Check className="h-4 w-4" /></button>
                  : canDelete && <button type="button" onClick={() => setDeleteConfirmation({ type: 'single', id: item.id, title: item.title })} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-700 transition hover:bg-rose-50" aria-label="Hapus notifikasi" title="Hapus notifikasi"><Trash2 className="h-4 w-4" /></button>}
              </div>)}
            </div>}
      </div>, document.body)}

      <Modal open={canDelete && Boolean(deleteConfirmation)} onClose={() => setDeleteConfirmation(null)} title={deleteConfirmation?.type === 'single' ? 'Hapus notifikasi?' : deleteConfirmation?.type === 'read' ? 'Hapus notifikasi yang sudah dibaca?' : 'Hapus semua notifikasi?'} titleEyebrow="Konfirmasi" size="sm">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">{deleteConfirmation?.type === 'single' ? `“${deleteConfirmation.title}” akan dihapus dari daftar notifikasi akun ini.` : deleteConfirmation?.type === 'read' ? 'Semua notifikasi yang sudah dibaca akan dihapus dari daftar. Notifikasi belum dibaca dan data sumber tidak akan dihapus.' : 'Semua notifikasi akan dihapus dari daftar akun ini. Data sumber seperti pesanan, pendaftaran, dan evaluasi tidak akan dihapus.'}</p>
          {actionError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{actionError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setDeleteConfirmation(null)} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="button" onClick={() => { if (!deleteConfirmation) return; if (deleteConfirmation.type === 'single') void deleteRead(deleteConfirmation.id); else if (deleteConfirmation.type === 'read') void clearRead(); else void clearAll(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-800"><Trash2 className="h-4 w-4" />{deleteConfirmation?.type === 'single' ? 'Ya, Hapus' : 'Ya, Hapus'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
