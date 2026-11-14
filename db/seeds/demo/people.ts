/**
 * The demo marketplace's people (db/seeds/demo). Fictional: names are common first and last names, emails use
 * the reserved .test domain and phones the 555 exchange, so nothing ever reaches a real inbox or phone.
 *
 * Each client lives somewhere (a neighborhood, an apartment or a house) and is a kind of household, which
 * decides what they post: a house with a yard posts yard work, a student moves, a senior asks for computer help.
 * Each helper offers a few services from a home neighborhood, within a radius.
 */
import type { CategorySlug } from '@/contracts';

export type HomeKind = 'apartment' | 'house';
export type Household = 'family' | 'senior' | 'student' | 'professional' | 'newcomer' | 'host';

export interface DemoClient {
  key: string;
  firstName: string;
  lastName: string;
  area: string;
  home: HomeKind;
  household: Household;
  locale?: 'es';
}

export interface DemoService {
  category: CategorySlug;
  /** Fixed: the "from" price; hourly: the rate. */
  cents: number;
}

export interface DemoHelper {
  key: string;
  firstName: string;
  lastName: string;
  area: string;
  /** One of SERVICE_RADIUS_MILES. */
  radiusMiles: 5 | 8 | 12 | 15;
  services: DemoService[];
  languages: string[];
  tools: string[];
  headline: string;
  bio: string;
  /** How often clients give five stars (the rest is mostly four). */
  fiveStarRate: number;
  responseMinutes: number;
  joinedDaysAgo: number;
  foundingNumber?: number;
}

/** What each kind of household tends to post (relative weights; yard work needs a house). */
export const HOUSEHOLD_NEEDS: Record<Household, Partial<Record<CategorySlug, number>>> = {
  family: { 'furniture-assembly': 4, 'light-cleaning': 3, 'yard-cleanup': 3, 'moving-help': 1, 'computer-help': 1 },
  senior: { 'computer-help': 4, 'yard-cleanup': 3, 'light-cleaning': 2, 'furniture-assembly': 1 },
  student: { 'moving-help': 4, 'furniture-assembly': 3, 'computer-help': 1, 'light-cleaning': 1 },
  professional: { 'light-cleaning': 4, 'furniture-assembly': 3, 'computer-help': 2, 'moving-help': 1, 'yard-cleanup': 1 },
  newcomer: { 'moving-help': 4, 'furniture-assembly': 4, 'light-cleaning': 2, 'computer-help': 1 },
  host: { 'light-cleaning': 4, 'yard-cleanup': 2, 'furniture-assembly': 1 },
};

const c = (key: string, firstName: string, lastName: string, area: string, home: HomeKind, household: Household, locale?: 'es'): DemoClient => ({
  key,
  firstName,
  lastName,
  area,
  home,
  household,
  ...(locale ? { locale } : {}),
});

