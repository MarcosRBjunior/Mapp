import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The web bundle must never carry the data source's host or key (CLAUDE.md: only the sync job talks to the source).
export const FORBIDDEN: readonly string[] = ['api-ninjas.com', 'API_NINJAS_KEY', 'X-Api-Key'];

export async function findForbidden(dir: string): Promise<{ file: string; text: string }[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
  const found: { file: string; text: string }[] = [];
  for (const file of files) {
    const content = (await readFile(path.join(dir, file), 'utf8')).toLowerCase();
    for (const text of FORBIDDEN) {
      if (content.includes(text.toLowerCase())) found.push({ file, text });
    }
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.resolve(process.argv[2] ?? 'dist');
  const found = await findForbidden(dir);
  if (found.length > 0) {
    for (const { file, text } of found) console.error(`${file}: contains "${text}"`);
    process.exit(1);
  }
  console.log(`Bundle check passed (${dir})`);
}
