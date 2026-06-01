import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Same single source of truth as the asset build (tools/build.mjs): package.json.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  define: { __MODERNUI_VERSION__: JSON.stringify(version) },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup-localstorage.ts'],
    include: ['tests/unit-ts/**/*.test.ts'],
  },
});
