import type { ReactNode } from 'react';
import { routes, type PreviewEntry } from '@/contracts';
import { helpArticleWhenCharged, helpCenterData, legalTermsDraft, publicViewer } from '@/fixtures';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { SupportCard } from '@/ui/components/content/support-card';
import { HelpCenterScreen } from '@/ui/screens/content/help-center-screen';
import { HelpArticleScreen } from '@/ui/screens/content/help-article-screen';
import { LegalDocScreen } from '@/ui/screens/content/legal-doc-screen';
import { PublicShell } from '@/ui/shells/public-shell';
import help from '../../../messages/en/ui/help.json';
import legal from '../../../messages/en/ui/legal.json';

function page(id: string, title: string, path: string, render: () => ReactNode, group = help.previews.group): PreviewEntry {
  return { id, group, title, layout: 'fullscreen', render: () => <PublicShell viewer={publicViewer} currentPath={path}>{render()}</PublicShell> };
}

export const contentPreviews: PreviewEntry[] = [
  page('screen-help/center', help.previews.center, routes.help(), () => <HelpCenterScreen data={helpCenterData} />),
  page('screen-help/empty', help.previews.empty, routes.help(), () => <HelpCenterScreen data={{ topics: [] }} />),
  page('screen-help/article', help.previews.article, routes.help(helpArticleWhenCharged.slug), () => <HelpArticleScreen data={helpArticleWhenCharged} />),
  page('screen-legal/terms-draft', legal.previews.draft, routes.legal('terms'), () => <LegalDocScreen data={legalTermsDraft} />, legal.previews.group),
  page('screen-legal/terms-published', legal.previews.published, routes.legal('terms'), () => <LegalDocScreen data={{ ...legalTermsDraft, status: 'published', version: legal.previews.publishedVersion, effectiveAt: legalTermsDraft.updatedAt }} />, legal.previews.group),
  { id: 'content-blocks/all', group: help.previews.group, title: help.previews.blocks, render: () => <ContentBlocks blocks={helpArticleWhenCharged.blocks} /> },
  { id: 'support-card/default', group: help.previews.group, title: help.previews.support, render: () => <SupportCard /> },
];
