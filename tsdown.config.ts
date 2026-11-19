import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/helpers.ts', './src/types.ts'],
  clean: true,
  format: 'esm',
  unbundle: true,
  minify: 'dce-only',
  fixedExtension: false,
  dts: true,
  platform: 'neutral',
  target: 'esnext',
  exports: true,
});