export const DEMO_CLIENTS: DemoClient[] = [
  c('c01', 'Olivia', 'Chen', 'downtown', 'apartment', 'professional'),
  c('c02', 'Marcus', 'Johnson', 'downtown', 'apartment', 'professional'),
  c('c03', 'Hannah', 'Kim', 'downtown', 'apartment', 'newcomer'),
  c('c04', 'Diego', 'Ramirez', 'downtown', 'apartment', 'professional', 'es'),
  c('c05', 'Sophie', 'Laurent', 'downtown', 'apartment', 'host'),
  c('c06', 'Rachel', 'Goldberg', 'mueller', 'house', 'family'),
  c('c07', 'Kevin', 'Nguyen', 'mueller', 'apartment', 'professional'),
  c('c08', 'Isabel', 'Flores', 'mueller', 'house', 'family', 'es'),
  c('c09', 'Tom', 'Becker', 'mueller', 'apartment', 'newcomer'),
  c('c10', 'Aisha', 'Rahman', 'mueller', 'house', 'family'),
  c('c11', 'Luis', 'Herrera', 'mueller', 'apartment', 'newcomer', 'es'),
  c('c12', 'Jasmine', 'Brooks', 'east-austin', 'apartment', 'host'),
  c('c13', 'Nate', 'Okafor', 'east-austin', 'apartment', 'student'),
  c('c14', 'Carmen', 'Vega', 'east-austin', 'house', 'family', 'es'),
  c('c15', 'Eli', 'Shapiro', 'east-austin', 'apartment', 'professional'),
  c('c16', 'Mei', 'Lin', 'east-austin', 'apartment', 'newcomer'),
  c('c17', 'Andre', 'Wallace', 'east-austin', 'house', 'host'),
  c('c18', 'Margaret', 'Holloway', 'hyde-park', 'house', 'senior'),
  c('c19', 'Daniel', 'Park', 'hyde-park', 'apartment', 'student'),
  c('c20', 'Grace', 'Olsen', 'hyde-park', 'house', 'family'),
  c('c21', 'Samir', 'Haddad', 'hyde-park', 'apartment', 'student'),
  c('c22', 'Frances', 'Whitley', 'hyde-park', 'house', 'senior'),
  c('c23', 'Robert', 'Castillo', 'windsor-park', 'house', 'senior', 'es'),
  c('c24', 'Tiffany', 'Moore', 'windsor-park', 'house', 'family'),
  c('c25', 'Jamal', 'Pierce', 'windsor-park', 'house', 'professional'),
  c('c26', 'Linda', 'Kowalski', 'windsor-park', 'house', 'senior'),
  c('c27', 'Emma', 'Lindqvist', 'cherrywood', 'house', 'host'),
  c('c28', 'Oscar', 'Delgado', 'cherrywood', 'house', 'family', 'es'),
  c('c29', 'Noor', 'Siddiqui', 'cherrywood', 'apartment', 'professional'),
  c('c30', 'Caleb', 'Foster', 'cherrywood', 'apartment', 'student'),
  c('c31', 'Zoe', 'Martinez', 'north-loop', 'apartment', 'student'),
  c('c32', 'Henry', 'Adler', 'north-loop', 'house', 'senior'),
  c('c33', 'Leah', 'Novak', 'north-loop', 'apartment', 'professional'),
  c('c34', 'Ivan', 'Petrov', 'north-loop', 'apartment', 'newcomer'),
  c('c35', 'Patricia', 'Gomez', 'allandale', 'house', 'senior', 'es'),
  c('c36', 'Michael', 'Brennan', 'allandale', 'house', 'family'),
  c('c37', 'Susan', 'Hart', 'allandale', 'house', 'senior'),
  c('c38', 'Raj', 'Mehta', 'allandale', 'house', 'family'),
  c('c39', 'Alicia', 'Moreno', 'crestview', 'house', 'family', 'es'),
  c('c40', 'Greg', 'Sullivan', 'crestview', 'house', 'professional'),
  c('c41', 'Nina', 'Rossi', 'crestview', 'house', 'host'),
  c('c42', 'Walter', 'Jenkins', 'crestview', 'house', 'senior'),
  c('c43', 'Claire', 'Dubois', 'travis-heights', 'house', 'host'),
  c('c44', 'Victor', 'Salazar', 'travis-heights', 'house', 'family', 'es'),
  c('c45', 'Amber', 'Collins', 'travis-heights', 'apartment', 'professional'),
  c('c46', 'Sean', 'Gallagher', 'travis-heights', 'apartment', 'student'),
  c('c47', 'Paula', 'Jimenez', 'travis-heights', 'house', 'senior', 'es'),
  c('c48', 'Megan', 'Fischer', 'zilker', 'house', 'family'),
  c('c49', 'Tyler', 'Hansen', 'zilker', 'apartment', 'professional'),
  c('c50', 'Joanne', 'Mitchell', 'zilker', 'house', 'senior'),
  c('c51', 'Kenji', 'Watanabe', 'zilker', 'apartment', 'newcomer'),
  c('c52', 'Laura', 'Bennett', 'circle-c', 'house', 'family'),
  c('c53', 'Steve', 'Morales', 'circle-c', 'house', 'family', 'es'),
  c('c54', 'Dana', 'Whitfield', 'circle-c', 'house', 'senior'),
];

