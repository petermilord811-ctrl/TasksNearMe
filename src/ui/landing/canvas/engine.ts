/**
 * "Neighborhood light": the hero canvas, as pure TypeScript (no React, no DOM beyond a 2D context), so it
 * can be unit-tested with a fake clock.
 *
 * Soft iridescent light drifts slowly in the background. Task points (in their category's color) and
 * helper points (white, ringed) wander gently; when a helper comes near a task, a thin line forms between
 * them and both glow a little: help finding work nearby. The cursor is a soft light that brightens points
 * and draws them a touch closer. A focused category makes its tasks glow and quiets the rest.
 *
 * It stays out of the way of the words: the page passes the boxes of its text ("clear zones") and points
 * and links fade to a whisper over them, so the motion frames the content instead of crossing it. Smaller
 * scenes (phones) show fewer points, so the density stays the same.
 *
 * Budget: ~70 points, O(helpers × tasks) per frame, no allocations per frame, the light field drawn at low
 * resolution and scaled up.
 */

export interface ScenePalette {
  /** Background light, 3–4 colors. */
  light: string[];
  /** Category → task point color. */
  tasks: Record<string, string>;
  helper: string;
  ring: string;
  line: string;
  /** How strong the background light is (lighter in light mode). */
  lightAlpha?: number;
}

/** A box the scene keeps quiet over, in scene px. */
export interface ClearZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneOptions {
  width: number;
  height: number;
  categories: readonly string[];
  palette: ScenePalette;
  seed?: number;
  taskCount?: number;
  helperCount?: number;
}

interface Point {
  kind: 'task' | 'helper';
  category: string;
  /** Home position (fractions of the scene), phase and speed of its wander. */
  hx: number;
  hy: number;
  phase: number;
  speed: number;
  amp: number;
  /** Current position in px and its glow (0–1, eased). */
  x: number;
  y: number;
  glow: number;
  size: number;
  /** 0–1: drawn only while the scene's density is above it (an even spread, so thinning looks natural). */
  rank: number;
  /** 1 in the open, down to ZONE_FLOOR over a clear zone. */
  calm: number;
}

