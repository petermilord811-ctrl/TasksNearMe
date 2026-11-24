'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapPoint } from '@/contracts';

/**
 * Where this device is, for a trip on the task map: asked for only when the person presses "Use my location", or
 * found at once when they've allowed it on an earlier visit (no question). It stays in the browser: nothing here sends
 * it anywhere.
 */
export type DeviceLocation =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'found'; point: MapPoint; accuracyMeters?: number }
  | { status: 'denied' }
  | { status: 'unavailable' };

export function useDeviceLocation(): { location: DeviceLocation; locate: () => void } {
  const [location, setLocation] = useState<DeviceLocation>({ status: 'idle' });
  const asked = useRef(false);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocation({ status: 'unavailable' });
      return;
    }
    asked.current = true;
    setLocation((current) => (current.status === 'found' ? current : { status: 'locating' }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : undefined;
        setLocation({ status: 'found', point: { lat: position.coords.latitude, lng: position.coords.longitude }, ...(accuracy !== undefined ? { accuracyMeters: accuracy } : {}) });
      },
      (error) => setLocation(error.code === error.PERMISSION_DENIED ? { status: 'denied' } : { status: 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 15_000 },
    );
  }, []);

  // Allowed before: found as the map opens, without a question. The answer is read after the first paint.
  useEffect(() => {
    let stopped = false;
    const timer = window.setTimeout(() => {
      if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (!stopped && status.state === 'granted' && !asked.current) locate();
        })
        .catch(() => {});
    }, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [locate]);

  return { location, locate };
}
