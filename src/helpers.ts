import type {
  SatCatalogConfig,
  SatCatalogOption,
  SatCatalogOptionsConfig,
  SatCatalogRecord,
} from './types.js';

function toIsoDate(date: Date | string): string {
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }

  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isRecordActiveOn(item: SatCatalogRecord, isoDate: string): boolean {
  const from = item.vigencia_desde;
  if (typeof from === 'string' && from.length > 0 && isoDate < from) {
    return false;
  }

  const until = item.vigencia_hasta;

  return !(typeof until === 'string' && until.length > 0 && isoDate > until);
}

export class SatCatalog<T extends SatCatalogRecord = SatCatalogRecord> implements Iterable<T> {
  public readonly items: readonly T[];

  private readonly keyField: keyof T;

  private readonly textField: keyof T;

  private index: Map<string, T> | undefined;

  public constructor(items: readonly T[], config: SatCatalogConfig<T> = {}) {
    this.items = items;
    this.keyField = config.keyField ?? 'id';
    this.textField = config.textField ?? 'texto';
  }

  public get size(): number {
    return this.items.length;
  }

  public [Symbol.iterator](): IterableIterator<T> {
    return this.items[Symbol.iterator]();
  }

  public all(): readonly T[] {
    return this.items;
  }

  public has(key: string): boolean {
    return this.getIndex().has(key);
  }

  public get(key: string): T | undefined {
    return this.getIndex().get(key);
  }

  public text(key: string, fallback: string = key): string {
    const item = this.get(key);
    if (!item) {
      return fallback;
    }

    return String(item[this.textField] ?? fallback);
  }

  public label(key: string, separator = ' - ', fallback: string = key): string {
    const item = this.get(key);
    if (!item) {
      return fallback;
    }

    if (this.keyField === this.textField) {
      return String(item[this.keyField] ?? fallback);
    }

    return `${String(item[this.keyField])}${separator}${String(item[this.textField])}`;
  }

  public filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter((item) => predicate(item));
  }

  public active(date: Date | string = new Date()): T[] {
    const isoDate = toIsoDate(date);

    return this.items.filter((item) => isRecordActiveOn(item, isoDate));
  }

  public options(config: SatCatalogOptionsConfig<T> = {}): SatCatalogOption<T>[] {
    const { activeOn, separator = ' - ', filter } = config;
    const isoDate = activeOn === undefined ? undefined : toIsoDate(activeOn);
    const result: SatCatalogOption<T>[] = [];

    for (const item of this.items) {
      if (isoDate !== undefined && !isRecordActiveOn(item, isoDate)) {
        continue;
      }

      if (filter && !filter(item)) {
        continue;
      }

      const value = String(item[this.keyField] ?? '');
      const text = String(item[this.textField] ?? value);
      const label = this.keyField === this.textField ? value : `${value}${separator}${text}`;

      result.push({
        value,
        text,
        label,
        item,
      });
    }

    return result;
  }

  private getIndex(): Map<string, T> {
    if (!this.index) {
      const map = new Map<string, T>();
      for (const item of this.items) {
        const key = String(item[this.keyField] ?? '');
        if (!map.has(key)) {
          map.set(key, item);
        }
      }

      this.index = map;
    }

    return this.index;
  }
}

export function createCatalog<T extends SatCatalogRecord>(
  items: readonly T[],
  config?: SatCatalogConfig<T>,
): SatCatalog<T> {
  return new SatCatalog<T>(items, config);
}
