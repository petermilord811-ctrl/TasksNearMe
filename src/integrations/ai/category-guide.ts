import type { CategorySlug } from '@/contracts';

/**
 * What each launch category covers and what it never includes (blueprint 01 §6), in the words Claude reads
 * when it drafts for that category. Keep in step with the blueprint table.
 */
export const CATEGORY_GUIDE: Record<CategorySlug, { name: string; covers: string; never: string; note?: string }> = {
  'furniture-assembly': {
    name: 'Furniture assembly',
    covers: 'flat-pack furniture, beds, desks, shelves, wardrobes, and anti-tip wall anchoring',
    never: 'anything electrical, gas, or plumbing (licensed trades), and TV mounting',
  },
  'moving-help': {
    name: 'Moving help (labor only)',
    covers: 'loading and unloading a truck the client arranges, moving furniture within or between rooms, packing',
    never: "transport in the helper's vehicle, pianos, safes, and hazardous materials",
    note: 'The helper brings no truck; the client arranges any vehicle.',
  },
  'yard-cleanup': {
    name: 'Yard cleanup',
    covers: 'raking and bagging leaves, weeding, ground-level debris pickup, and light hand pruning',
    never: 'pesticide or herbicide application, irrigation repair, ladders, chainsaws, tree work, and hauling green waste away',
    note: 'Bags go to the curb for city pickup or stay with the client; helpers never haul them away.',
  },
  'light-cleaning': {
    name: 'Light cleaning',
    covers: 'standard home cleaning, kitchens and bathrooms, and a light tidy',
    never: 'biohazards, mold remediation, post-construction cleaning, and exterior windows above the ground floor',
  },
  'computer-help': {
    name: 'Computer and phone help',
    covers: 'device setup, Wi-Fi, printers, backups, basic cleanup, and how-to help, in person or remote over a video call',
    never: 'unattended remote-access tools, helpers handling passwords or financial accounts, and crypto wallets',
    note: 'The client keeps control of the device and types their own passwords.',
  },
};
