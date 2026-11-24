'use client';

import { useEffect, useRef, useState } from 'react';
import type { Season } from '@/shared/seasons';
import { cn } from '@/ui/lib/utils';
import { usePrefersReducedMotion } from '@/ui/motion';
import { dueFrame } from './frame-clock';
import { useHeroPaused } from './hero-pause';
import { whenHeroReady } from './hero-ready';
import { mapleRadius } from './leaf-shape';
import { MAP_SECTION_ID } from './sections/ids';

type Scheme = 'light' | 'dark';

/** One thing in the air (a flake, a leaf, a petal, a mote, a firefly), in CSS px. */
interface Mote {
  x: number;
  y: number;
  /** 0 far … 1 near: the near ones are bigger, quicker and stronger. */
  depth: number;
  size: number;
  /** The steady drift (px/s): the fall or the rise, and the wind. */
  vx: number;
  vy: number;
  /** The sway from side to side: how far (px), how quickly (rad/s), and where in its swing. */
  sway: number;
  swayRate: number;
  phase: number;
  angle: number;
  spin: number;
  /** Leaves and petals tumble (their width follows a cosine); motes twinkle and fireflies blink with it. */
  flip: number;
  flipRate: number;
  sprite: number;
  alpha: number;
}

interface Weather {
  /** How many per 10,000 px² of the hero, and between how many. */
  perArea: number;
  min: number;
  max: number;
  /** What's in the air goes up (summer's motes and fireflies) instead of down. */
  rises?: boolean;
  /** Turns edge-on and back as it falls (leaves, petals). */
  tumbles?: boolean;
  /** Its light comes and goes (motes twinkle, fireflies blink). */
  glows?: 'twinkle' | 'blink';
  draw(scheme: Scheme): HTMLCanvasElement[];
  make(random: () => number, depth: number, sprites: number): Omit<Mote, 'x' | 'y' | 'depth'>;
}

/** Sprites are drawn once, this big, and scaled down as they're drawn (sharp up to about 30 px at 2x). */
const SPRITE = 64;

function sprite(paint: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE;
  canvas.height = SPRITE;
  const context = canvas.getContext('2d');
  if (context) paint(context);
  return canvas;
}

function glow(stops: [number, string][]): HTMLCanvasElement {
  return sprite((context) => {
    const half = SPRITE / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, SPRITE, SPRITE);
  });
}

