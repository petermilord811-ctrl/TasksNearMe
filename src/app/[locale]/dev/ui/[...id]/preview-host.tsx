'use client';

import { MapTilesProvider, useMapTiles } from '@/ui/components/map/map-tiles';
import { previews } from '@/ui/previews/registry';

/** Client boundary so previews can pass plain functions (fake handlers) to components. */
export function PreviewHost({ id }: { id: string }) {
  // Previews draw maps without live tiles, so screenshots don't depend on the network.
  const tiles = useMapTiles();
  const entry = previews.find((p) => p.id === id);
  if (!entry) {
    return (
      <p role="alert" style={{ padding: 24 }}>
        Unknown preview: {id}
      </p>
    );
  }
  return (
    <div data-preview-root={entry.id} style={entry.layout === 'fullscreen' ? undefined : { padding: 16 }}>
      <MapTilesProvider tiles={{ ...tiles, live: false }}>{entry.render()}</MapTilesProvider>
    </div>
  );
}
