import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Generate from the finished build so even artwork never viewed online is cached.
export function offlinePlugin() {
  let output;
  return {
    name: 'scoundrel-offline',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      async function list(directory, prefix = '') {
        const entries = await readdir(directory, { withFileTypes: true });
        const files = await Promise.all(entries.map(entry => entry.isDirectory()
          ? list(join(directory, entry.name), prefix + entry.name + '/')
          : [prefix + entry.name]));
        return files.flat();
      }
      const files = (await list(output)).filter(file => file !== 'sw.js').sort();
      const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const file of files) {
        hash.update(file).update(await readFile(join(output, file)));
      }
      const worker = template
        .replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 20))
        .replace('__PRECACHE_FILES__', JSON.stringify(files));
      await writeFile(join(output, 'sw.js'), worker);
    },
  };
}
