import { describe, expect, test } from 'vitest';
import {
  cfdi40Estados,
  cfdi40Monedas,
  cfdi40Paises,
  cfdi40ReglasTasaCuota,
  cfdi40TiposFactores,
  cfdi40UsosCfdi,
} from '../../src/domains/cfdi-40.js';
import { hyp10ClavesHyp } from '../../src/domains/hyp-10.js';
import { nominaBancos, nominaTiposDeducciones } from '../../src/domains/nomina.js';
import { createCatalog } from '../../src/helpers.js';

describe('catalog helpers', () => {
  test('should create catalog with O(1) lookups and iteration', () => {
    const source = [
      { id: '1', texto: 'texto 1', vigencia_desde: '2022-01-01', vigencia_hasta: '' },
      { id: '2', texto: 'texto 2', vigencia_desde: '2022-01-01', vigencia_hasta: '2023-12-31' },
      { id: '3', texto: 'texto 3', vigencia_desde: '2030-01-01', vigencia_hasta: '' },
    ];
    const catalog = createCatalog(source);

    expect(catalog.size).toBe(3);
    expect(catalog.all()).toHaveLength(3);
    expect([...catalog]).toHaveLength(3);
    expect(catalog.has('1')).toBe(true);
    expect(catalog.has('99')).toBe(false);
    expect(catalog.get('1')).toEqual(source[0]);
    expect(catalog.get('99')).toBeUndefined();
    expect(catalog.text('1')).toBe('texto 1');
    expect(catalog.text('99')).toBe('99');
    expect(catalog.text('99', 'N/A')).toBe('N/A');
    expect(catalog.label('1')).toBe('1 - texto 1');
    expect(catalog.label('1', ': ')).toBe('1: texto 1');
    expect(catalog.label('99')).toBe('99');
    expect(catalog.label('99', ' - ', 'Desconocido')).toBe('Desconocido');
  });

  test('should filter active records and generate select options', () => {
    const source = [
      { id: 'A', texto: 'Activo', vigencia_desde: '2022-01-01', vigencia_hasta: '' },
      { id: 'B', texto: 'Vencido', vigencia_desde: '2022-01-01', vigencia_hasta: '2023-12-31' },
      { id: 'C', texto: 'Futuro', vigencia_desde: '2030-01-01', vigencia_hasta: '' },
    ];
    const catalog = createCatalog(source);

    expect(catalog.active('2024-06-15').map((item) => item.id)).toEqual(['A']);
    expect(catalog.active(new Date('2023-06-15T00:00:00Z')).map((item) => item.id)).toEqual(['A', 'B']);

    const options = catalog.options({
      activeOn: '2023-06-15',
      separator: ' | ',
      filter: (item) => item.id !== 'B',
    });

    expect(options).toEqual([
      {
        value: 'A',
        text: 'Activo',
        label: 'A | Activo',
        item: source[0],
      },
    ]);

    expect(catalog.filter((item) => item.id === 'C')).toEqual([source[2]]);
  });

  test('should work with generated CFDI 4.0 catalogs including monedas and paises', () => {
    expect(cfdi40UsosCfdi.label('G01')).toBe('G01 - Adquisición de mercancías.');
    expect(cfdi40UsosCfdi.text('G01')).toBe('Adquisición de mercancías.');
    expect(cfdi40UsosCfdi.text('PUE')).toBe('PUE');
    expect(cfdi40UsosCfdi.label('invalid')).toBe('invalid');

    expect(cfdi40Monedas.size).toBeGreaterThan(150);
    expect(cfdi40Monedas.text('MXN')).toBe('Peso Mexicano');
    expect(cfdi40Monedas.label('USD')).toBe('USD - Dólar americano');

    expect(cfdi40Paises.size).toBeGreaterThan(200);
    expect(cfdi40Paises.text('MEX')).toBe('México');
  });

  test('should include nomina bancos and tipos deducciones (> 100 rows)', () => {
    expect(nominaBancos.size).toBeGreaterThan(100);
    expect(nominaBancos.has('002')).toBe(true);
    expect(nominaTiposDeducciones.size).toBeGreaterThan(100);
    expect(nominaTiposDeducciones.has('001')).toBe(true);
  });

  test('should handle non-standard catalog schemas cleanly', () => {
    // estado + texto
    expect(cfdi40Estados.text('AGU')).toBe('Aguascalientes');
    expect(cfdi40Estados.label('AGU')).toBe('AGU - Aguascalientes');

    // id + descripcion
    expect(hyp10ClavesHyp.size).toBeGreaterThan(0);
    const firstHyp = hyp10ClavesHyp.all()[0];
    expect(hyp10ClavesHyp.text(firstHyp.id)).toBe(firstHyp.descripcion);

    // id only
    expect(cfdi40TiposFactores.text('Tasa')).toBe('Tasa');
    expect(cfdi40TiposFactores.label('Tasa')).toBe('Tasa');
    expect(cfdi40TiposFactores.options()[0]?.label).toBe(cfdi40TiposFactores.all()[0]?.id);

    // non key-value rules table
    expect(Array.isArray(cfdi40ReglasTasaCuota)).toBe(true);
    expect(cfdi40ReglasTasaCuota.length).toBeGreaterThan(0);
  });
});
