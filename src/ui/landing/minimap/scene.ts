import { cameraPose, projector, STAGE, unprojector, VIEW, type Frame, type View } from './camera';
import { chaikin, contours, pointInPolygon, seeded, simplify, spline, type Pt } from './geometry';

/**
 * The hero's mini-map town, as data: clay plates on thin terraces, a river and canals, bridges, roads with
 * lamps, and a lived-in town on the plates: gable houses, modern flat-roofed houses, townhouse rows, small
 * apartment blocks, shops with patios, a barn, a church, a water tower, a windmill, a greenhouse, a plaza with
 * food trucks and market stalls, a sports court, a playground, community garden beds, backyard pools, docks,
 * parked cars, trees of several kinds, lawns with bluebonnets, a round garden, benches and picnic blankets, the
 * pins' houses (each with a yard where its task happens), and the paths of everything that moves (bikes, cars,
 * boats, kayaks, people, birds, balloons). It spreads from the bottom-left of the stage to its top-right and
 * keeps clear of the headline (top-left). Generated once, deterministically: the land and the water are signed
 * distance fields, marching squares turns them into outlines, and a seeded random source scatters the rest.
 *
 * Each layout has its own composition: `wide` beside the headline (16:10, the plates keep clear of the text in
 * the top-left), `band` under it on narrow screens (a full-width band, land from edge to edge, a river from the
 * bottom-left to the top-right). A composition is written in its stage's coordinates (what the camera shows, at
 * ground level) and turned into the world exactly through its camera (`unprojector`). Everything returned is in
 * world units on the ground (x east, y south); heights are separate.
 */

export type TownLayout = 'wide' | 'band';
export const TOWN_LAYOUTS: readonly TownLayout[] = ['wide', 'band'];

/** The plate everything stands on (top at `GROUND`) and the two terraces that step down from it. */
export const LEVELS = [
  { offset: 13, top: 9, thickness: 9 },
  { offset: 6, top: 19, thickness: 10 },
  { offset: 0, top: 40, thickness: 21 },
] as const;
export const GROUND = 40;
export const WATER_LEVEL = 5;
/** How big the town's things are against its layout (houses, trees, roads). */
export const UNIT = 1.55;
/** The pins: their size, how far above a roof's ridge they float, and their head's height in pin units. */
export const PIN_SCALE = 2.3 * UNIT;
export const PIN_LIFT = 8;
export const PIN_HEAD = 14;
/** Half a road's width (the ribbon), in world units. */
export const ROAD_HALF = 6.5 * UNIT;

const p = (x: number, y: number): Pt => ({ x, y });

export interface MoverPlan {
  id: string;
  kind: Mover['kind'];
  /** Stage points; with `side`, a lane beside a road (positive: its left), else a free path (boats). */
  path: Pt[];
  side?: number;
  duration: number;
  phase: number;
  tone: number;
}

/** The town's bigger one-off places, by where they'd best sit on the stage (each is skipped if it can't fit). */
export type FeatureKind = 'plaza' | 'court' | 'playground' | 'beds' | 'tower' | 'windmill' | 'greenhouse';

/** One layout's town, in its stage's coordinates at ground level. Lines run past the stage so nothing ends in view. */
export interface Composition {
  layout: TownLayout;
  stage: Frame;
  view: View;
  /** The land's upper-left edge and its lower-right edge, left to right. */
  upper: Pt[];
  lower: Pt[];
  /** Where the headline sits on the stage (with the plate's height): no plate within `pad` of it. */
  text: { x0: number; y0: number; x1: number; y1: number; radius: number; pad: number } | null;
  river: { line: Pt[]; width: number };
  canals: { line: Pt[]; width: number }[];
  /** Roads; they're kept where they're on a plate and bridge the water. */
  roads: Pt[][];
  /** The pins stand on houses placed right here, or as close as a house fits. */
  slots: { id: string; at: Pt }[];
  landmarks: { church: Pt; garden: Pt };
  features: Partial<Record<FeatureKind, Pt>>;
  /** How built-up it is: the house grid's step (in UNITs), how often a cell stays empty, at most how many trees. */
  density: { step: number; skip: number; trees: number };
  /** How far left of the stage the land is drawn (stage units; a wide screen shows it beside the stage). */
  reachLeft?: number;
  /** Where the birds circle (a center and how far apart their circles are). */
  birds: { center: Pt; spread: Pt };
  /** Hot-air balloons drifting high above, around these points. */
  balloons: Pt[];
  /** Kayaks on the river: a lane (world units off its middle), a trip's seconds, where they start, a color. */
  kayaks: { offset: number; duration: number; phase: number; tone: number; reverse?: boolean }[];
  /** At most this many docks along the river. */
  docks: number;
  /** The helper's way to the first pin (dotted). */
  route: Pt[];
  movers: MoverPlan[];
}

