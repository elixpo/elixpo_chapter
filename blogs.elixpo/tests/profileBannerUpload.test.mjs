import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profilePage = new URL('../src/views/ProfilePage.jsx', import.meta.url);
const cropModal = new URL('../src/components/ImageCropModal.jsx', import.meta.url);
const baseStyles = new URL('../src/styles/editor/base.css', import.meta.url);

test('profile banner uploads expose shared progress and reduced-motion hooks', async () => {
  const [profileSource, modalSource, styles] = await Promise.all([
    readFile(profilePage, 'utf8'),
    readFile(cropModal, 'utf8'),
    readFile(baseStyles, 'utf8'),
  ]);

  assert.match(profileSource, /bannerUploading/);
  assert.match(profileSource, /cover-banner-enter/);
  assert.match(profileSource, /onSavingChange=\{setBannerUploading\}/);
  assert.match(profileSource, /disabled=\{bannerUploading\}/);
  assert.match(modalSource, /onSavingChange\?\.\(true\)/);
  assert.match(modalSource, /await onSave\(blob\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cover-banner-enter/);
});
