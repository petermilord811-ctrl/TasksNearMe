import type { ExperienceEntry } from '../../../src/contracts/resume';
/**
 * Seeded people. Ids, display names and helper data mirror src/fixtures/people.ts so screens built
 * from fixtures match the seeded database. Emails use the reserved .test domain (undeliverable).
 * Last names are private and must never reach public screens.
 */

interface SeedService {
  categoryId: string;
  pricingType: 'fixed' | 'hourly';
  fromPriceCents?: number;
  hourlyRateCents?: number;
  minHours?: number;
  /** The helper's own words about the service (the base seed sets these in profile-extras instead). */
  description?: string;
}

interface SeedHelper {
  handle: string;
  headline: string;
  bio: string;
  status: 'draft' | 'active';
  areaId: string;
  /** Default 8 km (the column's default). */
  serviceRadiusKm?: number;
  remoteOk: boolean;
  tools: string[];
  /** Skills, the work they enjoy and don't do, and their experience (2026-11-27, "Import from resume"); default none. */
  skills?: string[];
  likes?: string[];
  excludes?: string[];
  experience?: ExperienceEntry[];
  /** Default ['en'] (the base seed sets languages in profile-extras instead). */
  languages?: string[];
  foundingNumber?: number;
  idVerifiedAt?: string;
  backgroundCheckedAt?: string;
  payoutsReadyAt?: string;
  /** A verified proof of the home address: when it was approved, and the (fictional) address. */
  homeAddress?: { verifiedAt: string; line1: string; zip: string };
  completedCount: number;
  ratingAverage?: number;
  ratingCount: number;
  responseTimeMinutes?: number;
  services: SeedService[];
}

export interface SeedPerson {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mode: 'poster' | 'helper';
  phone?: string;
  /** The language emails and texts go out in; unset means the default (English). */
  locale?: 'en' | 'es';
  /** The cast is Austin's (`mkt_austin`, set explicitly by the seed); Gainesville's poster names hers. */
  homeMarketId?: string;
  createdAt: string;
  helper?: SeedHelper;
  staffRole?: 'support_agent' | 'support_lead' | 'trust_safety' | 'finance' | 'admin';
}

