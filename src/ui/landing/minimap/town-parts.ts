import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Pt } from './geometry';
import { GROUND, plazaLayout, SHOP_PATIO, UNIT, type House, type Placed, type RoofTint, type WallTint } from './scene';
import type { ColorKey, PaintRef } from './town-palette';

/**
 * The town's pieces as geometry: plates, roads, every kind of building, the props (tables, stalls, trucks,
 * playground, beds…), the movers' bodies and the five task vignettes. Builders push painted parts into batches;
 * the renderer merges each batch into one mesh with vertex colors (one draw call), so a busy town stays light.
 */

/** A piece of geometry and what it's painted with. `lift` lightens it toward white (0–1), `shade` darkens it. */
export interface Part {
  geometry: BufferGeometry;
  paint: PaintRef;
  shade?: number;
  lift?: number;
}

/** Where the builders put their parts (each becomes one merged mesh, or a few for windows and pools). */
export interface Batches {
  /** Facades, trims, doors, chimneys, bridges: matte. */
  walls: Part[];
  /** Roofs (pitched and flat), spires, parapets. */
  roofs: Part[];
  /** Small colorful things: awnings, umbrellas, stalls, trucks, benches, the playground, docks. */
  props: Part[];
  /** Solar panels, glass, metal: a little glossy. */
  shiny: Part[];
  /** Lying on the plates: courts, paving, sand, soil, pool rims, the garden's bed. */
  flats: Part[];
  /** Windows (they glow at night). */
  windows: BufferGeometry[];
  /** Water in pools and the fountain. */
  pools: BufferGeometry[];
}

export const emptyBatches = (): Batches => ({ walls: [], roofs: [], props: [], shiny: [], flats: [], windows: [], pools: [] });

// ---- Small builders ------------------------------------------------------------------------------------

const toFlat = (outline: Pt[]) => outline.map((point) => new Vector2(point.x, -point.y));

/** A flat shape on the ground at height y (faces up). */
export function flat(outline: Pt[], y: number): BufferGeometry {
  const geometry = new ShapeGeometry(new Shape(toFlat(outline)), 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/**
 * An extruded plate: the outline, `thickness` deep, top at `top`, edges rounded by `bevel`. Its sides darken a
 * little toward their foot (vertex colors), like clay that's softly shaded where it meets the ground.
 */
export function slab(outline: Pt[], top: number, thickness: number, bevel: number): BufferGeometry {
  const geometry = new ExtrudeGeometry(new Shape(toFlat(outline)), {
    depth: Math.max(0.5, thickness - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, top - thickness + bevel, 0);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const bottom = top - thickness;
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.max(0, Math.min(1, (position.getY(i) - bottom) / Math.max(1, thickness)));
    const shade = 0.8 + 0.2 * t * t;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const geometry = new BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

export function roundedBox(w: number, h: number, d: number, radius: number, x: number, y: number, z: number): BufferGeometry {
  const geometry = new RoundedBoxGeometry(w, h, d, 2, radius);
  geometry.translate(x, y, z);
  return geometry;
}

function cylinder(radius: number, height: number, x: number, y: number, z: number, segments = 10, top = radius): BufferGeometry {
  const geometry = new CylinderGeometry(top, radius, height, segments);
  geometry.translate(x, y, z);
  return geometry;
}

function ball(radius: number, x: number, y: number, z: number, squash = 1, detail = 1): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail);
  geometry.scale(1, squash, 1);
  geometry.translate(x, y, z);
  return geometry;
}

/** A thin round bar from one point to another. */
function beam(from: Vector3, to: Vector3, radius: number, segments = 5): BufferGeometry {
  const length = from.distanceTo(to);
  const geometry = new CylinderGeometry(radius, radius, length, segments);
  const direction = new Vector3().subVectors(to, from).normalize();
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
  geometry.applyMatrix4(new Matrix4().compose(new Vector3().addVectors(from, to).multiplyScalar(0.5), turn, new Vector3(1, 1, 1)));
  return geometry;
}

/** A road: a ribbon along the points, `half` wide each side, lying at height y. */
export function ribbon(points: Pt[], half: number, y: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const tx = after.x - before.x;
    const ty = after.y - before.y;
    const length = Math.hypot(tx, ty) || 1;
    const nx = -ty / length;
    const ny = tx / length;
    positions.push(point.x + nx * half, y, point.y + ny * half, point.x - nx * half, y, point.y - ny * half);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(i / points.length, 0, i / points.length, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/** Makes a part mergeable: non-indexed, with position, normal and uv only (plus color when asked). */
export function normalized(geometry: BufferGeometry, keepColor = false): BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  if (!part.getAttribute('uv')) part.setAttribute('uv', new BufferAttribute(new Float32Array(part.getAttribute('position').count * 2), 2));
  if (!part.getAttribute('normal')) part.computeVertexNormals();
  for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'uv', ...(keepColor ? ['color'] : [])].includes(name)) part.deleteAttribute(name);
  return part;
}

/** Merges geometries (made non-indexed so mixed sources merge), or null when there are none. */
export function merge(geometries: BufferGeometry[], keepColor = false): BufferGeometry | null {
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries.map((geometry) => normalized(geometry, keepColor)), false);
  return merged;
}

/** A soft, tileable ripple normal map (sums of waves with whole frequencies, so it repeats seamlessly). */
export function rippleTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const tau = Math.PI * 2;
  const height = (u: number, v: number) =>
    Math.sin(tau * (3 * u + 2 * v) + 1.3) * 0.5 + Math.sin(tau * (5 * u - 3 * v) + 0.2) * 0.32 + Math.sin(tau * (-2 * u + 7 * v) + 2.1) * 0.22 + Math.sin(tau * (9 * u + 4 * v) + 0.7) * 0.12;
  const e = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const dx = ((height(u + e, v) - height(u - e, v)) / (2 * e)) * 0.018;
      const dy = ((height(u, v + e) - height(u, v - e)) / (2 * e)) * 0.018;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** A boat's wake: two white lines that open out behind it and fade. */
export function wakeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(256, 0, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.strokeStyle = gradient;
  context.lineCap = 'round';
  for (const [width, spread] of [[7, 54], [4, 40], [3, 24]] as const) {
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(250, 64);
    context.quadraticCurveTo(140, 64 - spread * 0.4, 6, 64 - spread);
    context.moveTo(250, 64);
    context.quadraticCurveTo(140, 64 + spread * 0.4, 6, 64 + spread);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft round glow (the lamps' halos at night). */
export function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A lumpy sphere for tree crowns (few triangles: the town reads small). */
export function crownGeometry(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const bump = 1 + Math.sin(x * 5.1 + 1.3) * Math.sin(y * 4.3 + 0.5) * Math.sin(z * 5.7 + 2.1) * 0.09 + Math.sin(x * 9.7 + y * 8.1 + z * 7.3) * 0.035;
    position.setXYZ(i, x * bump, y * bump, z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A small bird: two swept wings, wingspan along x. */
export function birdGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, -1.2, -7, 0.8, 1.2, 0, 0, 2.2, 0, 0, -1.2, 0, 0, 2.2, 7, 0.8, 1.2], 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A conifer's tier: a cone with a soft base (unit size; instanced and scaled). */
export function coneGeometry(): BufferGeometry {
  return new ConeGeometry(1, 1, 9, 1);
}

/** A palm frond: a long, thin leaf that arches out and droops (unit length, along +x). */
export function frondGeometry(): BufferGeometry {
  const points: Vector3[] = [];
  for (let k = 0; k <= 6; k += 1) {
    const t = k / 6;
    points.push(new Vector3(t, Math.sin(t * Math.PI * 0.85) * 0.22 - t * t * 0.28, 0));
  }
  const geometry = new TubeGeometry(new CatmullRomCurve3(points), 8, 0.06, 4, false);
  geometry.scale(1, 0.5, 2.4);
  return geometry;
}

/** An agave: a rosette of pointed leaves (unit size). */
export function agaveGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 9; k += 1) {
    const angle = (k / 9) * Math.PI * 2;
    const leaf = new ConeGeometry(0.16, 1, 4, 1);
    leaf.translate(0, 0.5, 0);
    leaf.rotateZ(-0.75 - (k % 3) * 0.18);
    leaf.rotateY(angle);
    parts.push(leaf);
  }
  const core = new ConeGeometry(0.14, 0.9, 5, 1);
  core.translate(0, 0.45, 0);
  parts.push(core);
  return merge(parts)!;
}

/** A cactus: a column with two arms (unit height). */
export function cactusGeometry(): BufferGeometry {
  const parts = [cylinder(0.13, 1, 0, 0.5, 0, 8, 0.12), ball(0.125, 0, 1, 0, 1, 1)];
  for (const [side, height, reach] of [[1, 0.45, 0.24], [-1, 0.62, 0.2]] as const) {
    const elbow = cylinder(0.08, reach, 0, 0, 0, 6);
    elbow.rotateZ(Math.PI / 2);
    elbow.translate(side * reach * 0.5, height, 0);
    parts.push(elbow, cylinder(0.08, 0.28, side * reach, height + 0.14, 0, 6), ball(0.08, side * reach, height + 0.28, 0, 1, 1));
  }
  return merge(parts)!;
}

/**
 * A hot-air balloon (unit height ~1.25 above its basket): an envelope of twelve gores, alternately its color and
 * white so it never reads as a map pin, a wicker basket, a burner and the ropes.
 */
export function balloonParts(tone: number): Part[] {
  const profile: Vector2[] = [];
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16;
    // From the mouth at the bottom, out to the widest part and round over the top.
    const y = t * 1.25;
    const r = t < 0.62 ? 0.13 + Math.sin((t / 0.62) * Math.PI * 0.5) * 0.47 : Math.cos(((t - 0.62) / 0.38) * Math.PI * 0.5) * 0.6;
    profile.push(new Vector2(Math.max(0.001, r), y));
  }
  const gores = 12;
  const parts: Part[] = [];
  for (let k = 0; k < gores; k += 1) {
    parts.push({ geometry: new LatheGeometry(profile, 3, (k / gores) * Math.PI * 2, (Math.PI * 2) / gores), paint: k % 2 === 0 ? ['balloons', tone] : 'trim' });
  }
  const basket = new BoxGeometry(0.17, 0.13, 0.17);
  basket.translate(0, -0.22, 0);
  parts.push({ geometry: basket, paint: 'wood' });
  parts.push({ geometry: cylinder(0.05, 0.06, 0, -0.08, 0, 6), paint: 'metal' });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    parts.push({ geometry: beam(new Vector3(sx * 0.075, -0.16, sz * 0.075), new Vector3(sx * 0.1, 0.03, sz * 0.1), 0.005, 3), paint: 'ink' });
  }
  return parts;
}

// ---- Paint helpers -------------------------------------------------------------------------------------

const WALL_KEYS: Record<WallTint, ColorKey> = { white: 'wall', cream: 'wallCream', sage: 'wallSage', sky: 'wallSky', blush: 'wallBlush', sand: 'wallSand', graphite: 'wallGraphite', barn: 'wallBarn' };
const ROOF_KEYS: Record<RoofTint, ColorKey> = { white: 'roofWhite', clay: 'roofClay', sand: 'roofSand', slate: 'roofSlate', sage: 'roofSage', charcoal: 'roofCharcoal' };
export const wallKey = (tint: WallTint): ColorKey => WALL_KEYS[tint];
export const roofKey = (tint: RoofTint): ColorKey => ROOF_KEYS[tint];
/** A stable small number for a building (picks its awning color and the like). */
const toneOf = (house: { x: number; y: number }) => Math.abs(Math.round(house.x * 0.37 + house.y * 0.61)) % 4;

// ---- Houses and buildings ------------------------------------------------------------------------------

/** A gable: the triangle under the roof, across the house, along the ridge. */
function gable(span: number, rise: number, length: number): BufferGeometry {
  const shape = new Shape([new Vector2(0, 0), new Vector2(span, 0), new Vector2(span / 2, rise)]);
  return new ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
}

/** One roof plane, from the ridge down one side (as a thin slab), before it's placed. */
function roofPlane(run: number, rise: number, length: number, side: 1 | -1, alongX: boolean): BufferGeometry {
  const slope = Math.atan2(rise, run);
  const overhang = 3.5 * UNIT;
  const slant = Math.hypot(run, rise) + overhang;
  const geometry = alongX ? new BoxGeometry(length + overhang * 2, 2.6, slant) : new BoxGeometry(slant, 2.6, length + overhang * 2);
  if (alongX) {
    geometry.translate(0, -1.3, (side * slant) / 2);
    geometry.rotateX(side * slope);
  } else {
    geometry.translate((side * slant) / 2, -1.3, 0);
    geometry.rotateZ(-side * slope);
  }
  return geometry;
}

/** Solar panels lying on a roof plane (the side the camera sees), before they're placed like the plane. */
function roofSolar(run: number, rise: number, length: number, alongX: boolean): BufferGeometry {
  const slope = Math.atan2(rise, run);
  const slant = Math.hypot(run, rise);
  const across = length * 0.58;
  const down = slant * 0.5;
  const geometry = alongX ? new BoxGeometry(across, 1, down) : new BoxGeometry(down, 1, across);
  if (alongX) {
    geometry.translate(0, 0.75, slant * 0.5);
    geometry.rotateX(slope);
  } else {
    geometry.translate(slant * 0.5, 0.75, 0);
    geometry.rotateZ(-slope);
  }
  return geometry;
}

/** Windows on the two walls that face the camera (south and east). */
function facadeWindows(out: Batches, x0: number, z0: number, w: number, d: number, h: number, base: number, rows: number[], skipDoorX?: number) {
  const windowH = (rows.length > 1 ? 7 : 8) * UNIT;
  const windowW = 5.5 * UNIT;
  const spots = (length: number) => {
    const count = Math.max(1, Math.floor((length - 8 * UNIT) / (12 * UNIT)));
    return Array.from({ length: count }, (_, k) => ((k + 1) * length) / (count + 1));
  };
  for (const row of rows) {
    for (const u of spots(w)) {
      const cx = x0 + u;
      if (row < 0.5 && skipDoorX !== undefined && Math.abs(cx - skipDoorX) < 7 * UNIT) continue;
      out.windows.push(box(windowW, windowH, 0.9, cx, base + h * row + windowH / 2, z0 + d + 0.3));
    }
    for (const u of spots(d)) out.windows.push(box(0.9, windowH, windowW, x0 + w + 0.3, base + h * row + windowH / 2, z0 + u));
  }
}

/** Flat-roof toppings: a few rows of tilted solar panels, or a planted roof with shrubs. */
function flatTopping(out: Batches, house: House, x0: number, z0: number, w: number, d: number, top: number) {
  if (house.topping === 'solar') {
    const columns = Math.max(1, Math.floor((w - 6 * UNIT) / (9 * UNIT)));
    const rows = Math.max(1, Math.floor((d - 6 * UNIT) / (8 * UNIT)));
    for (let i = 0; i < columns; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const panel = new BoxGeometry(8 * UNIT, 0.8, 5.6 * UNIT);
        panel.rotateX(-0.32);
        panel.translate(x0 + 3 * UNIT + (i + 0.5) * ((w - 6 * UNIT) / columns), top + 2.2, z0 + 3 * UNIT + (j + 0.5) * ((d - 6 * UNIT) / rows));
        out.shiny.push({ geometry: panel, paint: 'solar' });
      }
    }
  } else if (house.topping === 'garden') {
    out.props.push({ geometry: box(w - 3 * UNIT, 1, d - 3 * UNIT, x0 + w / 2, top + 0.6, z0 + d / 2), paint: 'grass' });
    for (const [u, v, r] of [[0.25, 0.3, 3.2], [0.7, 0.62, 3.8], [0.45, 0.75, 2.6]] as const) out.props.push({ geometry: ball(r * UNIT, x0 + w * u, top + 1.2 + r * UNIT * 0.7, z0 + d * v, 0.8), paint: 'hedge' });
  }
}

