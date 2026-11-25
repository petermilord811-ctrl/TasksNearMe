/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AiAssistResult, CommunityAnswerDraft, CommunityPolish } from '@/contracts';
import { communityAnswerResult, communityNewPostPageData, communityPolishResult, communityPostAnswerDraftData, fakeHandler } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CommunityPostForm } from './post-form';
import { CommunityReplyForm } from './reply-form';
import { ReplyTargetProvider } from './reply-target';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/app/community/new' }));
afterEach(() => { cleanup(); window.localStorage.clear(); });

const community = messages.community;
const drafts = messages.forms.aiDraft;

function wrap(children: ReactNode) {
  return <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages} onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>;
}

describe('"Make it clearer" in the Neighbors composer', () => {
  it('sends the kind, title and words, puts the rewrite in, and Undo brings theirs back', async () => {
    const user = userEvent.setup();
    const onPolish = vi.fn(async (): Promise<AiAssistResult<CommunityPolish>> => communityPolishResult);
    render(wrap(<CommunityPostForm data={communityNewPostPageData} initialKind="recommendation" onPost={fakeHandler({ ok: true, code: 'sent' })} label="New post" onPolish={onPolish} />));
    const polish = screen.getByRole('button', { name: community.polish.button });
    // Nothing to rewrite yet.
    expect(polish).toBeDisabled();
    await user.type(screen.getByLabelText(community.newPost.titleLabel), 'who can build ikea desk');
    await user.type(screen.getByLabelText(community.newPost.bodyOptional), 'need someone careful this weekend');
    await user.click(polish);
    expect(onPolish).toHaveBeenCalledExactlyOnceWith({ kind: 'recommendation', title: 'who can build ikea desk', body: 'need someone careful this weekend' });
    expect(await screen.findByText(drafts.rewritten)).toBeVisible();
    const polished = communityPolishResult.ok ? communityPolishResult.value : { title: '', body: '' };
    expect(screen.getByLabelText(community.newPost.titleLabel)).toHaveValue(polished.title);
    expect(screen.getByLabelText(community.newPost.bodyOptional)).toHaveValue(polished.body);
    await user.click(screen.getByRole('button', { name: drafts.undo }));
    expect(screen.getByLabelText(community.newPost.titleLabel)).toHaveValue('who can build ikea desk');
  });

  it('is not offered without the handler', () => {
    render(wrap(<CommunityPostForm data={communityNewPostPageData} initialKind="general" onPost={fakeHandler({ ok: true, code: 'sent' })} label="New post" />));
    expect(screen.queryByRole('button', { name: community.polish.button })).not.toBeInTheDocument();
  });
});

describe('"Draft an answer with AI" for a helper', () => {
  it('sends what is typed as their own words, fills the reply, and Undo restores', async () => {
    const user = userEvent.setup();
    const onDraftAnswer = vi.fn(async (): Promise<AiAssistResult<CommunityAnswerDraft>> => communityAnswerResult);
    render(wrap(<ReplyTargetProvider><CommunityReplyForm data={communityPostAnswerDraftData} onReply={fakeHandler({ ok: true, code: 'sent' })} onDraftAnswer={onDraftAnswer} /></ReplyTargetProvider>));
    const reply = screen.getByRole('textbox', { name: community.replyForm.label });
    await user.type(reply, 'I did three last month');
    await user.click(screen.getByRole('button', { name: community.answerDraft.button }));
    expect(onDraftAnswer).toHaveBeenCalledExactlyOnceWith({ notes: 'I did three last month' });
    expect(await screen.findByText(drafts.draftedSend)).toBeVisible();
    expect(reply).toHaveValue(communityAnswerResult.ok ? communityAnswerResult.value.body : '');
    await user.click(screen.getByRole('button', { name: drafts.undo }));
    expect(reply).toHaveValue('I did three last month');
  });

  it('says why it could not draft', async () => {
    const user = userEvent.setup();
    render(wrap(<ReplyTargetProvider><CommunityReplyForm data={communityPostAnswerDraftData} onReply={fakeHandler({ ok: true, code: 'sent' })} onDraftAnswer={async () => ({ ok: false, code: 'rate_limited' })} /></ReplyTargetProvider>));
    await user.click(screen.getByRole('button', { name: community.answerDraft.button }));
    expect(await screen.findByText(drafts.errors.rate_limited)).toBeVisible();
  });
});
