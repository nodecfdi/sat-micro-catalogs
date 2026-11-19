import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/helpers.ts', './src/types.ts'],
  outDir: './build',
  copy: './stubs/raw',
  clean: true,
  format: 'esm',
  fixedExtension: false,
  dts: true,
  target: 'node22.13',
});
