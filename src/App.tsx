import { useEffect, useState } from 'react';
import type { Router } from '@/lib/router';
import { useRouter, matchRoute } from '@/lib/router';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { AuthProvider } from '@/lib/auth';
import { NotificationProvider } from '@/lib/notification-context.tsx';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/public/HomePage';
import { OpenMicPage } from '@/pages/public/OpenMicPage';
import { OpenMicDetailPage } from '@/pages/public/OpenMicDetailPage';
import { OpenMicRegisterPage } from '@/pages/public/OpenMicRegisterPage';
import { EventPage } from '@/pages/public/EventPage';
import { EventDetailPage } from '@/pages/public/EventDetailPage';
import { TicketOrderPage } from '@/pages/public/TicketOrderPage';
import { KomikaPage } from '@/pages/public/KomikaPage';
import { KomikaDetailPage } from '@/pages/public/KomikaDetailPage';
import { MorePage } from '@/pages/public/MorePage';
import { AboutPage } from '@/pages/public/AboutPage';
import { PartnershipPage } from '@/pages/public/PartnershipPage';
import { ContactPage } from '@/pages/public/ContactPage';
import { CommunityJoinPage } from '@/pages/public/CommunityJoinPage';
import { EventRegisterPage } from '@/pages/public/EventRegisterPage';
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { MemberLoginPage } from '@/pages/member/MemberLoginPage';
import { MemberDashboardPage } from '@/pages/member/MemberDashboardPage';
import { MemberProfilePage } from '@/pages/member/MemberProfilePage';
import { MemberEvaluationPage } from '@/pages/member/MemberEvaluationPage';
import { MemberMorePage } from '@/pages/member/MemberMorePage';
import { MemberOpenMicHistoryPage } from '@/pages/member/MemberOpenMicHistoryPage';
import { MemberMaterialsPage } from '@/pages/member/MemberMaterialsPage';
import { MemberMaterialSetlistsPage } from '@/pages/member/MemberMaterialSetlistsPage';
import { MemberMaterialDetailPage } from '@/pages/member/MemberMaterialDetailPage';
import { MemberAccountSettingsPage } from '@/pages/member/MemberAccountSettingsPage';
import { MemberInfoPage } from '@/pages/member/MemberInfoPage';
import { EvaluatorDashboardPage } from '@/pages/evaluator/EvaluatorDashboardPage';
import { MemberBottomNav } from '@/components/nav/MemberBottomNav';
import { MemberDesktopNav } from '@/components/nav/MemberDesktopNav';
import { EvaluatorEvaluationPage } from '@/pages/evaluator/EvaluatorEvaluationPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppCredit } from '@/components/AppCredit';

function updateSeo(path: string, siteName: string) {
  const titles: Record<string, string> = {
    '/': `${siteName} — Komunitas Stand Up Comedy`,
    '/open-mic': `Open Mic — ${siteName}`,
    '/event': `Event — ${siteName}`,
    '/komika': `Komika — ${siteName}`,
    '/member': `Member — ${siteName}`,
    '/member/profile': `Profile Member — ${siteName}`,
    '/more': `More — ${siteName}`,
  };
  document.title = titles[path] ?? siteName;
}

function ProtectedAdmin({ router, settings }: { router: Router; settings: ReturnType<typeof useSiteSettings>['settings'] }) {
  const { session, loading, isAdminApp } = useAuth();
  const [authWaitExpired, setAuthWaitExpired] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAuthWaitExpired(false);
      return;
    }

    const timeout = window.setTimeout(() => setAuthWaitExpired(true), 3000);
    return () => window.clearTimeout(timeout);
  }, [loading]);
  useEffect(() => {
    if (!loading && (!session || !isAdminApp) && router.path !== '/admin/login') {
      router.navigate('/admin/login');
    }
  }, [loading, session, isAdminApp, router]);

  if (loading && !authWaitExpired) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat panel admin...</div>;
  if (!session || !isAdminApp) {
    return <AdminLoginPage router={router} />;
  }
  return <AdminPage router={router} settings={settings} />;
}

