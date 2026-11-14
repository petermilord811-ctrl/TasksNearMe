import type { CategorySlug } from '@/contracts';

/**
 * Reads what someone typed ("assemble an IKEA desk", "I have a truck", "Tengo una camioneta") and says which kind of
 * help it sounds like, with a suggested title. English and Spanish. Plain word matching, instant and free, for the landing page's assistant and
 * the map's search; the posting wizard's "Help me describe this" does the deeper drafting. Nothing here
 * decides a price or posts anything.
 */

interface Signals {
  /** Words that nearly settle it (3 points each). */
  strong: string[];
  /** Words that lean toward it (1 point each). */
  weak: string[];
}

const SIGNALS: Record<CategorySlug, Signals> = {
  'furniture-assembly': {
    strong: ['assemble', 'assembling', 'assembly', 'ikea', 'flat pack', 'flat-pack', 'flatpack', 'put together', 'mount', 'mounting', 'wall mount', 'hang', 'hanging', 'armar', 'armado', 'ensamblar', 'ensamblado', 'montar', 'colgar', 'arme', 'armen', 'armarlo', 'armarla', 'armarlos', 'armando', 'atornillar'],
    weak: ['desk', 'bed frame', 'bookshelf', 'bookcase', 'shelf', 'shelves', 'wardrobe', 'dresser', 'table', 'chair', 'chairs', 'crib', 'cabinet', 'furniture', 'anchor', 'anti-tip', 'mirror', 'curtains', 'blinds', 'pictures', 'frames', 'build', 'drill', 'escritorio', 'cama', 'librero', 'estante', 'estantes', 'repisa', 'repisas', 'ropero', 'armario', 'comoda', 'mesa', 'silla', 'sillas', 'cuna', 'gabinete', 'mueble', 'muebles', 'espejo', 'cortina', 'cortinas', 'buro', 'closet', 'cajonera', 'litera', 'base de cama', 'tocador'],
  },
  'moving-help': {
    strong: ['move', 'moving', 'movers', 'truck', 'u-haul', 'uhaul', 'load', 'loading', 'unload', 'unloading', 'haul', 'carry', 'lift', 'heavy lifting', 'mudanza', 'mudar', 'mudarme', 'mudarnos', 'camioneta', 'troca', 'camion', 'cargar', 'acarrear', 'traila', 'mudamos', 'mudo', 'mudando', 'mudanzas'],
    weak: ['boxes', 'couch', 'sofa', 'washer', 'dryer', 'upstairs', 'downstairs', 'storage unit', 'pack', 'packing', 'piano', 'mattress', 'rearrange', 'strong', 'heavy', 'cajas', 'sofa', 'lavadora', 'secadora', 'arriba', 'abajo', 'bodega', 'empacar', 'colchon', 'pesado', 'pesada', 'pesados', 'fuerte', 'levantar', 'descargar', 'sillon', 'subir', 'bajar', 'almacen', 'storage'],
  },
  'yard-cleanup': {
    strong: ['yard', 'garden', 'gardening', 'lawn', 'leaves', 'rake', 'raking', 'weeds', 'weeding', 'mow', 'mowing', 'prune', 'pruning', 'hedge', 'hedges', 'mulch', 'jardin', 'jardineria', 'cesped', 'pasto', 'hojas', 'rastrillar', 'maleza', 'malezas', 'deshierbar', 'podar', 'poda', 'setos', 'mantillo', 'yarda', 'zacate', 'desyerbar', 'mala hierba', 'podadora', 'jardinero', 'cortar el pasto', 'cortar el zacate'],
    weak: ['trim', 'trimming', 'bushes', 'branches', 'shrubs', 'flower bed', 'flowerbed', 'plants', 'planting', 'backyard', 'front yard', 'debris', 'gutters', 'grass', 'patio', 'outdoor', 'outside', 'recortar', 'arbustos', 'ramas', 'plantas', 'plantar', 'flores', 'escombros', 'canaletas', 'afuera', 'exterior', 'hierba'],
  },
  'light-cleaning': {
    strong: ['clean', 'cleaning', 'cleaner', 'tidy', 'tidying', 'declutter', 'decluttering', 'dust', 'dusting', 'vacuum', 'vacuuming', 'mop', 'mopping', 'scrub', 'limpiar', 'limpieza', 'ordenar', 'aspirar', 'trapear', 'tallar', 'sacudir', 'polvo', 'limpie', 'limpien', 'limpiando', 'barrer'],
    weak: ['kitchen', 'bathroom', 'laundry', 'fold', 'dishes', 'oven', 'fridge', 'windows', 'organize', 'organise', 'organizing', 'move-out', 'guests', 'floors', 'spotless', 'mess', 'cocina', 'bano', 'ropa', 'doblar', 'platos', 'horno', 'refrigerador', 'nevera', 'ventanas', 'organizar', 'pisos', 'desorden', 'visitas', 'refri', 'trastes', 'lavar', 'planchar', 'mugre', 'sucio', 'sucia'],
  },
  'computer-help': {
    strong: ['computer', 'laptop', 'pc', 'mac', 'macbook', 'wifi', 'wi-fi', 'router', 'printer', 'iphone', 'android', 'tablet', 'ipad', 'smartphone', 'email', 'software', 'virus', 'password', 'backup', 'smart tv', 'internet', 'tech', 'techie', 'computadora', 'computadoras', 'compu', 'computacion', 'impresora', 'celular', 'tableta', 'correo', 'contrasena', 'tecnologia', 'whatsapp', 'facebook', 'correo electronico', 'tele inteligente'],
    weak: ['phone', 'set up', 'setup', 'install', 'update', 'slow', 'connect', 'account', 'zoom', 'photos', 'files', 'device', 'devices', 'apps', 'app', 'screen', 'online', 'computers', 'telefono', 'configurar', 'instalar', 'actualizar', 'lento', 'lenta', 'conectar', 'cuenta', 'fotos', 'archivos', 'dispositivo', 'dispositivos', 'aplicacion', 'aplicaciones', 'pantalla', 'en linea', 'mensajes'],
  },
};

