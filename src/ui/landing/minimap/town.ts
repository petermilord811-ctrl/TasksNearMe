import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Side,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWN_DIVE_REACH } from '../chapters/timeline';
import { dueFrame } from '../frame-clock';
import { BUILD_UP } from './build-up';
import { cameraPose } from './camera';
import { nearness, turnToward } from './pointer-react';
import { HOUSE_RISE, houseShaders, treeVertex } from './react-shaders';
import { GROUND, PIN_HEAD, PIN_LIFT, PIN_SCALE, UNIT, WATER_LEVEL, townScene, type TownLayout, type TownModel, type WaterGrid } from './scene';
import {
  addBench,
  addBlanket,
  addBridge,
  addBuilding,
  addDock,
  addGarden,
  addPool,
  addTable,
  agaveGeometry,
  balloonParts,
  bikeParts,
  birdGeometry,
  boatParts,
  cactusGeometry,
  coneGeometry,
  crownGeometry,
  emptyBatches,
  flat,
  frondGeometry,
  glowTexture,
  kayakGeometry,
  merge,
  normalized,
  ribbon,
  rippleTexture,
  sailParts,
  slab,
  vignette,
  VIGNETTE_KINDS,
  wakeTexture,
  windmillFacing,
  windmillHub,
  windmillWheel,
  type Crew,
  type Part,
  type VignetteKind,
} from './town-parts';
import type { TownFlora } from './flora';
import { DARK_PALETTE, LIGHT_PALETTE, paintColor, type ColorKey, type PaintRef, type TownPalette } from './town-palette';

export { DARK_PALETTE, LIGHT_PALETTE, type TownPalette };
export { townPalette, type TownScheme } from './town-seasons';
export type { TownFlora } from './flora';

/**
 * The hero's 3D mini-map (three.js): the town from `scene.ts` as a lit model on the page, with soft sun
 * shadows, glossy water that ripples, trees that sway, lamps that glow at night, and a town that lives: bikes,
 * cars, a boat, a sailboat, kayaks, people on the pavements, at café tables and around the plaza's food trucks,
 * birds, slow hot-air balloons, a windmill whose wheel turns, a fountain. Each pin's house has a yard where its
 * task is happening (a moving truck being unloaded, leaves being raked, laundry on the line, furniture being
 * put together, someone getting help with a laptop). It builds itself up (`buildUp`, timed by `BUILD_UP`) out of
 * the skeleton the hero draws first: the land is in place, then the houses grow, the trees pop up in a wave, the
 * pins drop in and the things that move appear. As the hero scrolls away the camera tilts toward a view from straight above and pulls back,
 * handing over to the real map below. The canvas is transparent: the page shows through.
 *
 * Light on the GPU: everything that stands still is merged into a few meshes (one per kind of surface, colored
 * per vertex), and everything that repeats or moves is instanced, so the whole town is a few dozen draw calls.
 * The shadows of the still town are drawn only while it builds up (about ten times a second) and when the
 * theme changes, never per frame (so nothing that moves casts one); it draws about 30 frames a second, 60 only
 * while the camera moves or the intro plays; the stage caps the pixel ratio; and it asks for the low-power GPU.
 * Every color comes from the palette, so switching the theme repaints all of it.
 *
 * Light on the page: `createTown` builds in steps that give the main thread back between them, compiles every
 * shader without blocking (the driver compiles them in parallel), and draws its first frame (shadows included)
 * before it resolves, so the town is ready to show the moment it's handed over.
 */

export interface TownPin {
  slotId: string;
  color: string;
  /** Another category is picked or pointed at: this pin quiets down. */
  dim: boolean;
  /** This pin's task is pointed at or picked: it lifts and its rings pulse faster. */
  lit: boolean;
  /** The task's category (its slug): the pin's yard shows that kind of task happening. */
  category?: string;
}

/**
 * Where the composition's stage sits in the canvas, in CSS px (from the canvas's top-left). The canvas may show
 * only part of the stage (a narrow screen crops it) or more than it (a wide screen shows the land around it).
 */
export interface TownView {
  width: number;
  height: number;
  stage: { left: number; top: number; width: number; height: number };
}

export interface TownController {
  /** Starts the frame loop (and the build-up the first time). */
  start(): void;
  stop(): void;
  /**
   * Draws a frame now: stopped (reduced motion, paused, off screen), the town settles into its current state
   * first; running, it redraws the current frame as is (after a resize, say) and the loop goes on animating.
   */
  renderOnce(): void;
  /** Skips the build-up (reduced motion: the town is simply there). */
  finishIntro(): void;
  /** How far the build-up has come (0–1; 1 without one, or once it's over). */
  buildProgress(): number;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Which part of the stage (and of the land around it) the canvas shows. */
  setView(view: TownView): void;
  setPalette(palette: TownPalette): void;
  setPins(pins: TownPin[]): void;
  /** The pointer over the page, -1..1 on both axes (the camera leans toward it). */
  setPointer(x: number, y: number, active: boolean): void;
  /**
   * The pointer over the town itself, in the canvas's -1..1 (y up), and whether it's over it: the town reacts where it
   * points (the trees lean away, the houses near it stand a touch taller with their windows aglow, people turn to
   * look, a pin there rises). Off: it all settles back.
   */
  setHover(x: number, y: number, active: boolean): void;
  /** How far the hero has scrolled away (0–1): the camera tilts toward a view from above and pulls back. */
  setTilt(tilt: number): void;
  /**
   * The camera diving at a slot's pin (0–1), straight along its line of sight to the pin's resting top: the pin stays
   * where it is on the screen while the town grows around it (the landing's window onto the real map opens there).
   * Set each frame by the page's clock, so it isn't eased here; the pointer's lean holds still while it dives.
   */
  setDive(amount: number, slotId: string | null): void;
  /** Whether the frame loop has something to show: the build-up, a tilt or a lean still settling. */
  isSettling(): boolean;
  /**
   * Where the top of a slot's pin is in the canvas (fractions of its width and height), this frame. `resting`:
   * where it is without its bob and its lift (the cards hang from there, so a lifting pin never moves its card
   * out from under the pointer).
   */
  pinAt(slotId: string, resting?: boolean): { x: number; y: number } | null;
  /** Called after every frame (to move the HTML cards with the pins). */
  onFrame(callback: (() => void) | null): void;
  dispose(): void;
}

// ---- Small math ------------------------------------------------------------------------------------------

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t: number) => {
  const x = clamp01(t);
  const c = 1.55;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** How long the build-up takes (seconds). */
const INTRO = BUILD_UP.seconds;
/** How much of the way to a pin the camera covers at the end of a dive (`setDive`): the town grows about 3.6 times. */
const DIVE_REACH = TOWN_DIVE_REACH;

/**
 * How far the town notices the pointer (world units; a house is 30–60 across): trees lean within `TREE_REACH`, houses
 * rise and glow within `HOUSE_REACH`, people turn within `PEOPLE_REACH`, a pin lifts within `PIN_REACH`. Full
 * strength inside the first part of each (the rest fades out smoothly).
 */
const TREE_REACH = 230;
const HOUSE_REACH = 170;
const PEOPLE_REACH = 200;
const PIN_REACH = 150;

/** A phase of the build-up (`[from, length]`, fractions of it) at overall progress `t`, 0–1. */
const phase = ([from, length]: readonly [number, number], t: number) => clamp01((t - from) / length);

/** A part's geometry made mergeable and given a (to be painted) color attribute. */
interface TintRange {
  start: number;
  count: number;
  paint: PaintRef;
  shade: number;
  lift: number;
}

/**
 * Lets per-instance transparency reach a material (an `instanceAlpha` attribute), and, for lit materials, a
 * soft glow in the instance's own color.
 */
function withInstanceAlpha(material: Material, glow = 0) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceAlpha;');
    if (glow > 0) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vColor.rgb * ${glow.toFixed(3)};\n#endif`,
      );
    }
  };
  material.customProgramCacheKey = () => `instance-alpha-${glow}`;
}

export interface TownOptions {
  palette: TownPalette;
  shadowSize?: number;
  layout?: TownLayout;
  /** The town to draw, built ahead (in a worker); without it, it's built here. */
  scene?: TownModel;
  /** Which region's plants grow (flora.ts), when the town is built here (a scene built ahead says its own). */
  flora?: TownFlora;
  /** Play the build-up the first time it starts (off: the town is complete from its first frame). */
  buildUp?: boolean;
  /** The canvas's first size and view, so the warm-up frame is the real first frame. */
  size?: { width: number; height: number; pixelRatio: number; view: TownView };
  /** Stops a build that's no longer wanted (checked between its steps; what it made so far is released). */
  signal?: AbortSignal;
}

