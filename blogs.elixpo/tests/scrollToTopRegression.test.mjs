import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const globalButton = new URL('../src/components/ScrollToTopButton.jsx', import.meta.url);
const previewStyles = new URL('../src/styles/editor/preview.css', import.meta.url);
const previewComponent = new URL('../src/components/Editor/BlogPreview.jsx', import.meta.url);

test('story pages keep one back-to-top button', async () => {
  const [buttonSource, styles, previewSource] = await Promise.all([
    readFile(globalButton, 'utf8'),
    readFile(previewStyles, 'utf8'),
    readFile(previewComponent, 'utf8'),
  ]);

  assert.match(buttonSource, /className="global-scroll-to-top\b/);
  assert.match(previewSource, /className="preview-back-to-top"/);
  assert.match(
    styles,
    /body:has\(\.preview-back-to-top\)\s+\.global-scroll-to-top\s*\{\s*display:\s*none;/,
  );
});