/** Beside the headline on wide screens (STAGE is 1600 × 1000). */
const WIDE: Composition = {
  layout: 'wide',
  stage: STAGE,
  view: VIEW,
  upper: [p(-1300, 884), p(-800, 882), p(-300, 880), p(120, 846), p(420, 836), p(640, 826), p(770, 800), p(842, 720), p(870, 590), p(905, 455), p(975, 325), p(1085, 205), p(1245, 110), p(1440, 55), p(1700, 25), p(1950, 10)],
  // The land ends inside the stage at the bottom (its terraces in view), the river running out at the bottom-left.
  lower: [p(-1300, 992), p(-300, 990), p(200, 992), p(600, 988), p(900, 982), p(1100, 972), p(1300, 962), p(1460, 950), p(1620, 936), p(1800, 924), p(1950, 918)],
  text: { x0: -2400, y0: -600, x1: 750, y1: 784, radius: 150, pad: 30 },
  river: { line: [p(-1300, 1048), p(-700, 1030), p(-160, 1010), p(140, 978), p(400, 958), p(620, 930), p(800, 880), p(930, 800), p(1040, 700), p(1160, 622), p(1320, 574), p(1500, 548), p(1700, 530), p(1950, 520)], width: 40 },
  canals: [
    // North, between the middle plate and the church's.
    { line: [p(1040, 700), p(1075, 590), p(1130, 480), p(1205, 372), p(1295, 262), p(1395, 150), p(1480, 40), p(1560, -120)], width: 25 },
    // An inlet that almost splits the garden's plate from the middle one.
    { line: [p(620, 930), p(590, 878), p(574, 836)], width: 19 },
    // South, down from the river between the two plates below it.
    { line: [p(930, 800), p(960, 880), p(990, 960), p(1020, 1060), p(1040, 1200)], width: 19 },
    // South-east, down from the river.
    { line: [p(1320, 574), p(1345, 660), p(1385, 760), p(1440, 860), p(1500, 980)], width: 19 },
    // East, from the north canal out to the right edge.
    { line: [p(1205, 372), p(1320, 380), p(1440, 368), p(1580, 356), p(1760, 350)], width: 16 },
  ],
  roads: [
    // The main street: from far left (wide screens), the garden's plate, the middle plate, over the north canal,
    // up past the church.
    [p(-1050, 936), p(-700, 934), p(-380, 931), p(-60, 928), p(120, 920), p(300, 912), p(470, 902), p(560, 888), p(650, 868), p(740, 852), p(820, 820), p(870, 760), p(910, 690), p(960, 640), p(1020, 600), p(1090, 572), p(1170, 540), p(1235, 488), p(1285, 420), p(1335, 350), p(1405, 290), p(1495, 250), p(1620, 222), p(1760, 205)],
    // Down from the middle plate, over the river, to the plates below.
    [p(820, 820), p(850, 880), p(880, 932)],
    // Along the plates below the river, east to the edge (over two canals).
    [p(880, 932), p(1000, 928), p(1100, 908), p(1200, 884), p(1300, 856), p(1400, 820), p(1500, 790), p(1640, 770), p(1780, 760)],
    // A lane on the church's plate, and one across the middle plate.
    [p(1285, 420), p(1240, 372), p(1185, 352), p(1120, 362)],
    [p(910, 690), p(860, 640), p(840, 580), p(860, 500)],
    // The far east: up from the river to the north-east plate.
    [p(1500, 790), p(1520, 700), p(1560, 620), p(1640, 600), p(1780, 590)],
  ],
  slots: [
    { id: 'center', at: p(980, 520) },
    { id: 'east', at: p(1470, 690) },
    { id: 'west', at: p(260, 935) },
    { id: 'north', at: p(1330, 250) },
    { id: 'south', at: p(1235, 918) },
  ],
  landmarks: { church: p(1430, 330), garden: p(370, 860) },
  features: {
    plaza: p(1170, 800),
    court: p(1560, 470),
    playground: p(1365, 905),
    beds: p(1010, 330),
    tower: p(1130, 210),
    windmill: p(700, 880),
    greenhouse: p(1560, 880),
  },
  density: { step: 50, skip: 0.06, trees: 340 },
  reachLeft: 1060,
  birds: { center: p(1250, 520), spread: p(200, 160) },
  balloons: [p(1545, 330), p(1590, 800)],
  kayaks: [
    { offset: 20, duration: 70, phase: 0.12, tone: 0 },
    { offset: -22, duration: 82, phase: 0.58, tone: 1, reverse: true },
    { offset: 8, duration: 96, phase: 0.86, tone: 2, reverse: true },
  ],
  docks: 3,
  route: [p(300, 912), p(470, 902), p(560, 888), p(650, 868), p(740, 852), p(820, 820), p(870, 760), p(910, 690), p(940, 610), p(965, 560)],
  movers: [
    { id: 'bike', kind: 'bike', path: [p(-900, 935), p(-500, 932), p(-100, 928), p(120, 920), p(300, 912), p(470, 902), p(560, 888), p(650, 868), p(740, 852), p(820, 820), p(870, 760), p(910, 690), p(950, 600)], side: 3, duration: 36, phase: 0.3, tone: 0 },
    { id: 'bike-east', kind: 'bike', path: [p(1000, 928), p(1100, 908), p(1200, 884), p(1300, 856), p(1400, 820), p(1500, 790), p(1640, 770)], side: 3, duration: 19, phase: 0.6, tone: 1 },
    { id: 'car', kind: 'car', path: [p(1090, 572), p(1170, 540), p(1235, 488), p(1285, 420), p(1335, 350), p(1405, 290), p(1495, 250), p(1620, 222), p(1760, 205)], side: -3, duration: 16, phase: 0.1, tone: 0 },
    { id: 'car-2', kind: 'car', path: [p(1640, 770), p(1500, 790), p(1400, 820), p(1300, 856), p(1200, 884), p(1100, 908), p(1000, 928), p(890, 932)], side: -3, duration: 18, phase: 0.45, tone: 1 },
    { id: 'car-3', kind: 'car', path: [p(560, 888), p(650, 868), p(740, 852), p(820, 820), p(870, 760), p(910, 690), p(960, 640), p(1020, 600), p(1090, 572)], side: -3, duration: 14, phase: 0.8, tone: 2 },
    { id: 'boat', kind: 'boat', path: [p(1600, 538), p(1500, 548), p(1320, 574), p(1160, 622), p(1040, 700), p(930, 800), p(800, 880), p(620, 930), p(400, 958), p(140, 978), p(-160, 1010), p(-700, 1030)], duration: 60, phase: 0.42, tone: 0 },
    { id: 'sail', kind: 'sail', path: [p(500, 950), p(700, 912), p(860, 852), p(980, 760), p(1080, 670), p(1220, 600), p(1400, 560), p(1640, 536)], duration: 70, phase: 0.15, tone: 0 },
  ],
};

/**
 * Under the headline on narrow screens: a band as wide as the screen (1000 × 800). The land fills it, its upper
 * edge low on the left and high on the right (beside the text when there's room), and the river crosses it
 * from the bottom-left to the top-right. A closer camera, so things read at phone size.
 */
const BAND: Composition = {
  layout: 'band',
  stage: { width: 1000, height: 800 },
  view: { ...VIEW, distance: 3500 },
  upper: [p(-260, 300), p(-60, 262), p(120, 236), p(300, 200), p(470, 156), p(620, 112), p(760, 70), p(900, 34), p(1060, 4), p(1300, -40)],
  lower: [p(-260, 1120), p(300, 1060), p(700, 1010), p(1000, 980), p(1300, 960)],
  text: null,
  river: { line: [p(-160, 772), p(100, 690), p(300, 612), p(480, 524), p(640, 436), p(780, 348), p(900, 268), p(1020, 196), p(1160, 128), p(1320, 70)], width: 38 },
  canals: [
    // North-west, up from the river between the left plate and the middle one.
    { line: [p(480, 524), p(440, 430), p(410, 330), p(390, 220), p(380, 60)], width: 17 },
    // South-east, down from the river.
    { line: [p(780, 348), p(830, 470), p(880, 600), p(930, 740), p(980, 900)], width: 18 },
  ],
  roads: [
    // Above the river: the main street, left to right.
    [p(-60, 470), p(120, 420), p(300, 352), p(470, 290), p(620, 226), p(760, 164), p(900, 104), p(1080, 40), p(1220, -10)],
    // Below the river.
    [p(-60, 900), p(150, 834), p(340, 764), p(520, 700), p(700, 620), p(860, 540), p(1000, 460), p(1140, 390)],
    // Across the river, twice.
    [p(300, 352), p(350, 500), p(410, 660), p(450, 800), p(470, 900)],
    [p(760, 164), p(800, 320), p(850, 470), p(890, 600)],
  ],
  slots: [
    { id: 'center', at: p(560, 330) },
    { id: 'east', at: p(840, 470) },
    { id: 'west', at: p(170, 540) },
    { id: 'north', at: p(300, 340) },
    { id: 'south', at: p(600, 690) },
  ],
  landmarks: { church: p(640, 230), garden: p(220, 770) },
  features: {
    plaza: p(640, 560),
    court: p(880, 200),
    playground: p(90, 640),
    beds: p(380, 760),
    tower: p(985, 150),
    windmill: p(60, 410),
    greenhouse: p(950, 620),
  },
  density: { step: 44, skip: 0.04, trees: 135 },
  birds: { center: p(600, 300), spread: p(220, 120) },
  balloons: [p(380, 300)],
  kayaks: [
    { offset: 18, duration: 50, phase: 0.2, tone: 0 },
    { offset: -20, duration: 62, phase: 0.7, tone: 2, reverse: true },
  ],
  docks: 2,
  route: [p(120, 420), p(300, 352), p(400, 330), p(470, 290), p(530, 320)],
  movers: [
    { id: 'bike', kind: 'bike', path: [p(-40, 465), p(120, 420), p(300, 352), p(470, 290), p(620, 226), p(760, 164)], side: 3, duration: 18, phase: 0.3, tone: 0 },
    { id: 'car', kind: 'car', path: [p(1140, 390), p(1000, 460), p(860, 540), p(700, 620), p(520, 700), p(340, 764), p(150, 834)], side: -3, duration: 16, phase: 0.2, tone: 0 },
    { id: 'car-2', kind: 'car', path: [p(1080, 40), p(900, 104), p(760, 164), p(620, 226), p(470, 290)], side: -3, duration: 12, phase: 0.6, tone: 1 },
    { id: 'bike-2', kind: 'bike', path: [p(150, 834), p(340, 764), p(520, 700), p(700, 620), p(860, 540)], side: 3, duration: 16, phase: 0.75, tone: 1 },
    { id: 'boat', kind: 'boat', path: [p(1250, 96), p(1160, 128), p(1020, 196), p(900, 268), p(780, 348), p(640, 436), p(480, 524), p(300, 612), p(100, 690), p(-160, 772)], duration: 36, phase: 0.4, tone: 0 },
    { id: 'sail', kind: 'sail', path: [p(-100, 760), p(100, 686), p(300, 606), p(480, 518), p(640, 430), p(780, 342), p(900, 262), p(1100, 150)], duration: 54, phase: 0.1, tone: 0 },
  ],
};

/** For tests and tools: the wide composition's headline box. */
export const COMPOSITION = { text: WIDE.text! };

/** Water and land stay this far apart: the terraces step down into the water in between. */
const BANK = 12;

