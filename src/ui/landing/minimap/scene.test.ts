import { beforeAll, describe, expect, it } from 'vitest';
import { cameraPose, projector } from './camera';
import { pointInPolygon } from './geometry';
import { buildTown, COMPOSITION, GROUND, LEVELS, onPlate, PIN_HEAD, PIN_LIFT, PIN_SCALE, TOWN_LAYOUTS, type TownLayout, type TownScene } from './scene';
import { SLOT_ANCHORS, SLOT_IDS } from './slots';

const towns = new Map<TownLayout, TownScene>();

beforeAll(() => {
  for (const layout of TOWN_LAYOUTS) towns.set(layout, buildTown(layout));
});

describe.each(TOWN_LAYOUTS)('the mini-map town (%s)', (layout) => {
  const town = () => towns.get(layout)!;

  it('is the same on every build', () => {
    const again = buildTown(layout);
    expect(again.houses.length).toBe(town().houses.length);
    expect(again.trees.length).toBe(town().trees.length);
    expect(again.houses.slice(0, 5)).toEqual(town().houses.slice(0, 5));
    expect(again.slabs.map((slab) => slab.outline.length)).toEqual(town().slabs.map((slab) => slab.outline.length));
  });

  it('has a few plates, each on its terraces, and a town on them', () => {
    const tops = town().slabs.filter((slab) => slab.level === LEVELS.length - 1);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    expect(town().houses.length).toBeGreaterThan(layout === 'wide' ? 30 : 15);
    expect(town().trees.length).toBeGreaterThan(layout === 'wide' ? 150 : 80);
    expect(town().bridges.length).toBeGreaterThanOrEqual(3);
    expect(town().water.length).toBeGreaterThan(0);
  });

  it('stands every house and tree on a plate, and no two houses on each other', () => {
    for (const house of town().houses) {
      const { w, d } = house.type;
      for (const corner of [{ x: house.x, y: house.y }, { x: house.x + w, y: house.y }, { x: house.x, y: house.y + d }, { x: house.x + w, y: house.y + d }]) {
        expect(onPlate(town(), corner)).toBe(true);
      }
    }
    for (const tree of town().trees) expect(onPlate(town(), tree)).toBe(true);
    town().houses.forEach((a, i) => {
      town().houses.slice(i + 1).forEach((b) => {
        const apart = a.x + a.type.w <= b.x || b.x + b.type.w <= a.x || a.y + a.type.d <= b.y || b.y + b.type.d <= a.y;
        expect(apart).toBe(true);
      });
    });
  });

  it('lands both ends of every bridge on a plate', () => {
    for (const bridge of town().bridges) {
      expect(onPlate(town(), bridge.from)).toBe(true);
      expect(onPlate(town(), bridge.to)).toBe(true);
    }
  });

  it('puts a pin on a house for every slot, inside the stage, where the cards expect it', () => {
    const { stage, view } = town().composition;
    const project = projector(cameraPose(0, 0, 0, 1, view), stage);
    expect(town().slots.map((slot) => slot.id)).toEqual([...SLOT_IDS]);
    for (const slot of town().slots) {
      expect(onPlate(town(), slot.at)).toBe(true);
      expect(town().houses.some((house) => pointInPolygon(slot.at, [{ x: house.x, y: house.y }, { x: house.x + house.type.w, y: house.y }, { x: house.x + house.type.w, y: house.y + house.type.d }, { x: house.x, y: house.y + house.type.d }]))).toBe(true);
      const anchors = SLOT_ANCHORS[layout][slot.id as keyof (typeof SLOT_ANCHORS)[TownLayout]];
      const at = (height: number) => {
        const p = project({ x: slot.at.x, y: height, z: slot.at.y });
        return { x: p.x / stage.width, y: p.y / stage.height };
      };
      const head = at(slot.height + PIN_LIFT + PIN_HEAD * PIN_SCALE);
      const top = at(slot.height + PIN_LIFT + (PIN_HEAD + 8) * PIN_SCALE);
      const base = at(GROUND);
      for (const [expected, actual] of [[anchors.head, head], [anchors.top, top], [anchors.base, base]] as const) {
        expect(Math.abs(expected.x - actual.x)).toBeLessThan(0.002);
        expect(Math.abs(expected.y - actual.y)).toBeLessThan(0.002);
      }
      // A pin and its rings stay inside the stage, so no layout crops one in half.
      expect(head.x).toBeGreaterThan(0.04);
      expect(head.x).toBeLessThan(0.96);
      expect(top.y).toBeGreaterThan(0.03);
    }
  });
});

describe('the wide town', () => {
  it('keeps the plates clear of the headline (top-left of the stage)', () => {
    const town = towns.get('wide')!;
    const project = projector(cameraPose());
    const { x1, y1, radius } = COMPOSITION.text;
    // The headline's box, without its rounded corner.
    const insideText = (p: { x: number; y: number }) => (p.x < x1 - 4 && p.y < y1 - radius) || (p.x < x1 - radius && p.y < y1 - 4);
    for (const slab of town.slabs.filter((item) => item.level === LEVELS.length - 1)) {
      for (const point of slab.outline) expect(insideText(project({ x: point.x, y: GROUND, z: point.y }))).toBe(false);
    }
  });
});

