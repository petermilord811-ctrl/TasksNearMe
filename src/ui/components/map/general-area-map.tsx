'use client';

import { useTranslations } from 'next-intl';
import type { PublicLocation } from '@/contracts';
import { AreaMap } from './area-map';
import { useMapTiles } from './map-tiles';

/** One task's general area on the map: its circle around the public point (never the address). */
export function GeneralAreaMap({ location, live = true, className = 'h-56' }: { location: PublicLocation; live?: boolean; className?: string }) {
  const t = useTranslations('location');
  const tiles = useMapTiles();
  const label = t('mapDescription', { area: location.areaName, market: location.marketName });
  return <AreaMap
    styleUrl={tiles.styleUrl}
    attribution={tiles.attribution}
    places={[{ id: 'area', point: location.publicPoint, radiusMeters: location.radiusMeters, label: location.areaName, name: label }]}
    fallbackCenter={location.publicPoint}
    label={label}
    groupLabel={(count) => String(count)}
    live={live}
    className={className}
  />;
}
