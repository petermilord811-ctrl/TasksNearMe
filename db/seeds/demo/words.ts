/**
 * What demo people write (db/seeds/demo): task posts per category, shaped by the client's home, plus offer
 * messages, completion notes, reviews and booking messages. Plain fictional text: no contact details, links,
 * brands or anything a category's rules prohibit (the unit test checks).
 */
import type { CategorySlug } from '@/contracts';
import type { Household, HomeKind } from './people';
import type { Rng } from './rng';

export interface ClientHome {
  kind: HomeKind;
  household: Household;
  floor: number;
  elevator: boolean;
  bedrooms: number;
  bathrooms: number;
  pets: boolean;
}

export type DemoBudget =
  | { type: 'fixed'; priceCents: number }
  | { type: 'hourly'; rateCents: number; estimatedHours: number; hoursCap: number };

export interface TaskDraft {
  title: string;
  description: string;
  details: Record<string, string | number | boolean>;
  budget: DemoBudget;
  /** A remote session (computer help only). */
  remote?: boolean;
  /** How long the work takes once started. */
  workHours: number;
}

interface Template {
  category: CategorySlug;
  /** Homes it fits (default: both). */
  homes?: HomeKind[];
  /** Households it fits (default: any). */
  households?: Household[];
  make(rng: Rng, home: ClientHome): TaskDraft;
}

const dollars = (low: number, high: number, rng: Rng) => rng.int(low / 5, high / 5) * 500;
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

function whereLine(home: ClientHome): string {
  if (home.kind === 'house') return '';
  if (home.floor <= 1) return ' Ground-floor apartment.';
  return home.elevator ? ` ${ordinal(home.floor)} floor, with an elevator.` : ` ${ordinal(home.floor)} floor and no elevator, sorry.`;
}

function apartmentDetails(home: ClientHome): Record<string, number | boolean> {
  return home.kind === 'apartment' ? { floor: home.floor, elevator: home.elevator } : {};
}

function toolsLine(toolsOnSite: boolean): string {
  return toolsOnSite ? ' I have a drill and screwdrivers you can use.' : ' I don’t have tools, so please bring yours.';
}

