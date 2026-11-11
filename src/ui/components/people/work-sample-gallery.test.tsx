/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { samProfilePageData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import reviews from '../../../../messages/en/ui/reviews.json';
import { WorkSampleGallery } from './work-sample-gallery';

afterEach(cleanup);

function renderGallery() {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, reviews }}><WorkSampleGallery samples={samProfilePageData.workSamples} /></NextIntlClientProvider>);
}

describe('WorkSampleGallery', () => {
  it('preserves the supplied image sources and alt text', () => {
    renderGallery();
    for (const sample of samProfilePageData.workSamples) {
      expect(screen.getByRole('img', { name: sample.photo.alt })).toHaveAttribute('src', sample.photo.src);
    }
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('opens by keyboard, shows the caption, and returns focus after Escape', async () => {
    const user = userEvent.setup();
    renderGallery();
    const trigger = screen.getByRole('button', { name: 'View sample: Standing desk with a drawer unit' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Work sample 1 of 3' });
    expect(within(dialog).getByText('Standing desk with a drawer unit')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: samProfilePageData.workSamples[0]!.photo.alt })).toBeInTheDocument();
    expect(within(dialog).getByText('Furniture assembly')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('uses photo alt text when a caption is absent', async () => {
    const user = userEvent.setup();
    renderGallery();
    const sample = samProfilePageData.workSamples[2]!;
    const trigger = screen.getByRole('button', { name: `View sample: ${sample.photo.alt}` });
    expect(trigger).toHaveTextContent('View sample');
    expect(trigger).toHaveAccessibleName(expect.stringContaining(trigger.textContent!));
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Work sample 3 of 3' });
    expect(within(dialog).getByText(sample.photo.alt)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