/** Gives the main thread back for a moment (input, paint, other work) between the build's steps. */
function nextTask(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function createTown(canvas: HTMLCanvasElement, options: TownOptions): Promise<TownController> {
  const data: TownModel = options.scene ?? townScene(options.layout ?? 'wide', options.flora ?? 'texas');
  const florida = data.flora === 'florida';
  const { view, stage } = data.composition;
  let palette = options.palette;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  // Reading every shader's log back is a stall per program; development keeps it (to see shader errors).
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(view.fov, stage.width / stage.height, view.distance * 0.23, view.distance * 2.5);
  const materials: Material[] = [];
  const geometries: BufferGeometry[] = [];
  const textures: CanvasTexture[] = [];
  const pmrem = new PMREMGenerator(renderer);
  let environment: { dispose(): void } | null = null;
  /** Lets go of everything made so far (the GPU's buffers, programs and textures, and the context's renderer). */
  const release = () => {
    scene.traverse((child) => {
      if (child instanceof Mesh || child instanceof InstancedMesh || child instanceof Points) child.geometry.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
  /** Between steps: the page gets the main thread back, and a build that's no longer wanted stops (and lets go). */
  const step = async () => {
    await nextTask();
    if (!options.signal?.aborted) return;
    release();
    throw new DOMException('The town is no longer needed.', 'AbortError');
  };

  // The room's soft reflections (image-based light for the glossy surfaces): its shaders compile first,
  // without blocking, then it's drawn.
  await step();
  const room = new RoomEnvironment();
  await warmRoom(renderer, room);
  await step();
  await warmEnvironment(renderer, pmrem);
  await step();
  const environmentTexture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  environment = environmentTexture;
  scene.environment = environmentTexture;
  scene.environmentIntensity = palette.environment;
  await step();
  const painted: { material: MeshStandardMaterial; key: ColorKey; emissive: boolean }[] = [];
  const tinted: { geometry: BufferGeometry; ranges: TintRange[] }[] = [];
  const color = new Color();
  const whiten = new Color('#ffffff');
  const track = <T extends BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };
  /** A material painted with one of the palette's colors (it follows the theme). */
  const paint = (key: ColorKey, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}, emissive = false) => {
    const material = new MeshStandardMaterial({ color: palette[key], roughness: 0.9, ...extra });
    if (emissive) material.emissive.set(palette[key]);
    materials.push(material);
    painted.push({ material, key, emissive });
    return material;
  };
  /** A white material for meshes colored per vertex or per instance. */
  const plain = (extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => {
    const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, ...extra });
    materials.push(material);
    return material;
  };
  const paintRange = (entry: { geometry: BufferGeometry; ranges: TintRange[] }) => {
    const attribute = entry.geometry.getAttribute('color') as BufferAttribute;
    for (const range of entry.ranges) {
      color.set(paintColor(palette, range.paint));
      if (range.lift) color.lerp(whiten, range.lift);
      if (range.shade !== 1) color.multiplyScalar(range.shade);
      for (let v = range.start; v < range.start + range.count; v += 1) attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  };
  // The pointer over the town: where it touches the ground (x, z) and how present it is (0–1), for the shaders that
  // react to it, and how far each kind of thing notices it (full strength within the first number).
  const reactAt = { value: new Vector3(0, 0, 0) };
  const treeReach = { value: new Vector2(TREE_REACH * 0.2, TREE_REACH) };
  const houseReach = { value: new Vector2(HOUSE_REACH * 0.25, HOUSE_REACH) };
  /** Each building's parts and windows, by the building's middle on the ground: they react to the pointer as one. */
  const anchorOf = new Map<Part | BufferGeometry, [number, number]>();
  const nowhere: [number, number] = [1e6, 1e6];
  const anchorAttribute = (count: number, at: [number, number]) => {
    const values = new Float32Array(count * 2);
    for (let v = 0; v < count; v += 1) {
      values[v * 2] = at[0];
      values[v * 2 + 1] = at[1];
    }
    return new BufferAttribute(values, 2);
  };
  /**
   * A material that reacts to the pointer. Trees (instanced, at the scene's root) lean away from it; buildings (merged,
   * with a `reactAnchor` per vertex: their middle) stand a touch taller near it, and glow (`glow`) a little, their
   * windows more. All in the shaders: the main thread only sets one uniform a frame. The glow is a uniform of each
   * material, so materials of a kind share one shader program (fewer to compile while the town loads).
   */
  const reactive = <M extends Material>(material: M, kind: 'tree' | 'house', glow = 0): M => {
    const before = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey();
    const ownGlow = { value: glow };
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      if (kind === 'tree') {
        const vertex = treeVertex(shader.vertexShader, GROUND);
        if (!vertex) return;
        shader.uniforms.uReact = reactAt;
        shader.uniforms.uReach = treeReach;
        shader.vertexShader = vertex;
        return;
      }
      const house = houseShaders(shader.vertexShader, shader.fragmentShader, GROUND);
      if (!house) return;
      shader.uniforms.uReact = reactAt;
      shader.uniforms.uReach = houseReach;
      shader.uniforms.uGlow = ownGlow;
      shader.vertexShader = house.vertex;
      shader.fragmentShader = house.fragment;
    };
    material.customProgramCacheKey = () => `${baseKey}|react-${kind}`;
    return material;
  };

  /** Merges painted parts into one geometry colored per vertex (repainted when the theme changes); `anchored`: with each part's building's middle (`anchorOf`), for the pointer. */
  const tint = (parts: Part[], anchored = false): BufferGeometry | null => {
    if (!parts.length) return null;
    const ranges: TintRange[] = [];
    let start = 0;
    const prepared = parts.map((part) => {
      const geometry = normalized(part.geometry);
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));
      if (anchored) geometry.setAttribute('reactAnchor', anchorAttribute(count, anchorOf.get(part) ?? nowhere));
      ranges.push({ start, count, paint: part.paint, shade: part.shade ?? 1, lift: part.lift ?? 0 });
      start += count;
      return geometry;
    });
    const geometry = mergeGeometries(prepared, false);
    prepared.forEach((part) => part.dispose());
    const entry = { geometry: track(geometry), ranges };
    paintRange(entry);
    tinted.push(entry);
    return geometry;
  };

  // Light: a low sun from the upper left of the stage, a soft sky, and the room's reflections.
  const sun = new DirectionalLight(palette.sun.color, palette.sun.intensity);
  sun.castShadow = true;
  const shadowSize = options.shadowSize ?? 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.6;
  const shadowCamera = sun.shadow.camera;
  // The shadow camera covers what this layout's camera sees (a tighter box: sharper shadows on narrow layouts).
  const reach = view.distance * (data.composition.layout === 'wide' ? 0.52 : 0.41);
  shadowCamera.left = -reach;
  shadowCamera.right = reach;
  shadowCamera.top = reach;
  shadowCamera.bottom = -reach;
  shadowCamera.near = 200;
  shadowCamera.far = 8000;
  shadowCamera.updateProjectionMatrix();
  const target = new Object3D();
  target.position.set(view.target.x, 0, view.target.z);
  sun.position.set(target.position.x - 1700, 2600, target.position.z + 600);
  sun.target = target;
  scene.add(sun, target);
  const sky = new HemisphereLight(palette.sky.color, palette.sky.ground, palette.sky.intensity);
  scene.add(sky);

  // The page under the model catches its shadows.
  const shadowMaterial = new ShadowMaterial({ color: palette.shadow.color, opacity: palette.shadow.opacity });
  materials.push(shadowMaterial);
  const ground = new Mesh(track(new PlaneGeometry(12000, 12000)), shadowMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(target.position.x, 0, target.position.z);
  ground.receiveShadow = true;
  scene.add(ground);

  // Everything on the ground rises together in the build-up; the houses and their things grow out of it.
  const land = new Group();
  const town = new Group();
  scene.add(land, town);

  const addMesh = (geometry: BufferGeometry | null, material: Material, parent: Object3D, cast = true, receive = true) => {
    if (!geometry) return null;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  };

  // Plates on their terraces.
  const plateKeys: ColorKey[] = ['terraceLow', 'terraceHigh', 'plate'];
  [0, 1, 2].forEach((level) => {
    const parts = data.slabs.filter((item) => item.level === level).map((item) => slab(item.outline, item.top, item.thickness, level === 2 ? 3 : 2));
    const geometry = merge(parts, true);
    parts.forEach((part) => part.dispose());
    addMesh(geometry && track(geometry), paint(plateKeys[level]!, { vertexColors: true }), land);
  });
  await step();

  // Water: a grid over the rivers, colored by depth, glossy, with ripples that drift.
  const ripples = rippleTexture();
  textures.push(ripples);
  const waterMaterial = new MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.1, metalness: 0.05, normalMap: ripples, normalScale: new Vector2(0.42, 0.42) });
  materials.push(waterMaterial);
  const water = new Mesh(track(waterGeometry(data.waterGrid, palette)), waterMaterial);
  water.receiveShadow = true;
  land.add(water);

  // Lawns and roads.
  const grassGeometry = merge(data.grass.map((outline) => flat(outline, GROUND + 0.25)));
  addMesh(grassGeometry && track(grassGeometry), paint('grass', { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), land, false);
  const roadGeometry = merge(data.roads.map((road) => ribbon(road, 6.5 * UNIT, GROUND + 0.35)));
  addMesh(roadGeometry && track(roadGeometry), paint('road', { roughness: 0.95, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), land, false);
  await step();

  // The still town, in a few batches: every building and place, bridges, the garden, benches, pools, docks, tables.
  const batches = emptyBatches();
  const { fountainTop } = addGarden(data.garden, batches);
  for (const house of data.houses) {
    const from = { walls: batches.walls.length, roofs: batches.roofs.length, props: batches.props.length, shiny: batches.shiny.length, windows: batches.windows.length };
    addBuilding(house, batches);
    const at: [number, number] = [house.x + house.type.w / 2, house.y + house.type.d / 2];
    for (const key of ['walls', 'roofs', 'props', 'shiny'] as const) for (let k = from[key]; k < batches[key].length; k += 1) anchorOf.set(batches[key][k]!, at);
    for (let k = from.windows; k < batches.windows.length; k += 1) anchorOf.set(batches.windows[k]!, at);
  }
  await step();
  for (const bridge of data.bridges) addBridge(bridge.from, bridge.to, batches);
  for (const bench of data.benches) addBench(bench, batches);
  for (const blanket of data.blankets) addBlanket(blanket, batches);
  for (const pool of data.pools) addPool(pool, batches);
  for (const dock of data.docks) addDock(dock, batches);
  for (const table of data.tables) addTable(table, batches);
  for (const meadow of data.meadows) batches.flats.push({ geometry: flat(meadow, GROUND + 0.32), paint: 'meadow' });
  await step();
  addMesh(tint(batches.walls, true), reactive(plain({ vertexColors: true, roughness: 0.82 }), 'house', 0.12), town);
  await step();
  addMesh(tint(batches.roofs, true), reactive(plain({ vertexColors: true, roughness: 0.72 }), 'house', 0.08), town);
  await step();
  addMesh(tint(batches.props, true), reactive(plain({ vertexColors: true, roughness: 0.62 }), 'house'), town);
  addMesh(tint(batches.shiny, true), reactive(plain({ vertexColors: true, roughness: 0.28, metalness: 0.25 }), 'house'), town);
  addMesh(tint(batches.flats), plain({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), land, false);
  const windowMaterial = reactive(paint('window', { roughness: 0.25, metalness: 0.1, emissiveIntensity: palette.windowGlow }, true), 'house', 0.9);
  // The windows, merged, each with its building's middle (they rise and light up with it).
  const windowGeometry = batches.windows.length
    ? mergeGeometries(batches.windows.map((part) => {
        const at = anchorOf.get(part) ?? nowhere;
        const geometry = normalized(part);
        geometry.setAttribute('reactAnchor', anchorAttribute(geometry.getAttribute('position').count, at));
        return geometry;
      }), false)
    : null;
  // Merged: let go of the parts (the closures here live as long as the town, and this map would keep them all).
  anchorOf.clear();
  addMesh(windowGeometry && track(windowGeometry), windowMaterial, town, false);
  const poolGeometry = merge(batches.pools);
  addMesh(poolGeometry && track(poolGeometry), paint('pool', { roughness: 0.08, metalness: 0.1, normalMap: ripples, normalScale: new Vector2(0.3, 0.3) }), land, false);

  // The windmill's wheel turns.
  const windmill = data.houses.find((house) => house.type.kind === 'windmill');
  const wheel = windmill ? addMesh(tint(windmillWheel()), plain({ vertexColors: true, roughness: 0.6 }), town, false) : null;
  if (wheel && windmill) {
    wheel.position.copy(windmillHub(windmill));
    wheel.rotation.order = 'YXZ';
    wheel.rotation.y = windmillFacing();
  }
  // Where the wheel's tower stands (its middle) and the hub's height: the tower rises near the pointer, and the
  // wheel with it.
  const windmillAt = windmill ? { x: windmill.x + windmill.type.w / 2, z: windmill.y + windmill.type.d / 2 } : null;
  const hubHeight = wheel ? wheel.position.y : GROUND;
  await step();

  const matrix = new Matrix4();
  const local = new Matrix4();
  const quaternion = new Quaternion();
  const scaleVector = new Vector3();
  const euler = new Euler();
  const up = new Vector3(0, 1, 0);
  const scratch = new Vector3();
  const tangent = new Vector3();
  const position = new Vector3();
  const instancedMesh = (geometry: BufferGeometry, material: Material, count: number, parent: Object3D, cast = false) => {
    const mesh = new InstancedMesh(track(geometry), material, Math.max(1, count));
    mesh.count = count;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };

  // Lamps along the roads, and their halos at night.
  const lampHeight = 15 * UNIT;
  const postMesh = instancedMesh(new CylinderGeometry(0.55, 0.8, 1, 6), paint('lampPost', { roughness: 0.6 }), data.lamps.length, town, true);
  const lampHeadMaterial = paint('lampHead', { roughness: 0.3, emissiveIntensity: palette.lampGlow }, true);
  const headMesh = instancedMesh(new SphereGeometry(1, 10, 8), lampHeadMaterial, data.lamps.length, town);
  data.lamps.forEach((lamp, i) => {
    postMesh.setMatrixAt(i, matrix.compose(new Vector3(lamp.at.x, GROUND + lampHeight / 2, lamp.at.y), quaternion.identity(), scaleVector.set(1, lampHeight, 1)));
    headMesh.setMatrixAt(i, matrix.compose(new Vector3(lamp.at.x, GROUND + lampHeight + 1.4, lamp.at.y), quaternion.identity(), scaleVector.set(2.3, 2.3, 2.3)));
  });
  const glow = glowTexture();
  textures.push(glow);
  const haloPositions = new Float32Array(Math.max(1, data.lamps.length) * 3);
  data.lamps.forEach((lamp, i) => haloPositions.set([lamp.at.x, GROUND + lampHeight + 1.4, lamp.at.y], i * 3));
  const haloGeometry = new BufferGeometry();
  haloGeometry.setAttribute('position', new BufferAttribute(haloPositions, 3));
  haloGeometry.setDrawRange(0, data.lamps.length);
  const haloMaterial = new PointsMaterial({ map: glow, size: 46, sizeAttenuation: true, transparent: true, depthWrite: false, blending: AdditiveBlending, color: palette.lampHead, opacity: 0.55 });
  materials.push(haloMaterial);
  const halos = new Points(track(haloGeometry), haloMaterial);
  halos.visible = palette.lampGlow > 0;
  town.add(halos);
  await step();

  // Trees (instanced): round crowns, trunks, conifers' tiers, palms' fronds, agaves and cacti. They grow in a
  // wave from the middle of the town during the build-up; the leaves sway a little (in the shader).
  interface Grown {
    position: Vector3;
    turn: Quaternion;
    scale: Vector3;
    delay: number;
  }
  const crowns: (Grown & { tone: number })[] = [];
  const trunks: Grown[] = [];
  const cones: Grown[] = [];
  const fronds: Grown[] = [];
  const agaves: Grown[] = [];
  const cacti: Grown[] = [];
  /** Spanish moss hanging from Florida's live oaks (and some of its round oaks). */
  const moss: Grown[] = [];
  const middle = view.target;
  const still = new Quaternion();
  data.trees.forEach((tree, index) => {
    const s = tree.scale * UNIT;
    const delay = Math.min(1, Math.hypot(tree.x - middle.x, tree.y - middle.z) / 2200);
    const at = (dx: number, dy: number, dz: number) => new Vector3(tree.x + dx * s, GROUND + dy * s, tree.y + dz * s);
    const spin = new Quaternion().setFromAxisAngle(up, (index * 2.39996) % (Math.PI * 2));
    const trunk = (height: number, radius: number, turn = still) => trunks.push({ position: at(0, height / 2, 0), turn, scale: new Vector3(radius * s, height * s, radius * s), delay });
    const crown = (dx: number, dy: number, dz: number, rx: number, ry = rx) => crowns.push({ position: at(dx, dy, dz), turn: spin, scale: new Vector3(rx * s, ry * s, rx * s), tone: tree.tone, delay });
    /** Strands of moss hanging from under a crown (its middle and radius), a few around it. */
    const drape = (dx: number, dy: number, dz: number, r: number, strands: number) => {
      for (let k = 0; k < strands; k += 1) {
        const angle = (k / strands) * Math.PI * 2 + index * 0.7;
        const length = 12 + ((index + k * 3) % 4) * 2;
        const x = dx + Math.cos(angle) * r * 0.74;
        const z = dz + Math.sin(angle) * r * 0.74;
        // Two strands, one shorter beside the other: a wisp rather than a spike.
        moss.push({ position: at(x, dy - r * 0.42, z), turn: spin, scale: new Vector3(1.45 * s, length * s, 1.45 * s), delay });
        moss.push({ position: at(x + Math.sin(angle) * 1.7, dy - r * 0.4, z - Math.cos(angle) * 1.7), turn: spin, scale: new Vector3(1.05 * s, length * 0.68 * s, 1.05 * s), delay });
      }
    };
    switch (tree.variant) {
      case 0:
        trunk(10, 1.7);
        crown(0, 19, 0, 11, 10.4);
        if (florida && index % 3 === 0) drape(0, 19, 0, 11, 3);
        break;
      case 1:
        trunk(8, 1.6);
        crown(-5, 15, 2, 8);
        crown(5, 15.5, -2, 8.5);
        crown(0, 22.5, 0, 9);
        break;
      case 2:
        trunk(6, 1.4);
        crown(0, 21, 0, 6.6, 16);
        break;
      case 3:
        trunk(13, 2.3);
        crown(-9, 23, 3, 12.5);
        crown(9, 23.5, -3, 12.5);
        crown(0, 34, 0, 13.5);
        crown(2, 26, 9, 10);
        // A live oak in Florida: Spanish moss hangs from its spreading limbs.
        if (florida) {
          drape(-9, 23, 3, 12.5, 4);
          drape(9, 23.5, -3, 12.5, 4);
          drape(2, 26, 9, 10, 3);
        }
        break;
      case 4:
        if (florida) {
          // A tall pine (longleaf, slash): a long bare trunk and a small tufted crown up top.
          trunk(24, 1.1);
          for (const [y, r, h] of [[25, 7, 8], [29, 5.6, 7], [32.5, 3.6, 5.5]] as const) cones.push({ position: at(0, y, 0), turn: spin, scale: new Vector3(r * s, h * s, r * s), delay });
          break;
        }
        trunk(6, 1.3);
        for (const [y, r, h] of [[12, 9, 15], [19.5, 7, 12.5], [26, 5, 10]] as const) cones.push({ position: at(0, y, 0), turn: spin, scale: new Vector3(r * s, h * s, r * s), delay });
        break;
      case 5: {
        // A palm: a slim trunk leaning a little, and fronds arching out from its top.
        const leanAngle = 0.1 + (index % 5) * 0.03;
        const leanTurn = new Quaternion().setFromEuler(new Euler(0, (index * 1.7) % (Math.PI * 2), leanAngle, 'YXZ'));
        const height = 30;
        const top = new Vector3(0, height, 0).applyQuaternion(leanTurn);
        trunks.push({ position: at(top.x / 2, top.y / 2, top.z / 2), turn: leanTurn, scale: new Vector3(1.15 * s, height * s, 1.15 * s), delay });
        for (let k = 0; k < 7; k += 1) {
          const turn = new Quaternion().setFromAxisAngle(up, (k / 7) * Math.PI * 2 + index);
          fronds.push({ position: at(top.x, top.y, top.z), turn, scale: new Vector3(13 * s, 13 * s, 13 * s), delay });
        }
        break;
      }
      case 6:
        // An agave; in Florida, saw palmetto: wider and lower, in a clump (the palette makes it green).
        if (florida) {
          agaves.push({ position: at(0, 0, 0), turn: spin, scale: new Vector3(9 * s, 4.6 * s, 9 * s), delay });
          agaves.push({ position: at(6.5, 0, 3), turn: spin, scale: new Vector3(6.5 * s, 3.6 * s, 6.5 * s), delay });
        } else agaves.push({ position: at(0, 0, 0), turn: spin, scale: new Vector3(7 * s, 6 * s, 7 * s), delay });
        break;
      case 7:
        cacti.push({ position: at(0, 0, 0), turn: spin, scale: new Vector3(15 * s, 15 * s, 15 * s), delay });
        break;
    }
  });
  const leafMaterial = plain({ roughness: 0.78 });
  const swayTime = { value: 0 };
  leafMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayTime;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 rootAt = instanceMatrix[3].xyz;
        float phase = rootAt.x * 0.013 + rootAt.z * 0.011;
        float sway = sin(uTime * 1.25 + phase) * 0.05 + sin(uTime * 2.05 + phase * 1.7) * 0.02;
        transformed.x += sway * (position.y + 1.0);
        transformed.z += sway * 0.6 * (position.y + 1.0);
      #endif`,
    );
  };
  leafMaterial.customProgramCacheKey = () => 'leaf-sway';
  // Every part of a tree leans the same way from the pointer (crowns, trunks, fronds, moss), so none comes apart.
  const crownMesh = instancedMesh(crownGeometry(), reactive(leafMaterial, 'tree'), crowns.length, scene, true);
  const trunkMesh = instancedMesh(new CylinderGeometry(0.7, 1, 1, 6), reactive(paint('trunk', { roughness: 0.9 }), 'tree'), trunks.length, scene, true);
  const coneMesh = instancedMesh(coneGeometry(), reactive(paint('conifer', { roughness: 0.8 }), 'tree'), cones.length, scene, true);
  const frondMesh = instancedMesh(frondGeometry(), reactive(paint('palm', { roughness: 0.75, side: DoubleSide }), 'tree'), fronds.length, scene, true);
  const agaveMesh = instancedMesh(agaveGeometry(), reactive(paint('agave', { roughness: 0.7 }), 'tree'), agaves.length, scene, true);
  const cactusMesh = instancedMesh(cactusGeometry(), reactive(paint('cactus', { roughness: 0.75 }), 'tree'), cacti.length, scene, true);
  // Spanish moss: thin strands hanging from their top (the strand's tip sways, its top stays put).
  const mossMaterial = paint('moss', { roughness: 0.95 });
  mossMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayTime;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 rootAt = instanceMatrix[3].xyz;
        float phase = rootAt.x * 0.017 + rootAt.z * 0.013;
        float sway = sin(uTime * 0.9 + phase) * 0.12;
        transformed.x += sway * -position.y;
        transformed.z += sway * 0.5 * -position.y;
      #endif`,
    );
  };
  mossMaterial.customProgramCacheKey = () => 'moss-sway';
  reactive(mossMaterial, 'tree');
  const strand = new ConeGeometry(1, 1, 5, 1);
  strand.rotateX(Math.PI);
  strand.translate(0, -0.5, 0);
  const mossMesh = instancedMesh(strand, mossMaterial, moss.length, scene);
  const grownSets: [InstancedMesh, Grown[], boolean][] = [
    [crownMesh, crowns, true],
    [trunkMesh, trunks, false],
    [coneMesh, cones, true],
    [frondMesh, fronds, true],
    [agaveMesh, agaves, true],
    [cactusMesh, cacti, true],
    [mossMesh, moss, false],
  ];
  for (const [mesh] of grownSets) mesh.receiveShadow = true;
  const crownColor = (tone: number) => (tone >= 6 ? palette.autumn[(tone - 6) % palette.autumn.length]! : tone >= 4 ? palette.blossoms[(tone - 4) % palette.blossoms.length]! : palette.leaves[tone % palette.leaves.length]!);
  const tintCrowns = () => {
    crowns.forEach((crown, i) => {
      color.set(crownColor(crown.tone));
      color.offsetHSL(0, 0, ((i * 37) % 11) / 200 - 0.025);
      crownMesh.setColorAt(i, color);
    });
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  };
  /** Trees grow in a wave from the middle of the town during the build-up (`grow` 0–1 overall). */
  const placeTrees = (grow: number) => {
    for (const [mesh, items, bouncy] of grownSets) {
      items.forEach((item, i) => {
        const s = grow >= 1 ? 1 : (bouncy ? easeOutBack : easeOut)((grow - item.delay * 0.55) / 0.45);
        mesh.setMatrixAt(i, matrix.compose(item.position, item.turn, scaleVector.copy(item.scale).multiplyScalar(Math.max(0.0001, s))));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  tintCrowns();
  placeTrees(1);
  await step();

  // Flowers in the beds and the garden, and bluebonnets on the lawns.
  const flowerSpots: { at: { x: number; y: number }; tone: number; size: number }[] = data.flowers.map((flower) => ({ ...flower, size: 1 }));
  for (let k = 0; k < 80; k += 1) {
    const angle = k * 2.39996;
    const radius = Math.sqrt((k + 0.5) / 80) * (data.garden.r - 17 * UNIT);
    if (radius < 13 * UNIT) continue;
    flowerSpots.push({ at: { x: data.garden.at.x + Math.cos(angle) * radius, y: data.garden.at.y + Math.sin(angle) * radius }, tone: k % 4, size: 1 });
  }
  for (const at of data.bluebonnets) flowerSpots.push({ at, tone: -1, size: 0.56 });
  const flowerMesh = instancedMesh(new SphereGeometry(1.8 * UNIT, 6, 4), plain({ roughness: 0.6 }), flowerSpots.length, town);
  flowerSpots.forEach((flower, i) => flowerMesh.setMatrixAt(i, matrix.compose(new Vector3(flower.at.x, GROUND + 2.2 * flower.size, flower.at.y), quaternion.identity(), scaleVector.set(flower.size, flower.size * (flower.tone < 0 ? 1.3 : 1), flower.size))));

  // The fountain: drops that rise and fall.
  const dropCount = 14;
  const drops = instancedMesh(new SphereGeometry(1, 6, 4), paint('waterShallow', { roughness: 0.1, metalness: 0.1 }), dropCount, town);

  // The dotted way to the first pin: dots that light up one after another.
  const routeCurve = new CatmullRomCurve3(data.route.map((point) => new Vector3(point.x, GROUND + 4, point.y)));
  const routeDots = Math.max(2, Math.floor(routeCurve.getLength() / (13 * UNIT)));
  const routeMesh = instancedMesh(new SphereGeometry(3.4 * UNIT, 10, 8), paint('route', { roughness: 0.4, emissiveIntensity: 0.3 }, true), routeDots, town);
  const routePoints = Array.from({ length: routeDots }, (_, i) => routeCurve.getPointAt(i / (routeDots - 1)));

  // Pins and their rings (instanced; colored when the page supplies its tasks; a quieted pin fades).
  const PIN = PIN_SCALE;
  const slotCount = data.slots.length;
  const pinHead = new SphereGeometry(8 * PIN, 28, 18);
  pinHead.translate(0, PIN_HEAD * PIN, 0);
  const pinTip = new ConeGeometry(6 * PIN, 13 * PIN, 28, 1);
  pinTip.rotateX(Math.PI);
  pinTip.translate(0, 4.5 * PIN, 0);
  const pinBodyGeometry = mergeGeometries([normalized(pinHead), normalized(pinTip)], false);
  const pinAlpha = new InstancedBufferAttribute(new Float32Array(slotCount).fill(1), 1);
  pinBodyGeometry.setAttribute('instanceAlpha', pinAlpha);
  const pinMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.05, transparent: true });
  withInstanceAlpha(pinMaterial, 0.14);
  materials.push(pinMaterial);
  const pinBodies = instancedMesh(pinBodyGeometry, pinMaterial, slotCount, scene);
  const pinDotGeometry = new SphereGeometry(3.4 * PIN, 16, 12);
  pinDotGeometry.translate(3.9 * PIN, 16 * PIN, 3.9 * PIN);
  const dotAlpha = new InstancedBufferAttribute(new Float32Array(slotCount).fill(1), 1);
  pinDotGeometry.setAttribute('instanceAlpha', dotAlpha);
  const dotMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, transparent: true });
  withInstanceAlpha(dotMaterial);
  materials.push(dotMaterial);
  const pinDots = instancedMesh(pinDotGeometry, dotMaterial, slotCount, scene);
  const ringGeometry = new RingGeometry(0.86, 1, 64);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringAlpha = new InstancedBufferAttribute(new Float32Array(slotCount * 2), 1);
  ringGeometry.setAttribute('instanceAlpha', ringAlpha);
  const ringMaterial = new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false });
  withInstanceAlpha(ringMaterial);
  materials.push(ringMaterial);
  const rings = instancedMesh(ringGeometry, ringMaterial, slotCount * 2, scene);
  rings.renderOrder = 2;
  // Colored per instance from the start, so their shaders are the ones compiled ahead (a color added later
  // would ask for another shader on the next frame).
  for (let i = 0; i < slotCount; i += 1) {
    pinBodies.setColorAt(i, whiten);
    pinDots.setColorAt(i, whiten);
    rings.setColorAt(i * 2, whiten);
    rings.setColorAt(i * 2 + 1, whiten);
  }
  const pinState: (TownPin | null)[] = data.slots.map(() => null);
  /** How lit each pin is (0–1), on a spring, and its speed: it eases in and out, never jumps. */
  const pinLift = data.slots.map(() => 0);
  const pinLiftSpeed = data.slots.map(() => 0);
  /** How present each pin is (1, or about a third when another category is picked), eased. */
  const pinPresence = data.slots.map(() => 1);
  /** Each pin's rings' own clock: it runs a little faster while lit, without the rings jumping. */
  const ringPhase = data.slots.map((_, index) => (index * 0.37) % 1);
  const pinY = data.slots.map((slot) => slot.height + PIN_LIFT);
  const pinTop = new Vector3();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  await step();

  // ---- Things that move -------------------------------------------------------------------------------

  const moving = data.movers.map((mover) => ({ mover, curve: new CatmullRomCurve3(mover.path.map((point) => new Vector3(point.x, 0, point.y))) }));
  const ofKind = (kind: string) => moving.filter((item) => item.mover.kind === kind);
  const cars = ofKind('car');
  const bikes = ofKind('bike');
  const boats = ofKind('boat');
  const sails = ofKind('sail');
  const kayaks = ofKind('kayak');

  // Cars (moving and parked): bodies colored per car, cabins that glow at night, wheels.
  const carTotal = cars.length + data.parked.length;
  const carBodies = instancedMesh(new RoundedBoxGeometry(22, 7, 11, 2, 2.6), plain({ roughness: 0.35, metalness: 0.1 }), carTotal, town);
  const moverWindows = paint('window', { roughness: 0.2, metalness: 0.2, emissiveIntensity: palette.windowGlow * 0.4 }, true);
  const carCabins = instancedMesh(new RoundedBoxGeometry(12, 6, 9.6, 2, 2.2), moverWindows, carTotal, town);
  const carWheel = new CylinderGeometry(2.7, 2.7, 1.8, 12);
  carWheel.rotateX(Math.PI / 2);
  const carWheels = instancedMesh(carWheel, paint('tyre', { roughness: 0.8 }), carTotal * 4, town);
  const carParts = { body: new Matrix4().makeTranslation(0, 5.6, 0), cabin: new Matrix4().makeTranslation(-1.5, 11, 0), wheels: [-7, 7].flatMap((x) => [-5.2, 5.2].map((z) => new Matrix4().makeTranslation(x, 2.7, z))) };
  const placeCar = (index: number, world: Matrix4) => {
    carBodies.setMatrixAt(index, local.multiplyMatrices(world, carParts.body));
    carCabins.setMatrixAt(index, local.multiplyMatrices(world, carParts.cabin));
    carParts.wheels.forEach((wheelAt, k) => carWheels.setMatrixAt(index * 4 + k, local.multiplyMatrices(world, wheelAt)));
  };
  data.parked.forEach((car, i) => {
    quaternion.setFromAxisAngle(up, -car.angle);
    placeCar(cars.length + i, matrix.compose(scratch.set(car.at.x, GROUND + 0.4, car.at.y), quaternion, scaleVector.setScalar(1.1 * UNIT)));
  });

  // Bikes (frames and wheels; a crate on the cargo bike), boats, the sailboat, kayaks and their paddles.
  const bikeMesh = instancedMesh(tint(bikeParts())!, plain({ vertexColors: true, roughness: 0.6 }), bikes.length, town);
  const crateMesh = instancedMesh(new BoxGeometry(5.6, 5, 6), paint('crate', { roughness: 0.6 }), bikes.length, town);
  const crateAt = new Matrix4().makeTranslation(-6.4, 9.6, 0);
  const boatMesh = instancedMesh(tint(boatParts())!, plain({ vertexColors: true, roughness: 0.3 }), boats.length, town);
  const wake = wakeTexture();
  textures.push(wake);
  const wakeMaterial = new MeshBasicMaterial({ map: wake, transparent: true, depthWrite: false, opacity: 0.85 });
  materials.push(wakeMaterial);
  const wakeGeometry = new PlaneGeometry(70, 30);
  wakeGeometry.rotateX(-Math.PI / 2);
  wakeGeometry.translate(-44, 0.8, 0);
  const wakeMesh = instancedMesh(wakeGeometry, wakeMaterial, boats.length, town);
  const sailMesh = instancedMesh(tint(sailParts())!, plain({ vertexColors: true, roughness: 0.55, side: DoubleSide }), sails.length, town);
  const kayakTotal = kayaks.length + data.moored.length;
  const kayakMesh = instancedMesh(kayakGeometry(), plain({ roughness: 0.4 }), kayakTotal, town);
  const paddle = new BoxGeometry(0.5, 0.5, 15);
  const paddleBlades = [-7.5, 7.5].map((z) => {
    const blade = new BoxGeometry(0.4, 2.6, 1.6);
    blade.translate(0, 0, z);
    return blade;
  });
  const paddleGeometry = merge([paddle, ...paddleBlades])!;
  const paddleMesh = instancedMesh(paddleGeometry, paint('ink', { roughness: 0.6 }), kayaks.length, town);
  const kayakScale = 1.25 * UNIT;
  data.moored.forEach((boat, i) => {
    quaternion.setFromAxisAngle(up, -boat.angle);
    kayakMesh.setMatrixAt(kayaks.length + i, matrix.compose(scratch.set(boat.at.x, WATER_LEVEL + 0.2, boat.at.y), quaternion, scaleVector.setScalar(kayakScale)));
  });

  // Hot-air balloons, high above (one mesh each: striped envelope, basket and ropes).
  const balloonSize = 46;
  const balloonMaterial = plain({ vertexColors: true, roughness: 0.55 });
  const balloons = data.balloons.map((balloon) => addMesh(tint(balloonParts(balloon.tone)), balloonMaterial, scene, false, false)!);
  await step();

  // The vignettes: one merged mesh each, placed into the pins' yards (by the pins' categories when known).
  const vignettes = VIGNETTE_KINDS.map((kind) => {
    const built = vignette(kind);
    const mesh = addMesh(tint(built.parts), plain({ vertexColors: true, roughness: 0.66 }), town)!;
    mesh.visible = false;
    return { kind, mesh, crew: built.crew, yard: -1, placement: new Matrix4() };
  });
  const yardSlots = data.yards.map((yard) => data.slots.find((slot) => slot.id === yard.slotId));
  const placeVignettes = (pins: (TownPin | null)[]) => {
    const used = new Set<VignetteKind>();
    const chosen: (VignetteKind | null)[] = data.yards.map((yard) => {
      const pin = pins.find((item) => item?.slotId === yard.slotId);
      const kind = VIGNETTE_KINDS.find((item) => item === pin?.category);
      if (kind && !used.has(kind)) {
        used.add(kind);
        return kind;
      }
      return null;
    });
    chosen.forEach((kind, index) => {
      if (kind) return;
      const next = VIGNETTE_KINDS.find((item) => !used.has(item));
      if (next) {
        used.add(next);
        chosen[index] = next;
      }
    });
    let moved = false;
    for (const item of vignettes) {
      const yard = chosen.indexOf(item.kind);
      if (yard === item.yard) continue;
      moved = true;
      item.yard = yard;
      item.mesh.visible = yard >= 0;
      if (yard < 0) continue;
      const spot = data.yards[yard]!;
      const house = yardSlots[yard];
      const cx = spot.x + spot.w / 2;
      const cz = spot.y + spot.d / 2;
      // Local -x points at the house (snapped to the axes, so the vignette stays inside its yard).
      const raw = house ? Math.atan2(house.at.y - cz, -(house.at.x - cx)) : 0;
      const angle = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2);
      item.placement.compose(new Vector3(cx, GROUND, cz), new Quaternion().setFromAxisAngle(up, angle), new Vector3(1, 1, 1));
      item.mesh.position.set(cx, GROUND, cz);
      item.mesh.rotation.set(0, angle, 0);
    }
    if (moved) renderer.shadowMap.needsUpdate = true;
  };
  placeVignettes(pinState);
  await step();

  // People (instanced: one draw call for bodies, one for heads): walkers, people at tables and stalls, riders,
  // kayakers and the vignettes' crews. Handheld things (a carried box, a rake) are one more.
  const walkerCurves = data.walkers.map((walker) => new CatmullRomCurve3(walker.path.map((point) => new Vector3(point.x, GROUND, point.y))));
  const crewList: { vignette: (typeof vignettes)[number]; member: Crew }[] = vignettes.flatMap((item) => item.crew.map((member) => ({ vignette: item, member })));
  const walkerStart = 0;
  const idleStart = walkerStart + data.walkers.length;
  const riderStart = idleStart + data.idle.length;
  const paddlerStart = riderStart + bikes.length;
  const crewStart = paddlerStart + kayaks.length;
  const peopleCount = crewStart + crewList.length;
  const bodyMesh = instancedMesh(new CapsuleGeometry(2.4, 6.5, 3, 6), plain({ roughness: 0.6 }), peopleCount, town);
  const skin = paint('skin', { roughness: 0.7 });
  const headMeshes = instancedMesh(new SphereGeometry(2.4, 8, 6), skin, peopleCount, town);
  const tones: number[] = [...data.walkers.map((walker) => walker.tone), ...data.idle.map((person) => person.tone), ...bikes.map((bike) => bike.mover.tone), ...kayaks.map((kayak) => kayak.mover.tone + 1), ...crewList.map((entry) => entry.member.tone)];
  const handheldCount = crewList.filter((entry) => (entry.member.motion === 'carry' && !entry.member.partner) || entry.member.motion === 'rake').length;
  const handheldMesh = instancedMesh(new BoxGeometry(1, 1, 1), plain({ roughness: 0.7 }), handheldCount, town);
  const handheldPaint: ColorKey[] = crewList.flatMap((entry) => (entry.member.motion === 'carry' && !entry.member.partner ? ['cardboard' as const] : entry.member.motion === 'rake' ? ['wood' as const] : []));
  /** Places person `i`: feet at (x, y, z), facing `yaw`, `s` their size; sitting and kneeling people are lower. */
  const placePerson = (i: number, x: number, y: number, z: number, yaw: number, s: number, pose: 'stand' | 'sit' | 'kneel' = 'stand', lean = 0) => {
    const squat = pose === 'sit' ? 0.72 : pose === 'kneel' ? 0.62 : 1;
    euler.set(0, yaw, lean, 'YXZ');
    quaternion.setFromEuler(euler);
    bodyMesh.setMatrixAt(i, matrix.compose(scratch.set(x, y + 6.4 * s * squat, z), quaternion, scaleVector.set(s, s * squat, s)));
    headMeshes.setMatrixAt(i, matrix.compose(scratch.set(x - Math.sin(lean) * 4 * s * Math.cos(yaw), y + (14 * squat + 0.6 * (1 - squat)) * s, z + Math.sin(lean) * 4 * s * Math.sin(yaw)), quaternion, scaleVector.set(s, s, s)));
  };

  // Birds, high above (instanced; they flap by narrowing their wingspan).
  const birdMesh = instancedMesh(birdGeometry(), paint('bird', { roughness: 0.8, side: DoubleSide }), data.birds.length, scene);

  /** The colors that live per instance (they follow the theme too). */
  const tintInstances = () => {
    flowerSpots.forEach((flower, i) => flowerMesh.setColorAt(i, color.set(flower.tone < 0 ? palette.bluebonnet : palette.flowers[flower.tone % palette.flowers.length]!)));
    if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
    tones.forEach((tone, i) => bodyMesh.setColorAt(i, color.set(palette.shirts[tone % palette.shirts.length]!)));
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < carTotal; i += 1) carBodies.setColorAt(i, color.set(palette.cars[(i < cars.length ? cars[i]!.mover.tone : data.parked[i - cars.length]!.tone) % palette.cars.length]!));
    if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
    for (let i = 0; i < kayakTotal; i += 1) kayakMesh.setColorAt(i, color.set(palette.kayaks[(i < kayaks.length ? kayaks[i]!.mover.tone : data.moored[i - kayaks.length]!.tone) % palette.kayaks.length]!));
    if (kayakMesh.instanceColor) kayakMesh.instanceColor.needsUpdate = true;
    handheldPaint.forEach((key, i) => handheldMesh.setColorAt(i, color.set(palette[key])));
    if (handheldMesh.instanceColor) handheldMesh.instanceColor.needsUpdate = true;
  };
  tintInstances();
  await step();

  // ---- Frame loop ------------------------------------------------------------------------------------------

  let frame = 0;
  let running = false;
  let last = 0;
  let clock = 0;
  // Without the build-up the town is complete from its first frame.
  let intro = options.buildUp ? 0 : INTRO;
  let introDone = !options.buildUp;
  let shadowAge = 0;
  const pointer = { x: 0, y: 0, active: false };
  const look = { yaw: 0, pitch: 0, tilt: 0, goalTilt: 0, goalYaw: 0, goalPitch: 0, dive: 0, drawnDive: 0 };
  /** The slot the camera dives at (`setDive`), or -1. */
  let diveIndex = -1;
  let afterFrame: (() => void) | null = null;
  /** The pointer over the town (canvas -1..1) and where it touches the ground, followed softly, fading in and out. */
  const hover = { x: 0, y: 0, active: false };
  const react = { x: 0, z: 0, goalX: 0, goalZ: 0, strength: 0, goal: 0, known: false };
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), -GROUND);
  const hoverAt = new Vector2();
  const touched = new Vector3();
  /** How near the pointer is to a spot on the ground (0–1, eased out at `reach`; 0 without a pointer). */
  const nearPointer = (x: number, z: number, reach: number) => (react.strength <= 0 ? 0 : nearness(react.strength, Math.hypot(react.x - x, react.z - z), reach));
  /** Someone at (x, z) facing `yaw` turns toward the pointer (`share` of the way at most: walkers only glance). */
  const lookToPointer = (x: number, z: number, yaw: number, near: number, share: number) => turnToward(yaw, x, z, react.x, react.z, near, share);

  const placeCamera = () => {
    // Scrolling away tilts the camera toward a view from above and pulls it back: the town becomes a map.
    const pose = cameraPose(look.yaw, look.pitch, look.tilt, 1 + look.tilt * 0.5, view);
    // Diving at a pin: the camera and its target move together along the line to the pin's top, so the pin keeps its
    // place on the screen and everything around it grows.
    let shiftX = 0;
    let shiftY = 0;
    let shiftZ = 0;
    const diveSlot = diveIndex >= 0 ? data.slots[diveIndex] : undefined;
    if (diveSlot && look.dive > 0) {
      const reach = look.dive * DIVE_REACH;
      shiftX = (diveSlot.at.x - pose.position.x) * reach;
      shiftY = (diveSlot.height + PIN_LIFT + (PIN_HEAD + 8) * PIN - pose.position.y) * reach;
      shiftZ = (diveSlot.at.y - pose.position.z) * reach;
    }
    camera.position.set(pose.position.x + shiftX, pose.position.y + shiftY, pose.position.z + shiftZ);
    camera.lookAt(pose.target.x + shiftX, pose.target.y + shiftY, pose.target.z + shiftZ);
    camera.updateMatrixWorld();
    look.drawnDive = look.dive;
  };

  /**
   * The build-up (`BUILD_UP`), from the skeleton's state: the land is already in place under the resting camera
   * (the skeleton drawn on the page is that land), then the houses grow, the trees pop up in a wave from the
   * middle, the pins drop in, and the things that move fade in.
   */
  const applyIntro = () => {
    const t = introDone ? 1 : clamp01(intro / INTRO);
    const grow = t >= 1 ? 1 : easeOutBack(phase(BUILD_UP.houses, t));
    town.scale.y = Math.max(0.0001, Math.min(1.08, grow));
    town.position.y = GROUND * (1 - town.scale.y);
    placeTrees(t >= 1 ? 1 : phase(BUILD_UP.trees, t));
  };

  // The lean is compared with its whole goal (the slow drift included: compared with the pointer's part alone, a
  // drifting camera counted as settling for good, and the town drew at 60 frames a second whenever a mouse was over
  // the page); the pointer's reaction counts while it fades in or out or follows a move.
  const isSettling = () =>
    !introDone ||
    look.dive !== look.drawnDive ||
    Math.abs(look.goalTilt - look.tilt) > 0.002 ||
    Math.abs(look.goalYaw - look.yaw) > 0.03 ||
    Math.abs(look.goalPitch - look.pitch) > 0.03 ||
    Math.abs(react.goal - react.strength) > 0.01 ||
    (react.strength > 0.01 && Math.abs(react.goalX - react.x) + Math.abs(react.goalZ - react.z) > 3) ||
    // A pin lifting or settling (its spring), or fading with a category pick: drawn at 60 frames a second.
    pinState.some((state, index) => Math.abs(Math.max(state?.lit ? 1 : 0, nearPointer(data.slots[index]!.at.x, data.slots[index]!.at.y, PIN_REACH) * 0.75) - pinLift[index]!) > 0.004 || Math.abs(pinLiftSpeed[index]!) > 0.02 || Math.abs((state?.dim ? 0.35 : 1) - pinPresence[index]!) > 0.01);

  /** The last `moverAt`'s fade (0–1): its matrix is returned, the fade kept here (no object a call, every frame). */
  let moverFade = 0;
  /** Where a mover is along its path (with a fade at either end), as a matrix (`out`). */
  const moverAt = (item: (typeof moving)[number], level: number, size: number, appear: number, out: Matrix4, bob = 0) => {
    const u = (item.mover.phase + clock / item.mover.duration) % 1;
    item.curve.getPointAt(u, position);
    item.curve.getTangentAt(Math.min(0.999, u), tangent);
    const yaw = Math.atan2(-tangent.z, tangent.x);
    moverFade = smooth(0, 0.04, u) * smooth(1, 0.95, u) * appear;
    euler.set(bob, yaw, 0, 'YXZ');
    quaternion.setFromEuler(euler);
    return out.compose(scratch.set(position.x, level, position.z), quaternion, scaleVector.setScalar(size * Math.max(0.0001, moverFade)));
  };
  const moverMeshes = () => [carBodies, carCabins, carWheels, bikeMesh, crateMesh, boatMesh, wakeMesh, sailMesh, kayakMesh, paddleMesh];
  let movers: InstancedMesh[] | null = null;
  const moverMatrix = new Matrix4();
  const partMatrix = new Matrix4();
  const riderBody = new Matrix4().compose(new Vector3(-0.6, 12, 0), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.35), new Vector3(0.88, 0.8, 0.88));
  const riderHead = new Matrix4().compose(new Vector3(1.4, 17.6, 0), new Quaternion(), new Vector3(0.96, 0.96, 0.96));
  const paddlerBody = new Matrix4().compose(new Vector3(0, 4.6, 0), new Quaternion(), new Vector3(0.62, 0.5, 0.62));
  const paddlerHead = new Matrix4().compose(new Vector3(0, 8.6, 0), new Quaternion(), new Vector3(0.62, 0.62, 0.62));

  const update = (dt: number) => {
    clock += dt;
    if (!introDone) {
      intro += dt;
      if (intro >= INTRO) introDone = true;
      applyIntro();
      // The shadows follow the build-up a few times a second, and are drawn once more as it ends.
      shadowAge += dt;
      if (introDone || shadowAge >= 0.1) {
        shadowAge = 0;
        renderer.shadowMap.needsUpdate = true;
      }
    }
    swayTime.value = clock;
    // The camera holds still while the town builds up (it grows out of the skeleton drawn from this very view),
    // then leans toward the pointer and drifts a little.
    const lean = pointer.active && introDone && look.dive === 0;
    look.goalYaw = (lean ? pointer.x * 2.4 : 0) + (introDone ? Math.sin(clock * 0.09) * 0.6 : 0);
    look.goalPitch = (lean ? -pointer.y * 1.4 : 0) + (introDone ? Math.sin(clock * 0.07 + 1) * 0.3 : 0);
    const ease = 1 - Math.exp(-dt * 2.4);
    look.yaw += (look.goalYaw - look.yaw) * ease;
    look.pitch += (look.goalPitch - look.pitch) * ease;
    look.tilt += (look.goalTilt - look.tilt) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 7));
    placeCamera();

    // Where the pointer touches the town: one ray to the ground plane (no meshes tested), followed softly; the town's
    // reaction fades in over it and out when it leaves (not while the town builds up, or seen from too far above).
    react.goal = 0;
    if (hover.active && introDone && look.tilt < 0.85 && look.dive === 0) {
      raycaster.setFromCamera(hoverAt.set(hover.x, hover.y), camera);
      if (raycaster.ray.intersectPlane(groundPlane, touched)) {
        react.goalX = touched.x;
        react.goalZ = touched.z;
        react.goal = 1;
        if (!react.known) {
          react.x = touched.x;
          react.z = touched.z;
          react.known = true;
        }
      }
    }
    const follow = dt === 0 ? 1 : 1 - Math.exp(-dt * 10);
    react.x += (react.goalX - react.x) * follow;
    react.z += (react.goalZ - react.z) * follow;
    react.strength += (react.goal - react.strength) * (dt === 0 ? 1 : 1 - Math.exp(-dt * (react.goal > react.strength ? 5 : 3)));
    if (react.goal === 0 && react.strength < 0.003) {
      react.strength = 0;
      react.known = false;
    }
    reactAt.value.set(react.x, react.z, react.strength);

    ripples.offset.set((clock * 0.011) % 1, (clock * 0.017) % 1);
    const appear = introDone ? 1 : smooth(0, 1, phase(BUILD_UP.movers, intro / INTRO));

    // Cars and bikes on the roads, boats and kayaks on the river.
    cars.forEach((item, i) => placeCar(i, moverAt(item, GROUND + 0.4, 1.1 * UNIT, appear, moverMatrix)));
    bikes.forEach((item, i) => {
      const world = moverAt(item, GROUND + 0.4, 1.45 * UNIT, appear, moverMatrix);
      const fade = moverFade;
      bikeMesh.setMatrixAt(i, world);
      crateMesh.setMatrixAt(i, item.mover.tone === 1 ? partMatrix.multiplyMatrices(world, crateAt) : hidden);
      const person = riderStart + i;
      bodyMesh.setMatrixAt(person, partMatrix.multiplyMatrices(world, riderBody));
      headMeshes.setMatrixAt(person, partMatrix.multiplyMatrices(world, riderHead));
      if (fade < 0.01) {
        bodyMesh.setMatrixAt(person, hidden);
        headMeshes.setMatrixAt(person, hidden);
      }
    });
    boats.forEach((item, i) => {
      const world = moverAt(item, WATER_LEVEL + Math.sin(clock * 2.1 + item.mover.phase * 9) * 0.4, 1.55 * UNIT, appear, moverMatrix, Math.sin(clock * 1.4 + item.mover.phase * 7) * 0.035);
      boatMesh.setMatrixAt(i, world);
      wakeMesh.setMatrixAt(i, world);
    });
    sails.forEach((item, i) => sailMesh.setMatrixAt(i, moverAt(item, WATER_LEVEL + Math.sin(clock * 1.7 + 2) * 0.4, 1.6 * UNIT, appear, moverMatrix, Math.sin(clock * 1.1 + 1) * 0.04)));
    kayaks.forEach((item, i) => {
      const world = moverAt(item, WATER_LEVEL + 0.3 + Math.sin(clock * 2.6 + i) * 0.25, kayakScale, appear, moverMatrix);
      kayakMesh.setMatrixAt(i, world);
      const stroke = Math.sin(clock * 3.2 + i * 1.3);
      euler.set(stroke * 0.55, stroke * 0.25, 0, 'YXZ');
      partMatrix.compose(scratch.set(0, 6.4, 0), quaternion.setFromEuler(euler), scaleVector.set(1, 1, 1));
      paddleMesh.setMatrixAt(i, local.multiplyMatrices(world, partMatrix));
      bodyMesh.setMatrixAt(paddlerStart + i, partMatrix.multiplyMatrices(world, paddlerBody));
      headMeshes.setMatrixAt(paddlerStart + i, partMatrix.multiplyMatrices(world, paddlerHead));
    });
    movers ??= moverMeshes();
    for (const mesh of movers) mesh.instanceMatrix.needsUpdate = true;

    // People: walkers there and back, people at tables and stalls, the vignettes' crews at work.
    const size = Math.max(0.0001, appear) * UNIT * 0.9;
    data.walkers.forEach((walker, i) => {
      const curve = walkerCurves[i]!;
      const cycle = (walker.phase * 2 + clock / walker.duration) % 2;
      const u = Math.min(0.999, cycle < 1 ? cycle : 2 - cycle);
      curve.getPointAt(u, position);
      curve.getTangentAt(u, tangent);
      const heading = Math.atan2(-tangent.z, tangent.x) + (cycle < 1 ? 0 : Math.PI);
      const stride = Math.abs(Math.sin(clock * 7 + i)) * 0.9;
      const near = nearPointer(position.x, position.z, PEOPLE_REACH);
      placePerson(walkerStart + i, position.x, GROUND + stride, position.z, lookToPointer(position.x, position.z, heading, near, 0.55), size);
    });
    data.idle.forEach((person, i) => {
      const sway = Math.sin(clock * 0.8 + i * 1.7) * 0.25;
      const near = nearPointer(person.at.x, person.at.y, PEOPLE_REACH);
      // Close to the pointer, someone standing gives a little hop, as if waving at it.
      const hop = near > 0.4 && person.pose !== 'sit' ? Math.max(0, Math.sin(clock * 7 + i * 1.9)) * 1.6 * (near - 0.4) / 0.6 : 0;
      placePerson(idleStart + i, person.at.x, GROUND + hop, person.at.y, lookToPointer(person.at.x, person.at.y, -person.angle + sway * 0.4, near, 1), size, person.pose);
    });
    let handheld = 0;
    crewList.forEach((entry, k) => {
      const index = crewStart + k;
      const { vignette: item, member } = entry;
      if (item.yard < 0) {
        bodyMesh.setMatrixAt(index, hidden);
        headMeshes.setMatrixAt(index, hidden);
        if ((member.motion === 'carry' && !member.partner) || member.motion === 'rake') handheldMesh.setMatrixAt(handheld++, hidden);
        return;
      }
      let x = member.x * UNIT;
      const z = member.z * UNIT;
      let angle = member.angle;
      let lift = 0;
      let lean = 0;
      if (member.motion === 'carry') {
        const swing = Math.sin(clock * 0.55 + 0.4);
        x += swing * 5 * UNIT;
        angle = Math.cos(clock * 0.55 + 0.4) >= 0 ? 0 : Math.PI;
        lift = Math.abs(Math.sin(clock * 6 + k)) * 0.7;
      } else if (member.motion === 'rake') {
        lean = Math.sin(clock * 2.4) * 0.18;
      } else if (member.motion === 'work') {
        lift = Math.abs(Math.sin(clock * 3.4 + k)) * 0.6;
      }
      position.set(x, 0, z).applyMatrix4(item.placement);
      // At work, they only glance up at the pointer.
      const yaw = lookToPointer(position.x, position.z, item.mesh.rotation.y + angle, nearPointer(position.x, position.z, PEOPLE_REACH), 0.45);
      placePerson(index, position.x, GROUND + lift, position.z, yaw, size, member.pose, lean);
      if (member.motion === 'carry' && !member.partner) {
        // The box between the two carriers, at hand height.
        position.set(x + 3 * UNIT, 9.6 * UNIT, z).applyMatrix4(item.placement);
        quaternion.setFromAxisAngle(up, item.mesh.rotation.y);
        handheldMesh.setMatrixAt(handheld++, matrix.compose(position, quaternion, scaleVector.set(4.6 * UNIT * appear + 0.0001, 4.2 * UNIT * appear + 0.0001, 4.6 * UNIT * appear + 0.0001)));
      } else if (member.motion === 'rake') {
        position.set(x + Math.cos(member.angle) * 4 * UNIT, 5.6 * UNIT, z - Math.sin(member.angle) * 4 * UNIT).applyMatrix4(item.placement);
        euler.set(0, item.mesh.rotation.y + member.angle, 0.95 + lean, 'YXZ');
        quaternion.setFromEuler(euler);
        handheldMesh.setMatrixAt(handheld++, matrix.compose(position, quaternion, scaleVector.set(0.45 * UNIT, 13 * UNIT * appear + 0.0001, 0.45 * UNIT)));
      }
    });
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMeshes.instanceMatrix.needsUpdate = true;
    handheldMesh.instanceMatrix.needsUpdate = true;

    data.birds.forEach((bird, i) => {
      const angle = bird.phase + clock * bird.speed;
      const flap = 0.55 + Math.abs(Math.sin(clock * 9 + i * 1.3)) * 0.45;
      quaternion.setFromAxisAngle(up, -angle + (bird.speed > 0 ? Math.PI : 0));
      const s = 1.6 * UNIT * Math.max(0.0001, appear);
      birdMesh.setMatrixAt(i, matrix.compose(scratch.set(bird.center.x + Math.cos(angle) * bird.radius, bird.height + Math.sin(clock * 0.8 + i) * 12, bird.center.y + Math.sin(angle) * bird.radius), quaternion, scaleVector.set(s * flap, s, s)));
    });
    birdMesh.instanceMatrix.needsUpdate = true;

    data.balloons.forEach((balloon, i) => {
      const angle = balloon.phase + clock * balloon.speed;
      const mesh = balloons[i]!;
      mesh.position.set(balloon.center.x + Math.cos(angle) * balloon.radius, balloon.height + Math.sin(clock * 0.35 + i * 2) * 8, balloon.center.y + Math.sin(angle) * balloon.radius);
      mesh.rotation.y = clock * 0.05 + i;
      mesh.scale.setScalar(balloonSize * Math.max(0.0001, appear));
    });

    if (wheel) {
      wheel.rotation.z = -clock * 1.4;
      // On its tower as the tower rises near the pointer (the same sum as the buildings' shader).
      const lift = windmillAt && react.strength > 0 ? react.strength * (1 - smooth(houseReach.value.x, houseReach.value.y, Math.hypot(windmillAt.x - react.x, windmillAt.z - react.z))) : 0;
      wheel.position.y = GROUND + (hubHeight - GROUND) * (1 + lift * HOUSE_RISE);
    }

    for (let k = 0; k < dropCount; k += 1) {
      const life = (clock * 0.9 + k / dropCount) % 1;
      const angle = k * 2.39996;
      const spread = life * 7 * UNIT;
      const height = fountainTop + life * 26 - life * life * 24;
      const dropSize = (1 - life) * 1.5 * appear + 0.0001;
      drops.setMatrixAt(k, matrix.compose(scratch.set(data.garden.at.x + Math.cos(angle) * spread, height, data.garden.at.y + Math.sin(angle) * spread), quaternion.identity(), scaleVector.set(dropSize, dropSize, dropSize)));
    }
    drops.instanceMatrix.needsUpdate = true;

    routePoints.forEach((point, i) => {
      const wave = Math.max(0, Math.sin(clock * 3.2 - i * 0.42));
      const dotSize = (0.75 + wave * wave * 0.65) * appear + 0.0001;
      routeMesh.setMatrixAt(i, matrix.compose(point, quaternion.identity(), scaleVector.set(dotSize, dotSize, dotSize)));
    });
    routeMesh.instanceMatrix.needsUpdate = true;

    const drop = introDone ? 1 : phase(BUILD_UP.pins, intro / INTRO);
    data.slots.forEach((slot, index) => {
      const state = pinState[index];
      if (!state) {
        pinBodies.setMatrixAt(index, hidden);
        pinDots.setMatrixAt(index, hidden);
        rings.setMatrixAt(index * 2, hidden);
        rings.setMatrixAt(index * 2 + 1, hidden);
        return;
      }
      // Lit (its card or row is pointed at): a gentle lift and a little growth on a critically damped spring,
      // so it starts and settles softly; quieted (another category): it fades back, eased.
      const goal = Math.max(state.lit ? 1 : 0, nearPointer(slot.at.x, slot.at.y, PIN_REACH) * 0.75);
      const presenceGoal = state.dim ? 0.35 : 1;
      if (dt === 0) {
        pinLift[index] = goal;
        pinLiftSpeed[index] = 0;
        pinPresence[index] = presenceGoal;
      } else {
        const stiffness = 70;
        pinLiftSpeed[index]! += ((goal - pinLift[index]!) * stiffness - pinLiftSpeed[index]! * 2 * Math.sqrt(stiffness)) * dt;
        pinLift[index]! += pinLiftSpeed[index]! * dt;
        pinPresence[index]! += (presenceGoal - pinPresence[index]!) * (1 - Math.exp(-dt * 7));
      }
      const lift = clamp01(pinLift[index]!);
      const presence = pinPresence[index]!;
      pinAlpha.setX(index, presence);
      dotAlpha.setX(index, presence);
      const bob = Math.sin(clock * 2 + slot.at.x * 0.01) * 3;
      const fall = (1 - easeOutBack(clamp01(drop * 1.2 - index * 0.08))) * 220;
      pinY[index] = slot.height + PIN_LIFT + bob + lift * 7 + fall;
      const s = (1 + lift * 0.12) * Math.max(0.0001, Math.min(1, drop * 3));
      matrix.compose(scratch.set(slot.at.x, pinY[index]!, slot.at.y), quaternion.identity(), scaleVector.setScalar(s));
      pinBodies.setMatrixAt(index, matrix);
      pinDots.setMatrixAt(index, matrix);
      // The rings pulse on their own clock (a little quicker, tighter and brighter while lit), so a change of
      // pace never makes them jump.
      ringPhase[index] = (ringPhase[index]! + dt * (0.62 + lift * 0.23)) % 1;
      const strength = (0.14 + ((presence - 0.35) / 0.65) * 0.41) * (1 + lift * 0.35);
      for (let k = 0; k < 2; k += 1) {
        const t = (ringPhase[index]! + k * 0.5) % 1;
        const radius = (30 - lift * 3 + t * (52 - lift * 22)) * UNIT;
        rings.setMatrixAt(index * 2 + k, matrix.compose(scratch.set(slot.at.x, GROUND + 0.6, slot.at.y), quaternion.identity(), scaleVector.set(radius, 1, radius)));
        ringAlpha.setX(index * 2 + k, (1 - t) * (1 - t) * strength * 1.25 * drop);
      }
    });
    pinBodies.instanceMatrix.needsUpdate = true;
    pinDots.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;
    ringAlpha.needsUpdate = true;
    pinAlpha.needsUpdate = true;
    dotAlpha.needsUpdate = true;
  };

  const draw = () => {
    renderer.render(scene, camera);
    afterFrame?.();
  };

  const loop = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(loop);
    // About 30 frames a second while the town just lives (on the frames the weather above it draws too); 60 while the
    // camera moves, the pointer's reaction settles or the town builds up.
    if (!dueFrame(now, last, isSettling() ? 60 : 30)) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    draw();
  };

  const applyPalette = () => {
    sun.color.set(palette.sun.color);
    sun.intensity = palette.sun.intensity;
    sky.color.set(palette.sky.color);
    sky.groundColor.set(palette.sky.ground);
    sky.intensity = palette.sky.intensity;
    scene.environmentIntensity = palette.environment;
    shadowMaterial.color.set(palette.shadow.color);
    shadowMaterial.opacity = palette.shadow.opacity;
    for (const { material, key, emissive } of painted) {
      material.color.set(palette[key]);
      if (emissive) material.emissive.set(palette[key]);
    }
    for (const entry of tinted) paintRange(entry);
    windowMaterial.emissiveIntensity = palette.windowGlow;
    moverWindows.emissiveIntensity = palette.windowGlow * 0.4;
    lampHeadMaterial.emissiveIntensity = palette.lampGlow;
    haloMaterial.color.set(palette.lampHead);
    halos.visible = palette.lampGlow > 0;
    paintWater(water.geometry, data.waterGrid, palette);
    tintCrowns();
    tintInstances();
    renderer.shadowMap.needsUpdate = true;
  };

  applyIntro();
  placeCamera();
  update(0);
  // Resizing the canvas reallocates its buffers (a stall), so only a real change does, in one go.
  let sizedAs = '';
  const resize = (width: number, height: number, pixelRatio: number) => {
    const key = `${width}x${height}@${pixelRatio}`;
    if (key === sizedAs) return;
    sizedAs = key;
    renderer.setDrawingBufferSize(width, height, pixelRatio);
  };
  if (options.size) {
    resize(options.size.width, options.size.height, options.size.pixelRatio);
    setCameraView(options.size.view);
  }
  await step();

  // Every shader, compiled before the first frame without blocking the page (the driver compiles them in
  // parallel and three waits without stalling, through KHR_parallel_shader_compile), a part at a time (building
  // each shader's source takes a moment too) and waited for together; then the shadow pass's (`warmShadows`).
  const compiling: Promise<unknown>[] = [];
  for (const part of scene.children) {
    compiling.push(renderer.compileAsync(part, camera, scene));
    await step();
  }
  await Promise.all(compiling);
  await step();
  const releaseStandIns = await warmShadows(renderer, scene, camera);
  await step();
  // The first frame, shadows and all, while the canvas is still hidden: the town is ready the moment it's shown.
  renderer.render(scene, camera);
  releaseStandIns();
  await step();

  function setCameraView({ width, height, stage: box }: TownView) {
    // The camera's picture is the stage; a view offset (in stage units) moves and sizes the canvas's window
    // onto it, so a crop costs nothing and the land around the stage draws in the same projection.
    const scale = box.width / stage.width;
    if (!(scale > 0) || !(width > 0) || !(height > 0)) return;
    camera.aspect = stage.width / stage.height;
    camera.setViewOffset(stage.width, stage.height, -box.left / scale, -box.top / scale, width / scale, height / scale);
    camera.updateProjectionMatrix();
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
      // Stopped (paused, out of sight), the town shows itself settled: no reaction to a pointer it no longer follows.
      hover.active = false;
    },
    renderOnce() {
      // Running, the loop animates the change; this only redraws the current frame (a resize clears it).
      if (!running) update(0);
      draw();
    },
    finishIntro() {
      if (introDone) return;
      introDone = true;
      intro = INTRO;
      applyIntro();
      renderer.shadowMap.needsUpdate = true;
    },
    buildProgress() {
      return introDone ? 1 : clamp01(intro / INTRO);
    },
    setSize(width, height, pixelRatio) {
      resize(width, height, pixelRatio);
    },
    setView(next) {
      setCameraView(next);
    },
    setPalette(next) {
      palette = next;
      applyPalette();
    },
    setPins(next) {
      data.slots.forEach((slot, index) => {
        const state = next.find((item) => item.slotId === slot.id) ?? null;
        pinState[index] = state;
        if (!state) return;
        color.set(state.color);
        pinBodies.setColorAt(index, color);
        pinDots.setColorAt(index, whiten);
        rings.setColorAt(index * 2, color);
        rings.setColorAt(index * 2 + 1, color);
      });
      for (const mesh of [pinBodies, pinDots, rings]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      placeVignettes(pinState);
    },
    setPointer(x, y, active) {
      pointer.x = x;
      pointer.y = y;
      pointer.active = active;
    },
    setHover(x, y, active) {
      hover.x = x;
      hover.y = y;
      hover.active = active;
    },
    setTilt(tilt) {
      look.goalTilt = clamp01(tilt);
    },
    setDive(amount, slotId) {
      diveIndex = slotId === null ? -1 : data.slots.findIndex((slot) => slot.id === slotId);
      look.dive = diveIndex >= 0 ? clamp01(amount) : 0;
    },
    isSettling,
    pinAt(slotId, resting = false) {
      const index = data.slots.findIndex((slot) => slot.id === slotId);
      if (index < 0) return null;
      const slot = data.slots[index]!;
      const grown = resting ? 1 : 1 + clamp01(pinLift[index]!) * 0.12;
      const y = resting ? slot.height + PIN_LIFT : pinY[index]!;
      pinTop.set(slot.at.x, y + (PIN_HEAD + 8) * PIN * grown, slot.at.y).project(camera);
      return { x: (pinTop.x + 1) / 2, y: (1 - pinTop.y) / 2 };
    },
    onFrame(callback) {
      afterFrame = callback;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      release();
    },
  };
}