function gableHouse(house: House, out: Batches) {
  const { w, d, h, roof, ridge, kind } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const wall = wallKey(house.wall);
  const roofPaint = roofKey(house.tint);
  out.walls.push({ geometry: roundedBox(w, h, d, 1.3, x0 + w / 2, base + h / 2, z0 + d / 2), paint: wall });
  if (ridge === 'x') {
    const prism = gable(d, roof - 1.8, w);
    prism.rotateY(Math.PI / 2);
    prism.translate(x0, base + h, z0 + d);
    out.walls.push({ geometry: prism, paint: wall });
    for (const side of [1, -1] as const) {
      const plane = roofPlane(d / 2, roof, w, side, true);
      plane.translate(x0 + w / 2, base + h + roof, z0 + d / 2);
      out.roofs.push({ geometry: plane, paint: roofPaint });
    }
    if (house.topping === 'solar') {
      const panel = roofSolar(d / 2, roof, w, true);
      panel.translate(x0 + w / 2, base + h + roof, z0 + d / 2);
      out.shiny.push({ geometry: panel, paint: 'solar' });
    }
  } else {
    const prism = gable(w, roof - 1.8, d);
    prism.translate(x0, base + h, z0);
    out.walls.push({ geometry: prism, paint: wall });
    for (const side of [1, -1] as const) {
      const plane = roofPlane(w / 2, roof, d, side, false);
      plane.translate(x0 + w / 2, base + h + roof, z0 + d / 2);
      out.roofs.push({ geometry: plane, paint: roofPaint });
    }
    if (house.topping === 'solar') {
      const panel = roofSolar(w / 2, roof, d, false);
      panel.translate(x0 + w / 2, base + h + roof, z0 + d / 2);
      out.shiny.push({ geometry: panel, paint: 'solar' });
    }
  }

  const tall = h > 30 * UNIT;
  const doorX = x0 + w / 2;
  facadeWindows(out, x0, z0, w, d, h, base, tall ? [0.3, 0.68] : [0.45], kind === 'house' ? doorX : undefined);
  if (kind === 'house') {
    out.walls.push({ geometry: box(7 * UNIT, 12 * UNIT, 1, doorX, base + 6 * UNIT, z0 + d + 0.35), paint: 'door' });
    // A small porch roof over the door.
    out.walls.push({ geometry: box(11 * UNIT, 0.9, 4 * UNIT, doorX, base + 13.2 * UNIT, z0 + d + 2 * UNIT), paint: 'trim' });
  }
  if (house.chimney && kind === 'house') {
    const cx = ridge === 'x' ? x0 + w * 0.76 : x0 + w * 0.3;
    const cz = ridge === 'x' ? z0 + d * 0.32 : z0 + d * 0.72;
    out.walls.push({ geometry: roundedBox(5 * UNIT, 12 * UNIT, 5 * UNIT, 1, cx, base + h + roof * 0.62 + 4 * UNIT, cz), paint: wall });
  }

  if (kind === 'church') {
    const tower = 18 * UNIT;
    const towerTop = h + roof + 22 * UNIT;
    const tx = x0 + w / 2;
    const tz = z0 + d + tower / 2 - 2;
    out.walls.push({ geometry: roundedBox(tower, towerTop, tower, 1.2, tx, base + towerTop / 2, tz), paint: wall });
    const spire = new ConeGeometry(tower * 0.78, 40 * UNIT, 4, 1);
    spire.rotateY(Math.PI / 4);
    spire.translate(tx, base + towerTop + 20 * UNIT, tz);
    out.roofs.push({ geometry: spire, paint: roofPaint });
    out.windows.push(box(6 * UNIT, 11 * UNIT, 0.9, tx, base + towerTop - 10 * UNIT, tz + tower / 2 + 0.3));
    out.windows.push(box(0.9, 11 * UNIT, 6 * UNIT, tx + tower / 2 + 0.3, base + towerTop - 10 * UNIT, tz));
    out.walls.push({ geometry: box(9 * UNIT, 15 * UNIT, 1, tx, base + 7.5 * UNIT, tz + tower / 2 + 0.35), paint: 'door' });
  }
}

