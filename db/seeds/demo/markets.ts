/**
 * The demo marketplace beyond Austin (db/seeds/demo): cities across the country, plus Pretty Prairie, Kansas.
 *
 * All in Central time: the app shows every time in America/Chicago (`MARKET_TIME_ZONE`), so a market on another
 * clock would show its jobs an hour or two off. Neighborhood centers are approximate; addresses stay fictional.
 * Prices follow the city (`priceFactor` × Austin's), never below a category's minimum.
 */
export interface DemoArea {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  zip: string;
  /** Share of homes that are apartments (the rest are houses). */
  apartments: number;
  /** How much of the market's activity happens here (default 1). */
  weight?: number;
  /** What people call it in their own words and addresses, when that isn't `name` ("Town center" is "Pretty Prairie"). */
  label?: string;
}

export interface DemoMarket {
  /** Short key in demo ids: `tsk_demo_<key>_0001`, `usr_demo_<key>_c001`. */
  key: string;
  slug: string;
  name: string;
  state: string;
  areaCode: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  priceFactor: number;
  /** Small towns and farms: houses with big yards, longer drives, fewer students. */
  rural?: boolean;
  /** Share of people who also speak Spanish. */
  spanish: number;
  taskCount: number;
  areas: DemoArea[];
}

const a = (slug: string, name: string, lat: number, lng: number, zip: string, apartments: number, weight?: number, label?: string): DemoArea => ({
  slug,
  name,
  lat,
  lng,
  zip,
  apartments,
  ...(weight ? { weight } : {}),
  ...(label ? { label } : {}),
});

