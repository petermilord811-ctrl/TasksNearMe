/**
 * The Bubble cursor family as real cursor images (2026-11-24, round two; owner: "more optimized ... and more
 * different cases of cursors"). The browser and the system draw them, so they follow the mouse with no lag however
 * busy the page is, and they're there from the first paint. Each is a 32 px SVG; the same drawing makes the static
 * cursors (bubble-cursor.generated.css) and the frames of the few moments that move (cursor-motion.ts).
 *
 * Every image carries `id="bcur-<kind>"`, so a page can tell from an element's computed cursor which one it shows.
 */

export const CURSOR_KINDS = ['rest', 'press', 'tab', 'sheet', 'off', 'busy', 'loading', 'text', 'grab', 'grabbing', 'map', 'mapDrag'] as const;
export type CursorKind = (typeof CURSOR_KINDS)[number];

/** How a frame bends the drawing. All of it pivots on the hotspot, so the point never moves. */
export interface CursorPose {
  /** Scale, on top of the kind's own size. */
  scale?: number;
  /** Clockwise turn in degrees. */
  rotate?: number;
  /** Squash and stretch. */
  sx?: number;
  sy?: number;
  /** The bubble's corners: 8.5 is round, 4.8 a rounded square (loading). */
  corner?: number;
  /** Loading: the spinner's turn in degrees. */
  spin?: number;
  /** Arrival: 0 → 1 as the ring closes and the check is drawn. */
  check?: number;
}

const CLAY = '#c13f12';
const CREAM = '#fffaf3';
const INK = '#241c16';
/** The bubble on a 24-unit grid: tip (2.5, 2.5), round body centered at (12.5, 12.5), radius 8.5. */
const TAIL = 'M2.5 2.5 Q4.1 5.9 4.29 10.3 L10.3 4.29 Q5.9 4.1 2.5 2.5 Z';
/** 24 units shown at 26 px. */
const UNIT = 26 / 24;

export const CURSOR_HOTSPOT: Record<CursorKind, readonly [number, number]> = {
  rest: [3, 3], press: [3, 3], tab: [3, 3], sheet: [3, 3], off: [3, 3], busy: [3, 3], loading: [3, 3],
  text: [16, 16], grab: [16, 16], grabbing: [16, 16], map: [16, 29], mapDrag: [16, 29],
};

/** What the browser shows if it can't use the image. */
const FALLBACK: Record<CursorKind, string> = {
  rest: 'auto', press: 'pointer', tab: 'pointer', sheet: 'pointer', off: 'not-allowed', busy: 'progress', loading: 'progress',
  text: 'text', grab: 'grab', grabbing: 'grabbing', map: 'grab', mapDrag: 'grabbing',
};

/** Each kind's own size and shape before a pose bends it. */
const BASE: Partial<Record<CursorKind, CursorPose>> = {
  press: { scale: 1.06 }, tab: { scale: 1.12 }, sheet: { scale: 1.12 }, busy: { scale: 1.06, corner: 4.8 }, loading: { scale: 1.08, corner: 4.8 },
  grabbing: { scale: 0.92 }, mapDrag: { sy: 0.86 },
};

const n = (value: number) => String(Math.round(value * 1000) / 1000);

function svg(kind: CursorKind, body: string): string {
  return `<svg id="bcur-${kind}" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">`
    + '<defs><filter id="d" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.7" stdDeviation="0.6" flood-color="#17120e" flood-opacity="0.35"/></filter></defs>'
    + body + '</svg>';
}

/** The pose's transform about a hotspot (hx, hy), in a drawing whose own pivot is (px, py) at `unit` scale. */
function transform(pose: CursorPose, hx: number, hy: number, px: number, py: number, unit: number): string {
  const s = (pose.scale ?? 1) * unit;
  return `translate(${n(hx)} ${n(hy)}) rotate(${n(pose.rotate ?? 0)}) scale(${n(s * (pose.sx ?? 1))} ${n(s * (pose.sy ?? 1))}) translate(${n(-px)} ${n(-py)})`;
}

