import { routes, type AppShellHandlers, type HelperProfileEditorData, type HelperProfileEditorHandlers, type PreviewEntry } from '@/contracts';
import { fakeHandler, fakeProfileEditorHandlers, onboardingIdentityStep, sam, samProfileEditorData } from '@/fixtures';
import { HelperProfileEditorScreen, type HelperEditorSection } from '@/ui/screens/helper/helper-profile-editor-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/helperProfileEditor.json';

const viewer = { kind: 'user' as const, id: sam.id, displayName: sam.displayName, initials: sam.initials, mode: 'helper' as const, helperReady: true, unreadMessages: 0, unreadNotifications: 0 };
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data = samProfileEditorData, initialSection: HelperEditorSection = 'profile', handlers: HelperProfileEditorHandlers = fakeProfileEditorHandlers): PreviewEntry {
  return { id: `screen-helper-profile-editor/${variant}`, title, group: copy.screen.previews.group, layout: 'fullscreen', render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.helperProfile()}><HelperProfileEditorScreen data={data} handlers={handlers} initialSection={initialSection} /></AppShell> };
}
const fullSamples: HelperProfileEditorData = { ...samProfileEditorData, workSamples: Array.from({ length: samProfileEditorData.maxWorkSamples }, (_, index) => ({ ...samProfileEditorData.workSamples[index % samProfileEditorData.workSamples.length]!, id: `sample-preview-${index}` })) };

export const helperProfileEditorPreviews: PreviewEntry[] = [
  preview('default', copy.screen.previews.default),
  preview('paused', copy.screen.previews.paused, { ...samProfileEditorData, paused: true }, 'visibility'),
  ...(['services', 'area', 'tools', 'work-samples', 'verification', 'visibility'] as const).map((section) => preview(section, copy.screen.sections[section], samProfileEditorData, section)),
  preview('empty-work-samples', copy.screen.previews.emptySamples, { ...samProfileEditorData, workSamples: [] }, 'work-samples'),
  preview('work-sample-limit', copy.screen.previews.sampleLimit, fullSamples, 'work-samples'),
  preview('verification-missing', copy.screen.previews.verificationMissing, { ...samProfileEditorData, badges: { phoneVerified: true }, verification: onboardingIdentityStep.verification, progress: onboardingIdentityStep.progress }, 'verification'),
  preview('save-error', copy.screen.previews.saveError, samProfileEditorData, 'profile', { ...fakeProfileEditorHandlers, onSaveProfile: fakeHandler({ ok: false, code: 'unknown' }) }),
  preview('upload-error', copy.screen.previews.uploadError, samProfileEditorData, 'work-samples', { ...fakeProfileEditorHandlers, onUploadWorkSample: async () => ({ ok: false, code: 'too_large' }) }),
];
