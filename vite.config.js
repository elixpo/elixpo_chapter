import { defineConfig } from 'vite';
import { resolve } from 'path';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';

const getHTMLEntryPoints = () => {
  const entries = {};
  const srcDir = resolve(__dirname, 'src');
  
  // Find all index.html files in src directories
  const htmlFiles = glob.sync('**/index.html', { cwd: srcDir });
  
  htmlFiles.forEach((file) => {
    const dir = path.dirname(file);
    const entryName = dir === '.' ? 'index' : dir.replace(/\//g, '-');
    entries[entryName] = resolve(srcDir, file);
  });
  
  // Also include root index.html
  const rootIndex = resolve(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    entries['index'] = rootIndex;
  }
  
  return entries;
};

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: false,
    middlewareMode: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: getHTMLEntryPoints(),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './JS'),
    },
  },
});
