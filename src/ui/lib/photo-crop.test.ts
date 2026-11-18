import { describe, expect, it } from 'vitest';
import { clampCrop, displayedSize, initialCrop, MAX_ZOOM, moveCrop, photoBox, sourceSquare } from './photo-crop';

const landscape = { width: 1600, height: 1200 };
const portrait = { width: 900, height: 1400 };

describe('the profile photo crop (plan 9.3)', () => {
  it('covers the square frame with the shorter edge at zoom 1', () => {
    expect(displayedSize(landscape, 1)).toEqual({ width: 4 / 3, height: 1 });
    expect(displayedSize(portrait, 2).width).toBe(2);
  });

  it('starts centred and draws the middle square of the photo', () => {
    expect(sourceSquare(landscape, initialCrop)).toEqual({ x: 200, y: 0, size: 1200 });
    expect(sourceSquare(portrait, initialCrop)).toEqual({ x: 0, y: 250, size: 900 });
  });

  it('never leaves part of the frame empty', () => {
    // As far left as it goes: the photo's left edge stays at the frame's left edge.
    const left = moveCrop(landscape, initialCrop, 5, 0);
    expect(photoBox(landscape, left).left).toBeCloseTo(0);
    expect(sourceSquare(landscape, left).x).toBeCloseTo(0);
    const right = moveCrop(landscape, initialCrop, -5, 0);
    expect(sourceSquare(landscape, right).x + sourceSquare(landscape, right).size).toBeCloseTo(1600);
    // A landscape photo at zoom 1 can't move up or down.
    expect(moveCrop(landscape, initialCrop, 0, 1).center.y).toBe(0.5);
  });

  it('zooms between 1 and 3 and keeps the chosen point in the middle', () => {
    expect(clampCrop(landscape, { zoom: 10, center: { x: 0.5, y: 0.5 } }).zoom).toBe(MAX_ZOOM);
    expect(clampCrop(landscape, { zoom: 0.2, center: { x: 0.5, y: 0.5 } }).zoom).toBe(1);
    const zoomed = clampCrop(portrait, { zoom: 2, center: { x: 0.3, y: 0.4 } });
    const square = sourceSquare(portrait, zoomed);
    expect(square.size).toBe(450);
    expect(square.x + square.size / 2).toBeCloseTo(0.3 * 900);
    expect(square.y + square.size / 2).toBeCloseTo(0.4 * 1400);
  });
});
