import { routes, type CategorySlug } from '@/contracts';

/**
 * A city's cost guide for one service (docs/seo/PLAN.md S5): /austin/furniture-assembly/cost. Kept here until the board's
 * route changes (completion plan 7.4) settle in src/contracts/routes.ts; then it becomes routes.costGuide.
 */
export function costGuidePath(category: CategorySlug, market: string): string {
  return `${routes.category(category, market)}/cost`;
}
