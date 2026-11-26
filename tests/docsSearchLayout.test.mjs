import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layoutFile = new URL('../app/docs/layout.jsx', import.meta.url);
const searchFile = new URL('../src/components/docs/DocsSearch.jsx', import.meta.url);

test('docs search is the full-width control above the docs layout', async () => {
  const [layout, search] = await Promise.all([
    readFile(layoutFile, 'utf8'),
    readFile(searchFile, 'utf8'),
  ]);

  assert.match(layout, /<DocsSearch \/>[\s\S]*Back to LixBlogs/);
  assert.match(search, /className="flex w-full items-center justify-between/);
  assert.match(search, /Search documentation pages and sections\.\.\./);
  assert.match(search, /onKeyDown/);
  assert.match(search, /metaKey \|\| e\.ctrlKey/);
});
