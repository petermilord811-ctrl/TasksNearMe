import { routes, type AppShellHandlers, type HelperProfileEditorData, type HelperProfileEditorHandlers, type HelperStandingView, type PreviewEntry, type ResumeReadResult } from '@/contracts';
import { fakeHandler, fakeProfileEditorHandlers, onboardingIdentityStep, sam, samProfileEditorData, samProfilePhoto, samResumeRead, samResumeReadBasic } from '@/fixtures';
import { HelperProfileEditorScreen } from '@/ui/screens/helper/helper-profile-editor-screen';
import { ResumeImport } from '@/ui/screens/helper/resume-import';
import { AppShell } from '@/ui/shells/app-shell';
import { ClickOnLoad } from './click-on-load';
import copy from '../../../messages/en/ui/helperProfileEditor.json';

/**
 * The helper's own profile, LinkedIn-style (2026-11-27): the card and sections as clients read them, each section's
 * pencil opening its form in a dialog, "Import from resume" from upload to the suggestions, and the states around it.
 */

const viewer = { kind: 'user' as const, id: sam.id, displayName: sam.displayName, initials: sam.initials, mode: 'helper' as const, helperReady: true, unreadMessages: 0, unreadNotifications: 0 };
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const group = copy.screen.previews.group;
const page = copy.page;

function preview(variant: string, title: string, data: HelperProfileEditorData = samProfileEditorData, options: { click?: string; handlers?: HelperProfileEditorHandlers; standing?: HelperStandingView } = {}): PreviewEntry {
  const screen = <HelperProfileEditorScreen data={data} handlers={options.handlers ?? fakeProfileEditorHandlers} {...(options.standing ? { standing: options.standing } : {})} />;
  return { id: `screen-helper-profile-editor/${variant}`, title, group, layout: 'fullscreen', render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.helperProfile()}>{options.click ? <ClickOnLoad label={options.click}>{screen}</ClickOnLoad> : screen}</AppShell> };
}

function resume(variant: string, title: string, step: 'upload' | 'reading' | 'review' | 'done', result?: ResumeReadResult, failure?: Extract<ResumeReadResult, { ok: false }>['code']): PreviewEntry {
  return {
    id: `screen-helper-profile-editor/resume-${variant}`, title, group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.helperProfile()}>
      <HelperProfileEditorScreen data={samProfileEditorData} handlers={fakeProfileEditorHandlers} />
      <ResumeImport handlers={fakeProfileEditorHandlers} languageNames={{ en: 'English', es: 'Spanish' }} current={{ headline: samProfileEditorData.values.profile.headline, bio: samProfileEditorData.values.profile.bio }} trigger={<span hidden />} preview={{ step, ...(result ? { result } : {}), ...(failure ? { failure } : {}) }} />
    </AppShell>,
  };
}

const edit = (section: string) => page.editSection.replace('{section}', section);
const draft: HelperProfileEditorData = {
  ...samProfileEditorData,
  publicProfile: false,
  badges: { phoneVerified: false },
  verification: onboardingIdentityStep.verification,
  progress: onboardingIdentityStep.progress,
  values: { ...samProfileEditorData.values, preferences: { skills: [], likes: [], excludes: [] }, experience: { experience: [] }, tools: { tools: [] } },
  workSamples: [],
  stats: { ratingCount: 0, completedCount: 0 },
};

export const helperProfileEditorPreviews: PreviewEntry[] = [
  preview('default', copy.screen.previews.default),
  preview('with-photo', copy.screen.previews.withPhoto, { ...samProfileEditorData, person: { ...samProfileEditorData.person, photo: samProfilePhoto } }),
  preview('paused', copy.screen.previews.paused, { ...samProfileEditorData, paused: true, publicProfile: false }),
  // Not bookable yet: no public page (so no link to one), the lists empty, and the checks left to do.
  preview('draft', copy.screen.previews.draft, draft, { standing: { steps: [{ step: 'address', state: 'todo' }, { step: 'phone', state: 'done' }, { step: 'identity', state: 'todo' }, { step: 'payout', state: 'todo' }] } }),
  preview('edit-about', 'Edit the intro', samProfileEditorData, { click: edit(page.about) }),
  preview('edit-services', 'Edit services', samProfileEditorData, { click: edit(page.services) }),
  preview('edit-skills', 'Edit skills and preferences', samProfileEditorData, { click: edit(page.skills) }),
  preview('edit-experience', 'Edit experience', samProfileEditorData, { click: edit(page.experience) }),
  preview('edit-area', 'Edit where I help', samProfileEditorData, { click: edit(page.area) }),
  preview('edit-work-samples', 'Edit work samples', samProfileEditorData, { click: edit(page.workSamples) }),
  preview('save-error', copy.screen.previews.saveError, samProfileEditorData, { click: edit(page.skills), handlers: { ...fakeProfileEditorHandlers, onSavePreferences: fakeHandler({ ok: false, code: 'unknown' }) } }),
  resume('upload', 'Resume: upload', 'upload'),
  resume('reading', 'Resume: reading', 'reading'),
  resume('review', 'Resume: AI suggestions', 'review', samResumeRead),
  resume('review-basic', 'Resume: keyword suggestions', 'review', samResumeReadBasic),
  resume('error', 'Resume: unreadable file', 'upload', undefined, 'unreadable'),
  resume('done', 'Resume: added', 'done', samResumeRead),
];
