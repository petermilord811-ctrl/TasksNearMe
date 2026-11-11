// Owned by Codex (UI). Every component and screen gets at least one preview, registered here.
// Ids are "group/variant" in kebab-case. The harness (npm run test:ui) renders each one at
// 360×800 and 1280×800, runs axe, and saves screenshots to artifacts/ui-previews/.
import type { PreviewEntry } from '@/contracts/preview';
import { moneyPreviews } from './money.preview';
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
import { authPreviews } from './auth.preview';
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

export const previews: PreviewEntry[] = [
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
  ...publicPagePreviews,
  ...authPreviews,
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
  ...helperProfileEditorPreviews,
];
