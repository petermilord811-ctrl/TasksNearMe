/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { sparksActiveData, sparksPillarBoughtData, sparksTopData } from '@/fixtures';
import type { SparksPageData } from '@/contracts';
import uiMessages from '../../../../messages/en/ui';
import { SparksMilestones } from './sparks-milestones';

/** Sparks' levels as a milestone track (2026-11-24). */

afterEach(cleanup);

function show(data: SparksPageData) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}>
    <SparksMilestones levels={data.levels} total={data.summary.total} current={data.summary.level} />
  </NextIntlClientProvider>);
}

describe('SparksMilestones', () => {
  it('lists the six milestones in order and marks the person’s own', () => {
    show(sparksActiveData);
    const track = screen.getByRole('list', { name: 'Milestones' });
    const items = within(track).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Newcomer · Reached',
      'Neighbor · Reached',
      'Good neighbor · Your milestone',
      'Friendly face · Not reached yet',
      'Pillar · Not reached yet',
      'Local legend · Not reached yet',
    ]);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1);
    expect(items[3]).toHaveTextContent('From 750');
    expect(items[3]).toHaveTextContent('30 chats a day');
  });

  it('says that the top two show the contact details helpers share', () => {
    show(sparksPillarBoughtData);
    const items = within(screen.getByRole('list', { name: 'Milestones' })).getAllByRole('listitem');
    expect(items.filter((item) => item.textContent?.includes('Contact details')).map((item) => item.querySelector('p')?.textContent)).toEqual(['Pillar · Your milestone', 'Local legend · Not reached yet']);
    expect(items[4]).toHaveTextContent('From 2,000');
  });

  it('fills the segment after the person’s milestone with their progress, and none after the top one', () => {
    const { container } = show(sparksActiveData);
    // 312 Sparks: Good neighbor (250) toward Friendly face (750) is 62 of 500.
    const fills = [...container.querySelectorAll<HTMLElement>('[style*="--fill"]')].map((node) => Number(node.style.getPropertyValue('--fill')));
    expect(fills).toHaveLength(5);
    expect(fills.slice(0, 2)).toEqual([1, 1]);
    expect(fills[2]).toBeCloseTo(62 / 500);
    expect(fills.slice(3)).toEqual([0, 0]);
    cleanup();
    const top = show(sparksTopData);
    expect([...top.container.querySelectorAll<HTMLElement>('[style*="--fill"]')].map((node) => Number(node.style.getPropertyValue('--fill')))).toEqual([1, 1, 1, 1, 1]);
    expect(screen.getAllByRole('listitem')[5]).toHaveAttribute('aria-current', 'step');
  });
});
