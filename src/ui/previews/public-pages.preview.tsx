import type { ReactNode } from 'react';
import type { CategoryPageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts';
import { becomeHelperNoRewardsData, becomeHelperPageData, categoryViews, cleaningPublicTask, furnitureCategoryPageData, homePageData, lee, movingCategoryPageData, pricingPageData, publicViewer, remoteComputerPublicTask, sam, yardPublicTask } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { BecomeHelperScreen, CategoryScreen, HowItWorksScreen, MarketScreen, PricingScreen, TrustSafetyScreen } from '@/ui/screens/public';
import copy from '../../../messages/en/ui/publicPages.json';

const now = '2026-11-17T15:00:00.000Z';
const computerData: CategoryPageData = { market: homePageData.market, category: categoryViews[4]!, recentTasks: [remoteComputerPublicTask], topHelpers: [lee] };
const yardData: CategoryPageData = { market: homePageData.market, category: categoryViews[2]!, recentTasks: [yardPublicTask], topHelpers: [sam] };
const cleaningData: CategoryPageData = { market: homePageData.market, category: categoryViews[3]!, recentTasks: [cleaningPublicTask], topHelpers: [sam] };

function page(id: string, title: string, path: string, render: () => ReactNode): PreviewEntry {
  return { id, group: copy.previews.group, title, layout: 'fullscreen', render: () => <div className="bg-background text-foreground"><PublicShell viewer={publicViewer} currentPath={path}>{render()}</PublicShell></div> };
}

export const publicPagePreviews: PreviewEntry[] = [
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