/** A modern house: a flat-roofed ground floor with a glass band and a wood panel, and (two-story) an offset upper box. */
function modernHouse(house: House, out: Batches) {
  const { w, d, h } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const wall = wallKey(house.wall);
  const top = roofKey(house.tint);
  const twoStory = h > 20 * UNIT;
  const h1 = twoStory ? h * 0.5 : h;
  out.walls.push({ geometry: box(w, h1, d, x0 + w / 2, base + h1 / 2, z0 + d / 2), paint: wall });
  out.roofs.push({ geometry: box(w + 2, 1.6, d + 2, x0 + w / 2, base + h1 + 0.8, z0 + d / 2), paint: top });
  out.windows.push(box(w * 0.46, h1 * 0.5, 0.9, x0 + w * 0.64, base + h1 * 0.48, z0 + d + 0.35));
  out.walls.push({ geometry: box(w * 0.2, h1 * 0.84, 0.8, x0 + w * 0.2, base + h1 * 0.42, z0 + d + 0.4), paint: 'wood' });
  out.walls.push({ geometry: box(6 * UNIT, Math.min(11 * UNIT, h1 * 0.8), 1, x0 + w * 0.36, base + Math.min(5.5 * UNIT, h1 * 0.4), z0 + d + 0.45), paint: 'door' });
  out.windows.push(box(0.9, h1 * 0.42, d * 0.5, x0 + w + 0.35, base + h1 * 0.52, z0 + d * 0.45));
  if (!twoStory) {
    flatTopping(out, house, x0, z0, w, d, base + h1 + 1.6);
    return;
  }
  const uw = w * 0.64;
  const ud = d * 0.8;
  const h2 = h - h1;
  const ux = x0 + w - uw;
  const uz = z0 + d * 0.3;
  const upper = house.wall === 'white' ? 'wallGraphite' : 'wall';
  out.walls.push({ geometry: box(uw, h2, ud, ux + uw / 2, base + h1 + 1.6 + h2 / 2, uz + ud / 2), paint: upper });
  out.roofs.push({ geometry: box(uw + 2, 1.6, ud + 2, ux + uw / 2, base + h1 + 1.6 + h2 + 0.8, uz + ud / 2), paint: top });
  out.windows.push(box(uw * 0.7, h2 * 0.46, 0.9, ux + uw * 0.45, base + h1 + 1.6 + h2 * 0.5, uz + ud + 0.35));
  out.windows.push(box(0.9, h2 * 0.46, ud * 0.6, ux + uw + 0.35, base + h1 + 1.6 + h2 * 0.5, uz + ud * 0.5));
  flatTopping(out, house, ux, uz, uw, ud, base + h1 + 1.6 + h2 + 1.6);
}

/** A townhouse row: units side by side (west to east), each its own facade, gable and roof. */
function townhouses(house: House, out: Batches) {
  const { w, d, roof } = house.type;
  const units = house.units ?? [{ wall: house.wall, roof: house.tint, h: house.type.h }];
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const uw = w / units.length;
  units.forEach((unit, k) => {
    const ux = x0 + k * uw;
    const wall = wallKey(unit.wall);
    out.walls.push({ geometry: box(uw - 0.5, unit.h, d, ux + uw / 2, base + unit.h / 2, z0 + d / 2), paint: wall });
    const prism = gable(uw - 0.5, roof - 1.6, d);
    prism.translate(ux + 0.25, base + unit.h, z0);
    out.walls.push({ geometry: prism, paint: wall });
    for (const side of [1, -1] as const) {
      const plane = roofPlane(uw / 2 - 0.25, roof, d, side, false);
      plane.scale(0.94, 1, 1);
      plane.translate(ux + uw / 2, base + unit.h + roof, z0 + d / 2);
      out.roofs.push({ geometry: plane, paint: roofKey(unit.roof) });
    }
    for (const row of [0.3, 0.66]) out.windows.push(box(5 * UNIT, 6.6 * UNIT, 0.9, ux + uw * (row < 0.5 ? 0.66 : 0.5), base + unit.h * row + 3.3 * UNIT, z0 + d + 0.3));
    out.walls.push({ geometry: box(4.6 * UNIT, 10 * UNIT, 1, ux + uw * 0.28, base + 5 * UNIT, z0 + d + 0.4), paint: 'door' });
    out.walls.push({ geometry: box(uw * 0.9, 0.8, 3 * UNIT, ux + uw / 2, base + 0.4, z0 + d + 1.5 * UNIT), paint: 'trim' });
  });
  const last = units[units.length - 1]!;
  for (const row of [0.3, 0.66]) out.windows.push(box(0.9, 6.6 * UNIT, 5 * UNIT, x0 + w + 0.3, base + last.h * row + 3.3 * UNIT, z0 + d * 0.5));
}

/** A small apartment block: three floors, cornices, balconies with glass rails, a flat roof. */
function apartment(house: House, out: Batches) {
  const { w, d, h } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const cx = x0 + w / 2;
  const cz = z0 + d / 2;
  const floors = 3;
  const fh = h / floors;
  out.walls.push({ geometry: roundedBox(w, h, d, 1.2, cx, base + h / 2, cz), paint: wallKey(house.wall) });
  for (let f = 1; f < floors; f += 1) out.walls.push({ geometry: box(w + 1.2, 1.1, d + 1.2, cx, base + f * fh, cz), paint: 'trim' });
  out.roofs.push({ geometry: box(w + 1.6, 2.2, d + 1.6, cx, base + h + 1.1, cz), paint: roofKey(house.tint) });
  out.shiny.push({ geometry: box(9 * UNIT, 5 * UNIT, 7 * UNIT, x0 + w * 0.2, base + h + 2.2 + 2.5 * UNIT, z0 + d * 0.3), paint: 'metal' });
  for (let f = 0; f < floors; f += 1) {
    for (let k = 0; k < 4; k += 1) {
      if (f === 0 && k === 1) continue;
      out.windows.push(box(6 * UNIT, fh * 0.46, 0.9, x0 + (w * (k + 0.5)) / 4, base + f * fh + fh * 0.52, z0 + d + 0.35));
    }
    for (let k = 0; k < 3; k += 1) out.windows.push(box(0.9, fh * 0.46, 6 * UNIT, x0 + w + 0.35, base + f * fh + fh * 0.52, z0 + (d * (k + 0.5)) / 3));
  }
  for (let f = 1; f < floors; f += 1) {
    for (const u of [0.25, 0.75]) {
      out.walls.push({ geometry: box(w * 0.3, 1.2, 5 * UNIT, x0 + w * u, base + f * fh + 0.6, z0 + d + 2.5 * UNIT), paint: 'trim' });
      out.shiny.push({ geometry: box(w * 0.3, 3.4 * UNIT, 0.5, x0 + w * u, base + f * fh + 1.2 + 1.7 * UNIT, z0 + d + 5 * UNIT), paint: 'glass' });
    }
  }
  out.walls.push({ geometry: box(8 * UNIT, 11 * UNIT, 1, x0 + w * 0.375, base + 5.5 * UNIT, z0 + d + 0.4), paint: 'door' });
  flatTopping(out, house, x0 + w * 0.36, z0, w * 0.62, d, base + h + 2.2);
}