function bubbleMarks(kind: CursorKind, pose: CursorPose): string {
  const stroke = `fill="none" stroke="${CREAM}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case 'press':
      return `<circle cx="12.5" cy="12.5" r="2.3" fill="${CREAM}"/>`;
    case 'tab':
      return `<path d="M9.9 15.1 L15.1 9.9 M11.2 9.9 H15.1 V13.8" ${stroke} stroke-width="1.7"/>`;
    case 'sheet':
      return `<g ${stroke} stroke-width="1.4"><rect x="8.6" y="9.2" width="7.8" height="6.6" rx="1.4"/><path d="M13.4 9.2 V15.8"/></g>`;
    case 'off':
      return `<g ${stroke} stroke-width="1.5"><circle cx="12.5" cy="12.5" r="3.6"/><path d="M10 15 L15 10"/></g>`;
    case 'busy':
      return `<g fill="${CREAM}"><circle cx="9.7" cy="12.5" r="1.1"/><circle cx="12.5" cy="12.5" r="1.1"/><circle cx="15.3" cy="12.5" r="1.1"/></g>`;
    case 'loading': {
      if (pose.check === undefined) {
        return `<circle cx="12.5" cy="12.5" r="4.3" ${stroke} stroke-width="1.7" stroke-dasharray="20 7.02" transform="rotate(${n(pose.spin ?? 0)} 12.5 12.5)"/>`;
      }
      const c = Math.min(1, Math.max(0, pose.check));
      const ring = `<circle cx="12.5" cy="12.5" r="4.3" ${stroke} stroke-width="1.7" opacity="${n(1 - c * 0.85)}"/>`;
      return ring + `<path d="M9.4 12.8 L11.6 15 L15.7 10.7" ${stroke} stroke-width="1.8" stroke-dasharray="9.6" stroke-dashoffset="${n(9.6 * (1 - c))}"/>`;
    }
    default:
      return '';
  }
}

function bubble(kind: CursorKind, pose: CursorPose): string {
  const corner = n(pose.corner ?? 8.5);
  const shape = `<path d="${TAIL}"/><rect x="4" y="4" width="17" height="17" rx="${corner}" ry="${corner}"/>`;
  const faded = kind === 'off' ? ' opacity="0.55"' : '';
  return svg(kind, `<g filter="url(#d)" transform="${transform(pose, 3, 3, 2.5, 2.5, UNIT)}">`
    + `<g fill="${CREAM}" stroke="${CREAM}" stroke-width="2.4" stroke-linejoin="round">${shape}</g>`
    + `<g fill="${CLAY}"${faded}>${shape}</g>${bubbleMarks(kind, pose)}</g>`);
}

/** Text: a crisp I-beam (the caret's place) with a small bubble beside it, as if about to speak. */
function textBeam(pose: CursorPose): string {
  const beam = 'M12.6 8.2 C14.6 8.2 15.3 8.8 16 9.6 C16.7 8.8 17.4 8.2 19.4 8.2 M16 9.6 V22.4 M12.6 23.8 C14.6 23.8 15.3 23.2 16 22.4 C16.7 23.2 17.4 23.8 19.4 23.8';
  return svg('text', `<g transform="${transform(pose, 16, 16, 16, 16, 1)}">`
    + `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${beam}" stroke="${CREAM}" stroke-width="4"/><path d="${beam}" stroke="${INK}" stroke-width="1.6"/></g>`
    + `<g filter="url(#d)"><path d="M19.3 11.3 L20.4 8.6 L22.4 10.3 Z" fill="${CLAY}" stroke="${CREAM}" stroke-width="1" stroke-linejoin="round"/><circle cx="22.8" cy="8.2" r="3.1" fill="${CLAY}" stroke="${CREAM}" stroke-width="1.1"/></g></g>`);
}

/** Things you drag: a round clay bubble with an open hand, closed while dragging. */
function hand(kind: 'grab' | 'grabbing', pose: CursorPose): string {
  const open = ['M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'];
  const closed = ['M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4', 'M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5', 'M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0'];
  const paths = (kind === 'grab' ? open : closed).map((d) => `<path d="${d}"/>`).join('');
  return svg(kind, `<g filter="url(#d)" transform="${transform(pose, 16, 16, 16, 16, 1)}">`
    + `<circle cx="16" cy="16" r="10.5" fill="${CLAY}" stroke="${CREAM}" stroke-width="1.6"/>`
    + `<g transform="translate(9.4 9.4) scale(0.55)" fill="none" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g></g>`);
}

/** Maps: the bubble as a map marker, pointing down at the place; squashed while you drag the map. */
function marker(kind: 'map' | 'mapDrag', pose: CursorPose): string {
  const pin = 'M16 29 L8.71 16.88 A8.5 8.5 0 1 1 23.29 16.88 Z';
  const inner = kind === 'map' ? `<circle cx="16" cy="12.5" r="3" fill="${CREAM}"/>` : `<circle cx="16" cy="12.5" r="3" fill="none" stroke="${CREAM}" stroke-width="1.6"/>`;
  return svg(kind, `<g filter="url(#d)" transform="${transform(pose, 16, 29, 16, 29, 1)}">`
    + `<path d="${pin}" fill="${CLAY}" stroke="${CREAM}" stroke-width="1.6" stroke-linejoin="round"/>${inner}</g>`);
}

/** One cursor image as SVG markup. */
export function cursorSvg(kind: CursorKind, pose: CursorPose = {}): string {
  const base = BASE[kind] ?? {};
  const merged: CursorPose = { ...base, ...pose, scale: (base.scale ?? 1) * (pose.scale ?? 1), sx: (base.sx ?? 1) * (pose.sx ?? 1), sy: (base.sy ?? 1) * (pose.sy ?? 1) };
  if (kind === 'text') return textBeam(merged);
  if (kind === 'grab' || kind === 'grabbing') return hand(kind, merged);
  if (kind === 'map' || kind === 'mapDrag') return marker(kind, merged);
  return bubble(kind, merged);
}

/** SVG as a compact data URI: only what a quoted CSS url needs escaped (about half the size of full encoding). */
const dataUri = (markup: string) => `data:image/svg+xml,${markup.replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}`;

/** A CSS `cursor` value: the image, its hotspot, and the system cursor it falls back to. */
export function cursorValue(kind: CursorKind, pose: CursorPose = {}): string {
  const [x, y] = CURSOR_HOTSPOT[kind];
  return `url("${dataUri(cursorSvg(kind, pose))}") ${x} ${y}, ${FALLBACK[kind]}`;
}

/** Which of the family an element's computed cursor is, or null for a system cursor. */
export function kindOfCursor(computed: string): CursorKind | null {
  const match = /bcur-([a-zA-Z]+)/.exec(computed);
  return match && (CURSOR_KINDS as readonly string[]).includes(match[1]!) ? (match[1] as CursorKind) : null;
}
