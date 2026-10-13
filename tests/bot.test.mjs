import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  openDb, parseMoney, parseEntry, parseExpense, parseMonthlyValue, processText,
  setMonthlyValue, validMonth, resolveActor, dateFor,
} from '../bot.mjs';

// Synthetic JIDs exercise WhatsApp identifier normalization without real phones.
// The all-zero prefix is deliberately unsuitable as an international number.
const personA = { id: 'test-a', name: 'Pessoa A', aliases: ['000000000001@s.whatsapp.net'], isSelf: true };
const personB = { id: 'test-b', name: 'Pessoa B', aliases: ['000000000002@s.whatsapp.net', '222@lid'] };
const instant = new Date('2026-10-12T15:00:00Z');
const baseEvent = { groupId: 'test@g.us', person: personA, instant };

function fixture(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let serial = 0;
  return {
    db,
    send: (text, options = {}) => processText(db, { ...baseEvent, messageId: `test-${++serial}`, text, ...options }),
  };
}

test('dinheiro brasileiro usa centavos, preserva zero e rejeita valores inválidos', () => {
  for (const [value, cents] of [['107,87', 10787], ['1.234,56', 123456], ['1.234', 123400], ['12.5', 1250], ['R$ 15,09', 1509], ['10.000.000.000,00', 1_000_000_000_000]]) {
    assert.equal(parseMoney(value), cents, value);
  }
  assert.equal(parseMoney('0'), null);
  assert.equal(parseMoney('0', { allowZero: true }), 0);
  assert.equal(parseMoney('0,00', { allowZero: true }), 0);
  for (const value of ['', '-1', '+1', '1,234', '1.23,45', '1e3', 'NaN', 'Infinity', '1,2,3', '10.000.000.000,01', '1\n2', 10]) {
    assert.equal(parseMoney(value, { allowZero: true }), null, String(value));
  }
});

test('reserva é aporte e os comandos antigos continuam reconhecidos', () => {
  assert.deepEqual(parseEntry('reserva 200'), { description: 'Reserva', cents: 20000, kind: 'investment' });
  assert.deepEqual(parseEntry('reserva emergência 150,50'), { description: 'Reserva emergência', cents: 15050, kind: 'investment' });
  assert.deepEqual(parseEntry('RESERVA R$ 200'), { description: 'Reserva', cents: 20000, kind: 'investment' });
  assert.deepEqual(parseEntry('investimento CDB 200'), { description: 'CDB', cents: 20000, kind: 'investment' });
  assert.deepEqual(parseEntry('aporte 150'), { description: 'Investimento', cents: 15000, kind: 'investment' });
  assert.deepEqual(parseExpense('mercado 107,87'), { description: 'mercado', cents: 10787 });
  assert.equal(parseEntry('farmácia 40').kind, 'expense');
  assert.equal(parseEntry('cartão 850,90'), null);
  assert.equal(parseEntry('salário 3000'), null);
});

test('mês explícito validado e mês padrão respeita São Paulo na virada do UTC', () => {
  const boundary = new Date('2026-11-01T01:30:00Z');
  assert.equal(dateFor(boundary), '2026-10-31');
  assert.deepEqual(parseMonthlyValue('cartão 850,90', boundary), { kind: 'card', month: '2026-10', cents: 85090 });
  assert.deepEqual(parseMonthlyValue('salário 2026-11 R$ 3.000,00', boundary), { kind: 'salary', month: '2026-11', cents: 300000 });
  assert.deepEqual(parseMonthlyValue('salario 0', boundary), { kind: 'salary', month: '2026-10', cents: 0 });
  for (const month of ['2026-00', '2026-13', '2026-1', '0000-01', '2026-10 extra']) assert.equal(validMonth(month), false);
  assert.equal(validMonth('2026-10'), true);
});