const FURNITURE_TOOLS = ['Drill', 'Hex keys', 'Level', 'Stud finder'];
const MOVING_TOOLS = ['Moving straps', 'Furniture blankets', 'Dolly'];
const YARD_TOOLS = ['Rake', 'Leaf blower', 'Pruning shears', 'Yard bags'];
const CLEANING_TOOLS = ['Microfiber cloths', 'Cleaning supplies', 'Vacuum'];
const COMPUTER_TOOLS = ['Laptop', 'USB drives', 'Ethernet cable'];

export const DEMO_HELPERS: DemoHelper[] = [
  {
    key: 'h01', firstName: 'Marisol', lastName: 'Ortega', area: 'east-austin', radiusMiles: 8,
    services: [{ category: 'light-cleaning', cents: 9500 }, { category: 'furniture-assembly', cents: 5000 }],
    languages: ['en', 'es'], tools: [...CLEANING_TOOLS, 'Drill'],
    headline: 'Thorough light cleaning and tidy assembly in East Austin',
    bio: 'I clean apartments and houses around East Austin and bring my own supplies. I also put together flat-pack furniture and take the packaging with me to the recycling bin.',
    fiveStarRate: 0.9, responseMinutes: 25, joinedDaysAgo: 74, foundingNumber: 4,
  },
  {
    key: 'h02', firstName: 'DeShawn', lastName: 'Carter', area: 'mueller', radiusMiles: 8,
    services: [{ category: 'moving-help', cents: 3800 }, { category: 'furniture-assembly', cents: 5500 }],
    languages: ['en'], tools: [...MOVING_TOOLS, 'Drill', 'Hex keys'],
    headline: 'Strong, careful moving help and furniture assembly',
    bio: 'Former warehouse lead. I load and unload rental trucks, carry the heavy pieces, and reassemble beds and tables at the new place. Straps and blankets come with me.',
    fiveStarRate: 0.86, responseMinutes: 40, joinedDaysAgo: 70, foundingNumber: 7,
  },
  {
    key: 'h03', firstName: 'Elena', lastName: 'Vasquez', area: 'cherrywood', radiusMiles: 5,
    services: [{ category: 'light-cleaning', cents: 10000 }],
    languages: ['en', 'es'], tools: CLEANING_TOOLS,
    headline: 'Detail-minded light cleaning, kitchens and bathrooms first',
    bio: 'I have cleaned homes in Cherrywood and Mueller for years. Kitchens, bathrooms, floors and the little things like baseboards and light switches. Pet friendly.',
    fiveStarRate: 0.95, responseMinutes: 20, joinedDaysAgo: 78, foundingNumber: 2,
  },
  {
    key: 'h04', firstName: 'Tomás', lastName: 'Reyes', area: 'windsor-park', radiusMiles: 12,
    services: [{ category: 'yard-cleanup', cents: 7000 }, { category: 'moving-help', cents: 3500 }],
    languages: ['en', 'es'], tools: [...YARD_TOOLS, 'Moving straps'],
    headline: 'Yard cleanups and an extra pair of hands on moving day',
    bio: 'Leaves, weeds, shrubs and storm branches, bagged and set at the curb. I also help load and unload trucks. Northeast Austin and beyond.',
    fiveStarRate: 0.8, responseMinutes: 55, joinedDaysAgo: 66, foundingNumber: 11,
  },
  {
    key: 'h05', firstName: 'Kai', lastName: 'Nakamura', area: 'north-loop', radiusMiles: 8,
    services: [{ category: 'computer-help', cents: 4000 }],
    languages: ['en'], tools: COMPUTER_TOOLS,
    headline: 'Patient computer and phone help, in person or by screen share',
    bio: 'IT support by day. I set up new laptops, move files and photos, fix flaky Wi-Fi and explain things without jargon. Happy to help remotely too.',
    fiveStarRate: 0.95, responseMinutes: 15, joinedDaysAgo: 72, foundingNumber: 5,
  },
  {
    key: 'h06', firstName: 'Brianna', lastName: 'Hughes', area: 'hyde-park', radiusMiles: 5,
    services: [{ category: 'furniture-assembly', cents: 4500 }, { category: 'light-cleaning', cents: 9000 }],
    languages: ['en'], tools: ['Drill', 'Hex keys', 'Level', 'Microfiber cloths'],
    headline: 'Flat-pack furniture and light cleaning around Hyde Park',
    bio: 'Grad student who loves a good instruction booklet. Desks, dressers, shelves and beds, built level and sturdy. I also do light cleaning on weekends.',
    fiveStarRate: 0.9, responseMinutes: 30, joinedDaysAgo: 68, foundingNumber: 9,
  },
  {
    key: 'h07', firstName: 'Omar', lastName: 'Farouk', area: 'downtown', radiusMiles: 8,
    services: [{ category: 'moving-help', cents: 4000 }, { category: 'furniture-assembly', cents: 6000 }],
    languages: ['en', 'ar'], tools: [...MOVING_TOOLS, 'Drill'],
    headline: 'Downtown apartment moves, elevators and stairs included',
    bio: 'I help with apartment moves downtown and in East Austin: loading docks, freight elevators and narrow stairs. I take apart and rebuild bed frames and tables too.',
    fiveStarRate: 0.85, responseMinutes: 35, joinedDaysAgo: 63, foundingNumber: 13,
  },
  {
    key: 'h08', firstName: 'Wes', lastName: 'Dalton', area: 'crestview', radiusMiles: 12,
    services: [{ category: 'yard-cleanup', cents: 6500 }, { category: 'furniture-assembly', cents: 5000 }],
    languages: ['en'], tools: [...YARD_TOOLS, 'Drill', 'Level'],
    headline: 'Yard work and furniture assembly in North Austin',
    bio: 'Weekend yard cleanups in Crestview, Allandale and nearby, plus patio sets, garage shelving and other flat-pack builds.',
    fiveStarRate: 0.8, responseMinutes: 60, joinedDaysAgo: 61, foundingNumber: 15,
  },
  {
    key: 'h09', firstName: 'Lucia', lastName: 'Benitez', area: 'travis-heights', radiusMiles: 8,
    services: [{ category: 'light-cleaning', cents: 9500 }, { category: 'yard-cleanup', cents: 6000 }],
    languages: ['en', 'es'], tools: [...CLEANING_TOOLS, 'Rake', 'Yard bags'],
    headline: 'Light cleaning and garden tidy-ups south of the river',
    bio: 'I clean homes in Travis Heights, Zilker and Bouldin, and help with small garden jobs like weeding and raking. Reliable, quiet and quick.',
    fiveStarRate: 0.9, responseMinutes: 25, joinedDaysAgo: 76, foundingNumber: 3,
  },
  {
    key: 'h10', firstName: 'Ethan', lastName: 'Caldwell', area: 'zilker', radiusMiles: 12,
    services: [{ category: 'furniture-assembly', cents: 5500 }, { category: 'moving-help', cents: 3800 }],
    languages: ['en'], tools: [...FURNITURE_TOOLS, 'Moving straps'],
    headline: 'Furniture builds and moving help in South Austin',
    bio: 'Carpentry hobbyist. I assemble wardrobes, beds and bookcases and anchor them properly, and help load or unload when you move.',
    fiveStarRate: 0.86, responseMinutes: 45, joinedDaysAgo: 59, foundingNumber: 17,
  },
  {
    key: 'h11', firstName: 'Hana', lastName: 'Choi', area: 'allandale', radiusMiles: 8,
    services: [{ category: 'computer-help', cents: 4500 }, { category: 'furniture-assembly', cents: 4500 }],
    languages: ['en', 'ko'], tools: ['Laptop', 'USB drives', 'Drill', 'Hex keys'],
    headline: 'Tech setup and small furniture builds, explained step by step',
    bio: 'I help seniors and busy families with phones, tablets, printers and new laptops, and I build small flat-pack pieces. In person in North Austin or by screen share.',
    fiveStarRate: 0.95, responseMinutes: 20, joinedDaysAgo: 71, foundingNumber: 6,
  },
  {
    key: 'h12', firstName: 'Rafael', lastName: 'Torres', area: 'circle-c', radiusMiles: 12,
    services: [{ category: 'yard-cleanup', cents: 7500 }, { category: 'furniture-assembly', cents: 5500 }, { category: 'light-cleaning', cents: 10000 }],
    languages: ['en', 'es'], tools: [...YARD_TOOLS, 'Drill', 'Cleaning supplies'],
    headline: 'Southwest Austin yards, builds and cleaning',
    bio: 'Based in Circle C. I take care of yard cleanups, assemble furniture and do light cleaning, so one visit can cover a few chores.',
    fiveStarRate: 0.86, responseMinutes: 50, joinedDaysAgo: 57, foundingNumber: 19,
  },
  {
    key: 'h13', firstName: 'Jenna', lastName: 'Walsh', area: 'mueller', radiusMiles: 5,
    services: [{ category: 'light-cleaning', cents: 10000 }, { category: 'furniture-assembly', cents: 5000 }],
    languages: ['en'], tools: [...CLEANING_TOOLS, 'Hex keys'],
    headline: 'Mueller neighbor for cleaning and quick furniture builds',
    bio: 'I live in Mueller and keep my jobs close to home. Light cleaning, move-in wipe-downs and putting together the new desk or dresser.',
    fiveStarRate: 0.9, responseMinutes: 30, joinedDaysAgo: 69, foundingNumber: 8,
  },
  {
    key: 'h14', firstName: 'Isaiah', lastName: 'Grant', area: 'east-austin', radiusMiles: 8,
    services: [{ category: 'moving-help', cents: 3600 }, { category: 'yard-cleanup', cents: 6000 }],
    languages: ['en'], tools: [...MOVING_TOOLS, 'Rake', 'Yard bags'],
    headline: 'Moving day muscle and yard cleanups',
    bio: 'I played college football and still like heavy lifting. Truck loading, carrying sofas up stairs, and raking or weeding when the move is done.',
    fiveStarRate: 0.8, responseMinutes: 45, joinedDaysAgo: 65, foundingNumber: 12,
  },
  {
    key: 'h15', firstName: 'Anjali', lastName: 'Rao', area: 'north-loop', radiusMiles: 5,
    services: [{ category: 'computer-help', cents: 3500 }, { category: 'light-cleaning', cents: 9000 }],
    languages: ['en', 'hi'], tools: ['Laptop', 'USB drives', 'Microfiber cloths'],
    headline: 'Friendly tech help and light cleaning near North Loop',
    bio: 'Software tester who enjoys helping people get their devices working. Printers, phones, backups and video calls. I also do light cleaning for neighbors.',
    fiveStarRate: 0.9, responseMinutes: 20, joinedDaysAgo: 67, foundingNumber: 10,
  },
  {
    key: 'h16', firstName: 'Cody', lastName: 'Ferguson', area: 'windsor-park', radiusMiles: 8,
    services: [{ category: 'furniture-assembly', cents: 4500 }, { category: 'moving-help', cents: 3500 }],
    languages: ['en'], tools: [...FURNITURE_TOOLS, 'Dolly'],
    headline: 'Affordable furniture assembly and moving help',
    bio: 'Handy with flat-pack furniture and glad to help you move. I work evenings and weekends around Windsor Park, Mueller and Cherrywood.',
    fiveStarRate: 0.76, responseMinutes: 70, joinedDaysAgo: 55, foundingNumber: 21,
  },
  {
    key: 'h17', firstName: 'Sofia', lastName: 'Lindgren', area: 'zilker', radiusMiles: 8,
    services: [{ category: 'light-cleaning', cents: 11000 }],
    languages: ['en', 'de'], tools: CLEANING_TOOLS,
    headline: 'Calm, careful cleaning for homes in Zilker and Barton Hills',
    bio: 'I clean the way I would want my own home cleaned: kitchens and bathrooms spotless, floors done by hand where it matters, and everything put back where it was.',
    fiveStarRate: 0.95, responseMinutes: 30, joinedDaysAgo: 62, foundingNumber: 14,
  },
  {
    key: 'h18', firstName: 'Mateo', lastName: 'Cruz', area: 'travis-heights', radiusMiles: 12,
    services: [{ category: 'moving-help', cents: 3800 }, { category: 'furniture-assembly', cents: 5500 }, { category: 'yard-cleanup', cents: 7000 }],
    languages: ['en', 'es'], tools: [...MOVING_TOOLS, 'Drill', 'Rake'],
    headline: 'Moves, builds and yard work across South Austin',
    bio: 'Jack of a few trades. I help with moves, assemble the furniture once it arrives, and clean up yards. Punctual and easy to reach.',
    fiveStarRate: 0.86, responseMinutes: 35, joinedDaysAgo: 60, foundingNumber: 16,
  },
  {
    key: 'h19', firstName: 'Derek', lastName: 'Whitman', area: 'allandale', radiusMiles: 12,
    services: [{ category: 'yard-cleanup', cents: 6500 }],
    languages: ['en'], tools: YARD_TOOLS,
    headline: 'Leaves, weeds and storm cleanup in North Austin',
    bio: 'Retired landscaper who still likes to be outside. Raking, weeding, shrub trimming and storm branches, bagged and bundled for city pickup.',
    fiveStarRate: 0.8, responseMinutes: 90, joinedDaysAgo: 58,
  },
  {
    key: 'h20', firstName: 'Joy', lastName: 'Santos', area: 'downtown', radiusMiles: 5,
    services: [{ category: 'computer-help', cents: 5000 }, { category: 'furniture-assembly', cents: 5000 }],
    languages: ['en', 'tl'], tools: ['Laptop', 'Ethernet cable', 'Hex keys'],
    headline: 'Tech setup and home-office builds downtown',
    bio: 'I set up home offices: the desk and chair, the monitor, the printer and the Wi-Fi, so everything works on Monday morning. Remote help available.',
    fiveStarRate: 0.9, responseMinutes: 25, joinedDaysAgo: 64, foundingNumber: 18,
  },
  {
    key: 'h21', firstName: 'Andrés', lastName: 'Molina', area: 'crestview', radiusMiles: 8,
    services: [{ category: 'light-cleaning', cents: 9500 }, { category: 'yard-cleanup', cents: 6000 }],
    languages: ['en', 'es'], tools: [...CLEANING_TOOLS, 'Rake', 'Pruning shears'],
    headline: 'Home and garden tidy-ups in Crestview and Allandale',
    bio: 'I do light cleaning inside and simple yard work outside: dusting, floors, kitchens, then the leaves and the flower beds.',
    fiveStarRate: 0.86, responseMinutes: 40, joinedDaysAgo: 56, foundingNumber: 20,
  },
  {
    key: 'h22', firstName: 'Tyrone', lastName: 'Banks', area: 'hyde-park', radiusMiles: 8,
    services: [{ category: 'moving-help', cents: 3700 }, { category: 'furniture-assembly', cents: 5000 }],
    languages: ['en'], tools: [...MOVING_TOOLS, 'Hex keys'],
    headline: 'Student moves and dorm-to-apartment help near campus',
    bio: 'I help students and young professionals move around Hyde Park, North Loop and West Campus, and rebuild what had to come apart.',
    fiveStarRate: 0.8, responseMinutes: 50, joinedDaysAgo: 54, foundingNumber: 22,
  },
  {
    key: 'h23', firstName: 'Minh', lastName: 'Tran', area: 'cherrywood', radiusMiles: 8,
    services: [{ category: 'furniture-assembly', cents: 5000 }, { category: 'computer-help', cents: 4000 }],
    languages: ['en', 'vi'], tools: ['Drill', 'Hex keys', 'Level', 'Laptop'],
    headline: 'Furniture assembly and tech setup, done right the first time',
    bio: 'Mechanical engineer. I read the instructions so you do not have to, and I can also set up your new laptop, printer or smart TV apps.',
    fiveStarRate: 0.9, responseMinutes: 30, joinedDaysAgo: 53, foundingNumber: 23,
  },
  {
    key: 'h24', firstName: 'Rosa', lastName: 'Castañeda', area: 'east-austin', radiusMiles: 5,
    services: [{ category: 'light-cleaning', cents: 9000 }],
    languages: ['es', 'en'], tools: CLEANING_TOOLS,
    headline: 'Limpieza ligera en el Este de Austin / Light cleaning in East Austin',
    bio: 'Llevo mis propios productos. Cocinas, baños y pisos. I bring my own supplies and work quickly and carefully.',
    fiveStarRate: 0.9, responseMinutes: 35, joinedDaysAgo: 52, foundingNumber: 24,
  },
  {
    key: 'h25', firstName: 'Liam', lastName: "O'Connor", area: 'mueller', radiusMiles: 8,
    services: [{ category: 'furniture-assembly', cents: 4500 }, { category: 'moving-help', cents: 3500 }],
    languages: ['en'], tools: [...FURNITURE_TOOLS, 'Moving straps'],
    headline: 'New in Austin and ready to build and lift',
    bio: 'Just moved here from Dublin. I have assembled more flat-pack furniture than I can count and I am glad to help with moves around Mueller.',
    fiveStarRate: 0.86, responseMinutes: 30, joinedDaysAgo: 9,
  },
  {
    key: 'h26', firstName: 'Maddie', lastName: 'Harper', area: 'zilker', radiusMiles: 8,
    services: [{ category: 'yard-cleanup', cents: 6000 }],
    languages: ['en'], tools: ['Rake', 'Pruning shears', 'Yard bags'],
    headline: 'Garden helper for South Austin yards',
    bio: 'Master gardener in training. Weeding, raking and tidying beds, with green waste bagged for the curb.',
    fiveStarRate: 0.9, responseMinutes: 40, joinedDaysAgo: 7,
  },
  {
    key: 'h27', firstName: 'Wei', lastName: 'Zhang', area: 'downtown', radiusMiles: 12,
    services: [{ category: 'computer-help', cents: 4500 }],
    languages: ['en', 'zh'], tools: COMPUTER_TOOLS,
    headline: 'Computer help for home offices and small studios',
    bio: 'I fix slow computers, set up printers and routers and move files to new machines. In person around central Austin or remotely.',
    fiveStarRate: 0.95, responseMinutes: 15, joinedDaysAgo: 11,
  },
  {
    key: 'h28', firstName: 'Bianca', lastName: 'Russo', area: 'travis-heights', radiusMiles: 5,
    services: [{ category: 'furniture-assembly', cents: 5000 }, { category: 'light-cleaning', cents: 9500 }],
    languages: ['en', 'fr'], tools: ['Drill', 'Hex keys', 'Level', 'Microfiber cloths'],
    headline: 'Careful assembly and light cleaning in Travis Heights',
    bio: 'Interior design student. I assemble furniture with care for your floors and walls, and leave the room cleaner than I found it.',
    fiveStarRate: 0.9, responseMinutes: 25, joinedDaysAgo: 77, foundingNumber: 1,
  },
];

