import type { AiTaskDraft, CategorySlug, TaskDetailsValue } from '@/contracts';
import { CATEGORY_DETAIL_FIELDS, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from '@/contracts';

/**
 * "Help me describe this" (blueprint 02 J1 step 2). Production uses Claude through the official
 * Anthropic SDK once an API key exists (blocked.md); development and tests use the rule-based
 * drafter below, which turns plain words into the same structured draft. Nothing is posted.
 */
export interface TaskDrafter {
  readonly name: string;
  draft(input: { categorySlug: CategorySlug; text: string }): Promise<AiTaskDraft>;
}

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function countNear(text: string, nouns: string): number | undefined {
  const match = new RegExp(`\\b(\\d+|a|an|one|two|three|four|five|six)\\s+(?:[a-z-]+\\s+)?(?:${nouns})\\b`).exec(text);
  if (!match) return undefined;
  return /^\d+$/.test(match[1]!) ? Number(match[1]) : WORD_NUMBERS[match[1]!];
}

function firstOption(text: string, options: Record<string, RegExp>): string | undefined {
  return Object.entries(options).find(([, pattern]) => pattern.test(text))?.[0];
}

function sentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

const ITEM_TITLES: Record<string, string> = {
  desk: 'desk',
  bed: 'bed frame',
  bookshelf: 'bookshelf',
  wardrobe: 'wardrobe',
  dresser: 'dresser',
  table: 'table',
  chairs: 'chairs',
  other: 'furniture item',
};

function extractDetails(category: CategorySlug, text: string): TaskDetailsValue {
  const details: TaskDetailsValue = {};
  const has = (pattern: RegExp) => pattern.test(text);
  switch (category) {
    case 'furniture-assembly': {
      const item = firstOption(text, {
        desk: /\bdesk/,
        bed: /\bbed\b|\bbed frame/,
        bookshelf: /\bbook ?(shelf|case)|\bshelv/,
        wardrobe: /\bwardrobe|\barmoire/,
        dresser: /\bdresser|\bchest of drawers/,
        table: /\btable/,
        chairs: /\bchairs?\b/,
      });
      if (item) details.itemType = item;
      const count = countNear(text, 'desks?|beds?|bookshel(?:f|ves)|wardrobes?|dressers?|tables?|chairs?|items?|pieces?');
      if (count && count >= 1 && count <= 10) details.itemCount = count;
      else if (item) details.itemCount = 1;
      const floor = /\b(\d+)(?:st|nd|rd|th)\s+floor/.exec(text);
      if (floor && Number(floor[1]) <= 40) details.floor = Number(floor[1]);
      if (has(/\bno elevator|\bwalk-?up/)) details.elevator = false;
      else if (has(/\belevator/)) details.elevator = true;
      if (has(/\banchor/)) details.wallAnchoring = true;
      if (has(/\bno tools|\bbring (a |your )?(drill|tools)/)) details.toolsOnSite = false;
      else if (has(/\bi have (a |the )?(drill|tools)/)) details.toolsOnSite = true;
      break;
    }
    case 'moving-help': {
      const move = firstOption(text, {
        load_and_unload: /\bload(ing)? and unload/,
        unload_truck: /\bunload/,
        load_truck: /\bload/,
        within_home: /\b(upstairs|downstairs|another room|rearrang|within)/,
      });
      if (move) details.moveType = move;
      const rooms = countNear(text, 'bedrooms?|rooms?');
      if (rooms && rooms <= 10) details.rooms = rooms;
      const flights = countNear(text, 'flights?');
      if (flights !== undefined && flights <= 10) details.stairFlights = flights;
      if (has(/\bno elevator/)) details.elevator = false;
      else if (has(/\belevator/)) details.elevator = true;
      break;
    }
    case 'yard-cleanup': {
      const size = firstOption(text, { small: /\bsmall\b/, large: /\b(large|big)\b/, medium: /\bmedium\b/ });
      if (size) details.yardSize = size;
      const work = firstOption(text, { leaves: /\bleaves|\brak/, weeding: /\bweed/, pruning: /\bprun|\btrim/, debris: /\bdebris|\bbranches|\bsticks/, mixed: /\bmixed/ });
      if (work) details.work = work;
      const plan = firstOption(text, { curbside: /\bcurb|\bcity (picks|pickup|collects)/, poster_handles: /\bi('ll| will) (handle|take care)|\bleave (it|them) (in|at) (my|the) yard/ });
      if (plan) details.greenWastePlan = plan;
      if (has(/\bi have (a )?(rake|tools)|\btools (are )?(on site|here)/)) details.toolsOnSite = true;
      break;
    }
    case 'light-cleaning': {
      const bedrooms = /\bstudio\b/.test(text) ? 0 : countNear(text, 'bedrooms?|br\b|beds?');
      if (bedrooms !== undefined && bedrooms <= 8) details.bedrooms = bedrooms;
      const bathrooms = countNear(text, 'bathrooms?|baths?|ba\b');
      if (bathrooms && bathrooms <= 6) details.bathrooms = bathrooms;
      if (has(/\bsupplies (are )?(here|provided|on site|under)/)) details.suppliesOnSite = true;
      if (has(/\b(cat|dog|pet)s?\b/)) details.pets = true;
      break;
    }
    case 'computer-help': {
      const device = firstOption(text, {
        printer: /\bprinter/,
        wifi_router: /\b(wi-?fi|router|internet)/,
        phone: /\b(phone|iphone|android)/,
        tablet: /\b(tablet|ipad)/,
        tv: /\b(tv|television|roku|streaming)/,
        laptop: /\blaptop/,
        desktop: /\b(desktop|computer|pc|mac)\b/,
      });
      if (device) details.device = device;
      const need = firstOption(text, { backup: /\bback ?up|\bphotos? (moved|transfer)/, fix: /\b(fix|broken|not working|slow)/, setup: /\b(set ?up|install|new)\b/, how_to: /\b(how to|show me|learn|teach)/ });
      if (need) details.need = need;
      break;
    }
  }
  return details;
}

function titleFor(category: CategorySlug, details: TaskDetailsValue, text: string): string {
  switch (category) {
    case 'furniture-assembly': {
      const item = ITEM_TITLES[String(details.itemType ?? 'other')]!;
      const count = Number(details.itemCount ?? 1);
      return count > 1 ? `Assemble ${count} flat-pack ${item}${item.endsWith('s') ? '' : 's'}` : `Assemble a flat-pack ${item}`;
    }
    case 'moving-help':
      return {
        load_truck: 'Help loading a moving truck',
        unload_truck: 'Help unloading a moving truck',
        load_and_unload: 'Help loading and unloading a moving truck',
        within_home: 'Help moving furniture at home',
      }[String(details.moveType)] ?? 'Moving help (labor only)';
    case 'yard-cleanup':
      return details.work === 'leaves' ? `Rake and bag leaves in a ${details.yardSize ?? 'small'} yard` : 'Yard cleanup';
    case 'light-cleaning':
      return details.bedrooms !== undefined
        ? `Light cleaning for a ${details.bedrooms === 0 ? 'studio' : `${details.bedrooms}-bedroom home`}`
        : 'Light cleaning for my home';
    case 'computer-help': {
      const device = { printer: 'printer', wifi_router: 'Wi-Fi', phone: 'phone', tablet: 'tablet', tv: 'TV', laptop: 'laptop', desktop: 'computer' }[
        String(details.device)
      ];
      const verb = { setup: 'Set up my', fix: 'Fix my', backup: 'Back up my', how_to: 'Help me use my' }[String(details.need)];
      return device && verb ? `${verb} ${device}` : sentence(text).slice(0, 60).replace(/\.$/, '') || 'Computer help';
    }
  }
}

const QUESTION_FOR: Record<string, string> = {
  itemType: 'What are you having assembled?',
  itemCount: 'How many items are there?',
  floor: 'Which floor is it on?',
  elevator: 'Is there an elevator?',
  wallAnchoring: 'Should it be anchored to the wall?',
  toolsOnSite: 'Do you have tools there, or should the helper bring them?',
  moveType: 'Is it loading, unloading, or moving things within your home?',
  rooms: 'How many rooms are moving?',
  heavyItems: 'Are there any heavy items (couch, dresser, washer)?',
  stairFlights: 'How many flights of stairs are there?',
  yardSize: 'How big is the yard?',
  work: 'What needs doing: leaves, weeding, pruning, or a mix?',
  greenWastePlan: 'Should the bags go to the curb for city pickup, or stay in the yard?',
  bedrooms: 'How many bedrooms?',
  bathrooms: 'How many bathrooms?',
  suppliesOnSite: 'Are cleaning supplies there?',
  pets: 'Are there pets at home?',
  device: 'Which device is it?',
  need: 'Is it setup, a fix, a backup, or how-to help?',
  deviceBrand: 'What brand or model is it?',
};

export function createFakeTaskDrafter(): TaskDrafter {
  return {
    name: 'rule-based',
    async draft({ categorySlug, text }) {
      const lower = text.toLowerCase();
      const details = extractDetails(categorySlug, lower);
      const fields = CATEGORY_DETAIL_FIELDS[categorySlug];
      const openQuestions = fields
        .filter((field) => details[field.key] === undefined && QUESTION_FOR[field.key])
        .sort((a, b) => Number(b.required) - Number(a.required))
        .slice(0, 4)
        .map((field) => QUESTION_FOR[field.key]!);
      const description = sentence(text).slice(0, TASK_DESCRIPTION_MAX);
      return {
        title: titleFor(categorySlug, details, text).slice(0, TASK_TITLE_MAX),
        description: description.length >= 20 ? description : `${description} More details to follow.`.trim(),
        details,
        openQuestions,
      };
    },
  };
}

/** The drafter for this environment, or null when "Help me describe this" is unavailable. */
export function createTaskDrafter(): TaskDrafter | null {
  if (process.env.ANTHROPIC_API_KEY) {
    // TODO(integration): Claude adapter via @anthropic-ai/sdk (Phase 10). Until then, unavailable.
    return null;
  }
  return process.env.NODE_ENV === 'production' ? null : createFakeTaskDrafter();
}
