import type { AddressVerificationStatus, BackgroundCheckStatus, BadgeTone, IdentityStatus, PayoutAccountStatus } from '@/contracts';

/** The badge tone of each verification track's status (staff pages and the client's ID page). */

export const identityStatusTones: Record<IdentityStatus, BadgeTone> = {
  not_started: 'neutral', processing: 'info', requires_input: 'warning', verified: 'success', canceled: 'neutral',
};

export const addressStatusTones: Record<AddressVerificationStatus, BadgeTone> = {
  not_started: 'neutral', in_review: 'info', verified: 'success', rejected: 'warning', requested: 'warning',
};

export const payoutStatusTones: Record<PayoutAccountStatus, BadgeTone> = {
  not_started: 'neutral', pending: 'info', requirements_due: 'warning', active: 'success', restricted: 'danger',
};

export const backgroundStatusTones: Record<BackgroundCheckStatus, BadgeTone> = {
  not_required: 'neutral', not_started: 'neutral', invited: 'info', pending: 'info', clear: 'success',
  consider: 'warning', suspended: 'danger', canceled: 'neutral', expired: 'warning',
};
