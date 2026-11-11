import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { tasks } from '@/modules/tasks/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { EmptyState, PageHeader, PageSkeleton } from '@/ui/components';

/**
 * Temporary until the task management screen (UI-007): confirms a posted task to its poster and
 * links to the public view. Other people get a 404.
 */
export default function ManageTaskPage({ params }: PageProps<'/app/tasks/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <PostedTask params={params} />
    </Suspense>
  );
}

async function PostedTask({ params }: Pick<PageProps<'/app/tasks/[taskId]'>, 'params'>) {
  const { taskId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') notFound();
  const [task] = await db
    .select({ title: tasks.title, slug: tasks.slug })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.posterUserId, viewer.user.id)))
    .limit(1);
  if (!task) notFound();
  const t = await getTranslations('server.taskPosted');
  return (
    <div className="space-y-6">
      <PageHeader title={task.title} />
      <EmptyState title={t('title')} body={t('body')} action={{ href: routes.publicTask(task.slug), label: t('viewPublic') }} />
    </div>
  );
}
