/** The tiles for every map: any MapLibre style (`MAP_STYLE_URL`) and its attribution; OpenFreeMap by default, free and keyless. */
export function mapTiles(): { styleUrl: string; attribution: string } {
  return {
    styleUrl: process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
    attribution: process.env.MAP_ATTRIBUTION || 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  };
}
