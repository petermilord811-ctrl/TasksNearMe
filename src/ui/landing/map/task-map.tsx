'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { LandingMapData } from '@/contracts';
import { distanceMiles, roundMiles } from '@/shared/geo';
import { cn } from '@/ui/lib/utils';
import { useLanding } from '../landing-state';
import type { MapViewProps } from './maplibre-view';
import { StaticMap } from './static-map';

export type MapMode = 'interactive' | 'static';

/**
 * The map frame: the drawn map right away, then (in `interactive` mode, once the section is near the
 * viewport) the live MapLibre map, which fades in over it when its tiles and pins are drawn. If WebGL or
 * the tiles fail, the drawn map simply stays. Mid-size, soft edges, a faint glow behind it.
 */
export function TaskMap({ map, mode = 'interactive', className }: { map: LandingMapData; mode?: MapMode; className?: string }) {
  const { activeCategory, highlightedTaskId, setHighlightedTaskId, location } = useLanding();
  const userPoint = location.status === 'granted' ? location.point : undefined;
  const frameRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Live, setLive] = useState<ComponentType<MapViewProps> | null>(null);
  const [ready, setReady] = useState(false);

  const milesById = useMemo(
    () => (userPoint ? new Map(map.pins.map((pin) => [pin.id, roundMiles(distanceMiles(userPoint, pin.point))])) : undefined),
    [userPoint, map.pins],
  );

  useEffect(() => {
    if (mode === 'static') return;
    const frame = frameRef.current;
    if (!frame || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!near || failed || Live) return;
    let cancelled = false;
    import('./maplibre-view')
      .then((module) => {
        if (!cancelled) setLive(() => module.MapLibreView);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [near, failed, Live]);

  const showLive = Boolean(Live) && !failed;
  const liveReady = showLive && ready;

  return (
    <div ref={frameRef} className={cn('relative aspect-[4/3] w-full', className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] opacity-70 blur-2xl"
        style={{ background: 'radial-gradient(60% 55% at 30% 35%, color-mix(in oklab, var(--iri-1) 22%, transparent), transparent 70%), radial-gradient(55% 50% at 75% 70%, color-mix(in oklab, var(--iri-3) 20%, transparent), transparent 70%)' }}
      />
      <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'pointer-events-none opacity-0' : 'opacity-100')}>
        <StaticMap
          map={map}
          pins={map.pins}
          activeCategory={activeCategory}
          highlightedTaskId={liveReady ? null : highlightedTaskId}
          onHighlight={setHighlightedTaskId}
          userPoint={userPoint}
          milesById={milesById}
        />
      </div>
      {showLive && Live && (
        <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <Live
            map={map}
            pins={map.pins}
            activeCategory={activeCategory}
            highlightedTaskId={highlightedTaskId}
            onHighlight={setHighlightedTaskId}
            userPoint={userPoint}
            milesById={milesById}
            onReady={() => setReady(true)}
            onFailed={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  );
}
