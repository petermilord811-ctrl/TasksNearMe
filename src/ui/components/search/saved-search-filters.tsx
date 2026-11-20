import { useTranslations } from 'next-intl';
import type { SavedSearchFilters as Filters } from '@/contracts/searches';

/** The labels a saved search's filters read as (the board's own words), for chips and default names. */
export function useFilterLabels(): (filters: Filters) => string[] {
  const board = useTranslations('taskBoard');
  const card = useTranslations('taskCard');
  const chips = useTranslations('savedSearches.chips');
  const work = useTranslations('findWork');
  return (filters) => [
    ...(filters.category ? [card(`categories.${filters.category}`)] : []),
    ...(filters.category && filters.type ? [card(`types.${filters.category}.${filters.type}`)] : []),
    ...(filters.q ? [board('keyword', { q: filters.q })] : []),
    ...filters.areaNames,
    ...(filters.minPrice !== undefined && filters.maxPrice !== undefined ? [chips('price', { min: filters.minPrice, max: filters.maxPrice })] : filters.minPrice !== undefined ? [chips('from', { min: filters.minPrice })] : filters.maxPrice !== undefined ? [chips('upTo', { max: filters.maxPrice })] : []),
    ...(filters.pricing ? [board(`pricingOptions.${filters.pricing}`)] : []),
    ...(filters.when !== 'any' ? [board(`whenOptions.${filters.when}`)] : []),
    ...filters.times.map((time) => board(`timeOptions.${time}`)),
    ...(filters.posted ? [board(`postedOptions.${filters.posted}`)] : []),
    ...(filters.remoteOnly ? [board('remoteOnly')] : []),
    ...(filters.few ? [board('few')] : []),
    ...(filters.distance ? [work(`distanceOptions.${filters.distance}`)] : []),
  ];
}

export function SavedSearchFilterChips({ filters, everything }: { filters: Filters; everything: string }) {
  const labels = useFilterLabels()(filters);
  return <ul className="flex flex-wrap gap-1.5">
    {(labels.length > 0 ? labels : [everything]).map((label) => <li key={label} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{label}</li>)}
  </ul>;
}
