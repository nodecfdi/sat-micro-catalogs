import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/catalogs/**', 'src/domains/**', 'src/index.ts'],
    },
    isolate: false,
  },
});