/** A shop at the back of its lot with a patio in front: a sign band, a shop window and a striped awning. */
function shop(house: House, out: Batches) {
  const { w, d, h } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const bd = d - SHOP_PATIO;
  const tone = toneOf(house);
  out.walls.push({ geometry: box(w, h, bd, x0 + w / 2, base + h / 2, z0 + bd / 2), paint: wallKey(house.wall) });
  out.roofs.push({ geometry: box(w + 1.6, 1.8, bd + 1.6, x0 + w / 2, base + h + 0.9, z0 + bd / 2), paint: roofKey(house.tint) });
  out.props.push({ geometry: box(w * 0.92, 3.2 * UNIT, 1.2, x0 + w / 2, base + h - 1.9 * UNIT, z0 + bd + 0.6), paint: ['awnings', tone] });
  out.windows.push(box(w * 0.6, h * 0.42, 0.9, x0 + w * 0.4, base + h * 0.36, z0 + bd + 0.35));
  out.windows.push(box(0.9, h * 0.42, bd * 0.56, x0 + w + 0.35, base + h * 0.4, z0 + bd * 0.5));
  out.walls.push({ geometry: box(6 * UNIT, 10.5 * UNIT, 1, x0 + w * 0.84, base + 5.25 * UNIT, z0 + bd + 0.45), paint: 'door' });
  // The striped awning slopes out over the patio.
  const stripes = 7;
  const reach = 7 * UNIT;
  const drop = 3 * UNIT;
  const slope = Math.atan2(drop, reach);
  const length = Math.hypot(reach, drop);
  const width = (w * 0.86) / stripes;
  for (let k = 0; k < stripes; k += 1) {
    const stripe = new BoxGeometry(width + 0.05, 0.7, length);
    stripe.rotateX(slope);
    stripe.translate(x0 + w * 0.07 + (k + 0.5) * width, base + h * 0.64 - drop / 2, z0 + bd + reach / 2 + 0.6);
    out.props.push({ geometry: stripe, paint: k % 2 === 0 ? ['awnings', tone] : 'trim' });
  }
  out.flats.push({ geometry: box(w, 0.5, SHOP_PATIO, x0 + w / 2, base + 0.3, z0 + bd + SHOP_PATIO / 2), paint: 'paving' });
  for (const u of [0.04, 0.96]) {
    out.props.push({ geometry: box(4 * UNIT, 3 * UNIT, 4 * UNIT, x0 + w * u, base + 1.5 * UNIT, z0 + d - 2.4 * UNIT), paint: 'wood' });
    out.props.push({ geometry: ball(2.8 * UNIT, x0 + w * u, base + 4.6 * UNIT, z0 + d - 2.4 * UNIT, 0.9), paint: 'hedge' });
  }
}

/** A barn: barn-red walls, a gambrel roof, white trim and a big door on the end the camera sees. */
function barn(house: House, out: Batches) {
  const { w, d, h, roof } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const wall = wallKey(house.wall);
  out.walls.push({ geometry: box(w, h, d, x0 + w / 2, base + h / 2, z0 + d / 2), paint: wall });
  const profile = (scale: number) =>
    new Shape([
      new Vector2(d * (0.5 - 0.5 * scale), 0),
      new Vector2(d * (0.5 + 0.5 * scale), 0),
      new Vector2(d * (0.5 + 0.34 * scale), roof * 0.62 * scale),
      new Vector2(d * 0.5, roof * scale),
      new Vector2(d * (0.5 - 0.34 * scale), roof * 0.62 * scale),
    ]);
  const shell = new ExtrudeGeometry(profile(1.04), { depth: w + 4, bevelEnabled: false });
  shell.rotateY(Math.PI / 2);
  shell.translate(x0 - 2, base + h - 0.5, z0 + d);
  out.roofs.push({ geometry: shell, paint: roofKey(house.tint) });
  for (const x of [x0 - 2.3, x0 + w + 2.3]) {
    const end = new ShapeGeometry(profile(0.9));
    end.rotateY(x > x0 ? Math.PI / 2 : -Math.PI / 2);
    end.translate(x, base + h - 0.5, x > x0 ? z0 + d : z0);
    out.walls.push({ geometry: end, paint: wall });
  }
  // Doors with a white X on the east end, a loft window above, trim at the corners.
  const ex = x0 + w + 0.45;
  out.walls.push({ geometry: box(0.8, 15 * UNIT, 16 * UNIT, ex, base + 7.5 * UNIT, z0 + d / 2), paint: 'door' });
  for (const angle of [0.75, -0.75]) {
    const bar = new BoxGeometry(0.6, 21 * UNIT, 1.4);
    bar.rotateX(angle);
    bar.translate(ex + 0.5, base + 7.5 * UNIT, z0 + d / 2);
    out.walls.push({ geometry: bar, paint: 'trim' });
  }
  out.walls.push({ geometry: box(0.6, 1.2, 16 * UNIT, ex + 0.4, base + 15 * UNIT, z0 + d / 2), paint: 'trim' });
  out.windows.push(box(0.9, 5 * UNIT, 6 * UNIT, ex, base + h + 6 * UNIT, z0 + d / 2));
  for (const z of [z0 + 0.6, z0 + d - 0.6]) out.walls.push({ geometry: box(1.4, h, 1.4, x0 + w + 0.2, base + h / 2, z), paint: 'trim' });
  out.windows.push(box(w * 0.18, 5 * UNIT, 0.9, x0 + w * 0.3, base + h * 0.55, z0 + d + 0.35));
  out.windows.push(box(w * 0.18, 5 * UNIT, 0.9, x0 + w * 0.7, base + h * 0.55, z0 + d + 0.35));
}

/** A water tower: four legs, a white tank with a blue band, a cone roof and a ladder. */
function waterTower(house: House, out: Batches) {
  const { w, d } = house.type;
  const cx = house.x + w / 2;
  const cz = house.y + d / 2;
  const base = GROUND;
  const legH = 46 * UNIT;
  const tankR = 10 * UNIT;
  const tankH = 14 * UNIT;
  const spread = 7.5 * UNIT;
  const top = 5 * UNIT;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    out.props.push({ geometry: beam(new Vector3(cx + sx * spread, base, cz + sz * spread), new Vector3(cx + sx * top, base + legH + 1, cz + sz * top), 0.9 * UNIT, 6), paint: 'metal' });
  }
  for (const level of [0.36, 0.7]) {
    const r = spread + (top - spread) * level;
    const y = base + legH * level;
    for (const [a, b] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]] as const) {
      out.props.push({ geometry: beam(new Vector3(cx + a[0] * r, y, cz + a[1] * r), new Vector3(cx + b[0] * r, y, cz + b[1] * r), 0.45 * UNIT, 4), paint: 'metal' });
    }
  }
  out.walls.push({ geometry: cylinder(tankR, tankH, cx, base + legH + tankH / 2, cz, 22), paint: 'trim' });
  out.props.push({ geometry: cylinder(tankR + 0.3, 2.6 * UNIT, cx, base + legH + tankH * 0.55, cz, 22), paint: ['awnings', 1] });
  const cone = new ConeGeometry(tankR * 1.08, 7 * UNIT, 22, 1);
  cone.translate(cx, base + legH + tankH + 3.5 * UNIT, cz);
  out.roofs.push({ geometry: cone, paint: 'roofSlate' });
  out.props.push({ geometry: ball(1.3 * UNIT, cx, base + legH + tankH + 7.4 * UNIT, cz), paint: 'metal' });
  out.props.push({ geometry: box(1.2 * UNIT, legH, 0.6, cx + spread * 0.55, base + legH / 2, cz + spread * 0.9), paint: 'metal' });
}

/** A farm windmill's lattice tower and tail (its wheel turns: see `windmillWheel`). Returns where the wheel goes. */
function windmillTower(house: House, out: Batches) {
  const { w, d } = house.type;
  const cx = house.x + w / 2;
  const cz = house.y + d / 2;
  const base = GROUND;
  const height = 60 * UNIT;
  const spread = 7 * UNIT;
  const top = 1.6 * UNIT;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    out.props.push({ geometry: beam(new Vector3(cx + sx * spread, base, cz + sz * spread), new Vector3(cx + sx * top, base + height, cz + sz * top), 0.55 * UNIT, 5), paint: 'metal' });
  }
  for (const level of [0.22, 0.46, 0.7]) {
    const r = spread + (top - spread) * level;
    const y = base + height * level;
    for (const [a, b] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]] as const) {
      out.props.push({ geometry: beam(new Vector3(cx + a[0] * r, y, cz + a[1] * r), new Vector3(cx + b[0] * r, y, cz + b[1] * r), 0.3 * UNIT, 4), paint: 'metal' });
    }
  }
  out.props.push({ geometry: box(5 * UNIT, 1, 5 * UNIT, cx, base + height, cz), paint: 'wood' });
  // The head, and the tail vane pointing away from the wheel.
  const facing = windmillFacing();
  const head = new BoxGeometry(3 * UNIT, 3 * UNIT, 6 * UNIT);
  head.rotateY(facing);
  head.translate(cx, base + height + 2.5 * UNIT, cz);
  out.props.push({ geometry: head, paint: 'metal' });
  const tail = new BoxGeometry(0.5, 7 * UNIT, 14 * UNIT);
  tail.translate(0, 0, -9 * UNIT);
  tail.rotateY(facing);
  tail.translate(cx, base + height + 3 * UNIT, cz);
  out.props.push({ geometry: tail, paint: 'trim' });
}

/** The way a windmill's wheel faces: toward the camera, a little turned, so its blades read. */
export const windmillFacing = () => Math.PI / 4 - 0.45;
export function windmillHub(house: House): Vector3 {
  const facing = windmillFacing();
  return new Vector3(house.x + house.type.w / 2 + Math.sin(facing) * 4 * UNIT, GROUND + 60 * UNIT + 2.5 * UNIT, house.y + house.type.d / 2 + Math.cos(facing) * 4 * UNIT);
}