/**
 * Compiles the room's materials (the environment's reflections) the way its cube camera draws them, into a
 * render target (linear, no tone mapping), without blocking: drawing the room then doesn't stall on them.
 */
async function warmRoom(renderer: WebGLRenderer, room: Scene): Promise<void> {
  const target = new WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(room, new PerspectiveCamera(90, 1, 0.1, 100));
  renderer.setRenderTarget(previous);
  await ready;
  target.dispose();
}

/**
 * Compiles the environment's filters (three's PMREM: a blur and the GGX filters) without blocking. three makes
 * those materials as it first draws with them, so a dry run with its drawing switched off makes them, and they're
 * compiled here, into a render target, as they'll be drawn. It reaches into the generator's private parts
 * (three is pinned); if they aren't there, it does nothing and the filters compile as they're first used.
 */
async function warmEnvironment(renderer: WebGLRenderer, pmrem: PMREMGenerator): Promise<void> {
  type Generator = { _renderCube?: (target: unknown, lod: number, material: Material) => void; _boxMesh?: Mesh; _cubeCamera?: { children: PerspectiveCamera[] } };
  const generator = pmrem as unknown as Generator;
  const renderCube = generator._renderCube;
  const box = generator._boxMesh;
  const eye = generator._cubeCamera?.children[0];
  if (typeof renderCube !== 'function' || !box || !eye) return;
  const filters = new Set<Material>();
  try {
    generator._renderCube = (_target, _lod, material) => {
      filters.add(material);
    };
    pmrem.fromScene(new Scene(), 0.04).dispose();
  } catch {
    return;
  } finally {
    generator._renderCube = renderCube;
  }
  const standIns = new Group();
  for (const material of filters) standIns.add(new Mesh(box.geometry, material));
  const target = new WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(standIns, eye);
  renderer.setRenderTarget(previous);
  await ready;
  target.dispose();
}

