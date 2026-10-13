// Consistent SQLite snapshot, including committed data still in WAL.
// Usage: node scripts/backup-db.mjs SOURCE.sqlite DESTINATION.sqlite
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [sourceArg, destinationArg] = process.argv.slice(2);
if (!sourceArg || !destinationArg) throw new Error('Uso: node scripts/backup-db.mjs ORIGEM.sqlite DESTINO.sqlite');
const source = resolve(sourceArg);
const destination = resolve(destinationArg);
if (!existsSync(source)) throw new Error('O banco de origem não existe.');
if (source === destination || existsSync(destination)) throw new Error('O destino deve ser um arquivo novo, diferente da origem.');
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  const snapshot = new DatabaseSync(destination, { readOnly: true });
  try {
    if (snapshot.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('A verificação da cópia falhou.');
  } finally { snapshot.close(); }
  console.log(`Backup consistente verificado: ${destination}`);
} finally { db.close(); }
