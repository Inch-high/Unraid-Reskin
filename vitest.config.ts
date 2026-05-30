import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup-localstorage.ts'],
    include: ['tests/unit-ts/**/*.test.ts'],
  },
});
