import type { ReactNode } from 'react';
import type { CategoryPageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts';
import { citiesPageData, floridaCitiesPageData } from '@/fixtures';
import { AboutScreen } from '@/ui/screens/public/about-screen';
import { CitiesScreen, StateCitiesScreen } from '@/ui/screens/public/cities-screen';
import { becomeHelperNoRewardsData, becomeHelperPageData, categoryNoListingsData, categoryViews, cleaningPublicTask, furnitureCategoryPageData, furnitureCategoryWithSeoData, furnitureCostGuideData, movingCostGuideData, homePageData, lee, marketNoListingsData, movingCategoryPageData, movingCategoryWithSeoEmptyData, pricingWithPlansData, publicViewer, remoteComputerPublicTask, sam, yardPublicTask } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { BecomeHelperScreen, CategoryScreen, CostGuideScreen, HowItWorksScreen, MarketScreen, PricingScreen, TrustSafetyScreen } from '@/ui/screens/public';
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
  // Before the first real helper and task: what the public sees (sample rows are for signed-in testers only).
  page('screen-market/no-listings', copy.previews.marketNoListings, routes.market(), () => <MarketScreen data={marketNoListingsData} now={now} />),
  page('screen-category/no-listings', copy.previews.categoryNoListings, routes.category('moving-help'), () => <CategoryScreen data={categoryNoListingsData} now={now} />),
  page('screen-category/furniture', copy.previews.furniture, routes.category('furniture-assembly'), () => <CategoryScreen data={furnitureCategoryPageData} now={now} />),
  page('screen-category/moving-empty', copy.previews.moving, routes.category('moving-help'), () => <CategoryScreen data={movingCategoryPageData} now={now} />),
  page('screen-category/furniture-seo', copy.previews.furnitureSeo, routes.category('furniture-assembly'), () => <CategoryScreen data={furnitureCategoryWithSeoData} now={now} />),
  page('screen-category/moving-seo-empty', copy.previews.movingSeoEmpty, routes.category('moving-help'), () => <CategoryScreen data={movingCategoryWithSeoEmptyData} now={now} />),
  page('screen-cost-guide/furniture', copy.previews.costFurniture, '/austin/furniture-assembly/cost', () => <CostGuideScreen data={furnitureCostGuideData} />),
  page('screen-cost-guide/moving-hourly', copy.previews.costMoving, '/austin/moving-help/cost', () => <CostGuideScreen data={movingCostGuideData} />),
  page('screen-cities/directory', copy.previews.cities, routes.cities(), () => <CitiesScreen data={citiesPageData} />),
  page('screen-cities/state', copy.previews.citiesState, routes.cities('florida'), () => <StateCitiesScreen data={floridaCitiesPageData} />),
  page('screen-category/computer-remote', copy.previews.computer, routes.category('computer-help'), () => <CategoryScreen data={computerData} now={now} />),
  page('screen-category/yard', copy.previews.yard, routes.category('yard-cleanup'), () => <CategoryScreen data={yardData} now={now} />),
  page('screen-category/cleaning', copy.previews.cleaning, routes.category('light-cleaning'), () => <CategoryScreen data={cleaningData} now={now} />),
  page('screen-how-it-works/default', copy.previews.how, routes.howItWorks(), () => <HowItWorksScreen />),
  page('screen-become-helper/with-rewards', copy.previews.rewards, routes.becomeAHelper(), () => <BecomeHelperScreen data={becomeHelperPageData} />),
  page('screen-become-helper/no-rewards', copy.previews.noRewards, routes.becomeAHelper(), () => <BecomeHelperScreen data={becomeHelperNoRewardsData} />),
  page('screen-pricing/default', copy.previews.pricing, routes.pricing(), () => <PricingScreen data={pricingWithPlansData} />),
  page('screen-trust-safety/default', copy.previews.trust, routes.trustAndSafety(), () => <TrustSafetyScreen />),
  page('screen-about/default', copy.previews.about, routes.about(), () => <AboutScreen />),
];
