import { describe, expect, it } from 'vitest';
import { dockFrame, farthestCorner, pinFlight, pinIn, stageMoment } from './timeline';

describe('the stage’s two steps', () => {
  it('starts on the town, with nothing of the map or the categories showing', () => {
    expect(stageMoment(0)).toMatchObject({ wordsOut: 0, dive: 0, townShown: true, ring: null, pullBack: 0, headingIn: 0, gridShown: false, dock: 0 });
  });

  it('moves one thing at a time in step one: words, then the window, then the camera, then the panels', () => {
    const early = stageMoment(0.2);
    expect(early.wordsOut).toBe(1);
    expect(early.ring).toBeGreaterThan(0);
    expect(early.ring).toBeLessThan(0.3);
    expect(early.pullBack).toBe(0);
    const open = stageMoment(0.54);
    expect(open.ring).toBe(1);
    expect(open.townShown).toBe(false);
    expect(open.headingIn).toBe(0);
    const pulling = stageMoment(0.7);
    expect(pulling.pullBack).toBeGreaterThan(0.3);
    expect(pulling.headingIn).toBe(0);
    expect(stageMoment(1)).toMatchObject({ pullBack: 1, flatten: 1, headingIn: 1, explorerIn: 1, pinMorph: null, panelsOut: 0, gridShown: false });
  });

  it('lets the panels go before the map docks, and lands every task in its count by the end', () => {
    const start = stageMoment(1.12);
    expect(start.panelsOut).toBeGreaterThan(0.5);
    expect(start.dock).toBeLessThan(0.1);
    expect(start.gridShown).toBe(true);
    expect(stageMoment(2)).toMatchObject({ panelsOut: 1, dock: 1, labelIn: 1 });
    for (let index = 0; index < 9; index++) {
      expect(pinIn(1, index)).toBe(1);
      expect(pinFlight(1, index)).toBe(1);
      expect(pinFlight(0.5, index)).toBe(0);
    }
  });

  it('docks the map by a uniform scale and a crop to the tile’s shape', () => {
    const screen = { width: 1600, height: 1000 };
    const tile = { x: 96, y: 310, width: 450, height: 305 };
    const focus = { x: 576, y: 540 };
    const whole = dockFrame(0, screen, tile, focus, 18);
    expect(whole.scale).toBe(1);
    expect(whole.translate).toEqual({ x: 0, y: 0 });
    expect(whole.crop).toMatchObject({ x: 0, y: 0, width: 1600, height: 1000 });
    const docked = dockFrame(1, screen, tile, focus, 18);
    expect(docked.shown).toEqual(tile);
    expect(docked.radius).toBe(18);
    expect(docked.crop.width * docked.scale).toBeCloseTo(tile.width);
    expect(docked.crop.height * docked.scale).toBeCloseTo(tile.height);
    expect(docked.crop.y + docked.crop.height).toBeLessThanOrEqual(1000);
    // The crop's top-left corner lands on the tile's.
    expect(docked.translate.x + docked.scale * docked.crop.x).toBeCloseTo(tile.x);
    expect(docked.translate.y + docked.scale * docked.crop.y).toBeCloseTo(tile.y);
  });

  it('opens the window past the screen’s farthest corner', () => {
    expect(farthestCorner(0, 0, 300, 400)).toBe(508);
  });
});
