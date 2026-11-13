#!/usr/bin/env node
/**
 * npm run push:keys — makes a VAPID key pair for Web Push (completion plan 3.5) and adds it to .env.local,
 * unless one is there already. The keys are not printed. Restart the dev server afterwards.
 * Production gets its own pair from the hosting provider's secrets, never this file.
 */
import { createECDH } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2] ?? '.env.local');
const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
if (/^WEB_PUSH_PRIVATE_KEY=.+/m.test(current)) {
  console.log(`Web push keys are already in ${path.basename(file)}.`);
  process.exit(0);
}
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const lines = [
  '',
  '# Web Push (VAPID), made by npm run push:keys',
  `WEB_PUSH_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`,
  `WEB_PUSH_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`,
  '',
];
fs.writeFileSync(file, current.replace(/\n*$/, '\n') + lines.join('\n'), { mode: 0o600 });
console.log(`Added a web push key pair to ${path.basename(file)}. Restart the dev server to use it.`);
