/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type TaskPublicView } from '@/contracts';
import { cleaningPublicTask, deskPublicTask, remoteComputerPublicTask, yardPublicTask } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import taskCard from '../../../../messages/en/ui/taskCard.json';
import { PublicTaskCard } from './public-task-card';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';

function renderTask(task: TaskPublicView, headingLevel?: 2 | 3) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ...uiMessages, taskCard }}><TimeZoneProvider timeZone="America/Chicago">
      <PublicTaskCard task={task} now={now} headingLevel={headingLevel} />
    </TimeZoneProvider></NextIntlClientProvider>,
  );
}

describe('PublicTaskCard', () => {
  it('shows the public area, fixed budget, canonical time window, and poster trust signals', () => {
    renderTask(deskPublicTask);
    expect(screen.getByText('Mueller')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
    expect(screen.getByText('Sat, Nov 21 · 10:00 am–1:00 pm')).toBeInTheDocument();
    expect(screen.getByText('3 offers')).toBeInTheDocument();
    expect(screen.getByText('Maya R.')).toBeInTheDocument();
    // Reddit-style account age (2026-11-27): Maya joined Sep 4, so 2 months by Nov 17.
    expect(screen.getByText('Account age: 2 months')).toBeInTheDocument();
    expect(screen.getByTitle('Joined Sep 4, 2026')).toHaveTextContent('Account age 2 mo');
    expect(screen.getByRole('button', { name: 'Phone verified' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: deskPublicTask.title })).toHaveAttribute('href', routes.publicTask(deskPublicTask.slug));
    expect(screen.queryByText(/Example Lane/)).not.toBeInTheDocument();
  });

  it('labels remote tasks and honors the requested heading level', () => {
    renderTask(remoteComputerPublicTask, 2);
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: remoteComputerPublicTask.title })).toBeInTheDocument();
  });

  it('shows the supplied hourly rate and hours cap without calculating a total', () => {
    renderTask({ ...deskPublicTask, budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 4 } });
    expect(screen.getByText('$35.00/h, up to 4 h')).toBeInTheDocument();
    expect(screen.queryByText('$140.00')).not.toBeInTheDocument();
  });

  it('shows the flexible date and zero-offer wording', () => {
    renderTask(cleaningPublicTask);
    expect(screen.getByText('Any time on Wed, Nov 25')).toBeInTheDocument();
    expect(screen.getByText('No offers yet')).toBeInTheDocument();
    expect(screen.queryByText(/1:00 pm–5:00 pm/)).not.toBeInTheDocument();
  });

  it('uses singular offer wording and the supplied clock for posted age', () => {
    renderTask(yardPublicTask);
    expect(screen.getByText('1 offer')).toBeInTheDocument();
    expect(screen.getByText('Posted 2 days ago')).toBeInTheDocument();
  });

  it('does not invent phone verification', () => {
    renderTask({ ...deskPublicTask, poster: { ...deskPublicTask.poster, phoneVerified: false } });
    expect(screen.queryByRole('button', { name: 'Phone verified' })).not.toBeInTheDocument();
  });

  it('shows both dates once for a window across midnight in Austin', () => {
    renderTask({ ...deskPublicTask, schedule: { windowStart: '2026-11-22T04:00:00.000Z', windowEnd: '2026-11-22T07:00:00.000Z', flexible: false } });
    expect(screen.getByText('Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am')).toBeInTheDocument();
  });
});
