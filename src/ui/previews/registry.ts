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
];