export const PEOPLE: SeedPerson[] = [
  { id: 'usr_maya', email: 'maya@example.test', firstName: 'Maya', lastName: 'Rivera', mode: 'poster', phone: '+15125550101', createdAt: '2026-09-04T15:00:00.000Z' },
  { id: 'usr_chris', email: 'chris@example.test', firstName: 'Chris', lastName: 'Davis', mode: 'poster', phone: '+15125550102', createdAt: '2026-10-12T15:00:00.000Z' },
  { id: 'usr_ruth', email: 'ruth@example.test', firstName: 'Ruth', lastName: 'Alvarez', mode: 'poster', phone: '+15125550103', createdAt: '2026-11-02T15:00:00.000Z' },
  { id: 'usr_ben', email: 'ben@example.test', firstName: 'Ben', lastName: 'Wright', mode: 'poster', phone: '+15125550104', createdAt: '2026-10-01T15:00:00.000Z' },
  { id: 'usr_ana', email: 'ana@example.test', firstName: 'Ana', lastName: 'Patel', mode: 'poster', phone: '+15125550105', createdAt: '2026-09-20T15:00:00.000Z' },
  // Gainesville, the first city: a poster there, so its landing and map have open work in the test world.
  { id: 'usr_grace', email: 'grace@example.test', firstName: 'Grace', lastName: 'Okafor', mode: 'poster', phone: '+13525550110', homeMarketId: 'mkt_gainesville', createdAt: '2026-11-10T15:00:00.000Z' },
  {
    id: 'usr_jordan',
    email: 'jordan@example.test',
    firstName: 'Jordan',
    lastName: 'Thompson',
    mode: 'helper',
    phone: '+15125550201',
    createdAt: '2026-11-03T15:00:00.000Z',
    helper: {
      handle: 'jordan-t',
      headline: 'Careful assembly and moving help in East Austin',
      bio: 'I build flat-pack furniture weekly and bring my own tools. Happy to help with moves and yard work too.',
      status: 'active',
      areaId: 'area_east_austin',
      remoteOk: false,
      tools: ['Drill', 'Hex keys', 'Level', 'Stud finder'],
      foundingNumber: 63,
      idVerifiedAt: '2026-11-04T16:00:00.000Z',
      homeAddress: { verifiedAt: '2026-11-05T15:00:00.000Z', line1: '5678 Example Street', zip: '78702' },
      backgroundCheckedAt: '2026-11-06T16:00:00.000Z',
      payoutsReadyAt: '2026-11-05T16:00:00.000Z',
      completedCount: 0,
      ratingCount: 0,
      responseTimeMinutes: 35,
      services: [
        { categoryId: 'cat_furniture_assembly', pricingType: 'fixed', fromPriceCents: 4500 },
        { categoryId: 'cat_moving_help', pricingType: 'hourly', hourlyRateCents: 3500, minHours: 2 },
        { categoryId: 'cat_yard_cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2 },
      ],
    },
  },
  {
    id: 'usr_sam',
    email: 'sam@example.test',
    firstName: 'Sam',
    lastName: 'Kim',
    mode: 'helper',
    phone: '+15125550202',
    createdAt: '2024-05-20T15:00:00.000Z',
    helper: {
      handle: 'sam-k',
      headline: 'Assembly, moving, and yard help since 2024',
      bio: 'Over a hundred desks, beds and bookshelves built. Careful with floors and walls.',
      status: 'active',
      areaId: 'area_hyde_park',
      remoteOk: false,
      tools: ['Drill', 'Hex keys', 'Level', 'Furniture sliders', 'Dolly'],
      // As src/fixtures/resume.ts has them (previews and e2e).
      skills: ['Flat-pack assembly', 'Furniture moving', 'Wall mounting', 'Packing'],
      likes: ['Big assembly jobs', 'Weekend moves'],
      excludes: ['Pianos and safes', 'Electrical wiring'],
      experience: [
        { title: 'Furniture assembler', organization: 'Hyde Park Home Goods', startYear: 2022, current: true, summary: 'Assemble beds, desks and shelving for delivery customers; about 15 pieces a week.' },
        { title: 'Mover', organization: 'Two Brothers Moving', startYear: 2019, endYear: 2022, summary: 'Packed, loaded and unloaded trucks for local moves.' },
      ],
      idVerifiedAt: '2026-01-10T16:00:00.000Z',
      homeAddress: { verifiedAt: '2026-01-11T16:00:00.000Z', line1: '4321 Example Avenue', zip: '78751' },
      backgroundCheckedAt: '2026-01-12T16:00:00.000Z',
      payoutsReadyAt: '2024-05-22T16:00:00.000Z',
      completedCount: 140,
      ratingAverage: 4.9,
      ratingCount: 112,
      responseTimeMinutes: 20,
      services: [
        { categoryId: 'cat_furniture_assembly', pricingType: 'fixed', fromPriceCents: 5000 },
        { categoryId: 'cat_moving_help', pricingType: 'hourly', hourlyRateCents: 3800, minHours: 2 },
        { categoryId: 'cat_yard_cleanup', pricingType: 'hourly', hourlyRateCents: 3200, minHours: 2 },
        { categoryId: 'cat_light_cleaning', pricingType: 'fixed', fromPriceCents: 9000 },
      ],
    },
  },
  {
    id: 'usr_lee',
    email: 'lee@example.test',
    firstName: 'Lee',
    lastName: 'Martinez',
    mode: 'helper',
    phone: '+15125550203',
    createdAt: '2026-06-01T15:00:00.000Z',
    helper: {
      handle: 'lee-m',
      headline: 'Patient computer help and quick assembly',
      bio: 'IT support by day. I explain things in plain words and never ask for your passwords.',
      status: 'active',
      areaId: 'area_windsor_park',
      remoteOk: true,
      tools: ['Drill', 'Laptop toolkit'],
      skills: ['Wi-Fi setup', 'Printer setup', 'Data backups', 'Laptop cleanup'],
      likes: ['Patient one-on-one help', 'Remote sessions'],
      excludes: ['Handling your passwords', 'Phone screen repair'],
      experience: [{ title: 'IT support specialist', organization: 'Windsor Park Family Clinic', startYear: 2021, current: true, summary: 'Set up laptops, printers and Wi-Fi for a 40-person clinic.' }],
      idVerifiedAt: '2026-06-02T16:00:00.000Z',
      homeAddress: { verifiedAt: '2026-06-02T20:00:00.000Z', line1: '2468 Example Court', zip: '78723' },
      backgroundCheckedAt: '2026-06-05T16:00:00.000Z',
      payoutsReadyAt: '2026-06-03T16:00:00.000Z',
      completedCount: 11,
      ratingAverage: 4.6,
      ratingCount: 9,
      responseTimeMinutes: 60,
      services: [
        { categoryId: 'cat_furniture_assembly', pricingType: 'fixed', fromPriceCents: 4000 },
        { categoryId: 'cat_computer_help', pricingType: 'fixed', fromPriceCents: 4000 },
      ],
    },
  },
  {
    id: 'usr_priya',
    email: 'priya@example.test',
    firstName: 'Priya',
    lastName: 'Shah',
    mode: 'poster',
    phone: '+15125550204',
    createdAt: '2026-11-09T15:00:00.000Z',
    helper: {
      handle: 'priya-s',
      headline: '',
      bio: '',
      status: 'draft',
      areaId: 'area_north_loop',
      remoteOk: false,
      tools: [],
      completedCount: 0,
      ratingCount: 0,
      services: [],
    },
  },
  { id: 'usr_alex', email: 'alex@example.test', firstName: 'Alex', lastName: 'Price', mode: 'poster', createdAt: '2026-08-01T15:00:00.000Z', staffRole: 'support_agent' },
  { id: 'usr_morgan', email: 'morgan@example.test', firstName: 'Morgan', lastName: 'Lee', mode: 'poster', createdAt: '2026-08-01T15:00:00.000Z', staffRole: 'support_lead' },
  { id: 'usr_taylor', email: 'taylor@example.test', firstName: 'Taylor', lastName: 'Brooks', mode: 'poster', createdAt: '2026-08-01T15:00:00.000Z', staffRole: 'trust_safety' },
  { id: 'usr_casey', email: 'casey@example.test', firstName: 'Casey', lastName: 'Wong', mode: 'poster', createdAt: '2026-08-01T15:00:00.000Z', staffRole: 'finance' },
  { id: 'usr_riley', email: 'riley@example.test', firstName: 'Riley', lastName: 'Nguyen', mode: 'poster', createdAt: '2026-08-01T15:00:00.000Z', staffRole: 'admin' },
];

export const displayNameOf = (p: Pick<SeedPerson, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName.charAt(0)}.`;
