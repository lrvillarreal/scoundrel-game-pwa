// Copy the original binary artwork into Vite's public directory before dev/build.
// Pin the source commit and verify Git blob hashes; reuse valid cached files.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/lrvillarreal/scoundrel-game/8f46a06260ed9b71297cb2ed2abf997f0ddd0c5c/Assets/';
const output = new URL('../public/Assets/', import.meta.url);
const assets = [
  {
    "name": "club-1.jpg",
    "sha": "4fdd5b65b282e7a4141aea23b535e6afd859cad3"
  },
  {
    "name": "club-2.jpg",
    "sha": "61141977ae6045d73c9ce2cb9a5d27764ee0af3b"
  },
  {
    "name": "club-3.jpg",
    "sha": "5b71906c7b06298a62781758e3b3d6b3dcda8a1d"
  },
  {
    "name": "deck.jpg",
    "sha": "945e82154e6780ad94bf68ef44115295930ee217"
  },
  {
    "name": "diamond-1.jpg",
    "sha": "1710f1d4414583b3df03a852d68a648af99f8c1b"
  },
  {
    "name": "diamond-2.jpg",
    "sha": "16395f83e301d31a8becce69cbdf280e167689cd"
  },
  {
    "name": "diamond-3.jpg",
    "sha": "1bf6de5b9ae06e8ff83e543ba5e96c0d642aff7b"
  },
  {
    "name": "heart.jpg",
    "sha": "431977aef21c16173e31772ba03458432a972e88"
  },
  {
    "name": "spade-1.jpg",
    "sha": "ae5d138fcdb5032c274e02fbd78342da7237f298"
  },
  {
    "name": "spade-2.jpg",
    "sha": "02a47f7264dbe78566804aaac2166d2d106b5e8a"
  },
  {
    "name": "spade-3.jpg",
    "sha": "4a97ae3fb6075d22c679e7b972d2df5f9117a09d"
  }
];
const blobHash = bytes => createHash('sha1')
  .update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

await mkdir(output, { recursive: true });
await Promise.all(assets.map(async ({ name, sha }) => {
  const destination = new URL(name, output);
  try {
    if (blobHash(await readFile(destination)) === sha) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(source + name, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Artwork download failed: ' + name + ' (' + response.status + ')');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (blobHash(bytes) !== sha) throw new Error('Artwork integrity check failed: ' + name);
  const temporary = new URL(name + '.tmp', output);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  console.log('Prepared artwork: ' + name);
}));