export const DEMO_MARKETS: DemoMarket[] = [
  {
    key: 'pp', slug: 'pretty-prairie', name: 'Pretty Prairie', state: 'KS', areaCode: '620', lat: 37.7795, lng: -98.0198, serviceRadiusKm: 40, priceFactor: 0.8, rural: true, spanish: 0.1, taskCount: 100,
    areas: [
      // The town itself; pages show "Town center, Pretty Prairie" rather than the market's name twice.
      a('pretty-prairie', 'Town center', 37.7795, -98.0198, '67570', 0.05, 12, 'Pretty Prairie'),
      a('kingman', 'Kingman', 37.6458, -98.1137, '67068', 0.15, 1.5),
      a('arlington', 'Arlington', 37.8967, -98.1784, '67514', 0.05),
      a('haven', 'Haven', 37.8992, -97.7828, '67543', 0.05),
      a('cheney', 'Cheney', 37.63, -97.782, '67025', 0.1),
      a('south-hutchinson', 'South Hutchinson', 38.0283, -97.9406, '67505', 0.2, 1.5),
    ],
  },
  {
    key: 'chi', slug: 'chicago', name: 'Chicago', state: 'IL', areaCode: '312', lat: 41.8781, lng: -87.6298, serviceRadiusKm: 30, priceFactor: 1.2, spanish: 0.2, taskCount: 115,
    areas: [
      a('lincoln-park', 'Lincoln Park', 41.9214, -87.6513, '60614', 0.7),
      a('wicker-park', 'Wicker Park', 41.9088, -87.6796, '60622', 0.75),
      a('logan-square', 'Logan Square', 41.9231, -87.7093, '60647', 0.6),
      a('lakeview', 'Lakeview', 41.9434, -87.6553, '60657', 0.75),
      a('hyde-park', 'Hyde Park', 41.7943, -87.5907, '60615', 0.65),
      a('pilsen', 'Pilsen', 41.8564, -87.656, '60608', 0.55),
      a('west-loop', 'West Loop', 41.8826, -87.6447, '60607', 0.9),
      a('andersonville', 'Andersonville', 41.98, -87.6685, '60640', 0.6),
      a('bridgeport', 'Bridgeport', 41.838, -87.651, '60616', 0.4),
      a('rogers-park', 'Rogers Park', 42.0106, -87.6696, '60626', 0.7),
    ],
  },
  {
    key: 'hou', slug: 'houston', name: 'Houston', state: 'TX', areaCode: '713', lat: 29.7604, lng: -95.3698, serviceRadiusKm: 35, priceFactor: 1, spanish: 0.4, taskCount: 105,
    areas: [
      a('the-heights', 'The Heights', 29.798, -95.398, '77008', 0.35),
      a('montrose', 'Montrose', 29.747, -95.391, '77006', 0.55),
      a('midtown', 'Midtown', 29.7404, -95.377, '77002', 0.85),
      a('east-end', 'East End', 29.735, -95.324, '77011', 0.35),
      a('bellaire', 'Bellaire', 29.7058, -95.4588, '77401', 0.15),
      a('rice-village', 'Rice Village', 29.7166, -95.413, '77005', 0.4),
      a('garden-oaks', 'Garden Oaks', 29.841, -95.413, '77018', 0.1),
      a('third-ward', 'Third Ward', 29.73, -95.36, '77004', 0.5),
    ],
  },
  {
    key: 'dal', slug: 'dallas', name: 'Dallas', state: 'TX', areaCode: '214', lat: 32.7767, lng: -96.797, serviceRadiusKm: 30, priceFactor: 1.05, spanish: 0.35, taskCount: 95,
    areas: [
      a('uptown', 'Uptown', 32.802, -96.8, '75204', 0.85),
      a('deep-ellum', 'Deep Ellum', 32.784, -96.783, '75226', 0.75),
      a('bishop-arts', 'Bishop Arts', 32.748, -96.828, '75208', 0.35),
      a('lakewood', 'Lakewood', 32.816, -96.748, '75214', 0.15),
      a('oak-lawn', 'Oak Lawn', 32.812, -96.816, '75219', 0.7),
      a('lower-greenville', 'Lower Greenville', 32.819, -96.77, '75206', 0.5),
      a('preston-hollow', 'Preston Hollow', 32.885, -96.802, '75225', 0.1),
    ],
  },
  {
    key: 'sat', slug: 'san-antonio', name: 'San Antonio', state: 'TX', areaCode: '210', lat: 29.4241, lng: -98.4936, serviceRadiusKm: 30, priceFactor: 0.9, spanish: 0.5, taskCount: 70,
    areas: [
      a('alamo-heights', 'Alamo Heights', 29.4846, -98.4655, '78209', 0.2),
      a('king-william', 'King William', 29.413, -98.496, '78204', 0.3),
      a('pearl', 'Pearl', 29.443, -98.48, '78215', 0.85),
      a('monte-vista', 'Monte Vista', 29.456, -98.503, '78212', 0.25),
      a('stone-oak', 'Stone Oak', 29.64, -98.482, '78258', 0.3),
      a('tobin-hill', 'Tobin Hill', 29.447, -98.488, '78212', 0.5),
    ],
  },
  {
    key: 'kc', slug: 'kansas-city', name: 'Kansas City', state: 'MO', areaCode: '816', lat: 39.0997, lng: -94.5786, serviceRadiusKm: 30, priceFactor: 0.95, spanish: 0.12, taskCount: 65,
    areas: [
      a('westport', 'Westport', 39.053, -94.591, '64111', 0.6),
      a('crossroads', 'Crossroads', 39.089, -94.581, '64108', 0.85),
      a('brookside', 'Brookside', 39.013, -94.59, '64113', 0.15),
      a('waldo', 'Waldo', 38.984, -94.593, '64114', 0.25),
      a('river-market', 'River Market', 39.11, -94.582, '64105', 0.85),
      a('country-club-plaza', 'Country Club Plaza', 39.042, -94.593, '64112', 0.6),
      a('north-kansas-city', 'North Kansas City', 39.143, -94.572, '64116', 0.35),
    ],
  },
  {
    key: 'msp', slug: 'minneapolis', name: 'Minneapolis', state: 'MN', areaCode: '612', lat: 44.9778, lng: -93.265, serviceRadiusKm: 30, priceFactor: 1.1, spanish: 0.08, taskCount: 70,
    areas: [
      a('uptown', 'Uptown', 44.948, -93.298, '55408', 0.7),
      a('northeast', 'Northeast', 45.0, -93.253, '55418', 0.4),
      a('longfellow', 'Longfellow', 44.939, -93.216, '55406', 0.25),
      a('linden-hills', 'Linden Hills', 44.925, -93.317, '55410', 0.15),
      a('powderhorn', 'Powderhorn', 44.942, -93.256, '55407', 0.35),
      a('north-loop', 'North Loop', 44.989, -93.277, '55401', 0.9),
      a('nokomis', 'Nokomis', 44.908, -93.24, '55417', 0.1),
    ],
  },
  {
    key: 'stl', slug: 'st-louis', name: 'St. Louis', state: 'MO', areaCode: '314', lat: 38.627, lng: -90.1994, serviceRadiusKm: 30, priceFactor: 0.9, spanish: 0.06, taskCount: 60,
    areas: [
      a('soulard', 'Soulard', 38.607, -90.21, '63104', 0.45),
      a('central-west-end', 'Central West End', 38.643, -90.261, '63108', 0.75),
      a('tower-grove', 'Tower Grove', 38.602, -90.251, '63116', 0.3),
      a('the-hill', 'The Hill', 38.615, -90.276, '63110', 0.15),
      a('lafayette-square', 'Lafayette Square', 38.616, -90.216, '63104', 0.35),
      a('dogtown', 'Dogtown', 38.625, -90.293, '63139', 0.2),
    ],
  },
  {
    key: 'nsh', slug: 'nashville', name: 'Nashville', state: 'TN', areaCode: '615', lat: 36.1627, lng: -86.7816, serviceRadiusKm: 30, priceFactor: 1.05, spanish: 0.1, taskCount: 70,
    areas: [
      a('east-nashville', 'East Nashville', 36.181, -86.745, '37206', 0.3),
      a('the-gulch', 'The Gulch', 36.152, -86.789, '37203', 0.9),
      a('12-south', '12 South', 36.125, -86.79, '37204', 0.35),
      a('germantown', 'Germantown', 36.178, -86.788, '37208', 0.6),
      a('sylvan-park', 'Sylvan Park', 36.142, -86.848, '37209', 0.15),
      a('belmont-hillsboro', 'Belmont-Hillsboro', 36.129, -86.799, '37212', 0.4),
      a('inglewood', 'Inglewood', 36.217, -86.733, '37216', 0.15),
    ],
  },
  {
    key: 'nola', slug: 'new-orleans', name: 'New Orleans', state: 'LA', areaCode: '504', lat: 29.9511, lng: -90.0715, serviceRadiusKm: 25, priceFactor: 0.95, spanish: 0.12, taskCount: 55,
    areas: [
      a('garden-district', 'Garden District', 29.929, -90.085, '70130', 0.35),
      a('marigny', 'Marigny', 29.964, -90.056, '70117', 0.45),
      a('bywater', 'Bywater', 29.963, -90.04, '70117', 0.3),
      a('uptown', 'Uptown', 29.924, -90.103, '70115', 0.35),
      a('mid-city', 'Mid-City', 29.976, -90.095, '70119', 0.4),
      a('treme', 'Tremé', 29.967, -90.071, '70116', 0.45),
      a('lakeview', 'Lakeview', 30.005, -90.105, '70124', 0.1),
    ],
  },
  {
    key: 'okc', slug: 'oklahoma-city', name: 'Oklahoma City', state: 'OK', areaCode: '405', lat: 35.4676, lng: -97.5164, serviceRadiusKm: 30, priceFactor: 0.85, spanish: 0.2, taskCount: 50,
    areas: [
      a('midtown', 'Midtown', 35.48, -97.516, '73103', 0.6),
      a('plaza-district', 'Plaza District', 35.479, -97.552, '73106', 0.3),
      a('paseo', 'Paseo', 35.498, -97.524, '73103', 0.3),
      a('bricktown', 'Bricktown', 35.466, -97.509, '73104', 0.85),
      a('nichols-hills', 'Nichols Hills', 35.55, -97.548, '73116', 0.05),
      a('mesta-park', 'Mesta Park', 35.487, -97.531, '73103', 0.2),
    ],
  },
  {
    key: 'oma', slug: 'omaha', name: 'Omaha', state: 'NE', areaCode: '402', lat: 41.2565, lng: -95.9345, serviceRadiusKm: 25, priceFactor: 0.9, spanish: 0.12, taskCount: 45,
    areas: [
      a('dundee', 'Dundee', 41.261, -95.99, '68132', 0.2),
      a('benson', 'Benson', 41.284, -96.01, '68104', 0.3),
      a('old-market', 'Old Market', 41.256, -95.929, '68102', 0.85),
      a('aksarben', 'Aksarben', 41.239, -96.009, '68106', 0.55),
      a('blackstone', 'Blackstone', 41.258, -95.967, '68131', 0.6),
      a('florence', 'Florence', 41.336, -95.96, '68112', 0.15),
    ],
  },
  {
    key: 'mke', slug: 'milwaukee', name: 'Milwaukee', state: 'WI', areaCode: '414', lat: 43.0389, lng: -87.9065, serviceRadiusKm: 25, priceFactor: 0.95, spanish: 0.12, taskCount: 50,
    areas: [
      a('bay-view', 'Bay View', 42.99, -87.894, '53207', 0.3),
      a('third-ward', 'Third Ward', 43.033, -87.908, '53202', 0.9),
      a('riverwest', 'Riverwest', 43.073, -87.9, '53212', 0.45),
      a('east-side', 'East Side', 43.06, -87.885, '53211', 0.6),
      a('walkers-point', 'Walker’s Point', 43.023, -87.916, '53204', 0.55),
      a('washington-heights', 'Washington Heights', 43.05, -87.975, '53208', 0.15),
    ],
  },
  {
    key: 'ict', slug: 'wichita', name: 'Wichita', state: 'KS', areaCode: '316', lat: 37.6872, lng: -97.3301, serviceRadiusKm: 30, priceFactor: 0.85, spanish: 0.15, taskCount: 50,
    areas: [
      a('college-hill', 'College Hill', 37.69, -97.295, '67208', 0.2),
      a('riverside', 'Riverside', 37.708, -97.348, '67203', 0.2),
      a('delano', 'Delano', 37.685, -97.36, '67203', 0.4),
      a('old-town', 'Old Town', 37.688, -97.33, '67202', 0.85),
      a('eastborough', 'Eastborough', 37.687, -97.249, '67207', 0.05),
      a('midtown', 'Midtown', 37.71, -97.335, '67203', 0.3),
    ],
  },
];