/** A composition's camera: stage <-> world, and the sampled area (its stage and a margin, so every outline closes). */
interface Lens {
  toGround: (stageX: number, stageY: number, height?: number) => Pt;
  toStage: (point: { x: number; y: number; z: number }) => { x: number; y: number; depth: number };
  toWorld: (line: Pt[], step?: number) => Pt[];
  grid: { x0: number; y0: number; x1: number; y1: number; cell: number };
  /** Whether a world point is inside the sampled area (the plates exist only there). */
  drawn: (world: Pt, margin?: number) => boolean;
}

function lensOf(composition: Composition): Lens {
  const pose = cameraPose(0, 0, 0, 1, composition.view);
  const toGround = unprojector(pose, composition.stage);
  const toStage = projector(pose, composition.stage);
  const grid = { x0: -(composition.reachLeft ?? 90), y0: -70, x1: composition.stage.width + 90, y1: composition.stage.height + 110, cell: 8 };
  return {
    toGround,
    toStage,
    toWorld: (line, step = 24) => spline(line.map((point) => toGround(point.x, point.y)), step),
    grid,
    drawn: (world, margin = 34) => {
      const at = toStage({ x: world.x, y: 0, z: world.y });
      return at.x > grid.x0 + margin && at.x < grid.x1 - margin && at.y > grid.y0 + margin && at.y < grid.y1 - margin;
    },
  };
}

/** Distance to an open polyline and which side of it (positive: left of its direction, y down). */
function signedToPolyline(point: Pt, line: Pt[]): { distance: number; side: number } {
  let best = Infinity;
  let side = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
    const ex = a.x + t * dx - point.x;
    const ey = a.y + t * dy - point.y;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) {
      best = d2;
      side = dx * (point.y - a.y) - dy * (point.x - a.x);
    }
  }
  return { distance: Math.sqrt(best), side };
}

function roundedRectDistance(point: Pt, box: { x0: number; y0: number; x1: number; y1: number; radius: number }): number {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const qx = Math.abs(point.x - cx) - ((box.x1 - box.x0) / 2 - box.radius);
  const qy = Math.abs(point.y - cy) - ((box.y1 - box.y0) / 2 - box.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - box.radius;
}

/** A gentle, organic wobble for the edges (sums of sines: cheap, and the same on every render). */
function wobble(point: Pt): number {
  return Math.sin(point.x * 0.0131 + 1.3) * Math.sin(point.y * 0.0117 + 0.4) * 7 + Math.sin((point.x + point.y) * 0.029 + 2.1) * 3 + Math.sin((point.x - point.y) * 0.047) * 1.6;
}

export interface Fields {
  /** Negative on the plates. */
  island: (world: Pt) => number;
  /** Negative in the water. */
  water: (world: Pt) => number;
  /** Negative on the land (before the water is taken out). */
  land: (world: Pt) => number;
  river: Pt[];
}

export function buildFields(composition: Composition = WIDE): Fields {
  const { toWorld, toStage } = lensOf(composition);
  const upper = toWorld(composition.upper, 70);
  const lower = toWorld(composition.lower, 70);
  const river = toWorld(composition.river.line);
  const canals = composition.canals.map((canal) => toWorld(canal.line, 30));

  const land = (world: Pt) => {
    const u = signedToPolyline(world, upper);
    const l = signedToPolyline(world, lower);
    // Left to right, the land lies below the upper edge (its positive side) and above the lower edge.
    const su = u.side > 0 ? -u.distance : u.distance;
    const sl = l.side < 0 ? -l.distance : l.distance;
    return Math.max(su, sl) + wobble(world);
  };
  const water = (world: Pt) => {
    let d = signedToPolyline(world, river).distance - composition.river.width;
    composition.canals.forEach((canal, index) => {
      d = Math.min(d, signedToPolyline(world, canals[index]!).distance - canal.width);
    });
    return d + wobble({ x: world.y * 1.7, y: world.x * 1.3 }) * 0.25;
  };
  const box = composition.text;
  const island = (world: Pt) => {
    if (!box) return Math.max(land(world), BANK - water(world));
    const stage = toStage({ x: world.x, y: GROUND, z: world.y });
    const text = box.pad - roundedRectDistance(stage, box) + wobble({ x: world.y, y: world.x }) * 1.4;
    if (text > 60) return text;
    return Math.max(land(world), BANK - water(world), text);
  };
  return { island, water, land, river };
}

// ---- The scene ---------------------------------------------------------------------------------------

export interface Slab {
  /** The outline on the ground (world). */
  outline: Pt[];
  top: number;
  thickness: number;
  level: number;
}

export type WallTint = 'white' | 'cream' | 'sage' | 'sky' | 'blush' | 'sand' | 'graphite' | 'barn';
export type RoofTint = 'white' | 'clay' | 'sand' | 'slate' | 'sage' | 'charcoal';
export type BuildingKind =
  | 'house'
  | 'church'
  | 'modern'
  | 'row'
  | 'apartment'
  | 'shop'
  | 'barn'
  | 'tower'
  | 'windmill'
  | 'greenhouse'
  | 'court'
  | 'playground'
  | 'beds'
  | 'plaza'
  | 'yard';

/** A building type (or a place: a plaza, a court…): its footprint and height. Flat roofs have `roof` 0. */
export interface HouseType {
  id: string;
  w: number;
  d: number;
  h: number;
  roof: number;
  ridge: 'x' | 'y';
  kind: BuildingKind;
}

export interface House {
  type: HouseType;
  /** The north-west corner on the ground. */
  x: number;
  y: number;
  /** The roof's color (a flat roof's too). */
  tint: RoofTint;
  wall: WallTint;
  chimney: boolean;
  /** A townhouse row's units, west to east: each its own facade, roof and height. */
  units?: { wall: WallTint; roof: RoofTint; h: number }[];
  /** On the roof: solar panels, or (flat roofs) a planted roof. */
  topping?: 'solar' | 'garden';
  /** Which way a windmill's wheel or a tower's ladder faces (radians), for the one-offs. */
  turn?: number;
}

export interface Tree {
  x: number;
  y: number;
  /** 0 round, 1 bushy, 2 tall, 3 big, 4 conifer, 5 palm, 6 agave, 7 cactus. */
  variant: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  scale: number;
  /** The crown's color: 0–3 greens, 4–5 blossom, 6–7 autumn. */
  tone: number;
}

export interface Bridge {
  /** Both ends, on the plates. */
  from: Pt;
  to: Pt;
}

export interface Slot {
  id: string;
  /** The house's center on the ground, and the height of its roof's ridge. */
  at: Pt;
  height: number;
}

export interface Mover {
  id: string;
  kind: 'bike' | 'boat' | 'sail' | 'car' | 'kayak';
  path: Pt[];
  /** Seconds for one trip along the path. */
  duration: number;
  /** Where along the trip it starts (0–1). */
  phase: number;
  /** A color index (riders' shirts, cars' paint, kayaks). */
  tone: number;
}

export interface Walker {
  path: Pt[];
  duration: number;
  phase: number;
  tone: number;
}

/** Someone staying put: standing at a stall or a truck, or sitting at a table. */
export interface Idle {
  at: Pt;
  /** Facing (radians, on the ground). */
  angle: number;
  tone: number;
  pose: 'stand' | 'sit';
}

export interface Lamp {
  at: Pt;
}

export interface Bench {
  at: Pt;
  /** Along this direction (radians, on the ground). */
  angle: number;
}

export interface Bird {
  center: Pt;
  radius: number;
  height: number;
  speed: number;
  phase: number;
}

export interface Balloon {
  center: Pt;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  tone: number;
}

/** Something placed on the ground, turned (radians), with a color index. */
export interface Placed {
  at: Pt;
  angle: number;
  tone: number;
}

/** A pin's yard: room beside its house where the pin's task is shown happening. */
export interface Yard {
  slotId: string;
  x: number;
  y: number;
  w: number;
  d: number;
}

/**
 * The water's grid, sampled once with the scene (so drawing it, and repainting it for the other theme, never
 * evaluates the fields again): per cell, the water field (negative in the water) and the land field (negative
 * on the land), row by row from (`x0`, `y0`) in steps of `step`.
 */
export interface WaterGrid {
  x0: number;
  y0: number;
  step: number;
  cols: number;
  rows: number;
  water: Float32Array;
  land: Float32Array;
}

export interface TownScene {
  composition: Composition;
  fields: Fields;
  slabs: Slab[];
  water: Pt[][];
  waterGrid: WaterGrid;
  grass: Pt[][];
  roads: Pt[][];
  bridges: Bridge[];
  houses: House[];
  trees: Tree[];
  garden: { at: Pt; r: number };
  flowers: { at: Pt; tone: number }[];
  bluebonnets: Pt[];
  /** The bluebonnets' meadows: soft patches on the lawns, under the flowers. */
  meadows: Pt[][];
  blankets: { at: Pt; angle: number; tone: number }[];
  lamps: Lamp[];
  benches: Bench[];
  pools: { x: number; y: number; w: number; d: number }[];
  /** Parked cars (beside the roads, by shops and apartments). */
  parked: Placed[];
  /** Café and plaza tables, each under an umbrella (`tone` is the umbrella's color). */
  tables: Placed[];
  docks: { from: Pt; to: Pt }[];
  /** Kayaks tied up at the docks. */
  moored: Placed[];
  yards: Yard[];
  slots: Slot[];
  movers: Mover[];
  walkers: Walker[];
  idle: Idle[];
  birds: Bird[];
  balloons: Balloon[];
  /** The helper's way to the first pin (dotted). */
  route: Pt[];
}

/**
 * What the 3D town draws from a scene: all of it but the fields' functions, so it can be built in a worker and
 * posted to the page (functions can't be).
 */
export type TownModel = Omit<TownScene, 'fields'>;

/** Samples the water's grid over the water's outlines (see `WaterGrid`). */
function sampleWater(outlines: Pt[][], fields: Fields, step = 20): WaterGrid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const outline of outlines) {
    for (const point of outline) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return { x0: 0, y0: 0, step, cols: 0, rows: 0, water: new Float32Array(0), land: new Float32Array(0) };
  const cols = Math.ceil((maxX - minX) / step) + 1;
  const rows = Math.ceil((maxY - minY) / step) + 1;
  const water = new Float32Array(cols * rows);
  const land = new Float32Array(cols * rows);
  const at = { x: 0, y: 0 };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      at.x = minX + i * step;
      at.y = minY + j * step;
      const k = j * cols + i;
      water[k] = fields.water(at);
      land[k] = fields.land(at);
    }
  }
  return { x0: minX, y0: minY, step, cols, rows, water, land };
}

