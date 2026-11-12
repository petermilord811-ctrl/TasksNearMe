import type { ReactNode } from 'react';
import type { CategoryPageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts';
import { becomeHelperNoRewardsData, becomeHelperPageData, categoryViews, cleaningPublicTask, furnitureCategoryPageData, homePageData, homeNoRewardData, lee, movingCategoryPageData, pricingPageData, publicViewer, remoteComputerPublicTask, sam, yardPublicTask } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { BecomeHelperScreen, CategoryScreen, HomeScreen, HowItWorksScreen, MarketScreen, PricingScreen, TrustSafetyScreen } from '@/ui/screens/public';
import copy from '../../../messages/en/ui/publicPages.json';
import homeCopy from '../../../messages/en/ui/home.json';
import { HomeHeroIllustration } from '@/ui/components/illustrations/home-hero-illustration';
import { NeighborhoodIllustration } from '@/ui/components/illustrations/neighborhood-illustration';

const now = '2026-11-17T15:00:00.000Z';
const computerData: CategoryPageData = { market: homePageData.market, category: categoryViews[4]!, recentTasks: [remoteComputerPublicTask], topHelpers: [lee] };
const yardData: CategoryPageData = { market: homePageData.market, category: categoryViews[2]!, recentTasks: [yardPublicTask], topHelpers: [sam] };
const cleaningData: CategoryPageData = { market: homePageData.market, category: categoryViews[3]!, recentTasks: [cleaningPublicTask], topHelpers: [sam] };

function page(id: string, title: string, path: string, render: () => ReactNode, theme?: 'light'): PreviewEntry {
  return { id, group: copy.previews.group, title, layout: 'fullscreen', render: () => <div data-theme={theme} className="bg-background text-foreground"><PublicShell viewer={publicViewer} currentPath={path}>{render()}</PublicShell></div> };
}

export const publicPagePreviews: PreviewEntry[] = [
  page('screen-home/default', copy.previews.home, routes.home(), () => <HomeScreen data={homePageData} now={now} />, 'light'),
  page('screen-home/no-tasks', copy.previews.homeEmpty, routes.home(), () => <HomeScreen data={{ ...homePageData, recentTasks: [] }} now={now} />, 'light'),
  page('screen-home/no-reward', homeCopy.landing.previews.noReward, routes.home(), () => <HomeScreen data={homeNoRewardData} now={now} />, 'light'),
  { id: 'screen-home/dark', group: copy.previews.group, title: homeCopy.landing.previews.dark, layout: 'fullscreen', render: () => <div data-theme="dark" className="bg-background text-foreground"><PublicShell viewer={publicViewer} currentPath={routes.home()}><HomeScreen data={homePageData} now={now} /></PublicShell></div> },
  { id: 'component-brand/hero-illustration', group: copy.previews.group, title: homeCopy.landing.previews.heroArt, render: () => <HomeHeroIllustration className="mx-auto h-auto w-full max-w-xl" /> },
  { id: 'component-brand/neighborhood-illustration', group: copy.previews.group, title: homeCopy.landing.previews.neighborhoodArt, render: () => <NeighborhoodIllustration className="mx-auto h-auto w-full max-w-xl" /> },
  page('screen-market/default', copy.previews.market, routes.market(), () => <MarketScreen data={homePageData} now={now} />),
  page('screen-category/furniture', copy.previews.furniture, routes.category('furniture-assembly'), () => <CategoryScreen data={furnitureCategoryPageData} now={now} />),
  page('screen-category/moving-empty', copy.previews.moving, routes.category('moving-help'), () => <CategoryScreen data={movingCategoryPageData} now={now} />),
  page('screen-category/computer-remote', copy.previews.computer, routes.category('computer-help'), () => <CategoryScreen data={computerData} now={now} />),
  page('screen-category/yard', copy.previews.yard, routes.category('yard-cleanup'), () => <CategoryScreen data={yardData} now={now} />),
  page('screen-category/cleaning', copy.previews.cleaning, routes.category('light-cleaning'), () => <CategoryScreen data={cleaningData} now={now} />),
  page('screen-how-it-works/default', copy.previews.how, routes.howItWorks(), () => <HowItWorksScreen />),
  page('screen-become-helper/with-rewards', copy.previews.rewards, routes.becomeAHelper(), () => <BecomeHelperScreen data={becomeHelperPageData} />),
  page('screen-become-helper/no-rewards', copy.previews.noRewards, routes.becomeAHelper(), () => <BecomeHelperScreen data={becomeHelperNoRewardsData} />),
  page('screen-pricing/default', copy.previews.pricing, routes.pricing(), () => <PricingScreen data={pricingPageData} />),
  page('screen-trust-safety/default', copy.previews.trust, routes.trustAndSafety(), () => <TrustSafetyScreen />),
];
