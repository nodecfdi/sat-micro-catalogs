import eienjs from '@eienjs/eslint-config';

export default eienjs({
  ignores: ['src/catalogs/**', 'src/domains/**', 'src/index.ts'],
  markdown: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
    erasableSyntaxOnly: {
      parameterProperties: false,
    },
  },
});
