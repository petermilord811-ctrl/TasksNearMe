import type { ReactNode } from 'react';
import type { PreviewEntry, TaskMapBundle } from '@/contracts';
import { taskMapDarkBundle, taskMapHelperBundle, taskMapIndoorBundle, taskMapLaterBundle, taskMapStormBundle, taskMapUnavailableBundle } from '@/fixtures';
import { TaskMapPanel } from '@/ui/components/map/task-map-panel';
import copy from '../../../messages/en/ui/taskMap.json';

/** The task map's states (contracts/task-map.ts), as a task page's "Where" card shows them. */
function Frame({ map }: { map: TaskMapBundle }): ReactNode {
  return <main className="mx-auto max-w-reading py-4">
    <section className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <TaskMapPanel map={map} live={false} />
    </section>
  </main>;
}

const entry = (id: string, title: string, map: TaskMapBundle, notes?: string): PreviewEntry => ({ id: `task-map/${id}`, group: copy.previews.group, title, render: () => <Frame map={map} />, ...(notes ? { notes } : {}) });

export const taskMapPreviews: PreviewEntry[] = [
  entry('helper', copy.previews.helper, taskMapHelperBundle, 'The trip starts at the home neighborhood without asking for the location; "Open map" shows it large.'),
  entry('storm', copy.previews.storm, taskMapStormBundle, 'No location yet: the trip asks first. Hour by hour with rain bars, the storm and wind notes.'),
  entry('indoor', copy.previews.indoor, taskMapIndoorBundle),
  entry('later', copy.previews.later, taskMapLaterBundle),
  entry('dark', copy.previews.dark, taskMapDarkBundle),
  entry('unavailable', copy.previews.unavailable, taskMapUnavailableBundle),
];
