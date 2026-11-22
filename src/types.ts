export type SatCatalogRecord = Record<string, string | number | boolean | null>;

export interface SatCatalogConfig<
  T extends SatCatalogRecord,
  K extends keyof T = keyof T,
  L extends keyof T = keyof T,
> {
  keyField?: K;
  textField?: L;
}

export interface SatCatalogOption<T extends SatCatalogRecord = SatCatalogRecord> {
  value: string;
  text: string;
  label: string;
  item: T;
}

export interface SatCatalogOptionsConfig<T extends SatCatalogRecord = SatCatalogRecord> {
  activeOn?: Date | string;
  separator?: string;
  filter?: (item: T) => boolean;
}
