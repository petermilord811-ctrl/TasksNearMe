import type { InviteHandlers } from '@/contracts';
import {
  acceptCounterAction,
  acceptInviteAction,
  cancelInviteAction,
  counterInviteAction,
  declineCounterAction,
  declineInviteAction,
  finishInviteVerificationAction,
} from './actions';

/** The invite card's Server Actions, for the helper's offers and the client's task page. */
export const inviteHandlers: InviteHandlers = {
  onAccept: acceptInviteAction,
  onDecline: declineInviteAction,
  onCounter: counterInviteAction,
  onCancel: cancelInviteAction,
  onAcceptCounter: acceptCounterAction,
  onDeclineCounter: declineCounterAction,
  onFinishVerification: finishInviteVerificationAction,
};
