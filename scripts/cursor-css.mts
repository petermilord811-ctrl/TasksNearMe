// Writes src/ui/components/cursor/bubble-cursor.generated.css from cursor-art.ts and cursor-rules.ts.
//   npx tsx scripts/cursor-css.mts
// src/ui/components/cursor/cursor-art.test.ts fails while the file is out of date.
import { writeFileSync } from 'node:fs';
import { buildCursorCss } from '../src/ui/components/cursor/cursor-rules';

const target = new URL('../src/ui/components/cursor/bubble-cursor.generated.css', import.meta.url);
writeFileSync(target, buildCursorCss());
console.log(`wrote ${target.pathname}`);
