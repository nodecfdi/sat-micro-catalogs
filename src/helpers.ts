import { type SatCatalogItem } from './types.js';

export class SatCatalog<T extends { id: string; texto: string } = { id: string; texto: string }> extends Array<
  SatCatalogItem<T>
> {
  public findAndReturnEtiqueta(search: string): string {
    const item = this.find((raw) => raw.id === search);

    return item ? item.etiqueta : search;
  }

  public findAndReturnTexto(search: string): string {
    const item = this.find((raw) => raw.id === search);

    return item ? item.texto : search;
  }
}

export const wrapCatalog = <T extends { id: string; texto: string }>(source: T[]): SatCatalog<T> => {
  const catalog = new SatCatalog<T>();

  for (const item of source) {
    catalog.push({
      ...item,
      etiqueta: `${item.id} - ${item.texto}`,
    });
  }

  return catalog;
};
