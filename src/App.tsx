import { lazy, Suspense, useEffect, useState } from 'react';
import type { Router } from '@/lib/router';
import { useRouter, matchRoute } from '@/lib/router';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { AuthProvider } from '@/lib/auth';
import { NotificationProvider } from '@/lib/notification-context.tsx';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/public/HomePage';
const OpenMicPage = lazy(() => import('@/pages/public/OpenMicPage').then(({ OpenMicPage }) => ({ default: OpenMicPage })));
const OpenMicDetailPage = lazy(() => import('@/pages/public/OpenMicDetailPage').then(({ OpenMicDetailPage }) => ({ default: OpenMicDetailPage })));
const OpenMicRegisterPage = lazy(() => import('@/pages/public/OpenMicRegisterPage').then(({ OpenMicRegisterPage }) => ({ default: OpenMicRegisterPage })));
const EventPage = lazy(() => import('@/pages/public/EventPage').then(({ EventPage }) => ({ default: EventPage })));
const EventDetailPage = lazy(() => import('@/pages/public/EventDetailPage').then(({ EventDetailPage }) => ({ default: EventDetailPage })));
const EventDocumentationPage = lazy(() => import('@/pages/public/EventDocumentationPage').then(({ EventDocumentationPage }) => ({ default: EventDocumentationPage })));
const TicketOrderPage = lazy(() => import('@/pages/public/TicketOrderPage').then(({ TicketOrderPage }) => ({ default: TicketOrderPage })));
const TicketAccessPage = lazy(() => import('@/pages/public/TicketAccessPage').then(({ TicketAccessPage }) => ({ default: TicketAccessPage })));
const TicketSelectionPage = lazy(() => import('@/pages/public/TicketSelectionPage').then(({ TicketSelectionPage }) => ({ default: TicketSelectionPage })));
const TicketLegalPage = lazy(() => import('@/pages/public/TicketLegalPage').then(({ TicketLegalPage }) => ({ default: TicketLegalPage })));
const KomikaPage = lazy(() => import('@/pages/public/KomikaPage').then(({ KomikaPage }) => ({ default: KomikaPage })));
const KomikaDetailPage = lazy(() => import('@/pages/public/KomikaDetailPage').then(({ KomikaDetailPage }) => ({ default: KomikaDetailPage })));
const MorePage = lazy(() => import('@/pages/public/MorePage').then(({ MorePage }) => ({ default: MorePage })));
const PublicGuidePage = lazy(() => import('@/pages/public/PublicGuidePage').then(({ PublicGuidePage }) => ({ default: PublicGuidePage })));
const AboutPage = lazy(() => import('@/pages/public/AboutPage').then(({ AboutPage }) => ({ default: AboutPage })));
const PartnershipPage = lazy(() => import('@/pages/public/PartnershipPage').then(({ PartnershipPage }) => ({ default: PartnershipPage })));
const ContactPage = lazy(() => import('@/pages/public/ContactPage').then(({ ContactPage }) => ({ default: ContactPage })));
const CommunityJoinPage = lazy(() => import('@/pages/public/CommunityJoinPage').then(({ CommunityJoinPage }) => ({ default: CommunityJoinPage })));
const EventRegisterPage = lazy(() => import('@/pages/public/EventRegisterPage').then(({ EventRegisterPage }) => ({ default: EventRegisterPage })));
const AnnualRecapPage = lazy(() => import('@/pages/public/AnnualRecapPage').then(({ AnnualRecapPage }) => ({ default: AnnualRecapPage })));
const AdminLoginPage = lazy(() => import('@/pages/admin/AdminLoginPage').then(({ AdminLoginPage }) => ({ default: AdminLoginPage })));
const AdminPage = lazy(() => import('@/pages/admin/AdminPage').then(({ AdminPage }) => ({ default: AdminPage })));
const MemberLoginPage = lazy(() => import('@/pages/member/MemberLoginPage').then(({ MemberLoginPage }) => ({ default: MemberLoginPage })));
const MemberDashboardPage = lazy(() => import('@/pages/member/MemberDashboardPage').then(({ MemberDashboardPage }) => ({ default: MemberDashboardPage })));
const MemberKomikaRecapPage = lazy(() => import('@/pages/member/MemberKomikaRecapPage').then(({ MemberKomikaRecapPage }) => ({ default: MemberKomikaRecapPage })));
const MemberProfilePage = lazy(() => import('@/pages/member/MemberProfilePage').then(({ MemberProfilePage }) => ({ default: MemberProfilePage })));
const MemberEvaluationPage = lazy(() => import('@/pages/member/MemberEvaluationPage').then(({ MemberEvaluationPage }) => ({ default: MemberEvaluationPage })));
const MemberPerformanceHistoryPage = lazy(() => import('@/pages/member/MemberPerformanceHistoryPage').then(({ MemberPerformanceHistoryPage }) => ({ default: MemberPerformanceHistoryPage })));
const MemberMorePage = lazy(() => import('@/pages/member/MemberMorePage').then(({ MemberMorePage }) => ({ default: MemberMorePage })));
const MemberOpenMicHistoryPage = lazy(() => import('@/pages/member/MemberOpenMicHistoryPage').then(({ MemberOpenMicHistoryPage }) => ({ default: MemberOpenMicHistoryPage })));
const MemberMaterialsPage = lazy(() => import('@/pages/member/MemberMaterialsPage').then(({ MemberMaterialsPage }) => ({ default: MemberMaterialsPage })));
const MemberMaterialSetlistsPage = lazy(() => import('@/pages/member/MemberMaterialSetlistsPage').then(({ MemberMaterialSetlistsPage }) => ({ default: MemberMaterialSetlistsPage })));
const MemberMaterialDetailPage = lazy(() => import('@/pages/member/MemberMaterialDetailPage').then(({ MemberMaterialDetailPage }) => ({ default: MemberMaterialDetailPage })));
const MemberAccountSettingsPage = lazy(() => import('@/pages/member/MemberAccountSettingsPage').then(({ MemberAccountSettingsPage }) => ({ default: MemberAccountSettingsPage })));
const MemberInfoPage = lazy(() => import('@/pages/member/MemberInfoPage').then(({ MemberInfoPage }) => ({ default: MemberInfoPage })));
const EvaluatorDashboardPage = lazy(() => import('@/pages/evaluator/EvaluatorDashboardPage').then(({ EvaluatorDashboardPage }) => ({ default: EvaluatorDashboardPage })));
import { MemberBottomNav } from '@/components/nav/MemberBottomNav';
import { MemberDesktopNav } from '@/components/nav/MemberDesktopNav';
import { MemberNotificationCountsProvider } from '@/components/nav/MemberNotificationBell';
const EvaluatorEvaluationPage = lazy(() => import('@/pages/evaluator/EvaluatorEvaluationPage').then(({ EvaluatorEvaluationPage }) => ({ default: EvaluatorEvaluationPage })));
import { EmptyState } from '@/components/ui/EmptyState';
import { AppCredit } from '@/components/AppCredit';
import { clearPageMetadata, setPageMetadata } from '@/lib/seo';

