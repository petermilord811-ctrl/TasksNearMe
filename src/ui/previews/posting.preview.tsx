import type { ComponentProps } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry, type TaskDraftInput } from '@/contracts';
import {
  addressSuggestions, aiDeskDraft, deskDraft, fakeHandler, fakePostTaskHandlers, mayaShell,
  movingDraft, outOfAreaSuggestion, postTaskComputerHelpNoAiData, postTaskPageData,
  postTaskResults, remoteHelpDraft, uploadedTaskPhotos,
} from '@/fixtures';
import { PostTaskScreen } from '@/ui/screens/posting/post-task-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/postTask.json';

const handlers = { ...fakePostTaskHandlers, onPost: fakeHandler<TaskDraftInput>(postTaskResults.posted) };
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
type PreviewOptions = Partial<ComponentProps<typeof PostTaskScreen>>;

function preview(variant: keyof typeof copy.previews, props: PreviewOptions = {}): PreviewEntry {
  return {
    id: `screen-post-task/${variant}`,
    group: copy.previews.group,
    title: copy.previews[variant],
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.newTask()} layout="flow">
      <PostTaskScreen data={postTaskPageData} handlers={handlers} persistDraft={false} {...props} />
    </AppShell>,
  };
}

const desk = { initialValues: deskDraft, initialAddress: addressSuggestions[0], initialPhotos: uploadedTaskPhotos };
const moving = { initialValues: movingDraft, initialAddress: addressSuggestions[2] };

export const postingPreviews: PreviewEntry[] = [
  preview('category', { initialStep: 'category' }),
  preview('describe-ai', { initialStep: 'describe', ...desk }),
  preview('describe-no-ai', { data: postTaskComputerHelpNoAiData, initialStep: 'describe', initialValues: remoteHelpDraft }),
  preview('ai-suggestion', { initialStep: 'describe', ...desk, initialSuggestion: aiDeskDraft }),
  preview('details-furniture', { initialStep: 'details', ...desk }),
  preview('details-moving', { initialStep: 'details', ...moving }),
  preview('details-computer', { initialStep: 'details', initialValues: remoteHelpDraft }),
  preview('details-yard', { initialStep: 'details', initialValues: { ...deskDraft, categorySlug: 'yard-cleanup', details: { yardSize: 'small', work: 'leaves', greenWastePlan: 'curbside', toolsOnSite: true } } }),
  preview('details-cleaning', { initialStep: 'details', initialValues: { ...deskDraft, categorySlug: 'light-cleaning', details: { bedrooms: 2, bathrooms: 1, suppliesOnSite: true, pets: false } } }),
  preview('photos', { initialStep: 'photos', ...desk, initialValues: { ...deskDraft, photoIds: uploadedTaskPhotos.map((photo) => photo.id) } }),
  preview('photos-empty', { initialStep: 'photos', ...desk, initialValues: { ...deskDraft, photoIds: [] } }),
  preview('where-local', { initialStep: 'where', ...desk }),
  preview('where-remote', { initialStep: 'where', initialValues: remoteHelpDraft }),
  preview('where-out-of-area', { initialStep: 'where', initialValues: { ...deskDraft, location: { mode: 'local', placeId: '' } }, initialSuggestions: [outOfAreaSuggestion] }),
  preview('when-window', { initialStep: 'when', ...desk }),
  preview('when-flexible', { initialStep: 'when', initialValues: remoteHelpDraft }),
  preview('budget-fixed', { initialStep: 'budget', ...desk }),
  preview('budget-hourly', { initialStep: 'budget', ...moving }),
  preview('review-desk', { initialStep: 'review', ...desk }),
  preview('review-moving', { initialStep: 'review', ...moving }),
  preview('review-remote', { initialStep: 'review', initialValues: remoteHelpDraft }),
  preview('review-loading', { initialStep: 'review', ...desk, handlers: { ...handlers, onQuote: () => new Promise(() => {}) } }),
  preview('review-error', { initialStep: 'review', ...desk, handlers: { ...handlers, onQuote: async () => { throw new Error('Preview: unavailable'); } } }),
  preview('error-prohibited', { initialStep: 'describe', ...desk, initialResult: postTaskResults.prohibited, handlers: { ...handlers, onPost: fakeHandler(postTaskResults.prohibited) } }),
  preview('error-limit', { initialStep: 'review', ...desk, initialResult: postTaskResults.limitReached, handlers: { ...handlers, onPost: fakeHandler(postTaskResults.limitReached) } }),
];
