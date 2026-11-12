/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type HomePageData } from '@/contracts';
import { homeNoRewardData, homePageData } from '@/fixtures';
import { formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { HomeScreen } from './home-screen';

afterEach(cleanup);

const now = '2026-11-17T15:00:00.000Z';
const t = createTranslator({ locale: 'en', messages, namespace: 'home.landing' });

function show(data: HomePageData = homePageData) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeScreen data={data} now={now} />
    </NextIntlClientProvider>,
  );
}

describe('HomeScreen', () => {
  it('gives the landing page one main heading and each section its own heading', () => {
    const { container } = show();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const key of ['categories', 'steps', 'fees', 'trust', 'tasks', 'helpers', 'forHelpers', 'faq', 'closing'] as const) {
      expect(screen.getByRole('heading', { level: 2, name: t(`${key}.title`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 2, name: t('coverage.title', { market: homePageData.market.name }) })).toBeInTheDocument();
    const sections = container.querySelectorAll('section');
    // Hero, categories, steps, pricing, trust, tasks, helpers, helper invitation,
    // neighborhoods, FAQ, and closing invitation all have a place in the story.
    expect(sections.length).toBeGreaterThanOrEqual(11);
    for (const section of sections) {
      expect(within(section).getAllByRole('heading').length).toBeGreaterThan(0);
    }
  });

  it('shows supplied categories with their real price guidance and category destinations', () => {
    show();
    for (const category of homePageData.categories) {
      const link = screen.getAllByRole('link').find((item) =>
        item.getAttribute('href') === routes.category(category.slug, homePageData.market.slug),
      );
      expect(link).toBeDefined();
      expect(link).toHaveTextContent(category.name);
      expect(link).toHaveTextContent(formatMoney(category.priceGuidance.lowCents));
      expect(link).toHaveTextContent(formatMoney(category.priceGuidance.highCents));
    }
  });

  it('shows the supplied tasks, helpers, verification badges, ratings, and neighborhoods', () => {
    show();
    for (const task of homePageData.recentTasks) {
      expect(screen.getByRole('link', { name: task.title })).toHaveAttribute('href', routes.publicTask(task.slug));
      if (task.location.kind === 'local') {
        expect(screen.getAllByText(task.location.areaName).length).toBeGreaterThan(0);
      }
    }
    for (const helper of homePageData.featuredHelpers) {
      const link = screen.getByRole('link', { name: helper.displayName });
      expect(link).toHaveAttribute('href', routes.helperProfile(helper.handle));
      const article = link.closest('article');
      expect(article).not.toBeNull();
      if (!article) throw new Error('A featured helper must be presented as an article.');
      expect(article).toHaveTextContent(helper.headline);
      if (helper.badges.idVerifiedAt) {
        expect(within(article).getByRole('button', { name: messages.verification.identity })).toBeInTheDocument();
      }
      if (helper.badges.backgroundCheckedAt) {
        expect(within(article).getByRole('button', { name: messages.verification.background })).toBeInTheDocument();
      }
      if (helper.rating) {
        expect(article).toHaveTextContent(String(helper.rating.average));
        expect(article).toHaveTextContent(String(helper.rating.count));
      } else {
        expect(within(article).getByText(messages.verification.new)).toBeInTheDocument();
      }
    }
    for (const neighborhood of homePageData.market.areaNames) {
      expect(screen.getAllByText(neighborhood).length).toBeGreaterThan(0);
    }
  });

  it('renders fee-engine amounts exactly as supplied rather than calculating a fee or total', () => {
    // Deliberately independent values catch accidental arithmetic or hard-coded launch figures.
    const feeExample = {
      ...homePageData.feeExample,
      taskPriceCents: 7543,
      posterFeeCents: 1111,
      helperFeeCents: 987,
      posterTotalCents: 8867,
      helperEarningsCents: 6429,
    };
    const { container } = show({ ...homePageData, feeExample });
    for (const cents of [feeExample.taskPriceCents, feeExample.posterFeeCents, feeExample.helperFeeCents, feeExample.posterTotalCents, feeExample.helperEarningsCents]) {
      expect(container).toHaveTextContent(formatMoney(cents));
    }
    expect(screen.queryByText(formatMoney(homePageData.feeExample.posterTotalCents))).not.toBeInTheDocument();
  });

  it('shows the welcome reward only when supplied, while keeping the helper invitation', () => {
    const { rerender } = show();
    expect(screen.getByRole('region', { name: t('forHelpers.rewardTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('forHelpers.claimed', { claimed: homePageData.welcomeReward!.spotsClaimed, limit: homePageData.welcomeReward!.cohortLimit }))).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HomeScreen data={homeNoRewardData} now={now} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('region', { name: t('forHelpers.rewardTitle') })).not.toBeInTheDocument();
    expect(screen.queryByText(/spots claimed/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Become a helper/ }).length).toBeGreaterThan(0);
  });

  it('uses the supplied welcome amount, cohort size, and claimed count', () => {
    show({ ...homePageData, welcomeReward: { amountCents: 7350, cohortLimit: 123, spotsClaimed: 87 } });
    const reward = within(screen.getByRole('region', { name: t('forHelpers.rewardTitle') }));
    expect(reward.getByText(t('forHelpers.rewardAmount', { amount: formatMoney(7350) }))).toBeInTheDocument();
    expect(reward.getByText(t('forHelpers.rewardBody', { count: 123 }))).toBeInTheDocument();
    expect(reward.getByText(t('forHelpers.claimed', { claimed: 87, limit: 123 }))).toBeInTheDocument();
  });

  it('builds all calls to action and data links with route builders', () => {
    const data: HomePageData = {
      ...homePageData,
      market: { ...homePageData.market, slug: 'austin north' },
      recentTasks: homePageData.recentTasks.map((task) => ({ ...task, slug: `${task.slug} & more` })),
      featuredHelpers: homePageData.featuredHelpers.map((helper) => ({ ...helper, handle: `${helper.handle} & more` })),
    };
    show(data);
    const destinations = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    for (const href of [routes.app.newTask(), routes.becomeAHelper(), routes.taskBoard(data.market.slug), routes.howItWorks(), routes.pricing(), routes.trustAndSafety(), routes.waitlist()]) {
      expect(destinations).toContain(href);
    }
    for (const category of data.categories) {
      expect(destinations).toContain(routes.category(category.slug, data.market.slug));
    }
    for (const task of data.recentTasks) {
      expect(screen.getByRole('link', { name: task.title })).toHaveAttribute('href', routes.publicTask(task.slug));
    }
    for (const helper of data.featuredHelpers) {
      expect(screen.getByRole('link', { name: helper.displayName })).toHaveAttribute('href', routes.helperProfile(helper.handle));
    }
    for (const link of screen.getAllByRole('link', { name: /Post a task/ })) {
      expect(link).toHaveAttribute('href', routes.app.newTask());
    }
  });

  it('never renders private address or contact fields supplied beyond the public contract', () => {
    const privateFields = {
      address: '1234 Private Example Lane',
      email: 'private@example.test',
      phone: '+15125550134',
      lastName: 'PrivateSurname',
    };
    const exactAddress = { line1: privateFields.address, line2: 'Private unit 2B', city: 'Austin', state: 'TX', zip: '78723', accessNotes: 'Private gate code 9341' };
    const data = {
      ...homePageData,
      ...privateFields,
      exactAddress,
      recentTasks: homePageData.recentTasks.map((task) => ({
        ...task,
        ...privateFields,
        exactAddress,
        location: { ...task.location, ...privateFields, exactAddress },
        poster: { ...task.poster, ...privateFields },
      })),
      featuredHelpers: homePageData.featuredHelpers.map((helper) => ({ ...helper, ...privateFields, exactAddress })),
    };
    const { container } = show(data);
    for (const value of [...Object.values(privateFields), exactAddress.line2, exactAddress.accessNotes]) {
      expect(container.innerHTML).not.toContain(value);
    }
    expect(screen.getAllByText(homePageData.market.areaNames[0]!).length).toBeGreaterThan(0);
  });
});
