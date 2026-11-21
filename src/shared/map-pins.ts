import type { TaskMapPin, TaskPublicView } from '@/contracts';

/**
 * A public task as a pin on the landing page's map: its general area only (the public point is already moved
 * 300–800 m from the real place), never an address. Remote tasks have no place, so no pin. The landing's query and
 * the market's live stream both go through here, so a pin looks the same however it reached the map.
 */
export function taskMapPinOf(task: TaskPublicView): TaskMapPin | null {
  if (task.location.kind !== 'local') return null;
  return {
    id: task.id,
    slug: task.slug,
    title: task.title,
    categorySlug: task.categorySlug,
    areaName: task.location.areaName,
    point: task.location.publicPoint,
    radiusMeters: task.location.radiusMeters,
    budget: task.budget,
    windowStart: task.schedule.windowStart,
    windowEnd: task.schedule.windowEnd,
    offerCount: task.offerCount,
    postedAt: task.postedAt,
  };
}
