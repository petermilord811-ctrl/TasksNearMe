/**
 * The contiguous US for the minimap's view of the country: Natural Earth's 1:110m country outline (public domain,
 * naturalearthdata.com), in the usual USA Albers equal-area conic (standard parallels 29.5° and 45.5° N, origin 23° N
 * 96° W), simplified and fitted to a box 300 wide. `projectUS` places any point (a city, the visitor) the same way.
 */
export const US_VIEW = { width: 300, height: 190.96 };
const US_FIT = { minX: -0.369042, maxY: 0.497926, scale: 398.6908, pad: 6 };
export const US_PATH =
  'M30.7,6.0L61.1,13.7L102.2,20.4L147.5,23.4L157.0,23.4L157.0,20.7L158.6,20.7L159.4,24.5L160.9,25.6L168.9,26.9L173.6,28.9L177.3,27.8L184.7,29.0L188.7,26.8L206.1,34.8L207.8,37.8L209.9,37.0L211.5,39.6L213.6,40.2L213.2,41.5L218.7,44.0L222.5,56.0L219.0,67.0L219.7,68.7L221.6,69.5L228.2,64.8L233.2,62.9L239.2,58.3L237.3,54.3L239.3,52.8L248.7,51.0L249.7,48.0L256.1,39.6L272.2,35.6L272.2,33.8L275.3,31.5L276.1,22.4L278.2,16.4L280.2,17.7L282.9,15.7L285.5,17.0L288.3,26.0L294.0,30.7L290.0,35.5L281.2,42.7L279.4,49.2L280.3,52.8L282.9,55.9L285.0,55.5L283.8,53.2L285.7,54.3L285.8,56.3L272.0,63.0L268.3,66.0L275.4,62.9L277.2,63.8L270.6,67.6L267.4,68.4L267.3,67.5L266.2,69.8L267.8,69.7L267.9,74.9L265.3,81.1L264.5,79.4L261.2,77.9L263.1,81.4L264.7,82.3L265.3,84.9L262.4,94.1L262.5,88.9L259.2,86.8L257.4,81.3L257.0,84.4L259.1,88.6L255.3,88.2L259.5,89.7L261.1,96.2L262.7,96.3L266.0,105.3L263.6,111.1L258.3,114.3L255.4,119.1L252.6,120.1L250.2,123.1L249.8,125.6L241.6,134.9L239.5,139.5L239.4,144.5L241.2,149.1L247.5,159.1L248.1,162.1L252.3,169.5L253.0,176.8L252.2,181.2L250.4,182.4L247.2,182.1L245.7,179.3L243.1,178.1L234.0,165.3L234.6,160.6L232.4,157.0L227.0,151.9L224.5,151.1L218.8,155.0L214.5,151.8L210.5,150.5L203.9,152.0L198.5,151.7L191.6,153.8L192.8,155.6L192.9,158.4L194.3,159.7L193.2,160.7L190.9,159.8L188.7,161.2L184.3,161.3L179.6,157.8L174.3,158.9L169.9,157.5L161.1,159.8L155.6,165.0L149.5,168.0L146.1,171.2L144.6,174.3L144.5,179.1L145.9,184.8L143.5,185.0L134.2,181.1L131.3,172.9L127.8,168.8L123.1,159.7L119.0,156.7L114.0,156.5L109.8,161.7L105.0,159.3L102.0,156.9L99.2,149.1L91.4,140.5L81.2,139.3L80.8,142.2L64.5,139.9L44.1,127.7L44.9,126.5L30.9,124.9L30.7,121.2L28.0,116.4L25.6,114.9L25.4,112.8L22.4,111.7L20.9,109.4L15.9,107.4L14.8,106.0L15.1,102.1L11.7,93.8L10.0,83.2L10.6,81.7L6.6,71.9L7.6,66.2L6.0,61.8L8.8,56.5L10.4,50.7L10.4,45.1L14.2,39.4L19.1,27.6L20.9,18.5L20.9,8.9L21.8,7.8L27.6,12.0L28.2,18.9L29.8,17.5Z';

const RAD = Math.PI / 180;
const PHI1 = 29.5 * RAD;
const PHI2 = 45.5 * RAD;
const PHI0 = 23 * RAD;
const LAM0 = -96 * RAD;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

/** Where a point falls on the outline's box (its x and y, 0 at the box's top-left corner). */
export function projectUS(point: { lat: number; lng: number }): { x: number; y: number } {
  const rho = Math.sqrt(C - 2 * N * Math.sin(point.lat * RAD)) / N;
  const theta = N * (point.lng * RAD - LAM0);
  const x = rho * Math.sin(theta);
  const y = RHO0 - rho * Math.cos(theta);
  return { x: (x - US_FIT.minX) * US_FIT.scale + US_FIT.pad, y: (US_FIT.maxY - y) * US_FIT.scale + US_FIT.pad };
}

export interface LabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where each city's name goes on the country drawn `width` pixels wide: the first side of its dot (right, left, above,
 * below) that stays inside and clear of the dots and the names already placed; open cities first.
 */
export function placeCityLabels<City extends { name: string; status: string; point: { lat: number; lng: number } }>(cities: City[], width: number): { city: City; box: LabelBox }[] {
  const scale = width / US_VIEW.width;
  const drawingHeight = Math.round(US_VIEW.height * scale);
  const height = 16;
  const dots = cities.map((city) => {
    const at = projectUS(city.point);
    return { city, x: at.x * scale, y: at.y * scale };
  });
  const taken: LabelBox[] = dots.map(({ x, y }) => ({ left: x - 7, top: y - 7, width: 14, height: 14 }));
  const inside = (box: LabelBox) => box.left >= 2 && box.top >= 2 && box.left + box.width <= width - 2 && box.top + box.height <= drawingHeight - 2;
  const clear = (box: LabelBox) => taken.every((other) => box.left + box.width <= other.left || other.left + other.width <= box.left || box.top + box.height <= other.top || other.top + other.height <= box.top);
  const order = [...dots].sort((a, b) => Number(b.city.status === 'live') - Number(a.city.status === 'live'));
  return order.map(({ city, x, y }) => {
    // About 5.8 px a letter at the label's size, plus its padding.
    const labelWidth = Math.round(city.name.length * 5.8 + 12);
    const right = { left: x + 9, top: y - height / 2, width: labelWidth, height };
    const left = { left: x - 9 - labelWidth, top: y - height / 2, width: labelWidth, height };
    // Away from the nearest other city first, so a name never sits between two dots and reads as the other's.
    const others = dots.filter((dot) => dot.city !== city);
    const nearest = others.length > 0 ? others.reduce((best, dot) => (Math.hypot(dot.x - x, dot.y - y) < Math.hypot(best.x - x, best.y - y) ? dot : best)) : null;
    const sides: LabelBox[] = [
      ...(nearest && nearest.x > x ? [left, right] : [right, left]),
      { left: x - labelWidth / 2, top: y - 10 - height, width: labelWidth, height },
      { left: x - labelWidth / 2, top: y + 10, width: labelWidth, height },
    ];
    const box = sides.find((side) => inside(side) && clear(side)) ?? sides.find(inside) ?? sides[0]!;
    taken.push(box);
    return { city, box };
  });
}