const FURNITURE: Template[] = [
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const tools = rng.chance(0.4);
      const kind = rng.pick(['flat-pack desk', 'L-shaped desk', 'standing desk frame'] as const);
      return {
        title: kind === 'standing desk frame' ? 'Put together a standing desk frame' : `Assemble a${kind.startsWith('L') ? 'n' : ''} ${kind}`,
        description: `New ${kind}, still in the box. It goes in the spare room by the window.${whereLine(home)}${toolsLine(tools)}`,
        details: { itemType: 'desk', itemCount: 1, ...apartmentDetails(home), toolsOnSite: tools },
        budget: { type: 'fixed', priceCents: dollars(55, 90, rng) },
        workHours: 2,
      };
    },
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const tools = rng.chance(0.3);
      const kind = rng.pick(['queen bed frame', 'platform bed with storage drawers', 'king bed frame'] as const);
      return {
        title: `Assemble a ${kind}`,
        description: `The ${kind} arrived in three boxes. The old frame is already out, so the room is clear.${whereLine(home)}${toolsLine(tools)}`,
        details: { itemType: 'bed', itemCount: 1, ...apartmentDetails(home), toolsOnSite: tools },
        budget: { type: 'fixed', priceCents: dollars(70, 120, rng) },
        workHours: 2.5,
      };
    },
  },
  {
    category: 'furniture-assembly',
    households: ['family'],
    make: (rng, home) => ({
      title: rng.chance(0.5) ? 'Assemble a crib before the baby arrives' : 'Put together a bunk bed for the kids',
      description: `We want it built sturdy and checked twice. The instructions are in the box and every part is there.${whereLine(home)}${toolsLine(false)}`,
      details: { itemType: 'bed', itemCount: 1, ...apartmentDetails(home), toolsOnSite: false },
      budget: { type: 'fixed', priceCents: dollars(80, 140, rng) },
      workHours: 2.5,
    }),
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const tools = rng.chance(0.5);
      return {
        title: 'Assemble and anchor a tall bookshelf',
        description: `A six-foot bookshelf that needs to be anchored to the wall with the anti-tip kit it came with. Drywall, and I can show you the studs.${whereLine(home)}${toolsLine(tools)}`,
        details: { itemType: 'bookshelf', itemCount: 1, ...apartmentDetails(home), wallAnchoring: true, toolsOnSite: tools },
        budget: { type: 'fixed', priceCents: dollars(60, 95, rng) },
        workHours: 1.5,
      };
    },
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const anchor = home.household === 'family' || rng.chance(0.4);
      return {
        title: rng.chance(0.5) ? 'Assemble a two-door wardrobe' : 'Assemble a wardrobe with sliding doors',
        description: `Big flat-pack wardrobe for the bedroom, about 100 parts.${anchor ? ' Please anchor it to the wall too.' : ''}${whereLine(home)}${toolsLine(false)}`,
        details: { itemType: 'wardrobe', itemCount: 1, ...apartmentDetails(home), wallAnchoring: anchor, toolsOnSite: false },
        budget: { type: 'fixed', priceCents: dollars(95, 150, rng) },
        workHours: 3,
      };
    },
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const anchor = home.household === 'family';
      return {
        title: 'Assemble a six-drawer dresser',
        description: `Six drawers that need to slide smoothly.${anchor ? ' We have a toddler, so it has to be anchored to the wall.' : ''}${whereLine(home)}${toolsLine(rng.chance(0.3))}`,
        details: { itemType: 'dresser', itemCount: 1, ...apartmentDetails(home), wallAnchoring: anchor, toolsOnSite: false },
        budget: { type: 'fixed', priceCents: dollars(70, 110, rng) },
        workHours: 2,
      };
    },
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => ({
      title: 'Assemble a dining table and four chairs',
      description: `Table and chairs came flat-packed. The dining area is empty and ready.${whereLine(home)}${toolsLine(false)}`,
      details: { itemType: 'table', itemCount: 5, ...apartmentDetails(home), toolsOnSite: false },
      budget: { type: 'fixed', priceCents: dollars(80, 120, rng) },
      workHours: 2.5,
    }),
  },
  {
    category: 'furniture-assembly',
    make: (rng, home) => {
      const count = rng.pick([2, 3] as const);
      return {
        title: count === 2 ? 'Assemble two nightstands' : 'Assemble three cube shelves',
        description: `Small flat-pack pieces, quick work for someone who has done it before.${whereLine(home)}${toolsLine(true)}`,
        details: { itemType: count === 2 ? 'other' : 'bookshelf', itemCount: count, ...apartmentDetails(home), toolsOnSite: true },
        budget: { type: 'fixed', priceCents: dollars(45, 70, rng) },
        workHours: 1.5,
      };
    },
  },
  {
    category: 'furniture-assembly',
    homes: ['house'],
    make: (rng) => ({
      title: 'Assemble a patio table and two chairs',
      description: 'Outdoor set for the back porch. The boxes are in the garage and the porch is covered if it rains.',
      details: { itemType: 'other', itemCount: 3, toolsOnSite: true },
      budget: { type: 'fixed', priceCents: dollars(60, 95, rng) },
      workHours: 1.5,
    }),
  },
  {
    category: 'furniture-assembly',
    households: ['professional', 'newcomer', 'student'],
    make: (rng, home) => ({
      title: 'Assemble an office chair and a filing cabinet',
      description: `Setting up a home office. Two boxes, nothing heavy.${whereLine(home)}${toolsLine(false)}`,
      details: { itemType: 'other', itemCount: 2, ...apartmentDetails(home), toolsOnSite: false },
      budget: { type: 'fixed', priceCents: dollars(45, 70, rng) },
      workHours: 1.5,
    }),
  },
];

const HEAVY_ITEMS = ['Couch, queen bed, dresser', 'Sectional sofa, bookshelf, desk', 'Sleeper sofa, dining table', 'Queen bed, two dressers, about 30 boxes', 'Couch, armchair, boxes'];

function movingBudget(rng: Rng, hours: number): DemoBudget {
  const rateCents = rng.pick([3200, 3500, 3500, 3800, 4000] as const);
  return { type: 'hourly', rateCents, estimatedHours: hours, hoursCap: hours + 1 };
}

