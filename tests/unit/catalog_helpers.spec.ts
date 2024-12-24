import { wrapCatalog } from '../../src/helpers.js';
import cfdi40UsosCfdi from '../../stubs/raw/cfdi_40_usos_cfdi.json' assert { type: 'json' };

describe('catalog helpers', () => {
  test('should wrap catalog', () => {
    const source = [
      {
        id: '1',
        texto: 'texto 1',
      },
      {
        id: '2',
        texto: 'texto 2',
      },
    ];
    const catalog = wrapCatalog(source);

    expect(catalog[0]).toHaveProperty('etiqueta', '1 - texto 1');
    expect(catalog[1]).toHaveProperty('etiqueta', '2 - texto 2');
  });

  test('should wrap catalog with json raw data', () => {
    const catalog = wrapCatalog(cfdi40UsosCfdi);

    expect(catalog[0]).toHaveProperty('etiqueta', 'G01 - Adquisición de mercancías.');
  });

  test('get key value using valid data', () => {
    const catalog = wrapCatalog(cfdi40UsosCfdi);

    expect(catalog.findAndReturnEtiqueta('G01')).toBe('G01 - Adquisición de mercancías.');
    expect(catalog.findAndReturnEtiqueta('G02')).toBe('G02 - Devoluciones, descuentos o bonificaciones.');
    expect(catalog.findAndReturnEtiqueta('G03')).toBe('G03 - Gastos en general.');
    expect(catalog.findAndReturnEtiqueta('I01')).toBe('I01 - Construcciones.');
  });

  test('get value using valid id catalog', () => {
    const catalog = wrapCatalog(cfdi40UsosCfdi);

    expect(catalog.findAndReturnTexto('G01')).toBe('Adquisición de mercancías.');
  });

  test('get key value using invalid data', () => {
    const catalog = wrapCatalog(cfdi40UsosCfdi);

    expect(catalog.findAndReturnEtiqueta('invalid')).toBe('invalid');
  });

  test('get value using invalid id catalog', () => {
    const catalog = wrapCatalog(cfdi40UsosCfdi);

    expect(catalog.findAndReturnTexto('PUE')).toBe('PUE');
  });
});
