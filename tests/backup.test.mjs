import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('backup includes committed WAL data, checks integrity and refuses overwrite', () => {
  const tempRoot = resolve(tmpdir());
  const dir = mkdtempSync(join(tempRoot, 'gastos-backup-test-'));
  const source = join(dir, 'source.sqlite');
  const destination = join(dir, 'snapshot.sqlite');
  const script = fileURLToPath(new URL('../scripts/backup-db.mjs', import.meta.url));
  const db = new DatabaseSync(source);
  try {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE example (value INTEGER); INSERT INTO example VALUES (10787)');
    execFileSync(process.execPath, [script, source, destination], { stdio: 'pipe' });
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.equal(copy.prepare('SELECT value FROM example').get().value, 10787);
      assert.equal(copy.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    } finally { copy.close(); }
    assert.throws(() => execFileSync(process.execPath, [script, source, destination], { stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, [script, source, source], { stdio: 'pipe' }));
    assert.equal(db.prepare('SELECT value FROM example').get().value, 10787);
  } finally {
    db.close();
    assert.ok(resolve(dir).startsWith(tempRoot + sep));
    rmSync(dir, { recursive: true, force: true });
  }
});