/** Area ids beyond Austin: `area_demo_<market>_<slug>` (Austin's are `area_<slug>`). */
export const demoAreaId = (market: DemoMarket, area: DemoArea) => `area_demo_${market.key}_${area.slug.replaceAll('-', '_')}`;
export const demoMarketId = (market: DemoMarket) => `mkt_demo_${market.key}`;
export const demoPolicyId = (market: DemoMarket) => `pol_demo_${market.key}_v1`;

const FIRST_NAMES = [
  'Aaliyah', 'Aaron', 'Abigail', 'Adrian', 'Aiden', 'Alejandra', 'Alex', 'Alicia', 'Amara', 'Amir', 'Andrea', 'Angela', 'Anthony', 'Ariana', 'Ashley', 'Austin',
  'Avery', 'Beatriz', 'Benjamin', 'Bethany', 'Brandon', 'Brenda', 'Bryce', 'Caitlin', 'Camila', 'Carlos', 'Carmen', 'Carter', 'Cecilia', 'Chloe', 'Christian', 'Claudia',
  'Colin', 'Connor', 'Courtney', 'Dakota', 'Damian', 'Daniela', 'Darius', 'David', 'Delaney', 'Desmond', 'Destiny', 'Dominic', 'Dylan', 'Eduardo', 'Eleanor', 'Elijah',
  'Elise', 'Emily', 'Emmanuel', 'Eric', 'Erin', 'Esther', 'Evan', 'Fatima', 'Felix', 'Fiona', 'Gabriel', 'Gavin', 'Gemma', 'Gloria', 'Grant', 'Hailey',
  'Hassan', 'Heather', 'Hector', 'Helen', 'Ian', 'Imani', 'Irene', 'Isaac', 'Isla', 'Jacob', 'Jade', 'Jamie', 'Jared', 'Javier', 'Jenna', 'Jeremy',
  'Jessica', 'Joel', 'Jonah', 'Jordyn', 'Jose', 'Joseph', 'Joy', 'Julia', 'Julian', 'Justin', 'Kara', 'Karina', 'Katherine', 'Keith', 'Kelsey', 'Kendall',
  'Kevin', 'Kiara', 'Kyle', 'Lauren', 'Leila', 'Leon', 'Lila', 'Logan', 'Lucas', 'Lucy', 'Luis', 'Lydia', 'Malik', 'Marco', 'Maria', 'Mariah',
  'Mark', 'Marta', 'Mason', 'Matthew', 'Maya', 'Melissa', 'Micah', 'Miguel', 'Mila', 'Molly', 'Monica', 'Nadia', 'Natalie', 'Nathan', 'Nia', 'Noah',
  'Nolan', 'Olivia', 'Omar', 'Owen', 'Paige', 'Patrick', 'Paul', 'Penelope', 'Quinn', 'Rachel', 'Ramon', 'Rebecca', 'Reese', 'Ricardo', 'Riley', 'Rosa',
  'Ruby', 'Ryan', 'Sabrina', 'Samantha', 'Santiago', 'Sara', 'Savannah', 'Scott', 'Selena', 'Seth', 'Shawn', 'Sierra', 'Simone', 'Sophia', 'Spencer', 'Stella',
  'Tanya', 'Tessa', 'Theo', 'Thomas', 'Tiana', 'Travis', 'Trinity', 'Valeria', 'Vanessa', 'Victoria', 'Vincent', 'Wade', 'Wesley', 'Whitney', 'Xavier', 'Yasmin',
  'Yolanda', 'Zachary', 'Zainab', 'Zion',
];

