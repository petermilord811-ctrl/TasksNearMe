import { useTranslations } from 'next-intl';
import type { HelperSummary, PreviewEntry, TaskPublicView } from '@/contracts';
import { cleaningPublicTask, deskPublicTask, jordan, lee, remoteComputerPublicTask, sam, yardPublicTask } from '@/fixtures';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { HelperCard } from '@/ui/components/people/helper-card';
import taskCopy from '../../../messages/en/ui/taskCard.json';
import helperCopy from '../../../messages/en/ui/helperCard.json';

const now = '2026-11-17T15:00:00.000Z';
const hourlyTask: TaskPublicView = {
  ...deskPublicTask,
  budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 4 },
};

type TaskTitle = 'desk' | 'yard' | 'cleaningFlexible' | 'remote' | 'hourly';
type HelperTitle = 'samFull' | 'jordanFounding' | 'leeCompact';

function TaskPreview({ task, title }: { task: TaskPublicView; title: TaskTitle }) {
  const t = useTranslations('taskCard');
  return (
    <main className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t(`preview.${title}`)}</h1>
      <PublicTaskCard task={task} now={now} headingLevel={2} />
    </main>
  );
}

function HelperPreview({ helper, title, variant = 'full' }: { helper: HelperSummary; title: HelperTitle; variant?: 'compact' | 'full' }) {
  const t = useTranslations('helperCard');
  return (
    <main className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t(`preview.${title}`)}</h1>
      <section>
        <h2 className="sr-only">{t('preview.profile')}</h2>
        <HelperCard helper={helper} variant={variant} />
      </section>
    </main>
  );
}

export const publicCardPreviews: PreviewEntry[] = [
  { id: 'task-card/desk', group: taskCopy.preview.group, title: taskCopy.preview.desk, render: () => <TaskPreview task={deskPublicTask} title="desk" /> },
  { id: 'task-card/yard', group: taskCopy.preview.group, title: taskCopy.preview.yard, render: () => <TaskPreview task={yardPublicTask} title="yard" /> },
  { id: 'task-card/cleaning-flexible', group: taskCopy.preview.group, title: taskCopy.preview.cleaningFlexible, render: () => <TaskPreview task={cleaningPublicTask} title="cleaningFlexible" /> },
  { id: 'task-card/remote', group: taskCopy.preview.group, title: taskCopy.preview.remote, render: () => <TaskPreview task={remoteComputerPublicTask} title="remote" /> },
  { id: 'task-card/hourly', group: taskCopy.preview.group, title: taskCopy.preview.hourly, render: () => <TaskPreview task={hourlyTask} title="hourly" /> },
  { id: 'helper-card/sam-full', group: helperCopy.preview.group, title: helperCopy.preview.samFull, render: () => <HelperPreview helper={sam} title="samFull" /> },
  { id: 'helper-card/jordan-founding', group: helperCopy.preview.group, title: helperCopy.preview.jordanFounding, render: () => <HelperPreview helper={jordan} title="jordanFounding" /> },
  { id: 'helper-card/lee-compact', group: helperCopy.preview.group, title: helperCopy.preview.leeCompact, render: () => <HelperPreview helper={lee} title="leeCompact" variant="compact" /> },
];