function updateSeo(path: string, siteName: string) {
  const pages: Record<string, { title: string; description: string }> = {
    '/': {
      title: `${siteName} | Komunitas Stand Up Comedy Cilegon`,
      description: 'Standupindo Cilegon adalah komunitas stand up comedy di Cilegon, Banten. Temukan jadwal open mic, profil komika lokal, acara komedi, dokumentasi panggung, dan informasi bergabung bersama komunitas.',
    },
    '/open-mic': {
      title: `Open Mic Cilegon | Jadwal dan Pendaftaran | ${siteName}`,
      description: 'Temukan jadwal open mic Cilegon, informasi panggung, lokasi, dan pendaftaran untuk komika yang ingin mencoba materi.',
    },
    '/event': {
      title: `Event Stand Up Comedy Cilegon | ${siteName}`,
      description: 'Lihat acara stand up comedy dan event komedi di Cilegon, termasuk jadwal, lokasi, informasi pertunjukan, dan tiket yang tersedia.',
    },
    '/komika': {
      title: `Komika Cilegon dan Banten | Profil Komika | ${siteName}`,
      description: 'Kenali profil komika lokal Cilegon dan Banten, karya, spesialisasi, serta perjalanan panggung mereka bersama Standupindo Cilegon.',
    },
    '/more': {
      title: `Informasi Komunitas | ${siteName}`,
      description: 'Informasi tentang Standupindo Cilegon, kegiatan komunitas, kerja sama, kontak, dan cara bergabung.',
    },
    '/panduan': {
      title: `Panduan Open Mic dan Pembelian Tiket | ${siteName}`,
      description: 'Panduan langkah demi langkah untuk mendaftar Open Mic, memesan tiket Event, dan mengakses QR tiket.',
    },
    '/more/tentang': {
      title: `Tentang Komunitas | ${siteName}`,
      description: 'Kenali Standupindo Cilegon, komunitas stand up comedy yang menjadi ruang belajar, tampil, dan berkarya di Cilegon.',
    },
    '/more/kerja-sama': {
      title: `Kerja Sama dan Kolaborasi | ${siteName}`,
      description: 'Informasi kerja sama untuk event, sponsorship, dan kolaborasi bersama komunitas Standupindo Cilegon.',
    },
    '/more/kontak': {
      title: `Kontak Komunitas | ${siteName}`,
      description: 'Hubungi Standupindo Cilegon untuk informasi komunitas, open mic, event, dan peluang kolaborasi.',
    },
    '/more/gabung': {
      title: `Gabung Komunitas Stand Up Comedy Cilegon | ${siteName}`,
      description: 'Cari tahu cara bergabung dengan komunitas Standupindo Cilegon dan ikut kegiatan komedi serta open mic.',
    },
    '/syarat-ketentuan': {
      title: `Syarat dan Ketentuan | ${siteName}`,
      description: `Syarat dan ketentuan penggunaan layanan dan informasi pada website ${siteName}.`,
    },
    '/kebijakan-privasi': {
      title: `Kebijakan Privasi | ${siteName}`,
      description: `Kebijakan privasi dan informasi pengelolaan data pada website ${siteName}.`,
    },
  };
  const page = pages[path];
  if (!page) {
    document.title = siteName;
    clearPageMetadata();
    return;
  }
  setPageMetadata({ path, ...page });
}

