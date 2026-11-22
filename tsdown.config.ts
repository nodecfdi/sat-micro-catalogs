import { defineConfig } from 'tsdown';

const iifeBundles = [
  { name: 'all', entry: './src/index.ts', globalName: 'ncCatalog' },
  { name: 'cfdi-40', entry: './src/domains/cfdi-40.ts', globalName: 'ncCatalogCfdi40' },
  { name: 'nomina', entry: './src/domains/nomina.ts', globalName: 'ncCatalogNomina' },
  { name: 'ccp-31', entry: './src/domains/ccp-31.ts', globalName: 'ncCatalogCcp31' },
  { name: 'ret-20', entry: './src/domains/ret-20.ts', globalName: 'ncCatalogRet20' },
  { name: 'cce-20', entry: './src/domains/cce-20.ts', globalName: 'ncCatalogCce20' },
  { name: 'pagos', entry: './src/domains/pagos.ts', globalName: 'ncCatalogPagos' },
  { name: 'hyp-10', entry: './src/domains/hyp-10.ts', globalName: 'ncCatalogHyp10' },
];

export default defineConfig([
  {
    entry: [
      './src/index.ts',
      './src/helpers.ts',
      './src/types.ts',
      './src/domains/*.ts',
      './src/catalogs/*.ts',
    ],
    clean: true,
    format: 'esm',
    unbundle: true,
    minify: 'dce-only',
    fixedExtension: false,
    dts: true,
    platform: 'neutral',
    target: 'esnext',
    exports: {
      exclude: ['catalogs/**'],
      customExports(exports) {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(exports)) {
          if (key === './package.json') {
            continue;
          }

          const normalizedKey = key.startsWith('./domains/')
            ? `./${key.slice('./domains/'.length)}`
            : key;
          result[normalizedKey] = value;
        }

        result['./catalogs/*'] = {
          types: './dist/catalogs/*.d.ts',
          default: './dist/catalogs/*.js',
        };
        result['./iife/*'] = './dist/iife/*.iife.js';
        result['./package.json'] = './package.json';

        return result;
      },
    },
  },
  ...iifeBundles.map(({ name, entry, globalName }) => ({
    entry: { [name]: entry },
    outDir: 'dist/iife',
    clean: false,
    format: 'iife' as const,
    globalName,
    minify: true,
    fixedExtension: false,
    dts: false,
    platform: 'browser' as const,
    target: 'es2020',
  })),
]);