/** A small deterministic PRNG (mulberry32), so a seed always draws the same neighborhood. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same color at zero alpha (fading to "transparent" would fade through black). */
export function clear(color: string): string {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return `${hex}00`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}00`;
  return 'rgba(255,255,255,0)';
}

const LINK_DISTANCE = 120;
const POINTER_RADIUS = 200;
/** The area at which every point shows (a desktop hero); smaller scenes thin out, down to MIN_DENSITY. */
export const FULL_AREA = 1_150_000;
const MIN_DENSITY = 0.35;
/** Over a clear zone a point keeps this much of its strength, easing back to full within ZONE_FEATHER px. */
export const ZONE_FLOOR = 0.1;
const ZONE_FEATHER = 36;
/** The golden-ratio sequence: well-spread ranks without drawing from the seeded generator. */
const GOLDEN = 0.618033988749895;

export class NeighborhoodScene {
  width: number;
  height: number;
  /** Time in ms since the scene started (advanced by `update`). */
  time = 0;
  readonly points: Point[];
  private palette: ScenePalette;
  private focus: string | null = null;
  private pointer = { x: 0, y: 0, active: false, strength: 0 };
  private links = 0;
  private zones: ClearZone[] = [];
  /** The share of points shown (see FULL_AREA). */
  density = 1;

  constructor(options: SceneOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    const rand = random(options.seed ?? 7);
    const make = (kind: Point['kind'], category: string): Point => {
      // Keep the middle band a little clearer, where the headline sits.
      let hx = rand();
      const hy = rand();
      if (hx > 0.28 && hx < 0.72 && hy > 0.22 && hy < 0.7) hx = hx < 0.5 ? hx * 0.5 : 0.5 + hx * 0.5;
      return { kind, category, hx, hy, phase: rand() * Math.PI * 2, speed: 0.00012 + rand() * 0.00018, amp: 10 + rand() * 22, x: 0, y: 0, glow: 0, size: kind === 'task' ? 2.2 + rand() * 1.8 : 2, rank: 0, calm: 1 };
    };
    const categories = options.categories.length ? options.categories : ['task'];
    this.points = [
      ...Array.from({ length: options.taskCount ?? 46 }, (_, i) => make('task', categories[i % categories.length]!)),
      ...Array.from({ length: options.helperCount ?? 22 }, () => make('helper', '')),
    ];
    // Tasks and helpers each get their own even spread, so thinning keeps the mix.
    let tasks = 0;
    let helpers = 0;
    for (const point of this.points) {
      const n = point.kind === 'task' ? tasks++ : helpers++;
      point.rank = ((n + 1) * GOLDEN) % 1;
    }
    this.resize(options.width, options.height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.density = Math.min(1, Math.max(MIN_DENSITY, (width * height) / FULL_AREA));
    this.place();
  }

  /** The boxes of the content in front (headline, text, buttons), in scene px. */
  setClearZones(zones: readonly ClearZone[]): void {
    this.zones = zones.filter((zone) => zone.w > 0 && zone.h > 0).map((zone) => ({ ...zone }));
    for (const point of this.points) point.calm = this.calmAt(point.x, point.y);
  }

  /** 1 in the open, ZONE_FLOOR inside a clear zone, easing between over ZONE_FEATHER px. */
  calmAt(x: number, y: number): number {
    let calm = 1;
    for (const zone of this.zones) {
      const dx = Math.max(zone.x - x, 0, x - (zone.x + zone.w));
      const dy = Math.max(zone.y - y, 0, y - (zone.y + zone.h));
      const d = Math.hypot(dx, dy);
      if (d >= ZONE_FEATHER) continue;
      const k = ZONE_FLOOR + (1 - ZONE_FLOOR) * (d / ZONE_FEATHER);
      if (k < calm) calm = k;
    }
    return calm;
  }

  /** Whether a point is part of the scene at its current size. */
  shows(point: { rank: number }): boolean {
    return point.rank <= this.density;
  }

  setPalette(palette: ScenePalette): void {
    this.palette = palette;
  }

  setFocus(category: string | null): void {
    this.focus = category;
  }

  /** The cursor in scene px (or inactive). */
  setPointer(x: number, y: number, active: boolean): void {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  /** How many helper–task links were drawn last frame (for tests). */
  get linkCount(): number {
    return this.links;
  }

  private place(): void {
    for (const point of this.points) this.position(point);
  }

  private position(point: Point): void {
    const t = this.time * point.speed + point.phase;
    const pull = this.pointer.strength;
    let x = point.hx * this.width + Math.cos(t) * point.amp;
    let y = point.hy * this.height + Math.sin(t * 1.3) * point.amp * 0.7;
    if (pull > 0) {
      const dx = this.pointer.x - x;
      const dy = this.pointer.y - y;
      const d = Math.hypot(dx, dy);
      if (d < POINTER_RADIUS) {
        const k = (1 - d / POINTER_RADIUS) * 0.12 * pull;
        x += dx * k;
        y += dy * k;
      }
    }
    point.x = x;
    point.y = y;
  }

  /** Advances the scene by `dt` ms (clamped, so a backgrounded tab doesn't jump). */
  update(dt: number): void {
    const step = Math.min(64, Math.max(0, dt));
    this.time += step;
    const target = this.pointer.active ? 1 : 0;
    this.pointer.strength += (target - this.pointer.strength) * Math.min(1, step / 240);
    for (const point of this.points) {
      if (!this.shows(point)) continue;
      this.position(point);
      point.calm = this.calmAt(point.x, point.y);
      let want = 0;
      if (point.kind === 'task' && this.focus) want = point.category === this.focus ? 1 : -0.6;
      if (this.pointer.strength > 0) {
        const d = Math.hypot(this.pointer.x - point.x, this.pointer.y - point.y);
        if (d < POINTER_RADIUS) want = Math.max(want, (1 - d / POINTER_RADIUS) * this.pointer.strength);
      }
      point.glow += (want - point.glow) * Math.min(1, step / 180);
    }
  }

  draw(ctx: CanvasRenderingContext2D, light: CanvasImageSource | null): void {
    const { width, height } = this;
    ctx.clearRect(0, 0, width, height);
    if (light) ctx.drawImage(light, 0, 0, width, height);

    // Links: each helper reaches for its nearest task in range.
    this.links = 0;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (const helper of this.points) {
      if (helper.kind !== 'helper' || !this.shows(helper)) continue;
      let best: Point | null = null;
      let bestD = LINK_DISTANCE;
      for (const task of this.points) {
        if (task.kind !== 'task' || !this.shows(task)) continue;
        const d = Math.hypot(task.x - helper.x, task.y - helper.y);
        if (d < bestD) {
          bestD = d;
          best = task;
        }
      }
      if (!best) continue;
      const strength = 1 - bestD / LINK_DISTANCE;
      const dim = this.focus && best.category !== this.focus ? 0.35 : 1;
      ctx.globalAlpha = Math.min(0.55, 0.12 + strength * 0.5) * dim * Math.min(helper.calm, best.calm);
      ctx.strokeStyle = this.palette.tasks[best.category] ?? this.palette.line;
      ctx.beginPath();
      const mx = (helper.x + best.x) / 2 + (best.y - helper.y) * 0.18;
      const my = (helper.y + best.y) / 2 - (best.x - helper.x) * 0.18;
      ctx.moveTo(helper.x, helper.y);
      ctx.quadraticCurveTo(mx, my, best.x, best.y);
      ctx.stroke();
      this.links += 1;
    }

    // Points: tasks are colored dots with a halo; helpers are white with a thin ring.
    for (const point of this.points) {
      if (!this.shows(point)) continue;
      const glow = Math.max(0, point.glow);
      const quiet = (point.glow < 0 ? 1 + point.glow * 0.7 : 1) * point.calm;
      if (point.kind === 'task') {
        const color = this.palette.tasks[point.category] ?? this.palette.line;
        ctx.globalAlpha = (0.16 + glow * 0.3) * quiet;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size * (3.2 + glow * 2.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (0.78 + glow * 0.22) * quiet;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size * (1 + glow * 0.35), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = (0.5 + glow * 0.4) * point.calm;
        ctx.strokeStyle = this.palette.ring;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size + 2.6 + glow * 1.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.95 * point.calm;
        ctx.fillStyle = this.palette.helper;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The slow iridescent light, drawn small (it's all soft gradients), then scaled up by `draw`. */
  drawLight(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    const colors = this.palette.light;
    const t = this.time * 0.00005;
    const pointerShift = this.pointer.strength * 0.06;
    const px = this.width > 0 ? this.pointer.x / this.width : 0.5;
    const py = this.height > 0 ? this.pointer.y / this.height : 0.5;
    colors.forEach((color, index) => {
      const angle = t * (1 + index * 0.35) + index * 1.7;
      const cx = (0.5 + Math.cos(angle) * 0.32 + (px - 0.5) * pointerShift) * width;
      const cy = (0.45 + Math.sin(angle * 1.2) * 0.26 + (py - 0.5) * pointerShift) * height;
      const radius = Math.max(width, height) * (0.42 + index * 0.06);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, clear(color));
      ctx.globalAlpha = this.palette.lightAlpha ?? 0.5;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });
    ctx.globalAlpha = 1;
  }
}

/**
 * A requestAnimationFrame loop that can be paused and resumed, with injectable timing for tests. `tick`
 * receives the elapsed ms since the previous frame (0 on the first frame after a resume).
 */
export function createLoop(
  tick: (dt: number) => void,
  timing: { request: (cb: (time: number) => void) => number; cancel: (id: number) => void } = {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let id = 0;
  let last: number | null = null;
  let running = false;
  const frame = (time: number) => {
    if (!running) return;
    tick(last === null ? 0 : time - last);
    last = time;
    id = timing.request(frame);
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      id = timing.request(frame);
    },
    stop() {
      running = false;
      timing.cancel(id);
    },
    get running() {
      return running;
    },
  };
}
