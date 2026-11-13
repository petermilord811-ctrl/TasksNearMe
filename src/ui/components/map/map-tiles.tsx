'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The map tiles every map uses (any MapLibre style and its attribution), set once by the root layout from
 * the app's configuration (`MAP_STYLE_URL`, `MAP_ATTRIBUTION`; OpenFreeMap by default, free and keyless).
 */
export interface MapTiles {
  styleUrl: string;
  attribution: string;
}

const DEFAULT_TILES: MapTiles = {
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
};

const MapTilesContext = createContext<MapTiles>(DEFAULT_TILES);

export function MapTilesProvider({ tiles, children }: { tiles: MapTiles; children: ReactNode }) {
  return <MapTilesContext.Provider value={tiles}>{children}</MapTilesContext.Provider>;
}

export function useMapTiles(): MapTiles {
  return useContext(MapTilesContext);
}
