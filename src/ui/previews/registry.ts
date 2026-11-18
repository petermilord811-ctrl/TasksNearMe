// Owned by Codex (UI). Every component and screen gets at least one preview, registered here.
// Ids are "group/variant" in kebab-case. The harness (npm run test:ui) renders each one at
// 360×800 and 1280×800, runs axe, and saves screenshots to artifacts/ui-previews/.
import type { PreviewEntry } from '@/contracts/preview';
import { moneyPreviews } from './money.preview';
import { brandPreviews } from './brand.preview';
import { statusPreviews } from './status.preview';
import { deadlinePreviews } from './deadline.preview';
import { feedbackPreviews } from './feedback.preview';
import { peoplePreviews } from './people.preview';
import { locationPreviews } from './location.preview';
import { messagingPreviews } from './messaging.preview';
import { timelinePreviews } from './timeline.preview';
import { actionPreviews } from './actions.preview';
import { layoutPreviews } from './layout.preview';
import { primitivePreviews } from './primitives.preview';
import { shellPreviews } from './shell.preview';
import { publicCardPreviews } from './public-cards.preview';
import { publicPagePreviews } from './public-pages.preview';
import { landingPreviews } from './landing.preview';
import { authPreviews } from './auth.preview';
import { betaPreviews } from './beta.preview';
import { waitlistPreviews } from './waitlist.preview';
import { contentPreviews } from './content.preview';
import { taskPagePreviews } from './task-pages.preview';
import { helperProfilePreviews } from './helper-profile.preview';
import { reviewsWorkSamplesPreviews } from './reviews-work-samples.preview';
import { postingPreviews } from './posting.preview';
import { myTasksPreviews } from './my-tasks.preview';
import { taskManagePreviews } from './task-manage.preview';
import { offerPreviews } from './offers.preview';
import { helperOnboardingPreviews } from './helper-onboarding.preview';
import { helperProfileEditorPreviews } from './helper-profile-editor.preview';
import { findWorkPreviews } from './find-work.preview';
import { helperTaskPreviews } from './helper-task.preview';
import { myOffersPreviews } from './my-offers.preview';
import { bookingConfirmPreviews } from './booking-confirm.preview';
import { bookingsPreviews } from './bookings.preview';
import { completionPreviews } from './completion.preview';
import { messagesScreenPreviews } from './messages-screens.preview';
import { bookingSheetsPreviews } from './booking-sheets.preview';
import { moneyPagePreviews } from './money-pages.preview';
import { homePreviews } from './home.preview';
import { reviewPreviews } from './reviews.preview';
import { savedHelpersPreviews } from './saved-helpers.preview';
import { accountPreviews } from './account.preview';
import { notificationPreviews } from './notifications.preview';
import { supportPreviews } from './support.preview';
import { supportCasePreviews } from './support-case.preview';
import { safetyPreviews } from './safety.preview';
import { adminPreviews } from './admin.preview';
import { adminSupportToolsPreviews } from './admin-support-tools.preview';
import { adminMetricsPreviews } from './admin-metrics.preview';
import { helperStandingPreviews } from './helper-standing.preview';
import { badgesPreviews } from './badges.preview';
import { adminWebhooksPreviews } from './admin-webhooks.preview';
import { adminReversalsPreviews } from './admin-reversals.preview';
import { staffControlsPreviews } from './staff-controls.preview';
import { adminMoneyPreviews } from './admin-money.preview';
import { adminPeoplePreviews } from './admin-people.preview';
import { adminOpsPreviews } from './admin-ops.preview';
import { adminPaymentsPreviews } from './admin-payments.preview';
import { adminStaffPreviews } from './admin-staff.preview';
import { staffVerifyPreviews } from './staff-verify.preview';
import { adminConfigPreviews } from './admin-config.preview';
import { helpersBrowsePreviews } from './helpers-browse.preview';
import { reportPreviews } from './report.preview';
import { communityPreviews } from './community.preview';
import { portalPreviews } from './portal.preview';
import { questionPreviews } from './questions.preview';
import { searchPreviews } from './searches.preview';
import { rewardsPreviews } from './rewards.preview';
import { changesPreviews } from './changes.preview';
import { inviteCardPreviews } from './invite-card.preview';
import { requestHelperPreviews } from './request-helper.preview';
import { availabilityPreviews } from './availability.preview';
import { availabilitySlotPreviews } from './availability-slots.preview';
import { myClientsPreviews } from './my-clients.preview';
import { proposeRebookPreviews } from './propose-rebook.preview';
import { proposalPreviews } from './proposal.preview';
import { seriesPreviews } from './series.preview';
import { verificationPreviews } from './verification.preview';
import { identityCheckPreviews } from './identity-check.preview';

export const previews: PreviewEntry[] = [
  ...brandPreviews,
  ...moneyPreviews,
  ...statusPreviews,
  ...deadlinePreviews,
  ...feedbackPreviews,
  ...peoplePreviews,
  ...locationPreviews,
  ...messagingPreviews,
  ...timelinePreviews,
  ...actionPreviews,
  ...layoutPreviews,
  ...primitivePreviews,
  ...shellPreviews,
  ...publicCardPreviews,
  ...landingPreviews,
  ...publicPagePreviews,
  ...authPreviews,
  ...betaPreviews,
  ...waitlistPreviews,
  ...contentPreviews,
  ...taskPagePreviews,
  ...helperProfilePreviews,
  ...reviewsWorkSamplesPreviews,
  ...postingPreviews,
  ...myTasksPreviews,
  ...taskManagePreviews,
  ...offerPreviews,
  ...helperOnboardingPreviews,
  ...verificationPreviews,
  ...identityCheckPreviews,
  ...helperProfileEditorPreviews,
  ...findWorkPreviews,
  ...helperTaskPreviews,
  ...myOffersPreviews,
  ...bookingConfirmPreviews,
  ...bookingsPreviews,
  ...completionPreviews,
  ...messagesScreenPreviews,
  ...bookingSheetsPreviews,
  ...moneyPagePreviews,
  ...homePreviews,
  ...reviewPreviews,
  ...savedHelpersPreviews,
  ...accountPreviews,
  ...notificationPreviews,
  ...supportPreviews,
  ...supportCasePreviews,
  ...safetyPreviews,
  ...adminPreviews,
  ...adminSupportToolsPreviews,
  ...adminMetricsPreviews,
  ...helperStandingPreviews,
  ...badgesPreviews,
  ...adminWebhooksPreviews,
  ...adminReversalsPreviews,
  ...staffControlsPreviews,
  ...adminMoneyPreviews,
  ...adminPeoplePreviews,
  ...adminOpsPreviews,
  ...adminPaymentsPreviews,
  ...adminStaffPreviews,
  ...staffVerifyPreviews,
  ...adminConfigPreviews,
  ...helpersBrowsePreviews,
  ...rewardsPreviews,
  ...changesPreviews,
  ...inviteCardPreviews,
  ...requestHelperPreviews,
  ...availabilityPreviews,
  ...availabilitySlotPreviews,
  ...myClientsPreviews,
  ...proposeRebookPreviews,
  ...proposalPreviews,
  ...seriesPreviews,
  ...reportPreviews,
  ...communityPreviews,
  ...portalPreviews,
  ...questionPreviews,
  ...searchPreviews,
];