const MOVING: Template[] = [
  {
    category: 'moving-help',
    make: (rng, home) => {
      const rooms = home.kind === 'apartment' ? rng.int(1, 2) : rng.int(2, 3);
      const hours = rooms + rng.pick([1, 1.5, 2] as const);
      const stairs = home.kind === 'apartment' && !home.elevator ? Math.max(home.floor - 1, 0) : 0;
      return {
        title: `Help loading a rental truck (${rooms}-bedroom)`,
        description: `I’ve rented a truck and everything will be boxed and labeled. I need help carrying the furniture and boxes out and loading them tight.${whereLine(home)}`,
        details: { moveType: 'load_truck', rooms, heavyItems: rng.pick(HEAVY_ITEMS), stairFlights: stairs, elevator: home.kind === 'apartment' && home.elevator },
        budget: movingBudget(rng, hours),
        workHours: hours,
      };
    },
  },
  {
    category: 'moving-help',
    make: (rng, home) => {
      const hours = rng.pick([2, 2.5, 3] as const);
      return {
        title: home.kind === 'apartment' ? 'Help unloading into my new apartment' : 'Help unloading a moving truck',
        description: `The truck gets here in the morning. Everything goes inside and into the right rooms; the boxes are labeled.${whereLine(home)}`,
        details: { moveType: 'unload_truck', rooms: rng.int(1, 3), heavyItems: rng.pick(HEAVY_ITEMS), stairFlights: home.kind === 'apartment' && !home.elevator ? Math.max(home.floor - 1, 0) : 0, elevator: home.kind === 'apartment' && home.elevator },
        budget: movingBudget(rng, hours),
        workHours: hours,
      };
    },
  },
  {
    category: 'moving-help',
    households: ['student', 'newcomer', 'professional'],
    make: (rng, home) => {
      const hours = rng.pick([4, 4.5, 5] as const);
      return {
        title: 'Load and unload for a same-day move',
        description: 'I’ll have a rental truck and drive it myself. I need help loading here and unloading at the new place about 15 minutes away.',
        details: { moveType: 'load_and_unload', rooms: rng.int(1, 2), heavyItems: rng.pick(HEAVY_ITEMS), elevator: home.kind === 'apartment' && home.elevator },
        budget: movingBudget(rng, hours),
        workHours: hours,
      };
    },
  },
  {
    category: 'moving-help',
    make: (rng, home) => ({
      title: home.kind === 'house' ? 'Move furniture between rooms upstairs' : 'Rearrange the living room furniture',
      description: home.kind === 'house'
        ? 'Swapping two bedrooms: a bed, a dresser and a desk go across the hall, and the couch comes downstairs.'
        : 'Moving the couch, a bookcase and the TV stand around. Two strong people make it quick.',
      details: { moveType: 'within_home', rooms: 2, heavyItems: home.kind === 'house' ? 'Bed, dresser, couch' : 'Couch, bookcase', stairFlights: home.kind === 'house' ? 1 : 0 },
      budget: movingBudget(rng, 2),
      workHours: 2,
    }),
  },
  {
    category: 'moving-help',
    homes: ['house'],
    make: (rng) => ({
      title: 'Carry boxes and a freezer to the garage',
      description: 'Clearing out the back room: about 25 boxes and a small chest freezer go to the garage shelves.',
      details: { moveType: 'within_home', rooms: 1, heavyItems: 'Small chest freezer', stairFlights: 0 },
      budget: movingBudget(rng, 2),
      workHours: 2,
    }),
  },
];

const yardSizePrice = { small: [60, 85], medium: [85, 120], large: [120, 160] } as const;

function yardBudget(rng: Rng, size: keyof typeof yardSizePrice): DemoBudget {
  if (rng.chance(0.2)) {
    const hours = size === 'small' ? 2 : size === 'medium' ? 3 : 4;
    return { type: 'hourly', rateCents: rng.pick([3000, 3200] as const), estimatedHours: hours, hoursCap: hours + 1 };
  }
  const [low, high] = yardSizePrice[size];
  return { type: 'fixed', priceCents: dollars(low, high, rng) };
}

const yardHours = (size: 'small' | 'medium' | 'large') => (size === 'small' ? 2 : size === 'medium' ? 3 : 4);

