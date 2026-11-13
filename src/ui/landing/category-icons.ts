import { Hammer, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import type { CategorySlug } from '@/contracts';

/** One icon per kind of help, shared by the landing page's assistant, filter and cards. */
export const CATEGORY_ICONS: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};