const CATEGORIES = Object.keys(SIGNALS) as CategorySlug[];

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PATTERNS = Object.fromEntries(
  CATEGORIES.map((category) => [
    category,
    {
      strong: SIGNALS[category].strong.map((word) => new RegExp(`(?:^|[^a-z])${escape(word)}(?:[^a-z]|$)`)),
      weak: SIGNALS[category].weak.map((word) => new RegExp(`(?:^|[^a-z])${escape(word)}(?:[^a-z]|$)`)),
    },
  ]),
) as Record<CategorySlug, { strong: RegExp[]; weak: RegExp[] }>;

/**
 * Work the platform doesn't offer (blueprint 01): TV mounting comes later, with its own safety rules, and anything
 * electrical, gas or plumbing needs a licensed trade. Matched before the categories, so "mount my TV" isn't read
 * as furniture assembly.
 */
const NOT_OFFERED: { reason: 'tv-mounting' | 'licensed-trade'; patterns: RegExp[] }[] = [
  {
    reason: 'tv-mounting',
    patterns: [
      // "mount my 55 inch TV", "hang a TV" (the TV is what's put up; not "shelves above the TV", not "apps on my TV").
      /(?:^|[^a-z])(?:mount|mounting|hang|hanging|put up)\s+(?:(?:a|my|the|our|your|this|two|2)\s+)?(?:\d+\s*(?:inch|in|")\s*)?(?:(?:new|smart|flat|flat-screen|big|large)\s+)?(?:tv|television)s?\b/,
      /\b(?:tv|television)\s*(?:mount|mounting|bracket|on the wall|to the wall|on a wall|onto the wall)/,
      // Spanish: "colgar mi tele", "montar la television", "la pantalla en la pared" (not "instalar la tele inteligente":
      // setting one up is computer help).
      /(?:^|[^a-z])(?:montar|colgar)\s+(?:(?:la|una|mi|el|un|nuestra)\s+)?(?:tele|television|tv|pantalla)s?\b/,
      /\b(?:tele|television|tv|pantalla)\s+(?:en|a)\s+la\s+pared/,
    ],
  },
  {
    reason: 'licensed-trade',
    patterns: [
      /\b(?:electrical|electrician|rewire|rewiring|wiring|outlet|outlets|light switch|light fixture|ceiling fan|breaker|circuit|panel upgrade)\b/,
      /\b(?:plumber|plumbing|leak|leaking|leaky|faucet|toilet|pipe|pipes|water heater|garbage disposal|drain|clogged)\b/,
      /\b(?:gas line|gas stove|gas dryer|gas leak)\b/,
      // Spanish: electricians, plumbers and gas.
      /\b(?:electricista|instalacion electrica|cableado|enchufe|enchufes|apagador|apagadores|lampara de techo|ventilador de techo|breaker|circuito)\b/,
      /\b(?:plomero|plomeria|fuga|gotea|goteando|tuberia|tuberias|inodoro|excusado|calentador de agua|boiler|drenaje|tapado|tapada|lavabo|fregadero|regadera|destapar)\b/,
      // An outlet is "contacto" in Texas Spanish, which also means a contact: only where it's clearly the outlet.
      /\b(?:contactos? electricos?|(?:cambiar|instalar|arreglar|poner|reparar)\s+(?:(?:un|el|los|unos|mas|otro)\s+)?contactos?)\b/,
      /\b(?:linea de gas|estufa de gas|secadora de gas|fuga de gas)\b/,
    ],
  },
];

export interface TaskIntent {
  /** The best match, or null when nothing in the text points anywhere (or it's work the platform doesn't offer). */
  category: CategorySlug | null;
  /** Work the platform doesn't offer: TV mounting (later), or a licensed trade. */
  notOffered?: 'tv-mounting' | 'licensed-trade';
  /** How clearly the text points there (0–1). */
  confidence: number;
  /** Every category the text points to, best first. */
  matches: { category: CategorySlug; score: number }[];
  /** A short title from the text ("I need help to assemble a desk" → "Assemble a desk"). */
  title: string;
}

/** Leading phrases that aren't part of the task itself. */
const PREAMBLE = /^(?:(?:hi|hello|hey)[,!.]?\s+)?(?:(?:i|we)\s+(?:need|want|would like|'d like)\s+(?:some\s+)?(?:help|someone|a helper|a hand)?\s*(?:to|with|for)?\s+|(?:can|could)\s+(?:someone|anyone|you)\s+(?:help\s+(?:me\s+)?(?:to\s+|with\s+)?)?|help\s+(?:me\s+)?(?:to\s+|with\s+)?|looking\s+for\s+(?:someone\s+to\s+|help\s+(?:with|to)\s+)?|please\s+)/i;

/** A short title from what someone typed. */
export function suggestTitle(text: string, max = 80): string {
  let title = text.replace(/\s+/g, ' ').trim();
  for (let pass = 0; pass < 2; pass += 1) title = title.replace(PREAMBLE, '');
  title = title.replace(/^(?:to|with|for)\s+/i, '').replace(/[.!?,;:\s]+$/, '').replace(/\s+please$/i, '');
  if (!title) return '';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length <= max) return title;
  const cut = title.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Which kind of help a short request sounds like. */
export function readTaskIntent(text: string): TaskIntent {
  // Lower case, straight apostrophes and no accents, so Spanish matches however it's typed ("jardín", "jardin").
  const lower = ` ${text.toLowerCase().replace(/[’']/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '')} `;
  const title = suggestTitle(text);
  if (lower.trim().length < 3) return { category: null, confidence: 0, matches: [], title };
  const notOffered = NOT_OFFERED.find((rule) => rule.patterns.some((re) => re.test(lower)))?.reason;
  if (notOffered) return { category: null, confidence: 0, matches: [], title, notOffered };
  const matches = CATEGORIES.map((category) => {
    const pattern = PATTERNS[category];
    const score = pattern.strong.filter((re) => re.test(lower)).length * 3 + pattern.weak.filter((re) => re.test(lower)).length;
    return { category, score };
  })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best) return { category: null, confidence: 0, matches, title };
  const total = matches.reduce((sum, match) => sum + match.score, 0);
  // Clear when one category leads and has a strong word; weaker when it's a single weak word or a tie.
  const confidence = Math.min(1, (best.score / total) * Math.min(1, best.score / 3));
  return { category: best.category, confidence, matches, title };
}
