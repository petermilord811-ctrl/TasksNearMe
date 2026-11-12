import type { ComponentProps } from 'react';
import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type PaymentAttemptResult, type PreviewEntry, type ProposalHandlers, type ProposalPageData } from '@/contracts';
import {
  deskProposalDeclinedHelper, deskProposalExpiredPoster, deskProposalWithdrawnPoster,
  fakeHandler, fakeProposalHandlers, jordanShell, mayaShell, movingProposalSentHelper,
  proposalAcceptedData, proposalHelperData, proposalPosterData,
} from '@/fixtures';
import { ProposalContent } from '@/ui/screens/clients/proposal-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/proposal.json';
import feedbackCopy from '../../../messages/en/ui/feedback.json';

const now = '2026-12-08T17:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
type Options = Pick<ComponentProps<typeof ProposalContent>, 'initialResult' | 'initialPending'> & { handlers?: ProposalHandlers };

function preview(variant: string, title: string, data: ProposalPageData, options?: Options): PreviewEntry {
  return {
    id: `screen-proposal/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={data.proposal.viewerRole === 'poster' ? mayaShell : jordanShell} handlers={shellHandlers} currentPath={routes.app.proposal(data.proposal.id)} layout="flow">
      <ProposalContent data={data} handlers={fakeProposalHandlers} now={now} {...options} />
    </AppShell>,
  };
}

const verification: PaymentAttemptResult = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_proposal_desk', kind: 'dev' } };
const declined: ActionResult = { ok: false, code: 'payment_declined' };

export const proposalPreviews: PreviewEntry[] = [
  preview('client-sent', copy.previews['client-sent'], proposalPosterData),
  preview('client-bank-verification', copy.previews['client-bank-verification'], proposalPosterData, {
    initialResult: verification,
    handlers: {
      ...fakeProposalHandlers,
      onAccept: async () => { await fakeHandler()(undefined); return verification; },
      onFinishVerification: (input) => input.outcome === 'approved' ? fakeProposalHandlers.onFinishVerification(input) : fakeHandler(declined)(undefined),
    },
  }),
  preview('client-declined-card', copy.previews['client-declined-card'], proposalPosterData, {
    initialResult: declined, handlers: { ...fakeProposalHandlers, onAccept: fakeHandler(declined) },
  }),
  preview('helper-sent', copy.previews['helper-sent'], proposalHelperData),
  preview('helper-hourly', copy.previews['helper-hourly'], { proposal: movingProposalSentHelper }),
  preview('accepted', copy.previews.accepted, proposalAcceptedData),
  preview('declined', copy.previews.declined, { proposal: deskProposalDeclinedHelper }),
  preview('expired', copy.previews.expired, { proposal: deskProposalExpiredPoster }),
  preview('withdrawn', copy.previews.withdrawn, { proposal: deskProposalWithdrawnPoster }),
  preview('submitting', copy.previews.submitting, proposalPosterData, {
    initialPending: true, handlers: { ...fakeProposalHandlers, onAccept: () => new Promise(() => {}) },
  }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'payment_declined').map((code) => {
    const result: ActionResult = {
      ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { acceptTerms: ['must_accept' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-12-08T17:05:00.000Z' } : {}),
    };
    return preview(`result-${code.replaceAll('_', '-')}`, feedbackCopy.error[code], proposalPosterData, {
      initialResult: result, handlers: { ...fakeProposalHandlers, onAccept: fakeHandler(result) },
    });
  }),
];