function ProtectedMember({ router }: { router: Router }) {
  const { session, loading, isMember } = useAuth();
  const [authWaitExpired, setAuthWaitExpired] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAuthWaitExpired(false);
      return;
    }
    const timeout = window.setTimeout(() => setAuthWaitExpired(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (!loading && (!session || !isMember) && router.path !== '/member/login') {
      router.navigate('/member/login');
    }
  }, [loading, session, isMember, router]);

  if (loading && !authWaitExpired) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat area member...</div>;
  if (!session || !isMember) {
    return <MemberLoginPage router={router} />;
  }

  if (router.path === '/member') return <MemberDashboardPage router={router} />;
  const memberOpenMicPath = router.path.replace(/^\/member/, '') || '/';
  const memberPublicRouter: Router = {
    ...router,
    navigate: (to) => router.navigate(to.startsWith('/open-mic') ? `/member${to}` : to),
  };
  if (router.path === '/member/open-mic') return <OpenMicPage router={memberPublicRouter} />;
  const memberOpenMicRegister = matchRoute(memberOpenMicPath, '/open-mic/[slug]/daftar');
  if (memberOpenMicRegister) return <OpenMicRegisterPage router={memberPublicRouter} slug={memberOpenMicRegister.slug} />;
  const memberOpenMicDetail = matchRoute(memberOpenMicPath, '/open-mic/[slug]');
  if (memberOpenMicDetail) return <OpenMicDetailPage router={memberPublicRouter} slug={memberOpenMicDetail.slug} />;
  if (router.path === '/member/profile') return <MemberProfilePage router={router} />;
  if (router.path === '/member/evaluations') return <MemberEvaluationPage router={router} />;
  if (router.path === '/member/more') return <MemberMorePage router={router} />;
  if (router.path === '/member/open-mic-history') return <MemberOpenMicHistoryPage router={router} />;
  if (router.path === '/member/materials/new') return <MemberMaterialsPage router={router} />;
  if (router.path === '/member/materials/setlists') return <MemberMaterialSetlistsPage router={router} />;
  const memberMaterialDetail = matchRoute(router.path, '/member/materials/[id]');
  if (memberMaterialDetail) return <MemberMaterialDetailPage router={router} id={memberMaterialDetail.id} />;
  if (router.path === '/member/materials') return <MemberMaterialsPage router={router} />;
  if (router.path === '/member/settings') return <MemberAccountSettingsPage router={router} />;
  if (router.path === '/member/roles') return <MemberInfoPage router={router} kind="roles" />;
  if (router.path === '/member/help') return <MemberInfoPage router={router} kind="help" />;

  return <MemberDashboardPage router={router} />;
}

function ProtectedEvaluator({ router }: { router: Router }) {
  const { session, loading, isEvaluator, isAdmin } = useAuth();
  const [authWaitExpired, setAuthWaitExpired] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAuthWaitExpired(false);
      return;
    }

    const timeout = window.setTimeout(() => setAuthWaitExpired(true), 3000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (!loading && (!session || (!isEvaluator && !isAdmin)) && router.path !== '/member/login') {
      router.navigate('/member/login');
    }
  }, [loading, session, isEvaluator, isAdmin, router]);

  if (loading && !authWaitExpired) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat area evaluator...</div>;
  if (!session || (!isEvaluator && !isAdmin)) {
    return <MemberLoginPage router={router} />;
  }

  const evaluatorMatch = matchRoute(router.path, '/evaluator/[id]');
  if (evaluatorMatch) return <EvaluatorEvaluationPage router={router} openMicId={evaluatorMatch.id} />;
  return <EvaluatorDashboardPage router={router} />;
}