/** ZIP code and fictional street names per neighborhood (exact addresses are never real). */
export const AREA_STREETS: Record<string, { zip: string; streets: string[] }> = {
  downtown: { zip: '78701', streets: ['Example Lane', 'Sample Street', 'Placeholder Avenue'] },
  mueller: { zip: '78723', streets: ['Example Lane', 'Demo Court', 'Specimen Drive'] },
  'east-austin': { zip: '78702', streets: ['Demo Court', 'Mockup Road', 'Sample Street'] },
  'hyde-park': { zip: '78751', streets: ['Placeholder Avenue', 'Template Way', 'Example Lane'] },
  'windsor-park': { zip: '78723', streets: ['Sample Street', 'Prototype Trail', 'Demo Court'] },
  cherrywood: { zip: '78722', streets: ['Mockup Road', 'Template Way', 'Placeholder Avenue'] },
  'north-loop': { zip: '78751', streets: ['Specimen Drive', 'Sample Street', 'Example Lane'] },
  allandale: { zip: '78757', streets: ['Prototype Trail', 'Placeholder Avenue', 'Demo Court'] },
  crestview: { zip: '78757', streets: ['Sample Street', 'Template Way', 'Mockup Road'] },
  'travis-heights': { zip: '78704', streets: ['Example Lane', 'Prototype Trail', 'Specimen Drive'] },
  zilker: { zip: '78704', streets: ['Demo Court', 'Placeholder Avenue', 'Template Way'] },
  'circle-c': { zip: '78739', streets: ['Mockup Road', 'Example Lane', 'Prototype Trail'] },
};
