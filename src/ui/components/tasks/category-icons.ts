import { Hammer, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import type { CategorySlug } from '@/contracts';

/** One icon per kind of help, for the app's lists (the landing has its own copy in src/ui/landing). */
export const CATEGORY_ICONS: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};
