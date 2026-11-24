/**
 * Whether a frame loop running at about `fps` should draw at `now` (a requestAnimationFrame timestamp), having last
 * drawn at `last` (0: never). Frames are picked on one shared clock (whole periods since the page's start), so the
 * landing's loops at the same rate (the 3D town, the weather over it) draw on the same display frames and the
 * compositor rests on the frames between, instead of each loop keeping its own phase and the screen updating on every
 * frame. At 60 a second it draws on every frame of a 60 Hz display.
 */
export function dueFrame(now: number, last: number, fps: number): boolean {
  if (!last) return true;
  const period = 1000 / fps;
  // At display rates: every frame far enough along (a period's jitter can't skip one).
  if (fps >= 50) return now - last >= period * 0.6;
  // Slower: the shared clock (a loop that started out of step draws once more and is then in step).
  return Math.floor(now / period) !== Math.floor(last / period);
}
