import { TownStillCapture } from './capture';

export const metadata = { title: 'Dev town still' };

/**
 * Development only (the dev layout guards it): draws one of the hero town's still pictures, for
 * `node scripts/render-town-stills.mjs`, which saves them to public/ui/landing. One per layout, theme and season.
 */
export default function DevTownStillPage() {
  return <TownStillCapture />;
}
