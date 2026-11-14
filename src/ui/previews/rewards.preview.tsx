import { useTranslations } from 'next-intl';
import { routes, type AppShellHandlers, type PreviewEntry, type RewardsHandlers, type RewardsPageData } from '@/contracts';
import {
  fakeHandler, jordanShell, mayaShell, REWARDS_NOW, rewardGrantsByStatus,
  rewardsDeliveredData, rewardsEmptyData, rewardsNotHelperData, rewardsPendingData,
  rewardsQualifiedData, rewardsRedeemableData, welcomeAlmostCard, welcomeEarnedCard, welcomeOpenCard, welcomeQueuedCard, welcomeReadyCard,
} from '@/fixtures';
import { RewardGrantCard, WelcomeGiftCardView, WelcomeGiftStrip } from '@/ui/components/rewards';
import { RewardsScreen } from '@/ui/screens/rewards';
import { AppShell } from '@/ui/shells/app-shell';
import { AccountInteractionPreview } from './account-examples';
import copy from '../../../messages/en/ui/rewards.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const handlers: RewardsHandlers = { onRedeem: fakeHandler({ ok: true, code: 'submitted' }) };

function preview(variant: string, title: string, data: RewardsPageData, rewardHandlers: RewardsHandlers = handlers, redeem = false): PreviewEntry {
  return {
    id: `screen-rewards/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={data.helperReady ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.rewards()}>
      <AccountInteractionPreview action={redeem ? 'button' : undefined} triggerLabel={copy.actions.redeem}>
        <RewardsScreen data={data} handlers={rewardHandlers} now={REWARDS_NOW} />
      </AccountInteractionPreview>
    </AppShell>,
  };
}

function AllRewardStatusesPreview() {
  const t = useTranslations('rewards');
  return <main className="mx-auto max-w-reading space-y-6">
    <h1 className="text-2xl font-bold">{t('previews.allStatuses')}</h1>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t('previews.grants')}</h2>
      {rewardGrantsByStatus.map((grant) => <RewardGrantCard key={grant.id} grant={grant} now={REWARDS_NOW} onRedeem={handlers.onRedeem} />)}
    </section>
  </main>;
}

export const rewardsPreviews: PreviewEntry[] = [
  preview('pending', copy.previews.pending, rewardsPendingData),
  preview('qualified', copy.previews.qualified, rewardsQualifiedData),
  preview('redeemable', copy.previews.redeemable, rewardsRedeemableData),
  preview('delivered', copy.previews.delivered, rewardsDeliveredData),
  preview('empty', copy.previews.empty, rewardsEmptyData),
  preview('not-helper', copy.previews.notHelper, rewardsNotHelperData),
  preview('redeeming', copy.previews.redeeming, rewardsRedeemableData, {
    onRedeem: fakeHandler({ ok: true, code: 'submitted' }, 60_000),
  }, true),
  preview('redeem-error', copy.previews.redeemError, rewardsRedeemableData, {
    onRedeem: fakeHandler({ ok: false, code: 'not_allowed' }, 0),
  }, true),
  preview('rate-limited', copy.previews.rateLimited, rewardsRedeemableData, {
    onRedeem: fakeHandler({ ok: false, code: 'rate_limited', retryAt: '2026-12-01T16:05:00.000Z' }, 0),
  }, true),
  preview('unknown-error', copy.previews.unknownError, rewardsRedeemableData, {
    onRedeem: fakeHandler({ ok: false, code: 'unknown' }, 0),
  }, true),
  preview('submitted', copy.previews.submitted, rewardsRedeemableData, {
    onRedeem: fakeHandler({ ok: true, code: 'submitted' }, 0),
  }, true),
  {
    id: 'component-reward-grant/all-statuses', group: copy.previews.componentGroup,
    title: copy.previews.allStatuses, render: () => <AllRewardStatusesPreview />,
  },
  // The welcome gift card (2026-11-14): every helper whose phone, ID and background checks pass.
  { id: 'component-welcome-gift/open', group: copy.previews.componentGroup, title: copy.previews.welcomeOpen, render: () => <main className="mx-auto max-w-content p-gutter"><WelcomeGiftCardView card={welcomeOpenCard} /></main> },
  { id: 'component-welcome-gift/queued', group: copy.previews.componentGroup, title: copy.previews.welcomeQueued, render: () => <main className="mx-auto max-w-content p-gutter"><WelcomeGiftCardView card={welcomeQueuedCard} /></main> },
  { id: 'component-welcome-gift/ready', group: copy.previews.componentGroup, title: copy.previews.welcomeReady, render: () => <main className="mx-auto max-w-content p-gutter"><WelcomeGiftCardView card={welcomeReadyCard} /></main> },
  {
    id: 'component-welcome-gift/strip', group: copy.previews.componentGroup, title: copy.previews.welcomeStrip,
    render: () => <main className="mx-auto max-w-reading space-y-4 p-gutter"><WelcomeGiftStrip card={welcomeOpenCard} /><WelcomeGiftStrip card={welcomeAlmostCard} /><WelcomeGiftStrip card={welcomeEarnedCard} /></main>,
  },
];
