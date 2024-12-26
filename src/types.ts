export type SatCatalogItem<T extends { id: string; texto: string } = { id: string; texto: string }> = T & {
  etiqueta: string;
};