/** A leaf pointing up: an almond, or a five-lobed maple, with its midrib and stem. */
function leaf(color: string, vein: string, maple: boolean): HTMLCanvasElement {
  return sprite((context) => {
    const c = SPRITE / 2;
    context.beginPath();
    if (maple) {
      for (let step = 0; step <= 120; step++) {
        const theta = (step / 120) * Math.PI * 2;
        const r = mapleRadius(theta) * 29;
        const x = c + Math.sin(theta) * r;
        const y = 30 - Math.cos(theta) * r;
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
    } else {
      context.moveTo(c, 5);
      context.quadraticCurveTo(c + 24, 26, c, 55);
      context.quadraticCurveTo(c - 24, 26, c, 5);
    }
    context.closePath();
    const shade = context.createLinearGradient(8, 0, SPRITE - 8, 0);
    shade.addColorStop(0, color);
    shade.addColorStop(1, vein);
    context.fillStyle = color;
    context.fill();
    context.globalAlpha = 0.35;
    context.fillStyle = shade;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = vein;
    context.lineWidth = 1.6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(c, maple ? 14 : 9);
    context.lineTo(c, maple ? 63 : 61);
    context.stroke();
  });
}

/** A blossom's petal: a rounded teardrop with a notch at its tip, deeper toward its base. */
function petal(color: string, base: string): HTMLCanvasElement {
  return sprite((context) => {
    const c = SPRITE / 2;
    context.beginPath();
    context.moveTo(c, 58);
    context.bezierCurveTo(c - 26, 44, c - 20, 8, c - 5, 8);
    context.quadraticCurveTo(c, 15, c + 5, 8);
    context.bezierCurveTo(c + 20, 8, c + 26, 44, c, 58);
    context.closePath();
    const shade = context.createLinearGradient(0, 8, 0, 58);
    shade.addColorStop(0, color);
    shade.addColorStop(1, base);
    context.fillStyle = shade;
    context.fill();
  });
}

const between = (random: () => number, low: number, high: number) => low + random() * (high - low);

const WEATHER: Record<Season, Weather> = {
  // Snow: soft flakes, the near ones bigger and quicker, drifting a little with the wind. By day each has a cool
  // rim, so a white flake still shows on the white page.
  winter: {
    perArea: 1.2,
    min: 34,
    max: 150,
    draw: (scheme) =>
      scheme === 'dark'
        ? [glow([[0, 'rgb(255 255 255 / 0.95)'], [0.42, 'rgb(236 242 255 / 0.62)'], [1, 'rgb(200 215 255 / 0)']])]
        : [glow([[0, 'rgb(255 255 255 / 1)'], [0.32, 'rgb(255 255 255 / 1)'], [0.5, 'rgb(214 226 244 / 0.95)'], [0.68, 'rgb(150 174 214 / 0.48)'], [1, 'rgb(150 174 214 / 0)']])],
    make: (random, depth) => ({
      size: 3.2 + depth * 6,
      vx: between(random, 5, 15),
      vy: 15 + depth * 36 + random() * 6,
      sway: between(random, 6, 22),
      swayRate: between(random, 0.5, 1.3),
      phase: random() * Math.PI * 2,
      angle: 0,
      spin: 0,
      flip: 0,
      flipRate: 0,
      sprite: 0,
      alpha: 0.5 + depth * 0.5,
    }),
  },
  // Late fall: a few leaves letting go, tumbling and turning as the wind carries them across.
  fall: {
    perArea: 0.15,
    min: 6,
    max: 22,
    tumbles: true,
    draw: (scheme) => {
      const colors = scheme === 'dark' ? ['#c8642e', '#d8913a', '#b8452f', '#d9ad45', '#9c5a30'] : ['#d9692e', '#e8963a', '#c94a2e', '#e6b444', '#a8582c'];
      const vein = scheme === 'dark' ? '#5e2f16' : '#7a3a17';
      return colors.flatMap((color, index) => [leaf(color, vein, index % 2 === 0), leaf(color, vein, index % 2 === 1)]);
    },
    make: (random, depth, sprites) => ({
      size: 14 + depth * 14,
      vx: between(random, 12, 30),
      vy: 24 + depth * 30 + random() * 8,
      sway: between(random, 22, 64),
      swayRate: between(random, 0.55, 1.3),
      phase: random() * Math.PI * 2,
      angle: random() * Math.PI * 2,
      spin: between(random, -1.3, 1.3),
      flip: random() * Math.PI * 2,
      flipRate: between(random, 1.4, 3.6),
      sprite: Math.floor(random() * sprites),
      alpha: 0.82 + depth * 0.18,
    }),
  },
  // Spring: blossom petals on the breeze, lighter and slower than leaves.
  spring: {
    perArea: 0.15,
    min: 6,
    max: 22,
    tumbles: true,
    draw: (scheme) =>
      scheme === 'dark'
        ? [petal('#f6a6c7', '#d9709d'), petal('#fbd0e1', '#ef94b8'), petal('#e7d6ff', '#b99be6'), petal('#ffffff', '#f2b5cd')]
        : [petal('#f8b4d0', '#ec7fab'), petal('#fdd9e7', '#f3a3c3'), petal('#e3cff9', '#bb9ae9'), petal('#ffffff', '#f5bfd4')],
    make: (random, depth, sprites) => ({
      size: 9 + depth * 9,
      vx: between(random, 10, 26),
      vy: 14 + depth * 20 + random() * 6,
      sway: between(random, 18, 52),
      swayRate: between(random, 0.6, 1.5),
      phase: random() * Math.PI * 2,
      angle: random() * Math.PI * 2,
      spin: between(random, -1.6, 1.6),
      flip: random() * Math.PI * 2,
      flipRate: between(random, 1.2, 3),
      sprite: Math.floor(random() * sprites),
      alpha: 0.8 + depth * 0.2,
    }),
  },
  // Summer: warm motes of light rising slowly in the sun; at night, fireflies blinking over the town.
  summer: {
    perArea: 0.17,
    min: 8,
    max: 24,
    rises: true,
    glows: 'twinkle',
    draw: (scheme) =>
      scheme === 'dark'
        ? [glow([[0, 'rgb(250 255 205 / 1)'], [0.16, 'rgb(224 255 128 / 0.95)'], [0.42, 'rgb(186 240 84 / 0.32)'], [1, 'rgb(160 220 60 / 0)']])]
        : [glow([[0, 'rgb(255 244 200 / 1)'], [0.3, 'rgb(255 214 120 / 0.7)'], [1, 'rgb(255 190 90 / 0)']])],
    make: (random, depth) => ({
      size: 4 + depth * 6,
      vx: between(random, -5, 5),
      vy: -(5 + depth * 9),
      sway: between(random, 10, 28),
      swayRate: between(random, 0.3, 0.8),
      phase: random() * Math.PI * 2,
      angle: 0,
      spin: 0,
      flip: random() * Math.PI * 2,
      flipRate: between(random, 0.7, 1.7),
      sprite: 0,
      alpha: 0.4 + depth * 0.5,
    }),
  },
};

/** Fireflies, instead of summer's motes, on a dark page: bigger glows that blink. */
function weatherFor(season: Season, scheme: Scheme): Weather {
  const weather = WEATHER[season];
  if (season !== 'summer' || scheme === 'light') return weather;
  return {
    ...weather,
    perArea: 0.12,
    max: 18,
    glows: 'blink',
    make: (random, depth, sprites) => ({ ...weather.make(random, depth, sprites), size: 13 + depth * 11, vy: -(2 + depth * 4), sway: between(random, 18, 46) }),
  };
}

/** A small seeded random (mulberry32): previews and tests draw the same air every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const darkAt = (element: Element) => {
  const scheme = getComputedStyle(element).colorScheme;
  return scheme.includes('dark') && !scheme.includes('light');
};

/**
 * The season's weather over the hero: snow in winter, leaves in late fall, blossom petals in spring, warm motes
 * of light in summer (fireflies on a dark page). A canvas over the town and under the words; decorative
 * (`aria-hidden`), it never takes the pointer.
 *
 * It's light on purpose: a few dozen pre-drawn sprites at most, fewer on small screens, drawn only while the hero
 * is on screen and uncovered (on wide screens the map slides over the pinned hero, as for the town) and the tab is
 * visible. It waits for the hero's town (`whenHeroReady`: built up, or its still picture
 * in), then fades in, so it never competes with the town's start. It stops with the town's Pause button (`useHeroPaused`, the frame stays)
 * and for reduced motion (one still frame), and `still` draws one fixed frame (previews and tests). It fades out
 * toward the hero's bottom, so nothing is cut at an edge.
 */
export function SeasonWeather({ season, still = false, className }: { season: Season; still?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const paused = useHeroPaused();
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(false);
  /** The map below has reached the top of the window: it covers the pinned hero (wide screens) or the hero has
   *  scrolled away (phones). */
  const [covered, setCovered] = useState(false);
  /** The town is up (or this is a still frame): the air fades in and may move. */
  const [ready, setReady] = useState(still);
  const moving = ready && !still && !reduced && !paused && onScreen && !hidden && !covered;
  const controls = useRef<{ start(): void; stop(): void } | null>(null);

  // The air itself: sprites for the theme, as many motes as the hero's size calls for, and the frame loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const random = still ? seeded(20261117) : Math.random;
    let scheme: Scheme = darkAt(canvas) ? 'dark' : 'light';
    let weather = weatherFor(season, scheme);
    let sprites = weather.draw(scheme);
    const motes: Mote[] = [];
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let last = 0;
    let running = false;

    const make = (spread: boolean): Mote => {
      const depth = random();
      const parts = weather.make(random, depth, sprites.length);
      // How far the wind carries it while it crosses the hero: a new one may start that far upwind (the first
      // ones are spread over the hero itself, so it's full from the first frame).
      const crossing = height / Math.max(1, Math.abs(parts.vy));
      const upwind = Math.max(0, parts.vx * crossing);
      const x = spread ? random() * width : random() * (width + upwind) - upwind;
      const y = spread ? random() * height : weather.rises ? height + parts.size + random() * 24 : -parts.size - random() * 24;
      return { ...parts, x, y, depth };
    };
    const fill = () => {
      const want = Math.round(Math.min(weather.max, Math.max(weather.min, ((width * height) / 10_000) * weather.perArea)));
      while (motes.length < want) motes.push(make(true));
      motes.length = want;
    };
    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const mote of motes) {
        const image = sprites[mote.sprite % sprites.length];
        if (!image) continue;
        let alpha = mote.alpha;
        if (weather.glows === 'twinkle') alpha *= 0.55 + 0.45 * Math.sin(mote.flip);
        if (weather.glows === 'blink') alpha *= 0.08 + 0.92 * Math.pow(Math.max(0, Math.sin(mote.flip)), 3);
        if (alpha <= 0.01) continue;
        const x = (mote.x + Math.sin(mote.phase) * mote.sway) * ratio;
        const y = (weather.glows === 'blink' ? mote.y + Math.cos(mote.phase * 0.8) * mote.sway * 0.5 : mote.y) * ratio;
        const size = mote.size * ratio;
        const squash = weather.tumbles ? Math.max(0.18, Math.abs(Math.cos(mote.flip))) : 1;
        const cos = Math.cos(mote.angle);
        const sin = Math.sin(mote.angle);
        context.globalAlpha = Math.min(1, alpha);
        context.setTransform(cos * squash, sin * squash, -sin, cos, x, y);
        context.drawImage(image, -size / 2, -size / 2, size, size);
      }
      context.globalAlpha = 1;
    };
    const step = (dt: number) => {
      for (let index = 0; index < motes.length; index++) {
        const mote = motes[index]!;
        mote.phase += mote.swayRate * dt;
        mote.angle += mote.spin * dt;
        mote.flip += mote.flipRate * dt;
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        const margin = mote.size + mote.sway;
        const gone = weather.rises ? mote.y < -margin : mote.y > height + margin;
        if (gone || mote.x > width + margin || mote.x < -margin - width) motes[index] = make(false);
      }
    };
    // About 30 frames a second, in step with the town under it (the motes drift slowly: 60 would only double the
    // drawing of a canvas the size of the hero).
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!dueFrame(now, last, 30)) return;
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 1 / 60;
      last = now;
      step(dt);
      draw();
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      width = box.width;
      height = box.height;
      // Soft motes: 1.5× the CSS pixels is as sharp as they look (at most about 1.4 million pixels in all).
      ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_400_000 / (width * height))));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      fill();
      draw();
    };
    const restyle = () => {
      const next: Scheme = darkAt(canvas) ? 'dark' : 'light';
      if (next === scheme) return;
      scheme = next;
      weather = weatherFor(season, scheme);
      sprites = weather.draw(scheme);
      motes.length = 0;
      fill();
      draw();
    };

    controls.current = {
      start() {
        if (running) return;
        running = true;
        last = 0;
        frame = requestAnimationFrame(loop);
      },
      stop() {
        running = false;
        cancelAnimationFrame(frame);
      },
    };
    resize();
    const sized = new ResizeObserver(resize);
    sized.observe(canvas);
    const themeWatch = new MutationObserver(restyle);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', restyle);
    return () => {
      controls.current = null;
      running = false;
      cancelAnimationFrame(frame);
      sized.disconnect();
      themeWatch.disconnect();
      media?.removeEventListener('change', restyle);
    };
  }, [season, still]);

  // Moving only while it's seen, the tab is visible, motion is welcome and it isn't paused (and again after the
  // air above is made anew for another season).
  useEffect(() => {
    if (moving) controls.current?.start();
    else controls.current?.stop();
  }, [moving, season, still]);

  useEffect(() => {
    if (still) return;
    return whenHeroReady(() => setReady(true));
  }, [still]);

  useEffect(() => {
    const sheet = still ? null : document.getElementById(MAP_SECTION_ID);
    if (!sheet) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      setCovered(sheet.getBoundingClientRect().top <= 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [still]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || still || !('IntersectionObserver' in window)) return;
    const seen = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: '60px 0px' });
    seen.observe(canvas);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [still]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-weather={season}
      className={cn(
        'pointer-events-none transition-opacity duration-[1200ms] ease-out motion-reduce:transition-none',
        // Never over the words (audit M6): on phones the air starts below them, over the town's band; on wide
        // screens it keeps to the town's side. It still fades out before the hero's bottom edge. The canvas covers
        // only the part its mask shows (the hero's lower half on phones, its right 66% on wide screens; the
        // gradients are the hero-wide ones rescaled), so no frame draws air nobody sees. Prefixed, so they win
        // over the hero's `inset-0 size-full`.
        'max-lg:top-1/2 max-lg:h-1/2 lg:left-[34%] lg:w-[66%]',
        '[mask-image:linear-gradient(to_bottom,transparent_0%,#000_24%,#000_60%,transparent)]',
        'lg:[mask-image:linear-gradient(to_right,transparent_0%,#000_24.24%),linear-gradient(to_bottom,#000,#000_78%,transparent)] lg:[mask-composite:intersect]',
        ready ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  );
}