/** A windmill's wheel (around its own z axis): a hub, sixteen blades and an outer ring. */
export function windmillWheel(): Part[] {
  const parts: Part[] = [];
  const radius = 11 * UNIT;
  const hub = new CylinderGeometry(1.4 * UNIT, 1.4 * UNIT, 2 * UNIT, 10);
  hub.rotateX(Math.PI / 2);
  parts.push({ geometry: hub, paint: 'metal' });
  for (let k = 0; k < 16; k += 1) {
    const blade = new BoxGeometry(radius * 0.72, 2.2 * UNIT, 0.4);
    blade.translate(radius * 0.58, 0, 0);
    blade.rotateX(0.32);
    blade.rotateZ((k / 16) * Math.PI * 2);
    parts.push({ geometry: blade, paint: 'trim' });
  }
  const ring = new TorusGeometry(radius * 0.94, 0.35 * UNIT, 4, 40);
  parts.push({ geometry: ring, paint: 'metal' });
  return parts;
}

/** A greenhouse: a low white base, glass walls and a glass gable roof with white ribs. */
function greenhouse(house: House, out: Batches) {
  const { w, d, h, roof } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  out.walls.push({ geometry: box(w, 3 * UNIT, d, x0 + w / 2, base + 1.5 * UNIT, z0 + d / 2), paint: 'trim' });
  out.shiny.push({ geometry: box(w - 0.6, h - 3 * UNIT, d - 0.6, x0 + w / 2, base + 3 * UNIT + (h - 3 * UNIT) / 2, z0 + d / 2), paint: 'glass' });
  const prism = gable(d, roof, w);
  prism.rotateY(Math.PI / 2);
  prism.translate(x0, base + h, z0 + d);
  out.shiny.push({ geometry: prism, paint: 'glass' });
  const ribs = Math.max(3, Math.round(w / (8 * UNIT)));
  for (let k = 0; k <= ribs; k += 1) {
    const x = x0 + (w * k) / ribs;
    out.walls.push({ geometry: box(0.7, h - 3 * UNIT, 0.7, x, base + 3 * UNIT + (h - 3 * UNIT) / 2, z0 + d + 0.2), paint: 'trim' });
    out.walls.push({ geometry: box(0.7, 0.7, d * 0.56, x, base + h + roof / 2 + 0.3, z0 + d * 0.74), paint: 'trim' });
  }
  out.walls.push({ geometry: box(w + 0.6, 0.8, 0.8, x0 + w / 2, base + h, z0 + d + 0.2), paint: 'trim' });
  out.walls.push({ geometry: box(w + 0.6, 0.8, 0.8, x0 + w / 2, base + h + roof, z0 + d / 2), paint: 'trim' });
}

/** A tennis court: the surface, white lines and a net. */
function court(house: House, out: Batches) {
  const { w, d } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  out.flats.push({ geometry: box(w, 0.5, d, x0 + w / 2, base + 0.35, z0 + d / 2), paint: 'court' });
  const line = 0.9;
  const y = base + 0.7;
  const inset = 4 * UNIT;
  const lx0 = x0 + inset;
  const lx1 = x0 + w - inset;
  const lz0 = z0 + inset;
  const lz1 = z0 + d - inset;
  const lines: [number, number, number, number][] = [
    [lx0, lz0, lx1, lz0],
    [lx0, lz1, lx1, lz1],
    [lx0, lz0, lx0, lz1],
    [lx1, lz0, lx1, lz1],
    [lx0 + (lx1 - lx0) * 0.25, lz0, lx0 + (lx1 - lx0) * 0.25, lz1],
    [lx0 + (lx1 - lx0) * 0.75, lz0, lx0 + (lx1 - lx0) * 0.75, lz1],
    [lx0 + (lx1 - lx0) * 0.25, (lz0 + lz1) / 2, lx0 + (lx1 - lx0) * 0.75, (lz0 + lz1) / 2],
  ];
  for (const [ax, az, bx, bz] of lines) out.flats.push({ geometry: box(Math.max(line, bx - ax + line), 0.25, Math.max(line, bz - az + line), (ax + bx) / 2, y, (az + bz) / 2), paint: 'courtLine' });
  out.props.push({ geometry: box(0.5, 3.6 * UNIT, lz1 - lz0 + 2 * UNIT, x0 + w / 2, base + 1.8 * UNIT, z0 + d / 2), paint: 'trim' });
  for (const z of [lz0 - UNIT, lz1 + UNIT]) out.props.push({ geometry: cylinder(0.5 * UNIT, 4.4 * UNIT, x0 + w / 2, base + 2.2 * UNIT, z, 6), paint: 'metal' });
}

/** A playground: a sandpit, a slide on a platform, a swing set and a seesaw. */
function playground(house: House, out: Batches) {
  const { w, d } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  out.flats.push({ geometry: roundedBox(w, 0.6, d, 0.3, x0 + w / 2, base + 0.3, z0 + d / 2), paint: 'sand' });
  for (const [x, z, sw, sd] of [[x0 + w / 2, z0 + 0.6, w, 1.2], [x0 + w / 2, z0 + d - 0.6, w, 1.2], [x0 + 0.6, z0 + d / 2, 1.2, d], [x0 + w - 0.6, z0 + d / 2, 1.2, d]] as const) {
    out.props.push({ geometry: box(sw, 1.6, sd, x, base + 0.8, z), paint: 'wood' });
  }
  // The slide: four posts, a platform, a roof and the slide itself.
  const px = x0 + w * 0.28;
  const pz = z0 + d * 0.32;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.props.push({ geometry: cylinder(0.5 * UNIT, 14 * UNIT, px + sx * 4 * UNIT, base + 7 * UNIT, pz + sz * 4 * UNIT, 6), paint: 'metal' });
  out.props.push({ geometry: box(9 * UNIT, 1, 9 * UNIT, px, base + 7 * UNIT, pz), paint: 'wood' });
  const canopy = new ConeGeometry(7 * UNIT, 4 * UNIT, 4, 1);
  canopy.rotateY(Math.PI / 4);
  canopy.translate(px, base + 16 * UNIT, pz);
  out.props.push({ geometry: canopy, paint: ['awnings', 0] });
  const slide = new BoxGeometry(4 * UNIT, 0.8, 14 * UNIT);
  slide.rotateX(-0.52);
  slide.translate(px, base + 3.6 * UNIT, pz + 9.5 * UNIT);
  out.props.push({ geometry: slide, paint: 'crate' });
  // The swings: an A-frame at each end, a bar, two seats on their ropes.
  const sx0 = x0 + w * 0.56;
  const sx1 = x0 + w * 0.9;
  const sz = z0 + d * 0.3;
  for (const x of [sx0, sx1]) {
    for (const dz of [-3.4, 3.4]) out.props.push({ geometry: beam(new Vector3(x, base, sz + dz * UNIT), new Vector3(x, base + 12 * UNIT, sz), 0.45 * UNIT, 5), paint: ['awnings', 1] });
  }
  out.props.push({ geometry: beam(new Vector3(sx0, base + 12 * UNIT, sz), new Vector3(sx1, base + 12 * UNIT, sz), 0.5 * UNIT, 6), paint: 'metal' });
  for (const u of [0.33, 0.66]) {
    const x = sx0 + (sx1 - sx0) * u;
    out.props.push({ geometry: box(4 * UNIT, 0.6, 2.4 * UNIT, x, base + 4 * UNIT, sz), paint: 'tyre' });
    for (const dx of [-1.6, 1.6]) out.props.push({ geometry: box(0.25, 8 * UNIT, 0.25, x + dx * UNIT, base + 8 * UNIT, sz), paint: 'metal' });
  }
  // The seesaw.
  const seesaw = new BoxGeometry(16 * UNIT, 0.8, 2.4 * UNIT);
  seesaw.rotateZ(0.16);
  seesaw.translate(x0 + w * 0.68, base + 2.6 * UNIT, z0 + d * 0.74);
  out.props.push({ geometry: seesaw, paint: ['awnings', 2] });
  out.props.push({ geometry: box(1.6 * UNIT, 2.4 * UNIT, 1.6 * UNIT, x0 + w * 0.68, base + 1.2 * UNIT, z0 + d * 0.74), paint: 'metal' });
}

/** Community garden beds: raised wooden beds with soil and rows of plants, and a little tool shed. */
function gardenBeds(house: House, out: Batches) {
  const { w, d } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  const bedW = 15 * UNIT;
  const bedD = 9 * UNIT;
  let tone = 0;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const cx = x0 + 6 * UNIT + bedW / 2 + col * (bedW + 4 * UNIT);
      const cz = z0 + d * 0.42 + row * (bedD + 6 * UNIT) - bedD / 2;
      out.props.push({ geometry: box(bedW, 3 * UNIT, bedD, cx, base + 1.5 * UNIT, cz), paint: 'wood' });
      out.props.push({ geometry: box(bedW - 1.4, 0.4, bedD - 1.4, cx, base + 3 * UNIT + 0.15, cz), paint: 'soil' });
      for (let k = 0; k < 5; k += 1) {
        for (const lane of [-1, 1]) {
          const flower = (k + row + col) % 4 === 0;
          out.props.push({ geometry: ball((flower ? 1.5 : 1.9) * UNIT, cx + (k - 2) * 2.7 * UNIT, base + 3.6 * UNIT, cz + lane * 2 * UNIT, 0.85, 0), paint: flower ? ['flowers', tone++] : 'plants' });
        }
      }
    }
  }
  const sx = x0 + w - 5 * UNIT;
  const sz = z0 + 6 * UNIT;
  out.walls.push({ geometry: box(8 * UNIT, 10 * UNIT, 8 * UNIT, sx, base + 5 * UNIT, sz), paint: 'wallSage' });
  const shedRoof = new BoxGeometry(10 * UNIT, 1, 10 * UNIT);
  shedRoof.rotateX(0.24);
  shedRoof.translate(sx, base + 11 * UNIT, sz);
  out.roofs.push({ geometry: shedRoof, paint: 'roofCharcoal' });
  out.walls.push({ geometry: box(4 * UNIT, 7 * UNIT, 0.8, sx, base + 3.5 * UNIT, sz + 4 * UNIT + 0.3), paint: 'door' });
}

