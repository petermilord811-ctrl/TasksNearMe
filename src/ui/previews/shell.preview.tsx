import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type PreviewEntry, type ShellViewer } from '@/contracts';
import { alexStaff, jordanShell, mayaShell, morganStaff, priyaShell, publicViewer, rileyStaff } from '@/fixtures';
import { PageHeader } from '@/ui/components/layout/page-header';
import { buttonVariants } from '@/ui/primitives/button';
import { DetailPageShell, Logo, PublicShell } from '@/ui/shells';
import { AdminShellExample, AppShellExample, ModeResultsExample } from './shell-examples';
import shellCopy from '../../../messages/en/ui/shell.json';

function PublicShellExample({ viewer }: { viewer: ShellViewer | Promise<ShellViewer> }) {
  const t = useTranslations('shell');
  return (
    <PublicShell viewer={viewer} currentPath={routes.home()}>
      <div className="space-y-8 py-6">
        <PageHeader title={t('preview.publicTitle')} description={t('preview.publicBody')} />
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{t('preview.contentPlaceholder')}</div>
      </div>
    </PublicShell>
  );
}

function DetailShellExample() {
  const t = useTranslations('shell');
  return (
    <DetailPageShell title={t('preview.detailTitle')} backHref={routes.app.bookings()} actions={<Link href={routes.app.bookings()} className={buttonVariants({ className: 'w-full sm:w-auto' })}>{t('preview.detailAction')}</Link>}>
      <div className="space-y-6">
        <p className="text-muted-foreground">{t('preview.detailBody')}</p>
        <div className="flex min-h-[75dvh] items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{t('preview.contentPlaceholder')}</div>
      </div>
    </DetailPageShell>
  );
}

function LogoExample() {
  const t = useTranslations('shell');
  return (
    <main className="mx-auto min-h-dvh max-w-reading space-y-8 px-gutter py-8">
      <PageHeader title={t('preview.logo')} />
      <div className="flex flex-wrap items-center gap-8 rounded-xl border bg-card p-6"><Logo /><Logo variant="mark" /></div>
    </main>
  );
}

function AdminAgentExample() {
  const t = useTranslations('shell');
  return <AdminShellExample viewer={alexStaff} currentPath={routes.admin.case('case_desk')} breadcrumbs={[{ label: t('nav.queues'), href: routes.admin.home() }, { label: t('nav.cases'), href: routes.admin.cases() }, { label: t('preview.breadcrumbCase') }]} />;
}

const preview = shellCopy.preview;
const signedInViewerPromise = Promise.resolve<ShellViewer>(mayaShell);

export const shellPreviews: PreviewEntry[] = [
  { id: 'shell/public-signed-out', group: preview.group, title: preview.publicSignedOut, layout: 'fullscreen', render: () => <PublicShellExample viewer={publicViewer} /> },
  { id: 'shell/public-signed-in', group: preview.group, title: preview.publicSignedIn, layout: 'fullscreen', render: () => <PublicShellExample viewer={mayaShell} /> },
  { id: 'shell/public-viewer-promise', group: preview.group, title: preview.publicViewerPromise, layout: 'fullscreen', render: () => <PublicShellExample viewer={signedInViewerPromise} /> },
  { id: 'shell/public-staff', group: preview.group, title: preview.publicStaff, layout: 'fullscreen', render: () => <PublicShellExample viewer={rileyStaff} /> },
  { id: 'shell/app-poster', group: preview.group, title: preview.appPoster, layout: 'fullscreen', render: () => <AppShellExample initialViewer={mayaShell} currentPath={routes.app.bookings()} /> },
  { id: 'shell/app-helper', group: preview.group, title: preview.appHelper, layout: 'fullscreen', render: () => <AppShellExample initialViewer={jordanShell} currentPath={routes.app.findWork()} /> },
  { id: 'shell/app-helper-not-ready', group: preview.group, title: preview.appHelperNotReady, layout: 'fullscreen', render: () => <AppShellExample initialViewer={priyaShell} currentPath={routes.app.home()} /> },
  { id: 'shell/app-mode-switch-redirect', group: preview.group, title: preview.appModeRedirect, layout: 'fullscreen', notes: preview.redirectHint, render: () => <AppShellExample initialViewer={{ ...priyaShell, mode: 'poster' }} currentPath={routes.app.home()} modeResult={{ ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding() }} hint="redirectHint" /> },
  { id: 'shell/detail-page', group: preview.group, title: preview.detailPage, layout: 'fullscreen', render: () => <DetailShellExample /> },
  { id: 'shell/admin-agent', group: preview.group, title: preview.adminAgent, layout: 'fullscreen', render: () => <AdminAgentExample /> },
  { id: 'shell/admin-admin', group: preview.group, title: preview.adminAdmin, layout: 'fullscreen', render: () => <AdminShellExample viewer={rileyStaff} currentPath={routes.admin.config()} /> },
  { id: 'shell/admin-lead', group: preview.group, title: preview.adminLead, layout: 'fullscreen', render: () => <AdminShellExample viewer={morganStaff} currentPath={routes.admin.home()} /> },
  { id: 'shell/admin-multiple-roles', group: preview.group, title: preview.adminMultipleRoles, layout: 'fullscreen', render: () => <AdminShellExample viewer={{ ...morganStaff, roles: ['support_lead', 'trust_safety', 'finance'] }} currentPath={routes.admin.reports()} /> },
  { id: 'shell/logo', group: preview.group, title: preview.logo, layout: 'fullscreen', render: () => <LogoExample /> },
  { id: 'shell/mode-results', group: preview.group, title: preview.modeResults, layout: 'fullscreen', render: () => <ModeResultsExample currentPath={routes.app.home()} /> },
  { id: 'shell/sign-out-error', group: preview.group, title: preview.signOutError, layout: 'fullscreen', notes: preview.signOutHint, render: () => <AppShellExample initialViewer={mayaShell} currentPath={routes.app.account()} signOutResult={{ ok: false, code: 'unknown' }} hint="signOutHint" /> },
];