const YARD: Template[] = [
  {
    category: 'yard-cleanup',
    homes: ['house'],
    make: (rng) => {
      const size = rng.pick(['small', 'medium', 'large'] as const);
      const both = size !== 'small';
      return {
        title: both ? 'Rake and bag leaves, front and back' : 'Rake and bag the front-yard leaves',
        description: `The oaks dropped everything at once. Bags out by the curb for city yard-trimmings pickup.${rng.chance(0.5) ? ' I have a rake and paper bags.' : ''}`,
        details: { yardSize: size, work: 'leaves', greenWastePlan: 'curbside', toolsOnSite: rng.chance(0.5) },
        budget: yardBudget(rng, size),
        workHours: yardHours(size),
      };
    },
  },
  {
    category: 'yard-cleanup',
    homes: ['house'],
    make: (rng) => {
      const size = rng.pick(['small', 'medium'] as const);
      return {
        title: rng.chance(0.5) ? 'Weed the flower beds' : 'Pull weeds along the fence and driveway',
        description: 'Weeds took over while we were traveling. Pull them by hand, roots and all; I’ll handle the bags afterward.',
        details: { yardSize: size, work: 'weeding', greenWastePlan: 'poster_handles', toolsOnSite: true },
        budget: yardBudget(rng, size),
        workHours: yardHours(size),
      };
    },
  },
  {
    category: 'yard-cleanup',
    homes: ['house'],
    make: (rng) => ({
      title: 'Trim the shrubs out front',
      description: 'Six boxwoods and a row of low hedges, nothing above shoulder height. Hand shears are fine. Clippings bagged for the curb.',
      details: { yardSize: 'small', work: 'pruning', greenWastePlan: 'curbside', toolsOnSite: rng.chance(0.4) },
      budget: yardBudget(rng, 'small'),
      workHours: 2,
    }),
  },
  {
    category: 'yard-cleanup',
    homes: ['house'],
    make: (rng) => {
      const size = rng.pick(['medium', 'large'] as const);
      return {
        title: 'Pick up fallen branches after the storm',
        description: 'Lots of small branches all over the lawn. Gather them, cut them to four feet and tie them in bundles at the curb for brush pickup.',
        details: { yardSize: size, work: 'debris', greenWastePlan: 'curbside', toolsOnSite: false },
        budget: yardBudget(rng, size),
        workHours: yardHours(size),
      };
    },
  },
  {
    category: 'yard-cleanup',
    homes: ['house'],
    make: (rng) => {
      const size = rng.pick(['small', 'medium', 'large'] as const);
      return {
        title: 'Fall yard tidy-up',
        description: 'Leaves, a few weeds in the beds and sweeping the patio and walkway. Hosting family next weekend.',
        details: { yardSize: size, work: 'mixed', greenWastePlan: 'curbside', toolsOnSite: true },
        budget: yardBudget(rng, size),
        workHours: yardHours(size),
      };
    },
  },
];

function cleaningPrice(rng: Rng, home: ClientHome, extra = 0): DemoBudget {
  const base = 85 + home.bedrooms * 15 + (home.bathrooms - 1) * 12 + extra;
  return { type: 'fixed', priceCents: Math.max(60, Math.round((base + rng.int(-5, 15)) / 5) * 5) * 100 };
}

function homeWords(home: ClientHome): string {
  const place = home.kind === 'house' ? 'house' : 'apartment';
  return home.bedrooms === 0 ? `studio ${place === 'house' ? 'cottage' : 'apartment'}` : `${home.bedrooms}-bedroom ${place}`;
}

function cleaningExtras(home: ClientHome, supplies: boolean): string {
  return `${home.pets ? ' We have a friendly dog.' : ''}${supplies ? ' Supplies and a vacuum are here.' : ' Please bring supplies.'}`;
}