/** A food truck: its body, a cab, a serving window with an awning flap, and wheels (along x, window on the south). */
function foodTruck(at: Pt, tone: number, out: Batches) {
  const base = GROUND;
  const length = 22 * UNIT;
  const width = 10 * UNIT;
  const height = 11 * UNIT;
  out.props.push({ geometry: roundedBox(length, height, width, 1.4, at.x, base + 2.4 * UNIT + height / 2, at.y), paint: ['trucks', tone] });
  out.props.push({ geometry: roundedBox(6 * UNIT, 8 * UNIT, width - 0.4, 1.2, at.x + length / 2 + 2.6 * UNIT, base + 2.4 * UNIT + 4 * UNIT, at.y), paint: ['trucks', tone] });
  out.windows.push(box(0.9, 3.2 * UNIT, width * 0.7, at.x + length / 2 + 5.65 * UNIT, base + 8.4 * UNIT, at.y));
  out.props.push({ geometry: box(length * 0.56, height * 0.4, 0.6, at.x - 1.5 * UNIT, base + 2.4 * UNIT + height * 0.58, at.y + width / 2 + 0.3), paint: 'ink' });
  const flap = new BoxGeometry(length * 0.62, 0.6, 4 * UNIT);
  flap.rotateX(0.38);
  flap.translate(at.x - 1.5 * UNIT, base + 2.4 * UNIT + height * 0.86, at.y + width / 2 + 1.8 * UNIT);
  out.props.push({ geometry: flap, paint: ['awnings', tone + 1] });
  out.props.push({ geometry: box(length * 0.56, 0.8, 2 * UNIT, at.x - 1.5 * UNIT, base + 2.4 * UNIT + height * 0.36, at.y + width / 2 + 1 * UNIT), paint: 'trim' });
  for (const x of [-length * 0.32, length * 0.32]) {
    for (const z of [-width / 2, width / 2]) {
      const wheel = new CylinderGeometry(2.4 * UNIT, 2.4 * UNIT, 1.4, 10);
      wheel.rotateX(Math.PI / 2);
      wheel.translate(at.x + x, base + 2.4 * UNIT, at.y + z);
      out.props.push({ geometry: wheel, paint: 'tyre' });
    }
  }
}

/** A market stall: a table of goods under a striped canopy on four posts. */
function stall(at: Pt, tone: number, out: Batches) {
  const base = GROUND;
  const w = 16 * UNIT;
  const d = 8 * UNIT;
  out.props.push({ geometry: box(w, 4.6 * UNIT, d, at.x, base + 2.3 * UNIT, at.y), paint: 'wood' });
  for (let k = 0; k < 6; k += 1) out.props.push({ geometry: ball(1.6 * UNIT, at.x - w * 0.38 + k * w * 0.15, base + 5.2 * UNIT, at.y + (k % 2 ? 1.4 : -1.4) * UNIT, 0.8, 0), paint: ['flowers', k + tone] });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.props.push({ geometry: cylinder(0.35 * UNIT, 12 * UNIT, at.x + sx * w * 0.46, base + 6 * UNIT, at.y + sz * d * 0.46, 5), paint: 'metal' });
  const stripes = 6;
  for (let k = 0; k < stripes; k += 1) {
    const stripe = new BoxGeometry((w * 1.08) / stripes + 0.05, 0.6, d * 1.25);
    stripe.rotateX(-0.22);
    stripe.translate(at.x - w * 0.54 + ((k + 0.5) * w * 1.08) / stripes, base + 12.4 * UNIT, at.y);
    out.props.push({ geometry: stripe, paint: k % 2 === 0 ? ['awnings', tone] : 'trim' });
  }
}

/** A plaza: light paving with a ring pattern, food trucks, market stalls and planters. */
function plaza(house: House, out: Batches) {
  const { w, d } = house.type;
  const x0 = house.x;
  const z0 = house.y;
  const base = GROUND;
  out.flats.push({ geometry: roundedBox(w, 0.6, d, 0.3, x0 + w / 2, base + 0.3, z0 + d / 2), paint: 'paving' });
  const ring = new RingGeometry(d * 0.2, d * 0.24, 40);
  ring.rotateX(-Math.PI / 2);
  ring.translate(x0 + w / 2, base + 0.65, z0 + d * 0.52);
  out.flats.push({ geometry: ring, paint: 'road' });
  const layout = plazaLayout({ x: x0, y: z0, w, d });
  layout.trucks.forEach((truck) => foodTruck(truck.at, truck.tone, out));
  layout.stalls.forEach((item) => stall(item.at, item.tone, out));
  for (const [u, v] of [[0.03, 0.04], [0.97, 0.04], [0.03, 0.96], [0.97, 0.96]] as const) {
    out.props.push({ geometry: box(5 * UNIT, 3 * UNIT, 5 * UNIT, x0 + w * u, base + 1.5 * UNIT, z0 + d * v), paint: 'wood' });
    out.props.push({ geometry: ball(3.6 * UNIT, x0 + w * u, base + 5.6 * UNIT, z0 + d * v, 1.05), paint: 'hedge' });
  }
}

/** Every building and place of the town, by kind (a pin's yard is drawn by its vignette instead). */
export function addBuilding(house: House, out: Batches) {
  switch (house.type.kind) {
    case 'house':
    case 'church':
      return gableHouse(house, out);
    case 'modern':
      return modernHouse(house, out);
    case 'row':
      return townhouses(house, out);
    case 'apartment':
      return apartment(house, out);
    case 'shop':
      return shop(house, out);
    case 'barn':
      return barn(house, out);
    case 'tower':
      return waterTower(house, out);
    case 'windmill':
      return windmillTower(house, out);
    case 'greenhouse':
      return greenhouse(house, out);
    case 'court':
      return court(house, out);
    case 'playground':
      return playground(house, out);
    case 'beds':
      return gardenBeds(house, out);
    case 'plaza':
      return plaza(house, out);
    case 'yard':
      return;
  }
}

// ---- Yards, water, tables ------------------------------------------------------------------------------

/** A backyard pool: a white rim, the water, and a deck chair beside it. */
export function addPool(pool: { x: number; y: number; w: number; d: number }, out: Batches) {
  const base = GROUND;
  const rim = 2.2 * UNIT;
  out.flats.push({ geometry: roundedBox(pool.w + rim * 2, 0.8, pool.d + rim * 2, 0.35, pool.x + pool.w / 2, base + 0.4, pool.y + pool.d / 2), paint: 'trim' });
  const water = new BoxGeometry(pool.w, 0.3, pool.d);
  water.translate(pool.x + pool.w / 2, base + 0.85, pool.y + pool.d / 2);
  out.pools.push(water);
  const chair = new BoxGeometry(4 * UNIT, 0.8, 9 * UNIT);
  chair.rotateX(-0.25);
  chair.translate(pool.x + pool.w + rim + 3.2 * UNIT, base + 2 * UNIT, pool.y + pool.d / 2);
  out.props.push({ geometry: chair, paint: 'trim' });
}

/** A dock: planks from the bank out over the water, on posts. */
export function addDock(dock: { from: Pt; to: Pt }, out: Batches) {
  const length = Math.hypot(dock.to.x - dock.from.x, dock.to.y - dock.from.y);
  const angle = Math.atan2(dock.to.y - dock.from.y, dock.to.x - dock.from.x);
  const cx = (dock.from.x + dock.to.x) / 2;
  const cz = (dock.from.y + dock.to.y) / 2;
  const deck = new BoxGeometry(length, 1.4, 8 * UNIT);
  deck.rotateY(-angle);
  deck.translate(cx, 11, cz);
  out.props.push({ geometry: deck, paint: 'wood' });
  const nx = -Math.sin(angle);
  const nz = Math.cos(angle);
  for (const t of [0.55, 1]) {
    for (const side of [1, -1]) {
      const x = dock.from.x + (dock.to.x - dock.from.x) * t + nx * side * 3.6 * UNIT;
      const z = dock.from.y + (dock.to.y - dock.from.y) * t + nz * side * 3.6 * UNIT;
      out.props.push({ geometry: cylinder(0.8 * UNIT, 12, x, 6, z, 6), paint: 'wood' });
    }
  }
}

/** A café table under an umbrella, with two chairs. */
export function addTable(table: Placed, out: Batches) {
  const base = GROUND;
  const { x, y: z } = table.at;
  out.props.push({ geometry: cylinder(3.4 * UNIT, 0.6, x, base + 5 * UNIT, z, 12), paint: 'trim' });
  out.props.push({ geometry: cylinder(0.3 * UNIT, 12 * UNIT, x, base + 6 * UNIT, z, 5), paint: 'metal' });
  const umbrella = new ConeGeometry(7.4 * UNIT, 3 * UNIT, 10, 1);
  umbrella.translate(x, base + 12.4 * UNIT, z);
  out.props.push({ geometry: umbrella, paint: ['umbrellas', table.tone] });
  for (const side of [-1, 1]) out.props.push({ geometry: box(2.8 * UNIT, 3.4 * UNIT, 2.8 * UNIT, x + side * 5.4 * UNIT, base + 1.7 * UNIT, z), paint: 'wood' });
}