describe.each(TOWN_LAYOUTS)('what the town is made of (%s)', (layout) => {
  const town = () => towns.get(layout)!;
  const rects = () => town().houses.map((house) => ({ x: house.x, y: house.y, w: house.type.w, d: house.type.d }));
  const overlaps = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
  const corners = (r: { x: number; y: number; w: number; d: number }) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.d }, { x: r.x + r.w, y: r.y + r.d }];

  it('mixes many kinds of buildings and places, not just one house shape', () => {
    const kinds = new Set(town().houses.map((house) => house.type.kind));
    for (const kind of ['house', 'modern', 'row', 'apartment', 'shop', 'church', 'plaza', 'court', 'tower', 'windmill', 'greenhouse'] as const) expect(kinds.has(kind)).toBe(true);
    const walls = new Set(town().houses.flatMap((house) => (house.units ? house.units.map((unit) => unit.wall) : [house.wall])));
    expect(walls.size).toBeGreaterThanOrEqual(5);
    const roofs = new Set(town().houses.flatMap((house) => (house.units ? house.units.map((unit) => unit.roof) : [house.tint])));
    expect(roofs.size).toBeGreaterThanOrEqual(5);
    // A town, not a forest: under five trees per building.
    const buildings = town().houses.filter((house) => house.type.kind !== 'yard').length;
    expect(town().trees.length / buildings).toBeLessThan(5);
    expect(new Set(town().trees.map((tree) => tree.variant)).size).toBeGreaterThanOrEqual(7);
  });

  it('gives townhouse rows their units, and planted roofs only to flat roofs', () => {
    for (const house of town().houses) {
      if (house.type.kind === 'row') expect(house.units?.length).toBeGreaterThanOrEqual(3);
      if (house.topping === 'garden') expect(house.type.roof).toBe(0);
    }
  });

  it('keeps pools, parked cars and café tables on the plates and out of the buildings', () => {
    for (const pool of town().pools) {
      for (const corner of corners(pool)) expect(onPlate(town(), corner)).toBe(true);
      for (const rect of rects()) expect(overlaps(pool, rect)).toBe(false);
    }
    for (const car of town().parked) {
      expect(onPlate(town(), car.at)).toBe(true);
      for (const rect of rects()) expect(overlaps({ x: car.at.x - 8, y: car.at.y - 8, w: 16, d: 16 }, rect)).toBe(false);
    }
    for (const table of town().tables) expect(onPlate(town(), table.at)).toBe(true);
  });

  it('runs docks from the bank out over the water, and kayaks along it', () => {
    expect(town().docks.length).toBeGreaterThan(0);
    for (const dock of town().docks) expect(town().fields.water(dock.to)).toBeLessThan(0);
    const kayaks = town().movers.filter((mover) => mover.kind === 'kayak');
    expect(kayaks.length).toBeGreaterThan(0);
    for (const kayak of kayaks) {
      const wet = kayak.path.filter((point) => town().fields.water(point) < 0).length;
      expect(wet / kayak.path.length).toBeGreaterThan(0.9);
    }
  });

  it("gives pins' houses a yard beside them for their task, clear of other buildings", () => {
    expect(town().yards.length).toBeGreaterThanOrEqual(4);
    for (const yard of town().yards) {
      for (const corner of corners(yard)) expect(onPlate(town(), corner)).toBe(true);
      const slot = town().slots.find((item) => item.id === yard.slotId)!;
      expect(Math.hypot(yard.x + yard.w / 2 - slot.at.x, yard.y + yard.d / 2 - slot.at.y)).toBeLessThan(110);
    }
  });

  it('flies balloons above everything', () => {
    expect(town().balloons.length).toBeGreaterThan(0);
    for (const balloon of town().balloons) expect(balloon.height).toBeGreaterThan(GROUND + 200);
  });

  it('can be built in a worker: all the 3D town draws is plain data (posting it clones it)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the fields' functions stay in the worker
    const { fields, ...model } = town();
    const posted = structuredClone(model);
    expect(posted.houses).toEqual(model.houses);
    expect(posted.waterGrid.water).toEqual(model.waterGrid.water);
  });

  it("samples the water's grid once, as the fields say (drawing and repainting it never evaluates them)", () => {
    const { waterGrid: grid, fields } = town();
    expect(grid.cols).toBeGreaterThan(10);
    expect(grid.water.length).toBe(grid.cols * grid.rows);
    expect(grid.land.length).toBe(grid.cols * grid.rows);
    for (const k of [0, grid.cols + 3, Math.floor(grid.water.length / 2), grid.water.length - 1]) {
      const at = { x: grid.x0 + (k % grid.cols) * grid.step, y: grid.y0 + Math.floor(k / grid.cols) * grid.step };
      expect(Math.abs(grid.water[k]! - fields.water(at))).toBeLessThan(0.01);
      expect(Math.abs(grid.land[k]! - fields.land(at))).toBeLessThan(0.01);
    }
    // Some cells are water (negative), some aren't.
    expect(grid.water.some((value) => value < 0)).toBe(true);
    expect(grid.water.some((value) => value > 0)).toBe(true);
  });
});