function smoothOutline(lens: Lens, outline: Pt[]): Pt[] {
  return simplify(chaikin(simplify(outline, 1.2), 2), 0.6).map((point) => lens.toGround(point.x, point.y));
}

/** One pass over the stage's grid: the plates' field and the water's (only on and around the land). */
function sampleFields(lens: Lens, fields: Fields) {
  const { grid: GRID, toGround } = lens;
  const cols = Math.floor((GRID.x1 - GRID.x0) / GRID.cell) + 1;
  const rows = Math.floor((GRID.y1 - GRID.y0) / GRID.cell) + 1;
  const island = new Float64Array(cols * rows);
  const water = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const index = j * cols + i;
      // The grid's border is always outside, so every outline closes.
      if (i === 0 || j === 0 || i === cols - 1 || j === rows - 1) {
        island[index] = 999;
        water[index] = 999;
        continue;
      }
      const world = toGround(GRID.x0 + i * GRID.cell, GRID.y0 + j * GRID.cell);
      island[index] = fields.island(world);
      water[index] = Math.max(fields.water(world) - 6, fields.land(world) - 26);
    }
  }
  return { island, water, cols, rows };
}

const scaled = (type: HouseType): HouseType => ({ ...type, w: type.w * UNIT, d: type.d * UNIT, h: type.h * UNIT, roof: type.roof * UNIT });
const kind = (id: string, k: BuildingKind, w: number, d: number, h: number, roof = 0, ridge: 'x' | 'y' = 'x') => scaled({ id, kind: k, w, d, h, roof, ridge });
const HOUSE_TYPES: HouseType[] = [
  kind('a', 'house', 36, 32, 23, 14, 'x'),
  kind('b', 'house', 44, 34, 24, 15, 'x'),
  kind('c', 'house', 34, 40, 25, 15, 'y'),
  kind('d', 'house', 48, 38, 34, 17, 'x'),
  kind('e', 'house', 38, 46, 33, 17, 'y'),
  kind('f', 'house', 30, 30, 21, 13, 'y'),
  kind('g', 'house', 56, 34, 26, 14, 'x'),
];
const MODERN_TYPES: HouseType[] = [kind('m1', 'modern', 44, 34, 26), kind('m2', 'modern', 38, 40, 25), kind('m3', 'modern', 52, 32, 15)];
/** Townhouses: units 15 wide, gables facing the street (south). */
const ROW_TYPES: HouseType[] = [kind('r3', 'row', 45, 30, 27, 12, 'y'), kind('r4', 'row', 60, 30, 27, 12, 'y')];
const APARTMENT = kind('apartment', 'apartment', 52, 38, 42);
/** A shop: the building at the back, its patio (tables under umbrellas) in front. */
const SHOP = kind('shop', 'shop', 48, 46, 17);
export const SHOP_PATIO = 15 * UNIT;
const BARN = kind('barn', 'barn', 50, 38, 22, 20, 'x');
const CHURCH: HouseType = kind('church', 'church', 58, 46, 44, 22, 'y');
const FEATURE_TYPES: Record<FeatureKind, HouseType> = {
  plaza: kind('plaza', 'plaza', 100, 76, 0),
  court: kind('court', 'court', 78, 46, 0),
  playground: kind('playground', 'playground', 50, 40, 14),
  beds: kind('beds', 'beds', 62, 46, 3),
  tower: kind('tower', 'tower', 26, 26, 72),
  windmill: kind('windmill', 'windmill', 24, 24, 78),
  greenhouse: kind('greenhouse', 'greenhouse', 46, 28, 15, 9, 'x'),
};
const YARD = kind('yard', 'yard', 38, 30, 0);
const POOL = { w: 22 * UNIT, d: 13 * UNIT };

/** Where a plaza's food trucks, stalls, tables and the people at them stand (shared by the generator and the renderer). */
export function plazaLayout(plaza: { x: number; y: number; w: number; d: number }) {
  const at = (u: number, v: number) => p(plaza.x + plaza.w * u, plaza.y + plaza.d * v);
  return {
    trucks: [
      { at: at(0.27, 0.24), angle: 0, tone: 0 },
      { at: at(0.7, 0.22), angle: 0, tone: 1 },
    ] as Placed[],
    stalls: [
      { at: at(0.16, 0.72), angle: 0, tone: 0 },
      { at: at(0.5, 0.78), angle: 0, tone: 1 },
      { at: at(0.84, 0.72), angle: 0, tone: 2 },
    ] as Placed[],
    tables: [
      { at: at(0.4, 0.5), angle: 0, tone: 2 },
      { at: at(0.63, 0.52), angle: 0, tone: 3 },
    ] as Placed[],
    crowd: [
      { at: at(0.23, 0.42), angle: Math.PI / 2 },
      { at: at(0.31, 0.44), angle: Math.PI / 2 + 0.4 },
      { at: at(0.68, 0.4), angle: Math.PI / 2 - 0.3 },
      { at: at(0.16, 0.56), angle: -Math.PI / 2 },
      { at: at(0.5, 0.62), angle: -Math.PI / 2 + 0.3 },
      { at: at(0.86, 0.56), angle: -Math.PI / 2 },
    ],
  };
}