/**
 * Compiles the shadow pass's shaders without blocking. That pass draws each shadow caster with three's own depth
 * material (one, its side flipped from the caster's), into the shadow map (a render target), so stand-ins with
 * the same make-up (a mesh or an instanced one, colored per instance or not, the depth material's side) are
 * compiled into a render target here; the pass then finds its shaders ready. Resolves to a function that lets
 * the stand-ins go: call it after the first real frame (letting go sooner would free the shaders with them).
 */
async function warmShadows(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): Promise<() => void> {
  const flip: Record<number, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };
  const standIns = new Group();
  const made = new Set<string>();
  const geometry = new BoxGeometry(1, 1, 1);
  const depthMaterials: MeshDepthMaterial[] = [];
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || !object.castShadow) return;
    const material = object.material as Material;
    const side = material.shadowSide ?? flip[material.side] ?? BackSide;
    const instanced = object instanceof InstancedMesh;
    const colored = instanced && object.instanceColor !== null;
    const key = `${instanced}-${colored}-${side}`;
    if (made.has(key)) return;
    made.add(key);
    const depth = new MeshDepthMaterial({ side });
    depthMaterials.push(depth);
    if (instanced) {
      const standIn = new InstancedMesh(geometry, depth, 1);
      if (colored) standIn.setColorAt(0, new Color('#ffffff'));
      standIns.add(standIn);
    } else {
      standIns.add(new Mesh(geometry, depth));
    }
  });
  const target = new WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(standIns, camera, scene);
  renderer.setRenderTarget(previous);
  await ready;
  target.dispose();
  return () => {
    geometry.dispose();
    for (const material of depthMaterials) material.dispose();
  };
}

