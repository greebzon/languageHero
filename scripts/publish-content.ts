import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publishRelease } from '../apps/api/src/content';

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: pnpm content:publish content/release.json');
  const release = await publishRelease(JSON.parse(await readFile(resolve(source), 'utf8')));
  console.log(
    `Published catalog ${release.catalog.revision}: ${release.lessons.length} lessons. Refresh the catalog in the app.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
