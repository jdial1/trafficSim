import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src', 'generatedVersion.ts');

const now = new Date();
const yy = String(now.getFullYear()).slice(-2);
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const ssss =
  String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
const version = `${yy}.${mm}.${dd}.${ssss}`;

writeFileSync(
  outPath,
  `export const APP_BUILD_VERSION = ${JSON.stringify(version)};\n`,
  'utf8',
);