function RouteLoading() {
  return <div className="flex min-h-48 items-center justify-center text-sm text-slate-500" role="status">Memuat halaman...</div>;
}

function ProtectedAdmin({ router, settings, onSettingsUpdated }: { router: Router; settings: ReturnType<typeof useSiteSettings>['settings']; onSettingsUpdated: () => Promise<void> }) {
  const { session, loading, isAdminApp, deviceSwitchPending } = useAuth();
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
  if (deviceSwitchPending) return <Suspense fallback={<RouteLoading />}><AdminLoginPage router={router} /></Suspense>;
  if (!session || !isAdminApp) {
    return <Suspense fallback={<RouteLoading />}><AdminLoginPage router={router} /></Suspense>;
  }
  return <Suspense fallback={<RouteLoading />}><AdminPage router={router} settings={settings} onSettingsUpdated={onSettingsUpdated} /></Suspense>;
}

function ProtectedMember({ router }: { router: Router }) {
  const { session, loading, isMember, deviceSwitchPending } = useAuth();
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
  if (deviceSwitchPending) return <MemberLoginPage router={router} />;
  if (!session || !isMember) {
    return <MemberLoginPage router={router} />;
  }

  if (router.path === '/member') return <MemberDashboardPage router={router} />;
  if (router.path === '/member/komika-recap') return <MemberKomikaRecapPage router={router} />;
  const memberOpenMicPath = router.path.replace(/^\/member/, '') || '/';
  const memberPublicRouter: Router = {
    ...router,
    navigate: (to) => router.navigate(to.startsWith('/open-mic') ? `/member${to}` : to),
  };
  if (router.path === '/member/open-mic') return <OpenMicPage router={memberPublicRouter} />;
  const memberOpenMicRegister = matchRoute(memberOpenMicPath, '/open-mic/[slug]/daftar');
  if (memberOpenMicRegister) return <OpenMicRegisterPage router={memberPublicRouter} slug={memberOpenMicRegister.slug} />;
  const memberOpenMicDetail = matchRoute(memberOpenMicPath, '/open-mic/[slug]');
  if (memberOpenMicDetail) return <OpenMicDetailPage router={memberPublicRouter} slug={memberOpenMicDetail.slug} showFloatingRegister isMemberArea />;
  if (router.path === '/member/profile') return <MemberProfilePage router={router} />;
  if (router.path === '/member/evaluations') return <MemberEvaluationPage router={router} />;
  if (router.path === '/member/evaluations/history') return <MemberPerformanceHistoryPage router={router} />;
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
  const { settings, refreshSettings } = useSiteSettings();
  const { session, loading, isMember } = useAuth();
  useEffect(() => { updateSeo(router.path, settings.site_name); }, [router.path, settings.site_name]);

  if (router.path.startsWith('/admin')) return <ProtectedAdmin router={router} settings={settings} onSettingsUpdated={refreshSettings} />;
  if (router.path === '/member/login' || router.path.startsWith('/member')) {
    const memberContent = router.path === '/member/login'
      ? (loading
        ? <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat area member...</div>
        : session && isMember
          ? <ProtectedMember router={router} />
          : <MemberLoginPage router={router} />)
      : <ProtectedMember router={router} />;

    return (
      <MemberNotificationCountsProvider>
        <div className="flex min-h-screen flex-col bg-slate-50">
          {router.path !== '/member/login' && <MemberDesktopNav router={router} settings={settings} compact={router.path.startsWith('/member/materials/')} />}
          <main className="flex-1"><Suspense fallback={<RouteLoading />}>{memberContent}</Suspense></main>
          {router.path !== '/member/login' && (
            <footer className="border-t border-slate-200 bg-white px-4 pt-2 pb-safe-nav md:py-4 md:pb-4">
              <AppCredit />
            </footer>
          )}
          {router.path !== '/member/login' && <MemberBottomNav router={router} />}
        </div>
      </MemberNotificationCountsProvider>
    );
  }
  if (router.path === '/evaluator' || router.path.startsWith('/evaluator/')) {
    return (
      <MemberNotificationCountsProvider>
        <div className="flex min-h-screen flex-col bg-slate-50">
          <MemberDesktopNav router={router} settings={settings} />
          <main className="flex-1"><Suspense fallback={<RouteLoading />}><ProtectedEvaluator router={router} /></Suspense></main>
          <footer className="border-t border-slate-200 bg-white px-4 pt-2 pb-safe-nav md:py-4 md:pb-4">
            <AppCredit />
          </footer>
          <MemberBottomNav router={router} />
        </div>
      </MemberNotificationCountsProvider>
    );
  }

  const openMicRegister = matchRoute(router.path, '/open-mic/[slug]/daftar');
  const openMicDetail = matchRoute(router.path, '/open-mic/[slug]');
  const eventDocumentation = matchRoute(router.path, '/event/[slug]/dokumentasi');
  const eventDetail = matchRoute(router.path, '/event/[slug]');
  const ticketOrder = matchRoute(router.path, '/event/[slug]/tiket/[ticketId]');
  const ticketSelection = matchRoute(router.path, '/event/[slug]/tiket');
  const eventRegister = matchRoute(router.path, '/event/[slug]/daftar');
  const komikaDetail = matchRoute(router.path, '/komika/[slug]');
  const annualRecap = matchRoute(router.path, '/recap/[year]');

  let content: React.ReactNode;
  if (router.path === '/') content = <HomePage router={router} />;
  else if (router.path === '/tiket') content = <TicketAccessPage router={router} />;
  else if (router.path === '/open-mic') content = <OpenMicPage router={router} />;
  else if (openMicRegister) content = <OpenMicRegisterPage router={router} slug={openMicRegister.slug} />;
  else if (openMicDetail) content = <OpenMicDetailPage router={router} slug={openMicDetail.slug} showFloatingRegister />;
  else if (router.path === '/event') content = <EventPage router={router} />;
  else if (eventDocumentation) content = <EventDocumentationPage router={router} slug={eventDocumentation.slug} settings={settings} />;
  else if (ticketOrder) content = <TicketOrderPage router={router} slug={ticketOrder.slug} ticketId={ticketOrder.ticketId} />;
  else if (ticketSelection) content = <TicketSelectionPage router={router} slug={ticketSelection.slug} />;
  else if (eventRegister) content = <EventRegisterPage router={router} slug={eventRegister.slug} />;
  else if (eventDetail) content = <EventDetailPage router={router} slug={eventDetail.slug} />;
  else if (router.path === '/syarat-ketentuan') content = <TicketLegalPage router={router} settings={settings} document="terms" />;
  else if (router.path === '/kebijakan-privasi') content = <TicketLegalPage router={router} settings={settings} document="privacy" />;
  else if (router.path === '/komika') content = <KomikaPage router={router} />;
  else if (komikaDetail) content = <KomikaDetailPage router={router} slug={komikaDetail.slug} />;
  else if (annualRecap) content = <AnnualRecapPage router={router} year={annualRecap.year} />;
  else if (router.path === '/panduan') content = <PublicGuidePage router={router} />;
  else if (router.path === '/more') content = <MorePage router={router} settings={settings} />;
  else if (router.path === '/more/tentang') content = <AboutPage router={router} settings={settings} />;
  else if (router.path === '/more/kerja-sama') content = <PartnershipPage router={router} settings={settings} />;
  else if (router.path === '/more/kontak') content = <ContactPage router={router} settings={settings} />;
  else if (router.path === '/more/gabung') content = <CommunityJoinPage router={router} />;
  else content = <div className="container-app py-16"><EmptyState title="Halaman tidak ditemukan" description="Kembali ke beranda untuk melanjutkan." /></div>;

  if (annualRecap) return <Suspense fallback={<RouteLoading />}><div key={router.path} className="route-transition">{content}</div></Suspense>;

  const returningToList = router.navigationType === 'pop' && (
    (router.path === '/open-mic' && /^\/open-mic\/[^/]+$/.test(router.fromPath ?? ''))
    || (router.path === '/event' && /^\/event\/[^/]+$/.test(router.fromPath ?? ''))
    || (router.path === '/komika' && /^\/komika\/[^/]+$/.test(router.fromPath ?? ''))
  );

  return <AppShell router={router} settings={settings}>
    <Suspense fallback={<RouteLoading />}><div key={router.path} className={router.path === '/tiket' ? '' : returningToList ? 'route-return' : 'route-transition'}>{content}</div></Suspense>
  </AppShell>;
}

function App() {
  return <AuthProvider><NotificationProvider><RoutedApp /></NotificationProvider></AuthProvider>;
}

export default App;