/** A quick lookup of the roads' segments by area, so "is this near a road?" stays cheap. */
function roadIndex(roads: Pt[][], cell = 64) {
  const buckets = new Map<string, [Pt, Pt][]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (const road of roads) {
    for (let k = 1; k < road.length; k += 1) {
      const a = road[k - 1]!;
      const b = road[k]!;
      const i0 = Math.floor(Math.min(a.x, b.x) / cell);
      const i1 = Math.floor(Math.max(a.x, b.x) / cell);
      const j0 = Math.floor(Math.min(a.y, b.y) / cell);
      const j1 = Math.floor(Math.max(a.y, b.y) / cell);
      for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) (buckets.get(key(i, j)) ?? buckets.set(key(i, j), []).get(key(i, j))!).push([a, b]);
    }
  }
  /** The distance from a point to the nearest road's middle line (Infinity beyond `within`). */
  return (point: Pt, within: number): number => {
    let best = Infinity;
    const reach = Math.ceil(within / cell);
    const ci = Math.floor(point.x / cell);
    const cj = Math.floor(point.y / cell);
    for (let i = ci - reach; i <= ci + reach; i += 1) {
      for (let j = cj - reach; j <= cj + reach; j += 1) {
        for (const [a, b] of buckets.get(key(i, j)) ?? []) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
          best = Math.min(best, Math.hypot(a.x + t * dx - point.x, a.y + t * dy - point.y));
        }
      }
    }
    return best;
  };
}

/** Bridges where a road crosses water; the roads themselves, split where they leave the plates. */
function splitRoads(lens: Lens, fields: Fields, roads: Pt[][]): { bridges: Bridge[]; onLand: Pt[][] } {
  const { drawn } = lens;
  const bridges: Bridge[] = [];
  const onLand: Pt[][] = [];
  for (const road of roads) {
    let run: Pt[] = [];
    let lastLand: Pt | null = null;
    let crossedWater = false;
    for (const point of road) {
      if (fields.island(point) < -7 && drawn(point, 20)) {
        if (crossedWater && lastLand) bridges.push({ from: lastLand, to: point });
        crossedWater = false;
        run.push(point);
        lastLand = point;
      } else {
        if (run.length > 1) onLand.push(run);
        run = [];
        if (fields.water(point) < 0) crossedWater = true;
      }
    }
    if (run.length > 1) onLand.push(run);
  }
  return { bridges, onLand };
}

/** A copy of a polyline moved sideways by `offset` (positive: to its left, y down). */
function sideways(line: Pt[], offset: number): Pt[] {
  return line.map((point, i) => {
    const before = line[Math.max(0, i - 1)]!;
    const after = line[Math.min(line.length - 1, i + 1)]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return p(point.x + (dy / length) * offset, point.y - (dx / length) * offset);
  });
}

function pathLength(line: Pt[]): number {
  let length = 0;
  for (let i = 1; i < line.length; i += 1) length += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  return length;
}

export const COMPOSITIONS: Record<TownLayout, Composition> = { wide: WIDE, band: BAND };

const cached = new Map<TownLayout, TownScene>();

/** A layout's town (built on first use, then reused: it never changes). */
export function townScene(layout: TownLayout = 'wide'): TownScene {
  let scene = cached.get(layout);
  if (!scene) {
    scene = buildTown(layout);
    cached.set(layout, scene);
  }
  return scene;
}

type Rect = { x: number; y: number; w: number; d: number };
const overlaps = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.d + gap && b.y < a.y + a.d + gap;

