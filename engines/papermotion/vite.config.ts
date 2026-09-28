import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5299 },
  // Bundled up front, so the first scene that loads three.js doesn't make the dev server reload the page mid-render.
  optimizeDeps: { include: ['three'] },
  test: { include: ['tests/**/*.test.ts'] },
});