const LAST_NAMES = [
  'Abbott', 'Acosta', 'Adams', 'Aguilar', 'Ahmed', 'Alexander', 'Ali', 'Allen', 'Alvarado', 'Anderson', 'Andrews', 'Armstrong', 'Avila', 'Bailey', 'Baker', 'Banks',
  'Barker', 'Barnes', 'Barrett', 'Bates', 'Bell', 'Benson', 'Bishop', 'Black', 'Blake', 'Bowen', 'Boyd', 'Bradley', 'Brewer', 'Bryant', 'Burke', 'Burns',
  'Butler', 'Byrd', 'Cabrera', 'Calhoun', 'Campbell', 'Cannon', 'Carlson', 'Carr', 'Carroll', 'Carson', 'Castro', 'Chambers', 'Chang', 'Chapman', 'Chavez', 'Cho',
  'Clark', 'Cole', 'Coleman', 'Collins', 'Conner', 'Cooper', 'Cortez', 'Cox', 'Crawford', 'Cunningham', 'Curtis', 'Daniels', 'Dawson', 'Day', 'Dean', 'Delgado',
  'Diaz', 'Dixon', 'Douglas', 'Duncan', 'Dunn', 'Edwards', 'Elliott', 'Ellis', 'Espinoza', 'Evans', 'Farmer', 'Ferguson', 'Fields', 'Fleming', 'Fletcher', 'Ford',
  'Foster', 'Fowler', 'Francis', 'Franklin', 'Freeman', 'Fuller', 'Garcia', 'Gardner', 'Garner', 'George', 'Gibson', 'Gilbert', 'Gordon', 'Graham', 'Gray', 'Greene',
  'Gregory', 'Griffin', 'Guerrero', 'Gutierrez', 'Hale', 'Hall', 'Hamilton', 'Hampton', 'Hansen', 'Harper', 'Harris', 'Hart', 'Hayes', 'Henderson', 'Henry', 'Hernandez',
  'Hicks', 'Hill', 'Hoffman', 'Holland', 'Holmes', 'Hopkins', 'Howard', 'Hudson', 'Hunt', 'Ibarra', 'Jackson', 'James', 'Jensen', 'Johnston', 'Jordan', 'Kang',
  'Keller', 'Kelly', 'Kennedy', 'Khan', 'King', 'Klein', 'Knight', 'Lambert', 'Lane', 'Larson', 'Lawrence', 'Lawson', 'Le', 'Lewis', 'Lopez', 'Lowe',
  'Lucas', 'Lynch', 'Maldonado', 'Malone', 'Mann', 'Marshall', 'Mason', 'Matthews', 'May', 'McCoy', 'McDonald', 'Medina', 'Mendez', 'Meyer', 'Miles', 'Miller',
  'Mills', 'Montgomery', 'Morgan', 'Morris', 'Murphy', 'Murray', 'Myers', 'Nash', 'Navarro', 'Nelson', 'Newman', 'Nichols', 'Nunez', 'Obi', 'Olson', 'Ortiz',
  'Owens', 'Padilla', 'Palmer', 'Parker', 'Patel', 'Patterson', 'Payne', 'Pearson', 'Perez', 'Perkins', 'Perry', 'Peters', 'Phillips', 'Porter', 'Powell', 'Quinn',
  'Ramos', 'Reed', 'Reid', 'Reyes', 'Reynolds', 'Rice', 'Richards', 'Rios', 'Rivas', 'Roberts', 'Robinson', 'Rodgers', 'Romero', 'Rose', 'Ross', 'Russell',
  'Ryan', 'Sanchez', 'Sanders', 'Santiago', 'Schmidt', 'Schultz', 'Scott', 'Shaw', 'Shelton', 'Silva', 'Simmons', 'Simpson', 'Singh', 'Snyder', 'Soto', 'Spencer',
  'Stanley', 'Steele', 'Stephens', 'Stevens', 'Stone', 'Sutton', 'Tate', 'Taylor', 'Thornton', 'Torres', 'Tucker', 'Turner', 'Valdez', 'Vargas', 'Vasquez', 'Vaughn',
  'Wagner', 'Walker', 'Wallace', 'Walters', 'Ward', 'Warren', 'Watkins', 'Watson', 'Weaver', 'Webb', 'Wells', 'West', 'Wheeler', 'White', 'Wilkins', 'Williamson',
  'Willis', 'Wolfe', 'Wong', 'Wood', 'Woods', 'Wright', 'Yang', 'Young', 'Zamora', 'Zimmerman',
];

export const NAME_POOLS = { first: FIRST_NAMES, last: LAST_NAMES } as const;
