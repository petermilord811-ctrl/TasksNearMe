/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import { TIMELINE_EVENT_TYPES } from '@/contracts';
import { deskTimelineCompleted } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import timelineMessages from '../../../../messages/en/ui/timeline.json';
import { Timeline } from './timeline';

afterEach(cleanup);

it('labels every timeline event and displays supplied money in order', () => {
  for (const type of TIMELINE_EVENT_TYPES) expect(timelineMessages).toHaveProperty(type);
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><Timeline events={deskTimelineCompleted} /></NextIntlClientProvider>);
  const events = screen.getAllByRole('listitem');
  expect(events).toHaveLength(deskTimelineCompleted.length);
  expect(events[0]).toHaveTextContent('Task posted');
  expect(screen.getByText('Payment received · $66.00')).toBeVisible();
  expect(events.at(-1)).toHaveTextContent('Earnings transferred · $54.00');
});
