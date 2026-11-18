/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import uiMessages from '../../../../messages/en/ui';
import { BookingHubSkeleton } from '@/ui/screens/bookings/booking-hub-skeleton';
import { BookingsSkeleton } from '@/ui/screens/bookings/bookings-skeleton';
import { DashboardSkeleton } from '@/ui/screens/home/dashboard-skeleton';
import { InboxSkeleton } from '@/ui/screens/messages/inbox-skeleton';
import { ThreadSkeleton } from '@/ui/screens/messages/thread-skeleton';
import { CategorySkeleton } from '@/ui/screens/public/category-skeleton';
import { TaskBoardSkeleton } from '@/ui/screens/public/task-board-skeleton';
import { MyTasksSkeleton } from '@/ui/screens/tasks/my-tasks-skeleton';
import { OfferDetailSkeleton, TaskManageSkeleton } from '@/ui/screens/tasks/task-detail-skeletons';
import { FindWorkSkeleton } from '@/ui/screens/work/find-work-skeleton';

afterEach(cleanup);

const skeletons: [string, () => ReactElement][] = [
  ['dashboard', () => <DashboardSkeleton />],
  ['my tasks', () => <MyTasksSkeleton />],
  ['bookings', () => <BookingsSkeleton />],
  ['a booking', () => <BookingHubSkeleton />],
  ['messages', () => <InboxSkeleton />],
  ['a conversation', () => <ThreadSkeleton />],
  ['a task', () => <TaskManageSkeleton />],
  ['an offer', () => <OfferDetailSkeleton />],
  ['find work', () => <FindWorkSkeleton />],
  ['the task board', () => <TaskBoardSkeleton />],
  ['a category page', () => <CategorySkeleton />],
];

describe('page skeletons', () => {
  it.each(skeletons)('%s: one busy status that says it is loading, and no shapes for screen readers', (_, skeleton) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={uiMessages}>{skeleton()}</NextIntlClientProvider>);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent(uiMessages.feedback.loading);
    // Everything drawn sits inside one aria-hidden block, so only the announcement is read.
    const shapes = container.querySelectorAll('[data-slot="skeleton"]');
    expect(shapes.length).toBeGreaterThan(3);
    for (const shape of shapes) expect(shape.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