const CLEANING: Template[] = [
  {
    category: 'light-cleaning',
    make: (rng, home) => {
      const supplies = rng.chance(0.6);
      return {
        title: `Light cleaning for a ${homeWords(home)}`,
        description: `Dusting, vacuuming and mopping, kitchen counters and the stovetop, and the bathroom${home.bathrooms > 1 ? 's' : ''}.${cleaningExtras(home, supplies)}`,
        details: { bedrooms: home.bedrooms, bathrooms: home.bathrooms, suppliesOnSite: supplies, pets: home.pets },
        budget: cleaningPrice(rng, home),
        workHours: 2 + home.bedrooms * 0.5,
      };
    },
  },
  {
    category: 'light-cleaning',
    make: (rng, home) => {
      const supplies = rng.chance(0.7);
      return {
        title: 'Kitchen and bathroom refresh',
        description: `Just the kitchen and ${home.bathrooms > 1 ? 'both bathrooms' : 'the bathroom'}: counters, sink, stovetop, the outside of the fridge, mirrors and the tub.${cleaningExtras(home, supplies)}`,
        details: { bedrooms: home.bedrooms, bathrooms: home.bathrooms, suppliesOnSite: supplies, pets: home.pets },
        budget: { type: 'fixed', priceCents: dollars(70, 100, rng) },
        workHours: 2,
      };
    },
  },
  {
    category: 'light-cleaning',
    households: ['host', 'family', 'professional'],
    make: (rng, home) => {
      const supplies = true;
      return {
        title: 'Tidy-up before weekend guests',
        description: `Guests arrive Friday evening. Guest room, living room, kitchen and the guest bathroom, with fresh sheets on the bed.${cleaningExtras(home, supplies)}`,
        details: { bedrooms: home.bedrooms, bathrooms: home.bathrooms, suppliesOnSite: supplies, pets: home.pets },
        budget: cleaningPrice(rng, home, 10),
        workHours: 2.5,
      };
    },
  },
  {
    category: 'light-cleaning',
    households: ['newcomer', 'student'],
    make: (rng, home) => ({
      title: 'Light clean after moving out',
      description: 'The place is empty. Wipe down cabinets inside and out, counters, the fridge and the floors before I hand back the keys.',
      details: { bedrooms: home.bedrooms, bathrooms: home.bathrooms, suppliesOnSite: false, pets: false },
      budget: cleaningPrice(rng, home, 20),
      workHours: 3,
    }),
  },
  {
    category: 'light-cleaning',
    households: ['host'],
    make: (rng, home) => ({
      title: 'Clean up the kitchen after a party',
      description: 'Dishes are done, but counters, the stovetop, floors and the trash and recycling need attention. Living room needs a quick vacuum.',
      details: { bedrooms: home.bedrooms, bathrooms: home.bathrooms, suppliesOnSite: true, pets: home.pets },
      budget: { type: 'fixed', priceCents: dollars(70, 100, rng) },
      workHours: 2,
    }),
  },
];

const COMPUTER: Template[] = [
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Set up a new laptop and move my files',
      description: 'New laptop, old one still works. Move documents and photos over, set up the printer and email, and show me where things are.',
      details: { device: 'laptop', need: 'setup' },
      budget: { type: 'fixed', priceCents: dollars(50, 70, rng) },
      workHours: 2,
    }),
  },
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Fix Wi-Fi that keeps dropping',
      description: 'The internet drops several times a day, mostly in the back bedroom. The router is in the living room closet.',
      details: { device: 'wifi_router', need: 'fix' },
      budget: { type: 'fixed', priceCents: dollars(40, 60, rng) },
      workHours: 1.5,
    }),
  },
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Set up a wireless printer for two laptops',
      description: 'Printer is out of the box. It needs to print from both laptops and my phone.',
      details: { device: 'printer', need: 'setup' },
      budget: { type: 'fixed', priceCents: dollars(35, 55, rng) },
      workHours: 1,
    }),
  },
  {
    category: 'computer-help',
    households: ['senior', 'family'],
    make: (rng) => {
      const remote = rng.chance(0.5);
      return {
        title: 'Show me how to make video calls on my tablet',
        description: `I want to call my grandkids. Set up the app and walk me through calling, answering and turning the camera around.${remote ? ' A screen-share session is fine; my daughter can start it for me.' : ''}`,
        details: { device: 'tablet', need: 'how_to' },
        budget: { type: 'fixed', priceCents: dollars(35, 50, rng) },
        remote,
        workHours: 1,
      };
    },
  },
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Back up the photos on my phone',
      description: 'My phone is almost full. Back up the photos and videos to the computer and an external drive, then free up space.',
      details: { device: 'phone', need: 'backup' },
      budget: { type: 'fixed', priceCents: dollars(40, 60, rng) },
      workHours: 1.5,
    }),
  },
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Set up streaming apps on a new TV',
      description: 'New smart TV, already on the stand. Connect it to the Wi-Fi, sign in to our streaming apps and set up the remote.',
      details: { device: 'tv', need: 'setup' },
      budget: { type: 'fixed', priceCents: dollars(35, 55, rng) },
      workHours: 1,
    }),
  },
  {
    category: 'computer-help',
    households: ['professional', 'senior', 'newcomer'],
    make: (rng) => ({
      title: 'Help organizing my email and calendar',
      description: 'Thousands of unread emails. Help me set up folders and filters and connect my calendar to my phone. Screen share works for me.',
      details: { device: 'laptop', need: 'how_to' },
      budget: { type: 'fixed', priceCents: dollars(40, 60, rng) },
      remote: true,
      workHours: 1.5,
    }),
  },
  {
    category: 'computer-help',
    make: (rng) => ({
      title: 'Speed up a slow desktop computer',
      description: 'It takes ages to start and freezes when I open the browser. Clean it up and tell me if it’s worth keeping.',
      details: { device: 'desktop', need: 'fix' },
      budget: { type: 'fixed', priceCents: dollars(45, 70, rng) },
      workHours: 1.5,
    }),
  },
];

