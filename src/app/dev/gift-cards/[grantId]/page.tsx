import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { rewardGrants } from '@/modules/rewards/schema';
import { db } from '@/platform/db/client';
import { formatMoney } from '@/shared/format';

export const metadata = { title: 'Dev gift card' };

/** Development only (the /dev layout 404s in production): what a delivered gift card link opens. */
export default function DevGiftCardPage({ params }: PageProps<'/dev/gift-cards/[grantId]'>) {
  return (
    <Suspense fallback={null}>
      <GiftCard params={params} />
    </Suspense>
  );
}

async function GiftCard({ params }: Pick<PageProps<'/dev/gift-cards/[grantId]'>, 'params'>) {
  const { grantId } = await params;
  const [grant] = await db.select().from(rewardGrants).where(eq(rewardGrants.id, grantId)).limit(1);
  if (!grant || grant.status !== 'delivered') notFound();
  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-2xl font-semibold">Gift card (Tremendous stand-in)</h1>
      <p>Amount: {formatMoney(grant.amountCents)}</p>
      <p>Order: {grant.providerOrderId}</p>
    </main>
  );
}