/** A bench along a direction. */
export function addBench(bench: { at: Pt; angle: number }, out: Batches) {
  const length = 10 * UNIT;
  for (const part of [box(length, 1.6, 4.5, 0, 4.2, 0), box(length, 4.5, 1.2, 0, 6.6, -2.4), box(length * 0.88, 3.4, 3.6, 0, 1.7, 0)]) {
    part.rotateY(-bench.angle);
    part.translate(bench.at.x, GROUND, bench.at.y);
    out.props.push({ geometry: part, paint: 'wood' });
  }
}

/** A picnic blanket on a lawn. */
export function addBlanket(blanket: { at: Pt; angle: number; tone: number }, out: Batches) {
  const geometry = new BoxGeometry(14 * UNIT, 0.8, 10 * UNIT);
  geometry.rotateY(blanket.angle);
  geometry.translate(blanket.at.x, GROUND + 0.6, blanket.at.y);
  out.flats.push({ geometry, paint: ['flowers', blanket.tone + 1], lift: 0.18 });
}

/** A bridge's deck (arched) and its rails, as parts. */
export function addBridge(from: Pt, to: Pt, out: Batches) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const v = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  const half = 9 * UNIT;
  const steps = 18;
  const rise = Math.min(16, 5 + length * 0.08);
  const positions: number[] = [];
  const ring = (t: number) => {
    const c = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const top = GROUND + 1.2 + Math.sin(Math.PI * t) * rise;
    const bottom = top - 5;
    return [
      new Vector3(c.x + v.x * half, top, c.y + v.y * half),
      new Vector3(c.x - v.x * half, top, c.y - v.y * half),
      new Vector3(c.x - v.x * half, bottom, c.y - v.y * half),
      new Vector3(c.x + v.x * half, bottom, c.y + v.y * half),
    ];
  };
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  let previous = ring(0);
  for (let k = 1; k <= steps; k += 1) {
    const next = ring(k / steps);
    for (let side = 0; side < 4; side += 1) quad(previous[side]!, next[side]!, next[(side + 1) % 4]!, previous[(side + 1) % 4]!);
    previous = next;
  }
  const deck = new BufferGeometry();
  deck.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  deck.computeVertexNormals();
  out.walls.push({ geometry: deck, paint: 'bridge' });
  for (const side of [1, -1]) {
    const points: Vector3[] = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const c = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const top = GROUND + 1.2 + Math.sin(Math.PI * t) * rise;
      points.push(new Vector3(c.x + v.x * (half - 1) * side, top + 9, c.y + v.y * (half - 1) * side));
      if (k % 3 === 0) out.walls.push({ geometry: box(1.6, 9, 1.6, c.x + v.x * (half - 1) * side, top + 4.5, c.y + v.y * (half - 1) * side), paint: 'bridge' });
    }
    out.walls.push({ geometry: new TubeGeometry(new CatmullRomCurve3(points), steps * 2, 0.95, 5, false), paint: 'bridge' });
  }
}