test('reserva preserva pessoa, data e deduplicação sem virar gasto', (t) => {
  const { db, send } = fixture(t);
  const boundary = new Date('2026-11-01T01:00:00Z');
  assert.match(send('reserva emergência 150,50', { messageId: 'reserve-1', instant: boundary }), /Aporte registrado por Pessoa A/u);
  assert.equal(send('reserva emergência 150,50', { messageId: 'reserve-1', instant: boundary }), null);
  assert.deepEqual({ ...db.prepare('SELECT actor_id, spent_date, amount_cents, kind FROM expenses').get() }, {
    actor_id: personA.id, spent_date: '2026-10-31', amount_cents: 15050, kind: 'investment',
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 1);
});

test('cartão e salário atualizam sem acumular e duplicata antiga não sobrescreve atualização', (t) => {
  const { db, send } = fixture(t);
  assert.match(send('cartao 850,90', { messageId: 'card-1' }), /Fatura cadastrada para Pessoa A:\nMês: 2026-10\nValor: R\$\s850,90/u);
  assert.match(send('cartão 900', { messageId: 'card-2' }), /Fatura atualizada/u);
  assert.equal(send('cartao 850,90', { messageId: 'card-1' }), null);
  assert.equal(db.prepare("SELECT amount_cents FROM monthly_values WHERE kind = 'card'").get().amount_cents, 90000);
  assert.match(send('salario 3000'), /Salário cadastrado/u);
  assert.match(send('salário 0'), /Salário atualizado/u);
  assert.equal(db.prepare("SELECT amount_cents FROM monthly_values WHERE kind = 'salary'").get().amount_cents, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
});

test('valores mensais permanecem separados por pessoa, mês, grupo e tipo', (t) => {
  const { db, send } = fixture(t);
  send('salario 3000');
  send('salario 2000', { person: personB });
  send('salario 2026-11 3100');
  send('cartao 0');
  send('salario 5000', { groupId: 'other-test@g.us' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 5);
  const lookup = db.prepare('SELECT amount_cents FROM monthly_values WHERE group_id = ? AND actor_id = ? AND month = ? AND kind = ?');
  assert.equal(lookup.get('test@g.us', personA.id, '2026-10', 'salary').amount_cents, 300000);
  assert.equal(lookup.get('test@g.us', personB.id, '2026-10', 'salary').amount_cents, 200000);
  assert.equal(lookup.get('test@g.us', personA.id, '2026-11', 'salary').amount_cents, 310000);
  assert.equal(lookup.get('test@g.us', personA.id, '2026-10', 'card').amount_cents, 0);
  assert.equal(lookup.get('test@g.us', personB.id, '2026-10', 'card'), undefined);
});

test('comandos inválidos não criam valores nem gastos e a resposta também é deduplicada', (t) => {
  const { db, send } = fixture(t);
  const invalid = ['reserva', 'reserva emergência', 'reserva -20', 'reserva 0', 'reserva 1,234', 'reserva: 200', 'reserva\n200', 'cartao', 'cartão -1', 'cartao 2026-13 10', 'cartao 2026-1 20', 'cartao outra 100', 'cartao 2026-10', 'salário', 'salario 2026-00 1000', 'salario 2026-10 -30', 'salario mil 100', 'salario 1,234', 'salario\n3000', 'aporte', 'investimento -10'];
  for (const text of invalid) assert.match(send(text), /Comando inválido.*\n.*Nenhum valor foi registrado/u, text);
  assert.equal(send(invalid[0], { messageId: 'test-1' }), null);
  assert.equal(send('conversa normal sem valor'), null);
  assert.equal(send('🤖 Gastos\nreserva 200'), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
});

test('comandos sem espaço e consultas malformadas nunca caem no reconhecimento genérico', (t) => {
  const { db, send } = fixture(t);
  const invalid = [
    ['reserva200 100', 'reserva 200'], ['cartao2026-10 850', 'cartao 850,90'],
    ['salario2026-10 3000', 'salario 3000'], ['investimento200 100', 'investimento 200'],
    ['aporte200 100', 'aporte 200'], ['total mes 2026', 'total mês'],
    ['listar 2026-99 100', 'listar mês'], ['total 2026-13', 'total mês'],
    ['listar2026-10 100', 'listar mês'],
  ];
  for (const [index, [text, example]] of invalid.entries()) {
    const options = { messageId: `invalid-reserved-${index}` };
    assert.equal(parseEntry(text), null, text);
    const reply = send(text, options);
    assert.match(reply, /Comando inválido.*\n.*Nenhum valor foi registrado/u, text);
    assert.ok(reply.includes(example), text);
    assert.equal(send(text, options), null, `resposta duplicada: ${text}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM processed_messages').get().n, invalid.length);
  // O prefixo reservado não bloqueia palavras que apenas começam da mesma forma.
  assert.deepEqual(parseEntry('totalizador 30'), { description: 'totalizador', cents: 3000, kind: 'expense' });
  assert.deepEqual(parseEntry('reservatorio 40'), { description: 'reservatorio', cents: 4000, kind: 'expense' });
});

test('total, listar, desfazer e ajuda preservam comportamento sem dupla contagem da fatura', (t) => {
  const { db, send } = fixture(t);
  send('mercado 107,87');
  send('farmácia 40', { person: personB });
  send('investimento CDB 200');
  send('aporte 150');
  send('reserva 200');
  send('cartao 850,90');
  send('salario 3000');
  const total = send('total mês');
  assert.match(total, /Total de 2026-10: R\$\s147,87/u);
  assert.match(total, /Aportes do mês: R\$\s550,00/u);
  assert.match(send('listar 2026-10'), /\[Aporte\] Reserva/u);
  assert.match(send('desfazer', { person: personB }), /farmácia/u);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expenses WHERE actor_id = ? AND deleted_at IS NULL").get(personA.id).n, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 2);
  assert.match(send('total 2026-10'), /Total de 2026-10: R\$\s107,87/u);
  const help = send('ajuda');
  for (const command of ['reserva', 'cartao', 'salario', 'desfazer', 'investimento']) assert.ok(help.includes(command));
});

test('reconhecimento de autorizados e da própria conta permanece preservado', () => {
  const config = { people: [personA, personB], receiveOwnMessages: true };
  assert.equal(resolveActor(config, { key: { fromMe: true } }), personA);
  assert.equal(resolveActor({ ...config, receiveOwnMessages: false }, { key: { fromMe: true } }), undefined);
  assert.equal(resolveActor(config, { key: { participant: '000000000002:9@s.whatsapp.net' } }), personB);
  assert.equal(resolveActor(config, { key: { participantAlt: '222@lid' } }), personB);
  assert.equal(resolveActor(config, { key: { participant: '999@lid' } }), undefined);
});

test('valor mensal e deduplicação são revertidos juntos se o processamento falha', (t) => {
  const { db, send } = fixture(t);
  db.exec("CREATE TRIGGER reject_message BEFORE INSERT ON processed_messages BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(() => send('salario 3000'), /test failure/u);
  assert.throws(() => send('reserva 200'), /test failure/u);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
  assert.equal(db.isTransaction, false);
  db.exec('DROP TRIGGER reject_message');
  assert.match(send('salario 3000'), /cadastrado/u);
});

test('helper mensal valida inteiros, preserva transação externa e restrições SQLite', (t) => {
  const { db } = fixture(t);
  const value = { groupId: 'test@g.us', actorId: personA.id, month: '2026-10', kind: 'salary', amountCents: 0 };
  assert.deepEqual(setMonthlyValue(db, value), { created: true });
  assert.deepEqual(setMonthlyValue(db, { ...value, amountCents: 100 }), { created: false });
  for (const amountCents of [-1, 1.5, Number.MAX_SAFE_INTEGER, NaN]) assert.throws(() => setMonthlyValue(db, { ...value, amountCents }), /inválido/u);
  assert.throws(() => setMonthlyValue(db, { ...value, month: '2026-13' }), /inválido/u);
  assert.throws(() => db.prepare('UPDATE monthly_values SET amount_cents = ?').run(1.5), /CHECK constraint/u);
  db.exec('BEGIN IMMEDIATE');
  setMonthlyValue(db, { ...value, amountCents: 200 });
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT amount_cents FROM monthly_values').get().amount_cents, 100);
});

const legacySchema = `CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, message_id TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), spent_date TEXT NOT NULL,
  created_at TEXT NOT NULL, deleted_at TEXT, UNIQUE (group_id, message_id, actor_id)
);
INSERT INTO expenses VALUES (1, 'test@g.us', 'old-1', 'test-a', 'Pessoa A', 'reserva emergência', 15050, '2026-09-12', '2026-09-12T15:00:00Z', NULL);
INSERT INTO expenses VALUES (2, 'test@g.us', 'old-2', 'test-b', 'Pessoa B', 'mercado', 5000, '2026-09-13', '2026-09-13T15:00:00Z', '2026-09-14T15:00:00Z');`;

test('migração antiga é incremental, repetível e não converte reservas por texto', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'meus-gastos-migration-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(legacySchema);
  const before = legacy.prepare('SELECT * FROM expenses ORDER BY id').all().map((row) => ({ ...row }));
  legacy.close();
  let db = openDb(path);
  setMonthlyValue(db, { groupId: 'test@g.us', month: '2026-10', actorId: personA.id, kind: 'salary', amountCents: 300000 });
  db.exec("INSERT INTO monthly_goals VALUES ('test@g.us','2026-10','all',100000,20000,'2026-10-12T15:00:00Z')");
  db.close();
  db = openDb(path);
  try {
    const after = db.prepare('SELECT * FROM expenses ORDER BY id').all().map(({ kind, ...row }) => { assert.equal(kind, 'expense'); return row; });
    assert.deepEqual(after, before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM processed_messages').get().n, 2);
    assert.equal(db.prepare('SELECT amount_cents FROM monthly_values').get().amount_cents, 300000);
    assert.equal(db.prepare('SELECT investment_goal_cents FROM monthly_goals').get().investment_goal_cents, 20000);
    assert.equal(processText(db, { ...baseEvent, messageId: 'old-1', text: 'reserva emergência 150,50' }), null);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { db.close(); }
});

test('falha de migração reverte todas as alterações no esquema', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'meus-gastos-rollback-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'legacy.sqlite');
  let db = new DatabaseSync(path);
  db.exec(`${legacySchema} CREATE TABLE processed_messages (incompatible TEXT);`);
  db.close();
  assert.throws(() => openDb(path), /group_id/u);
  db = new DatabaseSync(path);
  try {
    assert.equal(db.prepare('PRAGMA table_info(expenses)').all().some((column) => column.name === 'kind'), false);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'monthly_values'").get(), undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 2);
  } finally { db.close(); }
});
