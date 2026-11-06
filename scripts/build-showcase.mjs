import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('showcase/', root);
const files = ['liquid-glass.js', 'glass-webgl.js', 'components.js'];
const sources = {
  original: { revision: '862e553fae1b97968af4206add31539534764919', directory: 'lib' },
  previous: { revision: '938df92e98d935c5fc61c3c7e0953a216bf831ce', directory: 'lib' },
  current: { revision: null, directory: 'lib' },
};

export function buildShowcase(outputDirectory = fileURLToPath(new URL('dist/', source))) {
  const destination = pathToFileURL(resolve(outputDirectory) + sep);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const file of ['index.html', 'styles.css', 'app.js', 'scene.html', 'scene.js', 'metrics.js', 'recorded-fps.json']) {
    copyFileSync(new URL(file, source), new URL(file, destination));
  }
  const builds = {};
  for (const [name, input] of Object.entries(sources)) {
    const directory = new URL(`builds/${name}/`, destination);
    mkdirSync(directory, { recursive: true });
    builds[name] = { ...input, sha256: {} };
    for (const file of files) {
      const contents = input.revision
        ? execFileSync('git', ['show', `${input.revision}:${input.directory}/${file}`], { cwd: fileURLToPath(root) })
        : readFileSync(new URL(`${input.directory}/${file}`, root));
      writeFileSync(new URL(file, directory), contents);
      builds[name].sha256[file] = createHash('sha256').update(contents).digest('hex');
    }
  }
  const manifest = { description: 'Original and previous are recovered from Git; current is built from lib/', builds };
  writeFileSync(new URL('builds/manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
  mkdirSync(new URL('media/', destination), { recursive: true });
  for (const [name, image] of Object.entries({ city: 'city-1200.jpg', beach: 'beach-1200.jpg', wave: 'wave.jpg', portrait: 'portrait-1200.jpg' })) {
    copyFileSync(new URL(`images/${image}`, root), new URL(`media/${name}.jpg`, destination));
  }
  copyFileSync(new URL('LICENSE', root), new URL('LICENSE', destination));
  return fileURLToPath(destination);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built standalone comparison site: ${buildShowcase()}`);
}
