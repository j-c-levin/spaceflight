import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const swPath = fileURLToPath(new URL('../dist/sw.js', import.meta.url));
const buildId = Date.now().toString(36);
const source = readFileSync(swPath, 'utf8');

if (!source.includes('__BUILD_ID__')) {
  throw new Error('dist/sw.js is missing the __BUILD_ID__ placeholder — did public/sw.js change?');
}

writeFileSync(swPath, source.replace('__BUILD_ID__', buildId));
console.log(`stamped dist/sw.js with build id ${buildId}`);
