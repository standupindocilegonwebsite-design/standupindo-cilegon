import { useEffect } from 'react';
import type { Router } from '@/lib/router';
import { useRouter, matchRoute } from '@/lib/router';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { AuthProvider } from '@/lib/auth';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/public/HomePage';
import { OpenMicPage } from '@/pages/public/OpenMicPage';
import { OpenMicDetailPage } from '@/pages/public/OpenMicDetailPage';
import { OpenMicRegisterPage } from '@/pages/public/OpenMicRegisterPage';
import { EventPage } from '@/pages/public/EventPage';
import { EventDetailPage } from '@/pages/public/EventDetailPage';
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
import { EmptyState } from '@/components/ui/EmptyState';

function updateSeo(path: string, siteName: string) {
  const titles: Record<string, string> = {
    '/': `${siteName} — Komunitas Stand Up Comedy`,
    '/open-mic': `Open Mic — ${siteName}`,
    '/event': `Event — ${siteName}`,
    '/komika': `Komika — ${siteName}`,
    '/more': `More — ${siteName}`,
  };
  document.title = titles[path] ?? siteName;
}

function ProtectedAdmin({ router, settings }: { router: Router; settings: ReturnType<typeof useSiteSettings>['settings'] }) {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Memuat panel admin...</div>;
  if (!session || !isAdmin) {
    if (router.path !== '/admin/login') router.navigate('/admin/login');
    return <AdminLoginPage router={router} />;
  }
  return <AdminPage router={router} settings={settings} />;
}

function RoutedApp() {
  const router = useRouter();
  const { settings } = useSiteSettings();
  useEffect(() => { updateSeo(router.path, settings.site_name); }, [router.path, settings.site_name]);

  if (router.path.startsWith('/admin')) return <ProtectedAdmin router={router} settings={settings} />;

  const openMicRegister = matchRoute(router.path, '/open-mic/[slug]/daftar');
  const openMicDetail = matchRoute(router.path, '/open-mic/[slug]');
  const eventDetail = matchRoute(router.path, '/event/[slug]');
  const eventRegister = matchRoute(router.path, '/event/[slug]/daftar');
  const komikaDetail = matchRoute(router.path, '/komika/[slug]');

  let content: React.ReactNode;
  if (router.path === '/') content = <HomePage router={router} />;
  else if (router.path === '/open-mic') content = <OpenMicPage router={router} />;
  else if (openMicRegister) content = <OpenMicRegisterPage router={router} slug={openMicRegister.slug} />;
  else if (openMicDetail) content = <OpenMicDetailPage router={router} slug={openMicDetail.slug} />;
  else if (router.path === '/event') content = <EventPage router={router} />;
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
  return <AuthProvider><RoutedApp /></AuthProvider>;
}

export default App;
