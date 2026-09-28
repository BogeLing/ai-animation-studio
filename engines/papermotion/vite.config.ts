import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5299 },
  // examples/local/ is usually a link to a private repository's films: keep its files at the linked path, so
  // their imports of the engine resolve from here and Vite transforms them like the scenes in this repo.
  resolve: { preserveSymlinks: true },
  // Bundled up front, so the first scene that loads three.js doesn't make the dev server reload the page mid-render.
  optimizeDeps: { include: ['three'] },
  test: { include: ['tests/**/*.test.ts'] },
});
