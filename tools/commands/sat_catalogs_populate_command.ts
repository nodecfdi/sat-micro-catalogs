import { exec } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { BaseCommand } from '@adonisjs/ace';
import { getDirname } from '@poppinss/utils';
import string from '@poppinss/utils/string';
// eslint-disable-next-line import-x/no-named-as-default
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { deleteAsync } from 'del';

const execAsync = promisify(exec);

export default class SatCatalogsPopulateCommand extends BaseCommand {
  public static readonly commandName = 'sat-catalogs:populate';

  public static readonly description = 'Download and populate Sat Catalogs';

  public async run(): Promise<void> {
    const { jsonPath, tmpPath, clean } = this.getPathsAndCleanFn();
    await clean(tmpPath);
    await clean(jsonPath);
    this.logger.info('Creating directory tmp');
    await mkdir(tmpPath);
    this.logger.info('Creating directory json');
    await mkdir(jsonPath);

    // Start process downloading
    const actionDownload = this.logger.action('Downloading catalogs.db.bz2');
    try {
      await this.downloadFile(
        'https://github.com/phpcfdi/resources-sat-catalogs/releases/latest/download/catalogs.db.bz2',
        path.join(tmpPath, 'catalogs.db.bz2'),
      );
      actionDownload.displayDuration().succeeded();
    } catch (error) {
      await clean(tmpPath);
      actionDownload.failed(error as Error);

      return;
    }

    // Decompress file bz2
    const actionDecompress = this.logger.action('Decompressing catalogs.db.bz2');
    try {
      await this.decompressFile(path.join(tmpPath, 'catalogs.db.bz2'));
      actionDecompress.displayDuration().succeeded();
    } catch (error) {
      await clean(tmpPath);
      actionDecompress.failed(error as Error);

      return;
    }

    // Start process populating
    const actionPopulate = this.logger.action('Populating catalogs.db');
    try {
      await this.populateCatalogsDb(path.join(tmpPath, 'catalogs.db'), jsonPath);
      actionPopulate.displayDuration().succeeded();
    } catch (error) {
      await clean(tmpPath);
      actionPopulate.failed(error as Error);

      return;
    }

    const applyPrettier = this.logger.action('Apply formatter using prettier');
    await execAsync(`pnpm prettier --write ${jsonPath}`);
    applyPrettier.displayDuration().succeeded();

    await clean(tmpPath);
  }

  private async populateCatalogsDb(catalogsDbPath: string, jsonPath: string): Promise<void> {
    const maxAllowRows = 100;
    const db = new Database(catalogsDbPath);
    db.pragma('journal_mode = WAL');
    const allTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];
    this.logger.info(`Found ${allTables.length} tables`);
    for (const table of allTables) {
      const countResult = db.prepare(`SELECT COUNT(*) count FROM ${table.name}`).get() as { count: number };
      if (countResult.count <= maxAllowRows) {
        const jsonPathTable = path.join(jsonPath, `${string.snakeCase(table.name)}.json`);
        this.logger.info(`Populating table ${table.name}`);
        await this.populateTable(db, table.name, jsonPathTable);
      }
    }

    db.close();
  }

  private async populateTable(db: DatabaseType, tableName: string, jsonPathTable: string): Promise<void> {
    const tableRows = db.prepare(`SELECT * FROM ${tableName}`).all();
    const jsonData = JSON.stringify(tableRows);
    await writeFile(jsonPathTable, jsonData);
  }

  private async decompressFile(inputPath: string): Promise<void> {
    await execAsync(`bunzip2 ${inputPath}`);
  }

  private async downloadFile(url: string, outputPath: string): Promise<void> {
    const responseRaw = await fetch(url);
    const rawBuffer = await responseRaw.arrayBuffer();
    await writeFile(outputPath, Buffer.from(rawBuffer));
  }

  private getPathsAndCleanFn(): {
    rootPath: string;
    srcPath: string;
    jsonPath: string;
    tmpPath: string;
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    clean: (targetPath: string) => Promise<void>;
  } {
    const rootPath = path.join(getDirname(import.meta.url), '..', '..');
    const srcPath = path.join(rootPath, 'src');
    const jsonPath = path.join(srcPath, 'raw');
    const tmpPath = path.join(rootPath, 'tmp');

    const clean = async (targetPath: string) => {
      await deleteAsync(targetPath);
    };

    return { rootPath, srcPath, jsonPath, tmpPath, clean };
  }
}
