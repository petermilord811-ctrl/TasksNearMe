// Owned by Codex (UI). Every component and screen gets at least one preview, registered here.
// Ids are "group/variant" in kebab-case. The harness (npm run test:ui) renders each one at
// 360×800 and 1280×800, runs axe, and saves screenshots to artifacts/ui-previews/.
import type { PreviewEntry } from '@/contracts/preview';
import { harnessPreviews } from './harness.preview';

export const previews: PreviewEntry[] = [...harnessPreviews];
