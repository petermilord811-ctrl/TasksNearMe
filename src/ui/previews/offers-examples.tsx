'use client';

import { useState } from 'react';
import { deskOfferJordan, fakeHandler } from '@/fixtures';
import { OfferCard } from '@/ui/components/offers/offer-card';

const now = '2026-11-17T15:00:00.000Z';
const onAction = fakeHandler<{ offerId: string; action: string }>({ ok: true, code: 'updated' });

export function SelectableOfferPreview() {
  const [selected, setSelected] = useState(true);
  return <OfferCard offer={deskOfferJordan} now={now} onAction={onAction} selectable={{ selected, onToggle: () => setSelected(!selected) }} />;
}