/** The round garden: a hedge ring, a path, a flower bed, and the fountain's basin and water. */
export function addGarden(garden: { at: Pt; r: number }, out: Batches): { fountainTop: number } {
  const { at, r } = garden;
  const ring = new Shape();
  ring.absarc(0, 0, r, 0, Math.PI * 2, false);
  const hole = new Shape();
  hole.absarc(0, 0, r - 7 * UNIT, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const hedge = new ExtrudeGeometry(ring, { depth: 4, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: 40 });
  hedge.rotateX(-Math.PI / 2);
  hedge.translate(at.x, GROUND + 2, at.y);
  out.props.push({ geometry: hedge, paint: 'hedge' });
  const path = new RingGeometry(r - 15 * UNIT, r - 7 * UNIT, 56);
  path.rotateX(-Math.PI / 2);
  path.translate(at.x, GROUND + 0.3, at.y);
  out.flats.push({ geometry: path, paint: 'road' });
  const bed = new CircleGeometry(r - 15 * UNIT, 56);
  bed.rotateX(-Math.PI / 2);
  bed.translate(at.x, GROUND + 0.28, at.y);
  out.flats.push({ geometry: bed, paint: 'bed' });
  const basin = new CylinderGeometry(10 * UNIT, 11 * UNIT, 4, 28);
  basin.translate(at.x, GROUND + 2, at.y);
  out.walls.push({ geometry: basin, paint: 'trim' });
  const fountainTop = GROUND + 4.1;
  const water = new CircleGeometry(8.4 * UNIT, 28);
  water.rotateX(-Math.PI / 2);
  water.translate(at.x, fountainTop, at.y);
  out.pools.push(water);
  return { fountainTop };
}

// ---- Vignettes: a pin's task, happening in its yard ------------------------------------------------------

export type VignetteKind = 'moving-help' | 'yard-cleanup' | 'light-cleaning' | 'furniture-assembly' | 'computer-help';
export const VIGNETTE_KINDS: VignetteKind[] = ['moving-help', 'yard-cleanup', 'light-cleaning', 'furniture-assembly', 'computer-help'];

/** Someone in a vignette: where they stand (local, UNITs), which way they face, and how they move. */
export interface Crew {
  x: number;
  z: number;
  /** Facing (radians, local). */
  angle: number;
  tone: number;
  pose: 'stand' | 'sit' | 'kneel';
  /** carry: walks between the truck and the house with a box (with a partner); rake: sways; work: bobs. */
  motion: 'carry' | 'rake' | 'work' | 'still';
  /** A carrier's partner holds the other side (no box of their own). */
  partner?: boolean;
}

/**
 * A vignette's things, in local coordinates (UNITs scaled in): the yard's middle at the origin, the house toward
 * -x, the camera's side toward +z. Returned as painted parts (one merged mesh per vignette) and its crew.
 */
export function vignette(kind: VignetteKind): { parts: Part[]; crew: Crew[] } {
  const U = UNIT;
  const parts: Part[] = [];
  const add = (geometry: BufferGeometry, paint: PaintRef, extra: Partial<Part> = {}) => parts.push({ geometry, paint, ...extra });
  const at = (geometry: BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x * U, y * U, z * U);
    return geometry;
  };
  const crew: Crew[] = [];
  switch (kind) {
    case 'moving-help': {
      // A box truck, its back open toward the house, a ramp, boxes stacked on the ground.
      add(at(new RoundedBoxGeometry(17 * U, 11 * U, 10 * U, 2, 0.8), 4.5, 7.8, -2), ['trucks', 2]);
      add(at(new RoundedBoxGeometry(5.5 * U, 8 * U, 9.6 * U, 2, 0.8), 15.6, 6.2, -2), ['trucks', 2]);
      add(at(new BoxGeometry(0.6, 3 * U, 7.6 * U), 18.4, 8, -2), 'window');
      add(at(new BoxGeometry(0.5, 9 * U, 8.4 * U), -4.05, 7.6, -2), 'ink', { shade: 0.6 });
      const ramp = new BoxGeometry(9 * U, 0.6, 6 * U);
      ramp.rotateZ(0.3);
      add(at(ramp, -8, 1.4, -2), 'metal');
      for (const [x, z] of [[-1, -4.6], [10, -4.6], [16, -4.6], [-1, 0.6], [10, 0.6], [16, 0.6]] as const) {
        const wheel = new CylinderGeometry(2 * U, 2 * U, 1.2, 10);
        wheel.rotateX(Math.PI / 2);
        add(at(wheel, x, 2, z), 'tyre');
      }
      for (const [x, y, z, s] of [[-14, 2.3, 6, 4.6], [-14, 6.8, 6, 4.4], [-9.4, 2.3, 7.4, 4.6], [-10.6, 2.2, 1.2, 4.4], [3, 2, 7.6, 4]] as const) {
        add(at(new BoxGeometry(s * U, s * U, s * U), x, y, z), 'cardboard');
        add(at(new BoxGeometry(s * U + 0.1, 0.25, 0.9 * U), x, y + s / 2, z), 'trim', { shade: 0.92 });
      }
      crew.push({ x: -11, z: -2.2, angle: 0, tone: 1, pose: 'stand', motion: 'carry' });
      crew.push({ x: -5, z: -2.2, angle: Math.PI, tone: 3, pose: 'stand', motion: 'carry', partner: true });
      break;
    }
    case 'yard-cleanup': {
      // A lawn with leaf piles, scattered leaves and a wheelbarrow full of them.
      add(at(new BoxGeometry(34 * U, 0.3, 26 * U), 0, 0.15, 0), 'grass');
      for (const [x, z, r] of [[-9, 6, 5.5], [3, -7, 4.6], [10, 6.5, 4]] as const) add(ball(r * U, x * U, 0.4, z * U, 0.42, 1), 'leafPile');
      for (let k = 0; k < 26; k += 1) {
        const angle = k * 2.39996;
        const r = 4 + ((k * 7) % 11);
        const leaf = new BoxGeometry(1.3 * U, 0.2, 0.9 * U);
        leaf.rotateY(angle);
        add(at(leaf, Math.cos(angle) * r, 0.45, Math.sin(angle) * r * 0.75), k % 3 === 0 ? 'leafPile' : ['autumn', k]);
      }
      const tray = new BoxGeometry(9 * U, 3 * U, 6 * U);
      tray.rotateZ(0.16);
      add(at(tray, 12, 4, -5), ['awnings', 2]);
      add(ball(3.2 * U, 12 * U, 6 * U, -5 * U, 0.5, 1), 'leafPile');
      const wheel = new CylinderGeometry(1.8 * U, 1.8 * U, 1.2, 10);
      wheel.rotateX(Math.PI / 2);
      add(at(wheel, 17, 1.8, -5), 'tyre');
      for (const z of [-7.2, -2.8]) add(beam(new Vector3(8 * U, 5 * U, z * U), new Vector3(3.5 * U, 3.4 * U, z * U), 0.3 * U, 4), 'wood');
      crew.push({ x: -3, z: 1, angle: -0.6, tone: 2, pose: 'stand', motion: 'rake' });
      break;
    }
    case 'light-cleaning': {
      // A washing line with bright cloths, a laundry basket, a bucket and a mop.
      for (const x of [-15, 15]) add(cylinder(0.4 * U, 14 * U, x * U, 7 * U, -6 * U, 6), 'metal');
      add(beam(new Vector3(-15 * U, 13.4 * U, -6 * U), new Vector3(15 * U, 13.4 * U, -6 * U), 0.12 * U, 4), 'trim');
      [-10.5, -5, 0.5, 6, 11].forEach((x, k) => {
        add(at(new BoxGeometry(4.4 * U, 6 * U - (k % 2) * U, 0.3), x, 10.2 + (k % 2) * 0.5, -6), k % 2 === 0 ? ['awnings', k] : k === 1 ? 'trim' : ['umbrellas', k]);
      });
      add(at(new BoxGeometry(7 * U, 3.4 * U, 5 * U), -6, 1.7, 5), 'cardboard', { lift: 0.25 });
      add(ball(2.6 * U, -6 * U, 3.6 * U, 5 * U, 0.5, 1), 'trim');
      add(cylinder(2 * U, 3.6 * U, 8 * U, 1.8 * U, 6 * U, 12, 2.4 * U), ['awnings', 1]);
      add(beam(new Vector3(9 * U, 0.6 * U, 7 * U), new Vector3(11.5 * U, 13 * U, 3 * U), 0.25 * U, 4), 'wood');
      add(at(new BoxGeometry(4 * U, 1.2 * U, 2 * U), 9, 0.6, 7.2), 'trim');
      crew.push({ x: -1, z: 3, angle: -0.4, tone: 4, pose: 'stand', motion: 'work' });
      break;
    }
    case 'furniture-assembly': {
      // A mat, flat-pack boxes, a half-built shelf, a finished nightstand and a toolbox.
      add(at(new BoxGeometry(22 * U, 0.3, 14 * U), 1, 0.15, 2), ['flowers', 2], { lift: 0.55 });
      for (const [x, z, angle] of [[-12, -6, 0.2], [-11, -2.2, -0.15]] as const) {
        const pack = new BoxGeometry(16 * U, 1.6 * U, 7 * U);
        pack.rotateY(angle);
        add(at(pack, x, 0.8 + (z > -3 ? 1.6 : 0), z), 'cardboard');
      }
      for (const x of [6, 14]) add(at(new BoxGeometry(1 * U, 15 * U, 6 * U), x, 7.5, -5), 'wood');
      for (const y of [0.6, 5, 9.6, 14.4]) add(at(new BoxGeometry(8 * U, 0.7 * U, 6 * U), 10, y, -5), 'wood', { lift: y > 10 ? 0 : 0.1 });
      add(at(new BoxGeometry(7 * U, 7 * U, 6 * U), 13, 3.5, 7), 'wood');
      add(at(new BoxGeometry(5 * U, 0.3, 0.4), 13, 5.2, 10.05), 'ink');
      add(at(new BoxGeometry(6 * U, 3.2 * U, 3.4 * U), -3, 1.6, 7.6), ['awnings', 0]);
      add(at(new BoxGeometry(3 * U, 0.6 * U, 0.6 * U), -3, 3.6, 7.6), 'ink');
      crew.push({ x: 4, z: 2.6, angle: Math.PI * 0.9, tone: 0, pose: 'kneel', motion: 'work' });
      break;
    }
    case 'computer-help': {
      // A café table with a laptop, two chairs, and a satellite dish on a pole (help from anywhere).
      add(cylinder(4.4 * U, 0.6, 0, 5.4 * U, 2 * U, 14), 'trim');
      add(cylinder(0.4 * U, 5.4 * U, 0, 2.7 * U, 2 * U, 6), 'metal');
      add(at(new BoxGeometry(3.6 * U, 0.3 * U, 2.6 * U), 0.6, 5.9, 2), 'ink');
      const lid = new BoxGeometry(0.3 * U, 2.6 * U, 3.6 * U);
      lid.rotateZ(-0.3);
      add(at(lid, 2.5, 7.3, 2), 'ink');
      for (const x of [-5, 5.5]) add(at(new BoxGeometry(3 * U, 3.6 * U, 3 * U), x, 1.8, 2), 'wood');
      add(cylinder(0.5 * U, 12 * U, 12 * U, 6 * U, -7 * U, 6), 'metal');
      const dish = new SphereGeometry(5.4 * U, 18, 8, 0, Math.PI * 2, 0, 0.95);
      dish.scale(1, 0.55, 1);
      dish.rotateX(-0.9);
      dish.rotateY(-0.6);
      add(at(dish, 12, 13.6, -7), 'trim');
      add(beam(new Vector3(12 * U, 13 * U, -7 * U), new Vector3(10.4 * U, 16.6 * U, -3.6 * U), 0.25 * U, 4), 'metal');
      add(ball(0.8 * U, 10.4 * U, 16.6 * U, -3.6 * U), 'metal');
      crew.push({ x: -4.6, z: 2, angle: 0, tone: 3, pose: 'sit', motion: 'still' });
      crew.push({ x: 5.2, z: 0.6, angle: Math.PI, tone: 1, pose: 'stand', motion: 'work' });
      break;
    }
  }
  return { parts, crew };
}

// ---- Movers' bodies ------------------------------------------------------------------------------------

/** A boat's hull in plan (an extruded, rounded wedge; unit scale is the town's). */
export function hullGeometry(): BufferGeometry {
  const hull = new Shape();
  hull.moveTo(-13, -5);
  hull.lineTo(6, -5.6);
  hull.quadraticCurveTo(15, -4, 18, 0);
  hull.quadraticCurveTo(15, 4, 6, 5.6);
  hull.lineTo(-13, 5);
  hull.quadraticCurveTo(-14.5, 0, -13, -5);
  const geometry = new ExtrudeGeometry(hull, { depth: 3, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** The motorboat: hull, cabin roof and windows, as painted parts (one geometry). */
export function boatParts(): Part[] {
  const body = hullGeometry();
  body.translate(0, 0.5, 0);
  const cabin = new RoundedBoxGeometry(11, 5, 8, 2, 1.6);
  cabin.translate(-1, 6.6, 0);
  const roof = new RoundedBoxGeometry(12.5, 1.3, 9.4, 2, 0.6);
  roof.translate(-1, 9.6, 0);
  return [
    { geometry: body, paint: 'hull' },
    { geometry: cabin, paint: 'window' },
    { geometry: roof, paint: 'hull' },
  ];
}

/** The sailboat: a smaller hull, a mast and a sail. */
export function sailParts(): Part[] {
  const body = hullGeometry();
  body.scale(0.8, 1, 0.8);
  body.translate(0, 0.5, 0);
  const mast = new CylinderGeometry(0.5, 0.6, 30, 6);
  mast.translate(1, 18, 0);
  const sail = new BufferGeometry();
  sail.setAttribute('position', new Float32BufferAttribute([1.5, 4, 0, 1.5, 32, 0, -13, 5, 0, 1.5, 4, 0, -13, 5, 0, 1.5, 32, 0], 3));
  sail.computeVertexNormals();
  return [
    { geometry: body, paint: 'hull' },
    { geometry: mast, paint: 'ink' },
    { geometry: sail, paint: 'sail' },
  ];
}

/** A kayak: a slim pointed hull (colored per kayak) with its cockpit. */
export function kayakGeometry(): BufferGeometry {
  const hull = new SphereGeometry(1, 14, 6);
  hull.scale(9, 1.6, 2.2);
  hull.translate(0, 1, 0);
  return hull;
}

/** A bike: two wheels and a frame (the rider is one of the town's people). */
export function bikeParts(): Part[] {
  const parts: Part[] = [];
  for (const x of [-5.2, 5.2]) {
    const wheel = new TorusGeometry(3.3, 0.6, 6, 16);
    wheel.translate(x, 3.3, 0);
    parts.push({ geometry: wheel, paint: 'ink' });
  }
  const frame = new BoxGeometry(10.4, 0.9, 0.9);
  frame.translate(0, 6.4, 0);
  parts.push({ geometry: frame, paint: 'ink' });
  const bar = new BoxGeometry(0.8, 4, 0.8);
  bar.translate(4.2, 8, 0);
  parts.push({ geometry: bar, paint: 'ink' });
  return parts;
}