function RoutedApp() {
  const router = useRouter();
  const { settings } = useSiteSettings();
  const { session, loading, isMember } = useAuth();
  useEffect(() => { updateSeo(router.path, settings.site_name); }, [router.path, settings.site_name]);

  if (router.path.startsWith('/admin')) return <ProtectedAdmin router={router} settings={settings} />;
  if (router.path === '/member/login' || router.path.startsWith('/member')) {
    const memberContent = router.path === '/member/login'
      ? (loading
        ? <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat area member...</div>
        : session && isMember
          ? <ProtectedMember router={router} />
          : <MemberLoginPage router={router} />)
      : <ProtectedMember router={router} />;

    return (
      <>
        <div className="flex min-h-screen flex-col bg-slate-50">
          {router.path !== '/member/login' && <MemberDesktopNav router={router} compact={router.path.startsWith('/member/materials/')} />}
          <main className="flex-1 pb-safe-nav md:pb-0">{memberContent}</main>
          {router.path !== '/member/login' && (
            <footer className="border-t border-slate-200 bg-white px-4 py-2 pb-[calc(4.5rem+var(--safe-bottom))] md:py-4 md:pb-4">
              <AppCredit />
            </footer>
          )}
          {router.path !== '/member/login' && <MemberBottomNav router={router} />}
        </div>
      </>
    );
  }
  if (router.path === '/evaluator' || router.path.startsWith('/evaluator/')) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <MemberDesktopNav router={router} />
        <main className="flex-1 pb-safe-nav md:pb-0"><ProtectedEvaluator router={router} /></main>
        <footer className="border-t border-slate-200 bg-white px-4 py-2 pb-[calc(4.5rem+var(--safe-bottom))] md:py-4 md:pb-4">
          <AppCredit />
        </footer>
        <MemberBottomNav router={router} />
      </div>
    );
  }

  const openMicRegister = matchRoute(router.path, '/open-mic/[slug]/daftar');
  const openMicDetail = matchRoute(router.path, '/open-mic/[slug]');
  const eventDetail = matchRoute(router.path, '/event/[slug]');
  const ticketOrder = matchRoute(router.path, '/event/[slug]/tiket/[ticketId]');
  const eventRegister = matchRoute(router.path, '/event/[slug]/daftar');
  const komikaDetail = matchRoute(router.path, '/komika/[slug]');

  let content: React.ReactNode;
  if (router.path === '/') content = <HomePage router={router} />;
  else if (router.path === '/open-mic') content = <OpenMicPage router={router} />;
  else if (openMicRegister) content = <OpenMicRegisterPage router={router} slug={openMicRegister.slug} />;
  else if (openMicDetail) content = <OpenMicDetailPage router={router} slug={openMicDetail.slug} />;
  else if (router.path === '/event') content = <EventPage router={router} />;
  else if (ticketOrder) content = <TicketOrderPage router={router} slug={ticketOrder.slug} ticketId={ticketOrder.ticketId} settings={settings} />;
  else if (eventRegister) content = <EventRegisterPage router={router} slug={eventRegister.slug} />;
  else if (eventDetail) content = <EventDetailPage router={router} slug={eventDetail.slug} settings={settings} />;
  else if (router.path === '/komika') content = <KomikaPage router={router} />;
  else if (komikaDetail) content = <KomikaDetailPage router={router} slug={komikaDetail.slug} />;
  else if (router.path === '/more') content = <MorePage router={router} settings={settings} />;
  else if (router.path === '/more/tentang') content = <AboutPage router={router} settings={settings} />;
  else if (router.path === '/more/kerja-sama') content = <PartnershipPage router={router} settings={settings} />;
  else if (router.path === '/more/kontak') content = <ContactPage router={router} settings={settings} />;
  else if (router.path === '/more/gabung') content = <CommunityJoinPage router={router} />;
  else content = <div className="container-app py-16"><EmptyState title="Halaman tidak ditemukan" description="Kembali ke beranda untuk melanjutkan." /></div>;

  return <AppShell router={router} settings={settings}>
    <div key={router.path} className="route-transition">{content}</div>
  </AppShell>;
}

function App() {
  return <AuthProvider><NotificationProvider><RoutedApp /></NotificationProvider></AuthProvider>;
}

export default App;