export function buildTown(layout: TownLayout = 'wide', seed = 11): TownScene {
  const composition = COMPOSITIONS[layout];
  const lens = lensOf(composition);
  const { toGround, toStage, drawn, grid: GRID } = lens;
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  /** Picks by weight: [value, weight][]. */
  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    let roll = random() * items.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return items[items.length - 1]![0];
  };
  const fields = buildFields(composition);
  const grid = sampleFields(lens, fields);

  /** The plates' field, read from the sampled grid (fast, and exactly what the outlines were drawn from). */
  const islandAt = (world: Pt): number => {
    const at = toStage({ x: world.x, y: 0, z: world.y });
    const fx = (at.x - GRID.x0) / GRID.cell;
    const fy = (at.y - GRID.y0) / GRID.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= grid.cols - 1 || j >= grid.rows - 1) return 999;
    const tx = fx - i;
    const ty = fy - j;
    const v = (a: number, b: number) => grid.island[b * grid.cols + a]!;
    return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty;
  };

  const slabs: Slab[] = [];
  LEVELS.forEach((level, index) => {
    for (const outline of contours(grid.island, grid.cols, grid.rows, GRID.x0, GRID.y0, GRID.cell, level.offset)) {
      if (outline.length < 8) continue;
      slabs.push({ outline: smoothOutline(lens, outline), top: level.top, thickness: level.thickness, level: index });
    }
  });
  const water = contours(grid.water, grid.cols, grid.rows, GRID.x0, GRID.y0, GRID.cell, 0).filter((outline) => outline.length >= 8).map((outline) => smoothOutline(lens, outline));

  const { bridges, onLand } = splitRoads(lens, fields, composition.roads.map((road) => spline(road.map((point) => toGround(point.x, point.y)), 9)));
  const roadDistance = roadIndex(onLand);
  const nearRoad = (world: Pt, margin: number) => roadDistance(world, margin) < margin;
  const garden = { at: toGround(composition.landmarks.garden.x, composition.landmarks.garden.y), r: 34 * UNIT };
  const reserved = [{ at: garden.at, r: garden.r + 10 }, ...bridges.flatMap((bridge) => [{ at: bridge.from, r: 30 }, { at: bridge.to, r: 30 }])];
  const inReserved = (world: Pt, radius: number) => reserved.some((zone) => Math.hypot(zone.at.x - world.x, zone.at.y - world.y) < zone.r + radius);

  /** A rectangle's corners, edge middles and center. */
  const samples = (rect: Rect) => {
    const out: Pt[] = [];
    for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) out.push(p(rect.x + rect.w * u, rect.y + rect.d * v));
    return out;
  };
  /** Whether a rectangle lies on a plate (this far in), inside the drawn area and clear of the roads' edges. */
  const onLandClear = (rect: Rect, margin: number, roadGap: number) =>
    samples(rect).every((point) => drawn(point) && islandAt(point) < -margin && !nearRoad(point, ROAD_HALF + roadGap)) && !inReserved(p(rect.x + rect.w / 2, rect.y + rect.d / 2), Math.max(rect.w, rect.d) * 0.5);

  // Houses (and the town's places): the landmarks first, then the pins' houses and their yards, then a grid.
  const houses: House[] = [];
  const rectOf = (house: House): Rect => ({ x: house.x, y: house.y, w: house.type.w, d: house.type.d });
  const fits = (type: HouseType, x: number, y: number, margin = 14, gap = 10 * UNIT) => {
    const rect = { x, y, w: type.w, d: type.d };
    const flat = type.kind === 'plaza' || type.kind === 'court' || type.kind === 'beds' || type.kind === 'yard';
    if (!onLandClear(rect, margin, flat ? 2 * UNIT : 4 * UNIT)) return false;
    return !houses.some((house) => overlaps(rect, rectOf(house), gap));
  };
  /** The nearest spot to a stage point where a house of this type fits (a spiral outward). */
  const placeNear = (type: HouseType, at: Pt, margin: number, rings = 9): { x: number; y: number } | null => {
    const world = toGround(at.x, at.y);
    for (let ring = 0; ring <= rings; ring += 1) {
      const steps = ring === 0 ? 1 : 10;
      for (let k = 0; k < steps; k += 1) {
        const angle = (k / steps) * Math.PI * 2 + ring;
        const x = world.x + Math.cos(angle) * ring * 16 - type.w / 2;
        const y = world.y + Math.sin(angle) * ring * 16 - type.d / 2;
        if (fits(type, x, y, margin)) return { x, y };
      }
    }
    return null;
  };
  const churchAt = placeNear(CHURCH, composition.landmarks.church, 8);
  if (churchAt) houses.push({ type: CHURCH, ...churchAt, tint: 'slate', wall: 'white', chimney: false });

  const slotWalls: WallTint[] = ['white', 'cream', 'sky', 'sage', 'blush'];
  const slotRoofs: RoofTint[] = ['clay', 'slate', 'white', 'charcoal', 'sand'];
  const slotHouses = composition.slots.map((target, index) => {
    const type = HOUSE_TYPES[0]!;
    const at = placeNear(type, target.at, 10);
    if (!at) return undefined;
    const house: House = { type, ...at, tint: slotRoofs[index % slotRoofs.length]!, wall: slotWalls[index % slotWalls.length]!, chimney: false };
    houses.push(house);
    return house;
  });

  // Each pin's house gets a yard beside it (east or south first: the sides the camera sees).
  const yards: Yard[] = [];
  slotHouses.forEach((house, index) => {
    if (!house) return;
    const { w, d } = YARD;
    const hw = house.type.w;
    const hd = house.type.d;
    const candidates = [
      p(house.x + hw + 4, house.y + hd - d),
      p(house.x + (hw - w) / 2, house.y + hd + 5),
      p(house.x + hw + 4, house.y + hd + 4 - d / 2),
      p(house.x - w - 4, house.y + hd - d),
      p(house.x + (hw - w) / 2, house.y - d - 5),
    ];
    for (const at of candidates) {
      const rect = { x: at.x, y: at.y, w, d };
      if (!onLandClear(rect, 8, 1.5 * UNIT)) continue;
      if (houses.some((other) => other !== house && overlaps(rect, rectOf(other), 6 * UNIT))) continue;
      if (overlaps(rect, rectOf(house), 1)) continue;
      houses.push({ type: YARD, x: at.x, y: at.y, tint: 'white', wall: 'white', chimney: false });
      yards.push({ slotId: composition.slots[index]!.id, ...rect });
      break;
    }
  });

  // The one-offs: a plaza, a court, a playground, garden beds, a water tower, a windmill, a greenhouse.
  (Object.entries(composition.features) as [FeatureKind, Pt][]).forEach(([feature, at]) => {
    const type = FEATURE_TYPES[feature];
    const spot = placeNear(type, at, 10, 12);
    if (!spot) return;
    houses.push({ type, ...spot, tint: 'white', wall: 'white', chimney: false, turn: random() * Math.PI * 2 });
  });

  const corners = [toGround(GRID.x0, GRID.y0), toGround(GRID.x1, GRID.y0), toGround(GRID.x0, GRID.y1), toGround(GRID.x1, GRID.y1)];
  const bounds = {
    x0: Math.min(...corners.map((c) => c.x)),
    x1: Math.max(...corners.map((c) => c.x)),
    y0: Math.min(...corners.map((c) => c.y)),
    y1: Math.max(...corners.map((c) => c.y)),
  };
  const houseWall = () => weighted<WallTint>([['white', 32], ['cream', 22], ['sky', 12], ['blush', 10], ['sage', 13], ['sand', 11]]);
  const pitchedRoof = () => weighted<RoofTint>([['clay', 30], ['white', 18], ['slate', 20], ['sand', 10], ['charcoal', 14], ['sage', 8]]);
  // Kinds come from a shuffled bag (so every layout gets the whole mix); a kind that doesn't fit a spot waits
  // for the next one, and a gable house takes the spot if it fits.
  type Group = 'house' | 'modern' | 'row' | 'apartment' | 'shop' | 'barn';
  const BAG: Group[] = ['house', 'house', 'house', 'house', 'house', 'house', 'house', 'modern', 'modern', 'modern', 'modern', 'row', 'row', 'row', 'apartment', 'apartment', 'shop', 'shop', 'shop', 'barn'];
  let bag: Group[] = [];
  let waiting: Group | null = null;
  const typeOf = (group: Group) => (group === 'house' ? pick(HOUSE_TYPES) : group === 'modern' ? pick(MODERN_TYPES) : group === 'row' ? pick(ROW_TYPES) : group === 'apartment' ? APARTMENT : group === 'shop' ? SHOP : BARN);
  const step = composition.density.step * UNIT;
  for (let gy = bounds.y0; gy < bounds.y1; gy += step) {
    for (let gx = bounds.x0; gx < bounds.x1; gx += step) {
      if (random() < composition.density.skip) continue;
      const x = gx + (random() - 0.5) * 22;
      const y = gy + (random() - 0.5) * 22;
      if (!waiting) {
        if (!bag.length) {
          bag = [...BAG];
          for (let k = bag.length - 1; k > 0; k -= 1) {
            const j = Math.floor(random() * (k + 1));
            [bag[k], bag[j]] = [bag[j]!, bag[k]!];
          }
        }
        waiting = bag.pop()!;
      }
      let group: Group = waiting;
      let type = typeOf(group);
      if (fits(type, x, y)) {
        waiting = null;
      } else {
        group = 'house';
        type = typeOf(group);
        if (!fits(type, x, y)) continue;
        if (waiting === 'house') waiting = null;
      }
      if (group === 'house') {
        houses.push({ type, x, y, tint: pitchedRoof(), wall: houseWall(), chimney: random() < 0.38, topping: random() < 0.16 ? 'solar' : undefined });
      } else if (group === 'modern') {
        const topping = weighted<'solar' | 'garden' | 'none'>([['solar', 36], ['garden', 30], ['none', 34]]);
        houses.push({ type, x, y, tint: weighted<RoofTint>([['white', 50], ['charcoal', 50]]), wall: weighted<WallTint>([['white', 44], ['graphite', 20], ['sand', 20], ['sage', 16]]), chimney: false, topping: topping === 'none' ? undefined : topping });
      } else if (group === 'row') {
        const count = Math.round(type.w / (15 * UNIT));
        const facades: WallTint[] = ['cream', 'sky', 'blush', 'sage', 'sand', 'white'];
        const start = Math.floor(random() * facades.length);
        const units = Array.from({ length: count }, (_, k) => ({
          wall: facades[(start + k) % facades.length]!,
          roof: weighted<RoofTint>([['clay', 30], ['slate', 26], ['charcoal', 22], ['white', 12], ['sand', 10]]),
          h: (22 + random() * 6) * UNIT,
        }));
        houses.push({ type, x, y, tint: units[0]!.roof, wall: units[0]!.wall, chimney: false, units });
      } else if (group === 'apartment') {
        houses.push({ type, x, y, tint: weighted<RoofTint>([['white', 50], ['charcoal', 50]]), wall: weighted<WallTint>([['white', 40], ['cream', 30], ['sand', 30]]), chimney: false, topping: random() < 0.45 ? 'solar' : random() < 0.4 ? 'garden' : undefined });
      } else if (group === 'shop') {
        houses.push({ type, x, y, tint: 'white', wall: weighted<WallTint>([['white', 50], ['cream', 30], ['sky', 20]]), chimney: false, topping: random() < 0.2 ? 'solar' : undefined });
      } else {
        houses.push({ type, x, y, tint: weighted<RoofTint>([['charcoal', 50], ['slate', 50]]), wall: 'barn', chimney: false });
      }
    }
  }

  // Pins stand on their houses (or, where one didn't fit, on the regular house nearest the target).
  const slots: Slot[] = composition.slots.map((target, index) => {
    const world = toGround(target.at.x, target.at.y);
    let best: House | undefined = slotHouses[index];
    let bestDistance = Infinity;
    for (const house of best ? [] : houses) {
      if (house.type.kind !== 'house') continue;
      const distance = Math.hypot(house.x + house.type.w / 2 - world.x, house.y + house.type.d / 2 - world.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = house;
      }
    }
    const house = best ?? houses[0]!;
    return { id: target.id, at: p(house.x + house.type.w / 2, house.y + house.type.d / 2), height: GROUND + house.type.h + house.type.roof };
  });

  // Backyard pools beside some houses (on the sides the camera sees).
  const pools: TownScene['pools'] = [];
  const poolFree = (rect: Rect) =>
    onLandClear(rect, 8, 2 * UNIT) && !houses.some((house) => overlaps(rect, rectOf(house), 3)) && !pools.some((pool) => overlaps(rect, pool, 6));
  for (const house of houses) {
    if ((house.type.kind !== 'house' && house.type.kind !== 'modern') || random() > 0.34) continue;
    const { w, d } = POOL;
    for (const at of [p(house.x + house.type.w + 5, house.y + house.type.d - d - 2), p(house.x + (house.type.w - w) / 2, house.y + house.type.d + 6), p(house.x - w - 5, house.y + house.type.d - d - 2)]) {
      const rect = { x: at.x, y: at.y, w, d };
      if (poolFree(rect)) {
        pools.push(rect);
        break;
      }
    }
  }

  // Café tables (under umbrellas) on the shops' patios and the plaza.
  const tables: Placed[] = [];
  const idle: Idle[] = [];
  for (const house of houses) {
    if (house.type.kind === 'shop') {
      const y = house.y + house.type.d - SHOP_PATIO / 2;
      [0.27, 0.73].forEach((u, k) => {
        const at = p(house.x + house.type.w * u, y);
        const tone = Math.floor(random() * 4);
        tables.push({ at, angle: 0, tone });
        if (random() < 0.75) idle.push({ at: p(at.x - 6 * UNIT, at.y + (k ? 1 : -1) * UNIT), angle: 0, tone: Math.floor(random() * 5), pose: 'sit' });
        if (random() < 0.45) idle.push({ at: p(at.x + 6 * UNIT, at.y), angle: Math.PI, tone: Math.floor(random() * 5), pose: 'sit' });
      });
    } else if (house.type.kind === 'plaza') {
      const plaza = plazaLayout(rectOf(house));
      tables.push(...plaza.tables);
      plaza.tables.forEach((table, k) => idle.push({ at: p(table.at.x - 6 * UNIT, table.at.y), angle: 0, tone: (k + 2) % 5, pose: 'sit' }));
      plaza.crowd.forEach((person, k) => idle.push({ at: person.at, angle: person.angle, tone: k % 5, pose: 'stand' }));
    }
  }

  // Parked cars beside the roads, by the shops and the apartments.
  const parked: Placed[] = [];
  const carClear = (at: Pt) =>
    drawn(at) &&
    islandAt(at) < -8 &&
    !houses.some((house) => overlaps({ x: at.x - 14, y: at.y - 14, w: 28, d: 28 }, rectOf(house), 2)) &&
    !pools.some((pool) => overlaps({ x: at.x - 14, y: at.y - 14, w: 28, d: 28 }, pool, 2)) &&
    !parked.some((car) => Math.hypot(car.at.x - at.x, car.at.y - at.y) < 34) &&
    !inReserved(at, 14);
  for (const house of houses) {
    if ((house.type.kind !== 'shop' && house.type.kind !== 'apartment') || parked.length >= 12) continue;
    const front = p(house.x + house.type.w / 2, house.y + house.type.d + 10);
    let road: Pt[] | null = null;
    let index = 0;
    let bestDistance = 90;
    for (const line of onLand) {
      for (let k = 0; k < line.length; k += 1) {
        const distance = Math.hypot(line[k]!.x - front.x, line[k]!.y - front.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          road = line;
          index = k;
        }
      }
    }
    if (!road) continue;
    for (const shift of [-4, 4]) {
      const k = Math.max(1, Math.min(road.length - 2, index + shift));
      const a = road[k - 1]!;
      const b = road[k + 1]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      for (const side of [1, -1]) {
        const at = p(road[k]!.x + nx * side * (ROAD_HALF + 9), road[k]!.y + ny * side * (ROAD_HALF + 9));
        if (!carClear(at)) continue;
        parked.push({ at, angle: Math.atan2(b.y - a.y, b.x - a.x), tone: Math.floor(random() * 3) });
        break;
      }
    }
  }

  // Docks along the river (on the lowest terrace, out over the water), with kayaks tied up at them.
  const docks: TownScene['docks'] = [];
  const moored: Placed[] = [];
  {
    let walked = 0;
    let lastDock = -400;
    const river = fields.river;
    for (let i = 1; i < river.length - 1 && docks.length < composition.docks; i += 1) {
      walked += Math.hypot(river[i]!.x - river[i - 1]!.x, river[i]!.y - river[i - 1]!.y);
      if (walked - lastDock < 300 || !drawn(river[i]!, 120)) continue;
      const a = river[i - 1]!;
      const b = river[i + 1]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      for (const side of i % 2 === 0 ? [1, -1] : [-1, 1]) {
        let bank: Pt | null = null;
        for (let s = 10; s < 140; s += 2) {
          const q = p(river[i]!.x + nx * side * s, river[i]!.y + ny * side * s);
          if (fields.island(q) < 9) {
            bank = q;
            break;
          }
        }
        if (!bank || !drawn(bank, 80) || inReserved(bank, 40) || nearRoad(bank, ROAD_HALF + 30)) continue;
        const reach = 24 * UNIT;
        const to = p(bank.x - nx * side * reach, bank.y - ny * side * reach);
        if (fields.water(to) > -6) continue;
        docks.push({ from: bank, to });
        const along = Math.atan2(b.y - a.y, b.x - a.x);
        const tip = p(bank.x - nx * side * reach * 0.8, bank.y - ny * side * reach * 0.8);
        moored.push({ at: p(tip.x + Math.cos(along) * 9 * UNIT, tip.y + Math.sin(along) * 9 * UNIT), angle: along, tone: docks.length % 4 });
        if (random() < 0.6) moored.push({ at: p(tip.x - Math.cos(along) * 9 * UNIT, tip.y - Math.sin(along) * 9 * UNIT), angle: along + 0.08, tone: (docks.length + 2) % 4 });
        lastDock = walked;
        break;
      }
    }
  }

  // Lamps along the roads (every so often, on alternate sides) and benches by some of them.
  const lamps: Lamp[] = [];
  const benches: Bench[] = [];
  const insideAny = (at: Pt, margin: number) =>
    houses.some((house) => at.x > house.x - margin && at.x < house.x + house.type.w + margin && at.y > house.y - margin && at.y < house.y + house.type.d + margin) ||
    pools.some((pool) => at.x > pool.x - margin && at.x < pool.x + pool.w + margin && at.y > pool.y - margin && at.y < pool.y + pool.d + margin) ||
    parked.some((car) => Math.hypot(car.at.x - at.x, car.at.y - at.y) < 16 + margin);
  onLand.forEach((road, r) => {
    const spacing = 150;
    let walked = 0;
    let side = r % 2 === 0 ? 1 : -1;
    for (let i = 1; i < road.length; i += 1) {
      const a = road[i - 1]!;
      const b = road[i]!;
      walked += Math.hypot(b.x - a.x, b.y - a.y);
      if (walked < spacing) continue;
      walked = 0;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const at = p(b.x + (dy / length) * 13 * UNIT * side, b.y - (dx / length) * 13 * UNIT * side);
      side = -side;
      if (islandAt(at) > -6 || !drawn(at)) continue;
      if (insideAny(at, 6)) continue;
      lamps.push({ at });
      if (random() < 0.35) {
        const bench = p(at.x + (dx / length) * 16, at.y + (dy / length) * 16);
        if (islandAt(bench) < -6 && !insideAny(bench, 4)) benches.push({ at: bench, angle: Math.atan2(dy, dx) });
      }
    }
  });
  for (let k = 0; k < 4; k += 1) {
    const angle = (k / 4) * Math.PI * 2 + 0.6;
    benches.push({ at: p(garden.at.x + Math.cos(angle) * (garden.r + 12), garden.at.y + Math.sin(angle) * (garden.r + 12)), angle: angle + Math.PI / 2 });
  }

  // Trees: dart throwing on the plates, clear of houses, roads, lamps and the garden. Mostly round and bushy
  // greens; some conifers, palms, agaves and cacti; a few in blossom and a few in autumn colors.
  const trees: Tree[] = [];
  const blocked = (world: Pt, radius: number) =>
    insideAny(world, radius + 5) ||
    nearRoad(world, ROAD_HALF + 2.5 * UNIT + radius) ||
    lamps.some((lamp) => Math.hypot(lamp.at.x - world.x, lamp.at.y - world.y) < radius + 8) ||
    docks.some((dock) => Math.hypot(dock.from.x - world.x, dock.from.y - world.y) < radius + 14) ||
    reserved.some((zone) => Math.hypot(zone.at.x - world.x, zone.at.y - world.y) < zone.r + radius - 12);
  const radiusOf = (variant: Tree['variant'], scale: number) => [12, 12, 8, 17, 9, 10, 5, 5][variant]! * scale * UNIT;
  for (let attempt = 0; attempt < 16000 && trees.length < composition.density.trees; attempt += 1) {
    const world = p(bounds.x0 + random() * (bounds.x1 - bounds.x0), bounds.y0 + random() * (bounds.y1 - bounds.y0));
    if (!drawn(world, 46)) continue;
    const depth = islandAt(world);
    if (depth > -10) continue;
    if (depth < -70 && random() < 0.4) continue;
    const variant = weighted<Tree['variant']>([[0, 24], [1, 24], [2, 14], [3, 7], [4, 13], [5, 6], [6, 6], [7, 6]]);
    const scale = 0.85 + random() * 0.5;
    const radius = radiusOf(variant, scale);
    if (blocked(world, radius)) continue;
    if (trees.some((tree) => Math.hypot(tree.x - world.x, tree.y - world.y) < radius + radiusOf(tree.variant, tree.scale) * 0.5 + 8)) continue;
    const tone = variant >= 4 ? 0 : weighted<number>([[0, 22], [1, 22], [2, 18], [3, 16], [4, 6], [5, 5], [6, 6], [7, 5]]);
    trees.push({ x: world.x, y: world.y, variant, scale, tone });
  }

  // Lawns under some trees (with a picnic blanket here and there, bluebonnets on others), flowers by houses.
  const grass: Pt[][] = [];
  const blankets: TownScene['blankets'] = [];
  const bluebonnets: Pt[] = [];
  const meadows: Pt[][] = [];
  const crownTrees = trees.filter((tree) => tree.variant <= 3);
  for (let i = 0; i < 80 && grass.length < 32; i += 1) {
    const tree = crownTrees[Math.floor(random() * crownTrees.length)];
    if (!tree) break;
    const r = (24 + random() * 30) * UNIT;
    const phase = random() * Math.PI * 2;
    const outline: Pt[] = [];
    for (let k = 0; k < 20; k += 1) {
      const angle = (k / 20) * Math.PI * 2;
      const rr = r * (1 + Math.sin(angle * 3 + phase) * 0.16 + Math.sin(angle * 5 + phase * 2) * 0.08);
      outline.push(p(tree.x + Math.cos(angle) * rr, tree.y + Math.sin(angle) * rr));
    }
    if (!outline.every((point) => drawn(point) && islandAt(point) < -5)) continue;
    if (houses.some((house) => house.type.kind === 'plaza' || house.type.kind === 'court' ? overlaps({ x: tree.x - r, y: tree.y - r, w: r * 2, d: r * 2 }, rectOf(house), 0) : false)) continue;
    grass.push(outline);
    const roll = random();
    if (roll < 0.35) {
      const at = p(tree.x + Math.cos(phase) * r * 0.55, tree.y + Math.sin(phase) * r * 0.55);
      if (!blocked(at, 8)) blankets.push({ at, angle: random() * Math.PI, tone: Math.floor(random() * 4) });
    } else if (roll < 0.75) {
      // A meadow of bluebonnets on the far side of the lawn from the trunk.
      const cx = tree.x + Math.cos(phase + Math.PI) * r * 0.45;
      const cy = tree.y + Math.sin(phase + Math.PI) * r * 0.45;
      const meadow: Pt[] = [];
      for (let k = 0; k < 16; k += 1) {
        const angle = (k / 16) * Math.PI * 2;
        const rr = r * 0.44 * (1 + Math.sin(angle * 3 + phase) * 0.14);
        meadow.push(p(cx + Math.cos(angle) * rr * 1.15, cy + Math.sin(angle) * rr * 0.85));
      }
      if (meadow.every((point) => islandAt(point) < -6 && !insideAny(point, 1) && !nearRoad(point, ROAD_HALF + 1))) {
        meadows.push(meadow);
        for (let k = 0; k < 14; k += 1) {
          const angle = k * 2.39996 + phase;
          const rr = Math.sqrt((k + 0.5) / 14) * r * 0.36;
          bluebonnets.push(p(cx + Math.cos(angle) * rr * 1.1, cy + Math.sin(angle) * rr * 0.8));
        }
      }
    }
  }
  const flowers: { at: Pt; tone: number }[] = [];
  for (const house of houses) {
    if ((house.type.kind !== 'house' && house.type.kind !== 'row') || random() < 0.5) continue;
    const tone = Math.floor(random() * 4);
    for (let k = 0; k < 6; k += 1) {
      const at = p(house.x + 3 + random() * (house.type.w - 6), house.y + house.type.d + 5 + random() * 7);
      if (drawn(at) && islandAt(at) < -4 && !pools.some((pool) => at.x > pool.x - 3 && at.x < pool.x + pool.w + 3 && at.y > pool.y - 3 && at.y < pool.y + pool.d + 3)) flowers.push({ at, tone });
    }
  }

  // People on the pavements: beside the roads, walking there and back.
  const walkers: Walker[] = [];
  onLand.forEach((road, r) => {
    if (road.length < 12) return;
    for (let k = 0; k < 4; k += 1) {
      const side = (k % 2 === 0 ? 1 : -1) * 10 * UNIT;
      const start = Math.floor(random() * (road.length / 2));
      const piece = sideways(road.slice(start, Math.min(road.length, start + 10 + Math.floor(random() * 14))), side);
      if (piece.length < 4 || piece.some((point) => islandAt(point) > -4)) continue;
      walkers.push({ path: piece, duration: pathLength(piece) / (9 + random() * 6), phase: random(), tone: (r + k) % 5 });
    }
  });

  // Birds, high over the town; balloons higher still.
  const birds: Bird[] = Array.from({ length: 5 }, (_, k) => ({
    center: toGround(composition.birds.center.x + Math.cos(k * 1.7) * composition.birds.spread.x, composition.birds.center.y + Math.sin(k * 2.3) * composition.birds.spread.y),
    radius: 90 + random() * 120,
    height: 150 + random() * 90,
    speed: (0.18 + random() * 0.12) * (k % 2 === 0 ? 1 : -1),
    phase: random() * Math.PI * 2,
  }));
  const balloons: Balloon[] = composition.balloons.map((at, k) => ({
    center: toGround(at.x, at.y),
    radius: 30 + random() * 30,
    height: 300 + k * 46 + random() * 30,
    speed: (0.035 + random() * 0.02) * (k % 2 === 0 ? 1 : -1),
    phase: random() * Math.PI * 2,
    tone: k,
  }));

  // Kayaks on the river: lanes beside its middle, over the stretch that's in view.
  const visibleRiver = fields.river.filter((point) => drawn(point, -60));
  const kayaks: Mover[] = composition.kayaks.map((plan, k) => {
    const lane = sideways(visibleRiver, plan.offset);
    return { id: `kayak-${k}`, kind: 'kayak', path: plan.reverse ? [...lane].reverse() : lane, duration: plan.duration, phase: plan.phase, tone: plan.tone };
  });

  const sketch = (points: Pt[], step = 8) => spline(points.map((point) => toGround(point.x, point.y)), step);
  const along = (road: Pt[], side: number) => sideways(sketch(road), side);
  return {
    composition,
    fields,
    slabs,
    water,
    waterGrid: sampleWater(water, fields),
    grass,
    roads: onLand,
    bridges,
    houses,
    trees,
    garden,
    flowers,
    bluebonnets,
    meadows,
    blankets,
    lamps,
    benches,
    pools,
    parked,
    tables,
    docks,
    moored,
    yards,
    slots,
    walkers,
    idle,
    birds,
    balloons,
    route: sketch(composition.route),
    movers: [
      ...composition.movers.map((plan): Mover => ({
        id: plan.id,
        kind: plan.kind,
        path: plan.side === undefined ? sketch(plan.path, 10) : along(plan.path, plan.side),
        duration: plan.duration,
        phase: plan.phase,
        tone: plan.tone,
      })),
      ...kayaks,
    ],
  };
}

/** For tests: whether a world point is on one of the top plates. */
export function onPlate(scene: TownScene, world: Pt): boolean {
  return scene.slabs.some((slab) => slab.level === LEVELS.length - 1 && pointInPolygon(world, slab.outline));
}

/** For tests and tools: a stage point (at height `height`) for a world point, on a layout's stage. */
export function stageOf(world: Pt, height = 0, layout: TownLayout = 'wide') {
  return lensOf(COMPOSITIONS[layout]).toStage({ x: world.x, y: height, z: world.y });
}