/**
 * The water's grid (sampled with the scene): only cells in (or just under the banks of) the water, with depth
 * colors and a soft end.
 */
function waterGeometry(grid: WaterGrid, palette: TownPalette): BufferGeometry {
  const { x0, y0, step, cols, rows } = grid;
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const normals = new Float32Array(count * 3);
  const inside = new Uint8Array(count);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const k = j * cols + i;
      const x = x0 + i * step;
      const y = y0 + j * step;
      inside[k] = Math.max(grid.water[k]! - 14, grid.land[k]! - 36) < 0 ? 1 : 0;
      positions[k * 3] = x;
      positions[k * 3 + 1] = WATER_LEVEL;
      positions[k * 3 + 2] = y;
      normals[k * 3 + 1] = 1;
      uvs[k * 2] = x / 220;
      uvs[k * 2 + 1] = y / 220;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (inside[a] && inside[b] && inside[c]) index.push(a, c, b);
      if (inside[b] && inside[c] && inside[d]) index.push(b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 4), 4));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  paintWater(geometry, grid, palette);
  return geometry;
}

/** The water's colors: shallow at the banks to deep in the middle, fading out under the banks (per theme). */
function paintWater(geometry: BufferGeometry, grid: WaterGrid, palette: TownPalette) {
  const attribute = geometry.getAttribute('color') as BufferAttribute;
  const shallow = new Color(palette.waterShallow);
  const deep = new Color(palette.waterDeep);
  const color = new Color();
  for (let k = 0; k < grid.cols * grid.rows; k += 1) {
    color.copy(shallow).lerp(deep, smooth(0, 40, -grid.water[k]!));
    attribute.setXYZW(k, color.r, color.g, color.b, 1 - smooth(-4, 32, grid.land[k]!));
  }
  attribute.needsUpdate = true;
}
