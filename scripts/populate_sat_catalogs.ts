import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import { decompressBzip2File } from './bzip2.js';

const CATALOGS_URL = 'https://github.com/phpcfdi/resources-sat-catalogs/releases/latest/download/catalogs.db.bz2';
const MAX_ALLOW_ROWS = 100;

function logInfo(message: string): void {
  console.log(`${styleText('cyan', 'info')} ${message}`);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

async function runAction(label: string, task: () => Promise<void>): Promise<void> {
  const startedAt = performance.now();
  try {
    await task();
    const duration = formatDuration(performance.now() - startedAt);
    console.log(`${styleText('green', 'DONE')} ${label} ${styleText('dim', `(${duration})`)}`);
  } catch (error) {
    const duration = formatDuration(performance.now() - startedAt);
    console.error(`${styleText('red', 'FAILED')} ${label} ${styleText('dim', `(${duration})`)}`);
    throw error;
  }
}

export function toSnakeCase(value: string): string {
  return value
    .replaceAll(/([\da-z])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replaceAll(/[^\da-z]+/gi, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toLowerCase();
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
    createWriteStream(outputPath),
  );
}

async function populateCatalogsDb(catalogsDbPath: string, jsonPath: string): Promise<void> {
  const db = new DatabaseSync(catalogsDbPath, { readOnly: true });
  try {
    const allTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    logInfo(`Found ${allTables.length} tables`);

    for (const table of allTables) {
      const quotedTable = `"${table.name.replaceAll('"', '""')}"`;
      const countSql = ['SELECT COUNT(*) AS count FROM', quotedTable].join(' ');
      const countResult = db.prepare(countSql).get() as { count: number };
      if (countResult.count > MAX_ALLOW_ROWS) {
        continue;
      }

      const jsonPathTable = path.join(jsonPath, `${toSnakeCase(table.name)}.json`);
      logInfo(`Populating table ${table.name}`);
      const selectSql = ['SELECT * FROM', quotedTable].join(' ');
      const tableRows = db.prepare(selectSql).all();
      await writeFile(jsonPathTable, `${JSON.stringify(tableRows, null, 2)}\n`);
    }
  } finally {
    db.close();
  }
}

export async function run(): Promise<void> {
  const rootPath = path.resolve(import.meta.dirname, '..');
  const jsonPath = path.join(rootPath, 'stubs', 'raw');
  const tmpPath = path.join(rootPath, 'tmp');
  const bz2Path = path.join(tmpPath, 'catalogs.db.bz2');
  const dbPath = path.join(tmpPath, 'catalogs.db');

  await rm(tmpPath, { force: true, recursive: true });
  await rm(jsonPath, { force: true, recursive: true });

  logInfo('Creating directory tmp');
  await mkdir(tmpPath, { recursive: true });
  logInfo('Creating directory json');
  await mkdir(jsonPath, { recursive: true });

  try {
    await runAction('Downloading catalogs.db.bz2', async () => {
      await downloadFile(CATALOGS_URL, bz2Path);
    });

    await runAction('Decompressing catalogs.db.bz2', async () => {
      await decompressBzip2File(bz2Path, dbPath);
    });

    await runAction('Populating catalogs.db', async () => {
      await populateCatalogsDb(dbPath, jsonPath);
    });
  } finally {
    await rm(tmpPath, { force: true, recursive: true });
  }
}

const isDirectExecution
  = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
