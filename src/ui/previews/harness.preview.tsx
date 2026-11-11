// Example preview created by Claude to prove the harness works. Codex may delete it once
// real previews exist. Shows the pattern: fixtures in, component out, no data fetching.
import type { PreviewEntry } from '@/contracts/preview';
import { formatMoney } from '@/shared/format';
import { deskBreakdown, maya } from '@/fixtures';

export const harnessPreviews: PreviewEntry[] = [
  {
    id: 'harness/hello',
    group: 'Harness',
    title: 'Harness check',
    notes: 'Delete when real previews exist.',
    render: () => (
      <main>
        <h1>Preview harness works</h1>
        <p>
          {maya.displayName} pays {formatMoney(deskBreakdown.posterTotalCents)} for the desk.
        </p>
      </main>
    ),
  },
];