export const TEMPLATES: Record<CategorySlug, Template[]> = {
  'furniture-assembly': FURNITURE,
  'moving-help': MOVING,
  'yard-cleanup': YARD,
  'light-cleaning': CLEANING,
  'computer-help': COMPUTER,
};

export function templatesFor(category: CategorySlug, home: ClientHome): Template[] {
  return TEMPLATES[category].filter(
    (template) => (!template.homes || template.homes.includes(home.kind)) && (!template.households || template.households.includes(home.household)),
  );
}

/** What a helper writes with an offer, in their own voice. */
const OFFER_LINES: Record<CategorySlug, string[]> = {
  'furniture-assembly': [
    'I assemble flat-pack furniture most weekends and I’ll check every joint before I leave.',
    'Happy to build this for you. I’ll take the packaging to your recycling when I’m done.',
    'I’ve built this kind of piece many times. I bring my own drill and level.',
  ],
  'moving-help': [
    'I can help you load it safely and tight so nothing shifts on the road.',
    'I do a lot of apartment moves and I bring straps and blankets for the furniture.',
    'Strong and careful with corners and door frames. Ready when the truck is.',
  ],
  'yard-cleanup': [
    'I can rake and bag everything and leave the walkways swept.',
    'Yard work is what I do most. I bring my own rake, shears and bags.',
    'I’ll leave it neat and have the bags at the curb before I go.',
  ],
  'light-cleaning': [
    'I bring my own supplies and start with the kitchen and bathrooms.',
    'I clean homes like yours every week and I’m careful around pets.',
    'I’ll leave everything spotless and put things back where they were.',
  ],
  'computer-help': [
    'I do this kind of setup often and I’ll explain each step as I go.',
    'I can sort this out and leave you a short note with what I changed.',
    'Happy to help, in person or by screen share, whichever you prefer.',
  ],
};

export function offerMessage(rng: Rng, category: CategorySlug, clientFirstName: string, startLabel: string): string {
  const greeting = rng.pick([`Hi ${clientFirstName}!`, `Hello ${clientFirstName},`, 'Hi there,']);
  return `${greeting} ${rng.pick(OFFER_LINES[category])} I can start at ${startLabel}.`;
}

export const COMPLETION_NOTES: Record<CategorySlug, string[]> = {
  'furniture-assembly': ['All built, level and sturdy. Packaging is flattened by the recycling bin.', 'Done and checked twice. Spare screws are in a bag in the top drawer.', 'Assembled and anchored to the studs. Doors and drawers line up.'],
  'moving-help': ['Everything is loaded and strapped down, heavy pieces first.', 'All furniture is in the rooms you showed me and the boxes are stacked by label.', 'Done. Nothing scratched and the hallway is clear.'],
  'yard-cleanup': ['Leaves raked and bagged, bags at the curb, walkways swept.', 'Beds weeded and edged. Bags are by the side gate.', 'Branches bundled at the curb for brush pickup. Lawn is clear.'],
  'light-cleaning': ['Kitchen, bathroom and floors done. Supplies put back under the sink.', 'Everything dusted, vacuumed and mopped. Trash and recycling are out.', 'All rooms on the list done, plus the inside of the microwave.'],
  'computer-help': ['All set up and tested. I left a note with what I changed.', 'Files moved and checked on the new machine. Nothing was kept on my side.', 'Working now. Showed you how to do it again if it happens.'],
};

