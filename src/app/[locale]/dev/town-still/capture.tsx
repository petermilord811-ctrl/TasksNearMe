'use client';

import { useEffect, useRef, useState } from 'react';
import { parseSeason } from '@/shared/seasons';
import type { TownView } from '@/ui/landing/minimap/town';

/**
 * The still pictures' frames (CSS px, drawn at 2×): the wide one is 2600 × 1000 with its 16:10 stage on the right
 * and 1000 units of land to its left (town-stage.tsx places it so); the band is its 10:8 stage, 1250 × 1000.
 */
const FRAMES: Record<'wide' | 'band', TownView> = {
  wide: { width: 1300, height: 500, stage: { left: 500, top: 0, width: 800, height: 500 } },
  band: { width: 625, height: 500, stage: { left: 0, top: 0, width: 625, height: 500 } },
};

declare global {
  interface Window {
    __townStill?: string;
    __townStillError?: string;
  }
}

/**
 * Draws the hero town once, complete and at rest, for `?layout=wide|band&theme=light|dark&season=…`, and leaves
 * the picture as a WebP data URL on `window.__townStill` (scripts/render-town-stills.mjs saves it). It draws on
 * whatever WebGL the browser has, software included: the picture is the same, only slower.
 */
export function TownStillCapture() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('drawing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const params = new URLSearchParams(window.location.search);
    const layout = params.get('layout') === 'band' ? 'band' : 'wide';
    const scheme = params.get('theme') === 'dark' ? 'dark' : 'light';
    const season = parseSeason(params.get('season')) ?? 'fall';
    const quality = Math.min(1, Math.max(0.5, Number(params.get('quality')) || 0.86));
    const frame = FRAMES[layout];
    canvas.style.width = `${frame.width}px`;
    canvas.style.height = `${frame.height}px`;
    let stopped = false;
    let dispose = () => {};
    void (async () => {
      const { createTown, townPalette } = await import('@/ui/landing/minimap/town');
      const town = await createTown(canvas, {
        palette: townPalette(scheme, season),
        shadowSize: 2048,
        layout,
        buildUp: false,
        size: { width: frame.width, height: frame.height, pixelRatio: 2, view: frame },
      });
      dispose = () => town.dispose();
      if (stopped) return dispose();
      town.finishIntro();
      town.renderOnce();
      // Read in the same task as the draw, before the browser clears the drawing buffer.
      window.__townStill = canvas.toDataURL('image/webp', quality);
      setStatus(`done: ${layout} ${scheme} ${season}`);
    })().catch((error: unknown) => {
      window.__townStillError = String(error);
      setStatus(`failed: ${String(error)}`);
    });
    return () => {
      stopped = true;
      dispose();
    };
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif', background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 20px 20px' }}>
      <p data-status={status}>{status}</p>
      <canvas ref={canvasRef} />
    </main>
  );
}
