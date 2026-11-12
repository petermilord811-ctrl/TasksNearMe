import { describe, expect, it } from 'vitest';
import { REBOOK_PROPOSAL_STATUSES, acceptProposalInputSchema, rebookProposalInputSchema, type RebookProposalView } from '@/contracts';
import {
  deskProposalAcceptedPoster,
  deskProposalDeclinedHelper,
  deskProposalExpiredPoster,
  deskProposalSentHelper,
  deskProposalSentPoster,
  deskProposalWithdrawnPoster,
  movingProposalSentHelper,
  myClientsData,
  proposalPosterData,
} from './rebook';

const proposals: RebookProposalView[] = [
  deskProposalSentPoster,
  deskProposalSentHelper,
  deskProposalAcceptedPoster,
  deskProposalDeclinedHelper,
  deskProposalExpiredPoster,
  deskProposalWithdrawnPoster,
  movingProposalSentHelper,
];

describe('rebooking fixtures', () => {
  it('cover every status, with actions only while a proposal waits', () => {
    expect(new Set(proposals.map((proposal) => proposal.status))).toEqual(new Set(REBOOK_PROPOSAL_STATUSES));
    for (const proposal of proposals) {
      const expected = proposal.status !== 'sent' ? [] : proposal.viewerRole === 'poster' ? ['accept_proposal', 'decline_proposal'] : ['withdraw_proposal'];
      expect(proposal.actions).toEqual(expected);
      expect(proposal.expiresAt !== undefined).toBe(proposal.status === 'sent');
      expect(proposal.bookingId !== undefined).toBe(proposal.status === 'accepted');
    }
  });

  it('show the exact address to the client only', () => {
    for (const proposal of proposals) if (proposal.viewerRole === 'helper') expect(proposal.exactAddress).toBeUndefined();
    expect(deskProposalSentPoster.exactAddress).toBeDefined();
    expect(proposalPosterData.payment).toBeDefined();
  });

  it('offer a proposal only to clients without one waiting', () => {
    for (const row of myClientsData.clients) if (row.openProposal) expect(row.actions).toEqual([]);
    expect(myClientsData.clients.some((row) => row.actions.includes('propose_rebook'))).toBe(true);
  });

  it('match the form schemas', () => {
    expect(rebookProposalInputSchema.safeParse({ date: '2026-12-19', startTime: '10:00', pricing: { type: 'fixed', priceCents: 6000 } }).success).toBe(true);
    expect(rebookProposalInputSchema.safeParse({ date: '', startTime: '10:00', pricing: { type: 'fixed', priceCents: 6000 } }).success).toBe(false);
    expect(acceptProposalInputSchema.safeParse({ payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true }).success).toBe(true);
  });
});