const HELPER_REVIEW_WORDS: Record<CategorySlug, { five: string[]; four: string[] }> = {
  'furniture-assembly': {
    five: ['Built everything perfectly and cleaned up after. Would book again.', 'Fast, careful and friendly. The dresser drawers glide like new.', 'Showed up on time with all the tools and anchored everything properly.'],
    four: ['Good work, took a little longer than expected but solid result.', 'Everything is sturdy. One door needed a small adjustment afterward.'],
  },
  'moving-help': {
    five: ['Strong, careful and fast. Not a single scratch on the furniture.', 'Made moving day so much easier. Loaded the truck like a puzzle.', 'Great energy and very careful on the stairs.'],
    four: ['Solid help, a bit late but made up for it.', 'Good work overall, loaded everything safely.'],
  },
  'yard-cleanup': {
    five: ['The yard looks amazing. Bags were neatly lined up at the curb.', 'Worked hard and left everything tidy. Will book again in the spring.', 'Very thorough, even swept the driveway.'],
    four: ['Nice job on the leaves. Missed a corner by the fence but fixed it when I asked.', 'Good work, fair price.'],
  },
  'light-cleaning': {
    five: ['My apartment has never been this clean. Kind and careful with our dog.', 'Spotless kitchen and bathroom. Very detail oriented.', 'Quick, thorough and pleasant. Highly recommend.'],
    four: ['Good cleaning overall, a few spots on the mirrors.', 'Did a nice job, arrived a little late.'],
  },
  'computer-help': {
    five: ['So patient. Explained everything clearly and wrote down the steps.', 'Fixed our Wi-Fi in no time and explained what was wrong.', 'Moved all my photos and set up the printer. Lifesaver.'],
    four: ['Got it working, took a bit of trial and error.', 'Helpful and friendly. Still need to learn a few things on my own.'],
  },
};

export function helperReviewBody(rng: Rng, category: CategorySlug, rating: number): string | null {
  if (rng.chance(0.15)) return null;
  const words = HELPER_REVIEW_WORDS[category];
  return rng.pick(rating >= 5 ? words.five : words.four);
}

export const HELPER_TAG_WEIGHTS: Record<CategorySlug, Record<string, number>> = {
  'furniture-assembly': { careful: 4, skilled: 4, on_time: 3, tidy: 2, friendly: 2, good_value: 2, clear_communication: 1 },
  'moving-help': { careful: 4, on_time: 3, friendly: 3, good_value: 2, skilled: 1, clear_communication: 2 },
  'yard-cleanup': { tidy: 4, good_value: 3, on_time: 3, friendly: 2, careful: 1 },
  'light-cleaning': { tidy: 5, careful: 3, friendly: 3, on_time: 2, good_value: 2 },
  'computer-help': { clear_communication: 5, skilled: 4, friendly: 3, on_time: 2, good_value: 2 },
};

const CLIENT_REVIEW_WORDS = [
  'Clear instructions and everything was ready when I arrived.',
  'Friendly and easy to work with. Would help again.',
  'Quick to reply and had the space cleared out.',
  'Great client, very respectful of my time.',
  'Easy access and good directions.',
];

export function clientReviewBody(rng: Rng): string | null {
  return rng.chance(0.4) ? null : rng.pick(CLIENT_REVIEW_WORDS);
}

const ARRIVAL_NOTES = ['Street parking right out front is fine.', 'Ring the doorbell when you get here.', 'Text me through the app when you’re close and I’ll come down.', 'The side gate is open; I’ll be in the backyard.', 'Visitor parking is by the leasing office.'];

/** A short conversation on a booking, oldest first: [sender, text]. */
export function bookingChat(rng: Rng, input: { clientFirstName: string; helperFirstName: string; tool: string | null; startLabel: string; done: boolean }): Array<['client' | 'helper', string]> {
  const chat: Array<['client' | 'helper', string]> = [
    ['helper', `Thanks for booking, ${input.clientFirstName}! I’ll be there at ${input.startLabel}${input.tool ? ` and I’ll bring my ${input.tool.toLowerCase()}` : ''}.`],
    ['client', `Great, thank you ${input.helperFirstName}. ${rng.pick(ARRIVAL_NOTES)}`],
  ];
  if (input.done) {
    chat.push(['helper', 'All done! I sent the work for you to check.']);
    chat.push(['client', rng.pick(['Looks great, thank you!', 'Thanks so much, approved.', 'Perfect, really appreciate it.'])]);
  }
  return chat;
}
