import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, ChevronRight, ClipboardCheck } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type MemberNotification = { id: string; title: string; description: string; href: string; kind: 'registration' | 'event' | 'evaluation' };

async function fetchReadIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('member_notification_reads').select('notification_key').eq('user_id', userId);
  if (error) return new Set();
  return new Set((data ?? []).map((item) => String(item.notification_key)));
}

export function MemberNotificationBell({ router }: { router: Router }) {
  const { user } = useAuth();
  const [items, setItems] = useState<MemberNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [channelRevision, setChannelRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRevision = useRef(0);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const requestId = ++requestRevision.current;
    setLoading(true);
    const { data: profile } = await supabase.from('komika').select('id').eq('user_id', user.id).maybeSingle();
    if (!profile?.id) {
      if (requestId === requestRevision.current) {
        setItems([]);
        setLoading(false);
      }
      return;
    }

    const [{ data: registrations }, { data: evaluations }, { data: eventParticipants }, readSet] = await Promise.all([
      supabase.from('open_mic_registrations').select('id, registration_id, open_mic_id, status, open_mics(title, slug)').eq('komika_id', profile.id).in('status', ['confirmed', 'rejected', 'cancelled']).order('updated_at', { ascending: false }).limit(10),
      supabase.from('evaluations').select('id, open_mic_id, performer_registration_id, status, open_mics(title)').eq('performer_komika_id', profile.id).eq('status', 'submitted').order('updated_at', { ascending: false }).limit(10),
      supabase.from('event_participants').select('id, registration_id, event_id, status, events(title)').eq('komika_id', profile.id).in('status', ['approved', 'rejected']).order('created_at', { ascending: false }).limit(10),
      fetchReadIds(user.id),
    ]);

    const registrationItems = ((registrations ?? []) as Array<{ id: string; registration_id: string; status: string; open_mics?: { title?: string; slug?: string } | null }>).map((row) => ({
      id: `registration:${row.id}:${row.status}`,
      title: `Pendaftaran ${row.status === 'confirmed' ? 'dikonfirmasi' : row.status === 'rejected' ? 'ditolak' : 'dibatalkan'}`,
      description: `${row.open_mics?.title ?? row.registration_id}`,
      href: row.status === 'confirmed' && row.open_mics?.slug ? `/member/open-mic/${row.open_mics.slug}#lineup` : '/member/open-mic', kind: 'registration' as const,
    }));
    const eventItems = ((eventParticipants ?? []) as Array<{ id: string; registration_id: string; status: string; events?: { title?: string } | null }>).map((row) => ({
      id: `event:${row.id}:${row.status}`,
      title: `Pendaftaran event ${row.status === 'approved' ? 'disetujui' : 'ditolak'}`,
      description: `${row.events?.title ?? row.registration_id}`,
      href: '/member/open-mic', kind: 'event' as const,
    }));
    const evaluationItems = ((evaluations ?? []) as Array<{ id: string; open_mics?: { title?: string } | null }>).map((row) => ({
      id: `evaluation:${row.id}`,
      title: 'Evaluasi baru tersedia',
      description: row.open_mics?.title ?? 'Performance kamu',
      href: '/member/evaluations', kind: 'evaluation' as const,
    }));

    if (requestId === requestRevision.current) {
      setItems([...registrationItems, ...eventItems, ...evaluationItems].filter((item) => !readSet.has(item.id)));
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
    if (!user?.id) return undefined;
    let active = true;
    const channel = supabase.channel(`member-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_mic_registrations' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' }, () => void loadNotifications())
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
          setChannelRevision((revision) => revision + 1);
        }
      });
    const refreshOnResume = () => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
        setChannelRevision((revision) => revision + 1);
      }
    };
    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);
    document.addEventListener('visibilitychange', refreshOnResume);
    return () => {
      active = false;
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
      document.removeEventListener('visibilitychange', refreshOnResume);
      void supabase.removeChannel(channel);
    };
  }, [channelRevision, loadNotifications, user?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const unreadCount = items.length;
  const groupedLabel = useMemo(() => unreadCount > 99 ? '99+' : String(unreadCount), [unreadCount]);

  async function markRead(item: MemberNotification) {
    if (!user?.id) return;
    const { error } = await supabase.from('member_notification_reads').upsert({ user_id: user.id, notification_key: item.id, read_at: new Date().toISOString() }, { onConflict: 'user_id,notification_key' });
    if (!error) {
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    }
    setOpen(false);
    router.navigate(item.href);
  }

  async function markAllRead() {
    if (!user?.id || items.length === 0) return;
    const payload = items.map((item) => ({ user_id: user.id, notification_key: item.id, read_at: new Date().toISOString() }));
    const { error } = await supabase.from('member_notification_reads').upsert(payload, { onConflict: 'user_id,notification_key' });
    if (!error) setItems([]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700" aria-label={`Notifikasi member${unreadCount ? `, ${groupedLabel} belum dibaca` : ''}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">{groupedLabel}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifikasi member" className="absolute right-0 top-12 z-[60] w-[min(23rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-extrabold text-slate-900">Notifikasi</h3><p className="mt-0.5 text-xs text-slate-500">Update aktivitas akun kamu</p></div>{items.length > 0 && <button type="button" onClick={markAllRead} className="text-xs font-bold text-blue-700">Tandai dibaca</button>}</div>
          {loading ? <div className="px-5 py-8 text-center"><span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /><p className="mt-3 text-sm font-semibold text-slate-500">Memuat notifikasi...</p></div> : items.length === 0 ? <div className="px-5 py-8 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-2 text-sm font-semibold text-slate-600">Belum ada notifikasi</p><p className="mt-1 text-xs text-slate-400">Update pendaftaran dan evaluasi akan muncul di sini.</p></div> : <div className="max-h-[min(20rem,calc(100vh-8rem))] overflow-y-auto p-2">{items.map((item) => <button key={item.id} type="button" onClick={() => markRead(item)} className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-blue-50"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{item.kind === 'evaluation' ? <ClipboardCheck className="h-4 w-4" /> : item.kind === 'event' ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{item.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span></span><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></button>)}</div>}
        </div>
      )}
    </div>
  );
}
