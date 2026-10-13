import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'public', 'assets');
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['motion-entry.js'],
  outfile: join(output, 'motion.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'eof',
});
await copyFile(join(root, 'node_modules', 'motion', 'LICENSE.md'), join(output, 'motion-LICENSE.md'));
// The animate API also includes code from these packages. Keep each original
// copyright and license alongside the redistributed browser bundle.
const noticePackages = ['motion', 'framer-motion', 'motion-dom', 'motion-utils'];
const notices = await Promise.all(noticePackages.map(async (name) => {
  const packageRoot = join(root, 'node_modules', name);
  const { version } = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const license = await readFile(join(packageRoot, 'LICENSE.md'), 'utf8');
  return `${name} ${version}\n${'='.repeat(name.length + version.length + 1)}\n${license.trim()}\n`;
}));
await writeFile(join(output, 'THIRD-PARTY-LICENSES.txt'),
  `Licenses for the code redistributed in public/assets/motion.js.\nCopied from the installed packages; this file does not license the project.\n\n${notices.join('\n')}`, 'utf8');
console.log(`Motion local: public/assets/motion.js (${(await stat(join(output, 'motion.js'))).size} bytes)`);
