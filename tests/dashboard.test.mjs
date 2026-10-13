import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, setMonthlyValue } from '../bot.mjs';
import { buildState, createDashboard, validatePublicOrigin } from '../dashboard.mjs';

const config = {
  groupId: 'test-dashboard@g.us', groupName: 'Grupo de teste',
  people: [{ id: 'test-a', name: 'Pessoa A' }, { id: 'test-b', name: 'Pessoa B' }],
};
const MONTH = '2026-10';
const TOKEN = 'token-exclusivo-dos-testes';
const PUBLIC_ORIGIN = 'https://dashboard.tail-example.ts.net';
let sequence = 0;

function record(db, { personId = 'test-a', cents = 10_000, description = 'Mercado',
  kind = 'expense', date = `${MONTH}-05`, groupId = config.groupId, deletedAt = null } = {}) {
  return Number(db.prepare(`INSERT INTO expenses
    (group_id, message_id, actor_id, actor_name, description, amount_cents, kind, spent_date, created_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    groupId, `fixture-${++sequence}`, personId, personId, description, cents, kind, date, '2026-10-05T15:00:00Z', deletedAt,
  ).lastInsertRowid);
}

function monthly(db, personId, kind, amountCents, month = MONTH, groupId = config.groupId) {
  return setMonthlyValue(db, { groupId, month, actorId: personId, kind, amountCents });
}

async function fixture(t, extra = {}) {
  const db = openDb(':memory:');
  const server = createDashboard({
    db, getConfig: () => config,
    html: '<meta name="gastos-token" content="__GASTOS_TOKEN__"><script nonce="__GASTOS_NONCE__" src="/dashboard.js"></script>',
    token: TOKEN, ...extra,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });
  function send(path, { method = 'GET', body, headers = {}, raw } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method,
        headers: { ...(method === 'POST' ? {
          'content-type': 'application/json', 'x-gastos-token': TOKEN, origin: `http://127.0.0.1:${port}`,
        } : {}), ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, text,
            body: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : null });
        });
      });
      req.on('error', reject);
      req.end(raw === undefined ? body === undefined ? undefined : JSON.stringify(body) : raw);
    });
  }
  return { db, server, send };
}

test('estado separa pessoas, meses, grupos, fatura e aportes; receita ausente permanece null', (t) => {
  const db = openDb(':memory:'); t.after(() => db.close());
  record(db);
  record(db, { personId: 'test-b', cents: 5_000, description: 'Transporte' });
  record(db, { cents: 20_000, kind: 'investment', description: 'Reserva' });
  record(db, { cents: 99_999, date: '2026-09-30' });
  record(db, { cents: 99_999, groupId: 'outro@g.us' });
  record(db, { cents: 99_999, deletedAt: '2026-10-06T12:00:00Z' });
  monthly(db, 'test-a', 'salary', 300_000);
  monthly(db, 'test-a', 'card', 85_090);
  monthly(db, 'test-b', 'card', 0);
  monthly(db, 'test-b', 'salary', 99_999, '2026-09');
  monthly(db, 'test-b', 'salary', 99_999, MONTH, 'outro@g.us');
  db.prepare('INSERT INTO monthly_goals VALUES (?, ?, ?, ?, ?, ?)').run(config.groupId, MONTH, 'all', 50_000, 30_000, 'now');
  db.prepare('INSERT INTO monthly_goals VALUES (?, ?, ?, ?, ?, ?)').run(config.groupId, MONTH, 'test-a', 12_000, 20_000, 'now');

  const all = buildState(db, config, MONTH);
  assert.deepEqual(all.summary, {
    expenses: 15_000, investments: 20_000, count: 3, remaining: 35_000,
    salary: 300_000, card: 85_090, estimatedBalance: 265_000,
    salaryInformedCount: 1, cardInformedCount: 2, participantCount: 2, balancePartial: true,
  });
  assert.equal(all.days.reduce((sum, day) => sum + day.expenses, 0), 15_000);
  assert.deepEqual(all.categories.map(({ label }) => label), ['Mercado', 'Transporte']);
  assert.equal(all.monthlyValues.length, 3);
  const personA = buildState(db, config, MONTH, 'test-a');
  assert.equal(personA.summary.expenses, 10_000);
  assert.equal(personA.summary.investments, 20_000);
  assert.equal(personA.summary.estimatedBalance, 270_000);
  assert.equal(personA.summary.balancePartial, false);
  assert.deepEqual(personA.people.map(({ id }) => id), ['test-a']);
  assert.equal(personA.goals.spendingCap, 12_000);
  assert.ok(personA.records.every(({ personId }) => personId === 'test-a'));
  assert.ok(personA.monthlyValues.every(({ personId }) => personId === 'test-a'));
  assert.deepEqual(personA.categories.map(({ label }) => label), ['Mercado']);
  const personB = buildState(db, config, MONTH, 'test-b');
  assert.equal(personB.summary.salary, null);
  assert.equal(personB.summary.card, 0);
  assert.equal(personB.summary.estimatedBalance, null);
  assert.equal(personB.goals.spendingCap, null);
  monthly(db, 'test-b', 'salary', 0);
  assert.equal(buildState(db, config, MONTH).summary.balancePartial, false);
  assert.equal(buildState(db, config, MONTH, 'test-b').summary.estimatedBalance, -5_000);
  const empty = buildState(db, config, '2026-11');
  assert.equal(empty.summary.salary, null);
  assert.equal(empty.summary.card, null);
  assert.equal(empty.summary.estimatedBalance, null);
  assert.equal(empty.summary.count, 0);
});

test('estado mantém snapshot consistente durante escrita concorrente do bot', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gastos-dashboard-snapshot-'));
  const path = join(root, 'test.sqlite');
  const reader = openDb(path);
  const writer = openDb(path);
  t.after(() => { reader.close(); writer.close(); rmSync(root, { recursive: true, force: true }); });
  record(writer, { cents: 10_000 });
  monthly(writer, 'test-a', 'salary', 300_000);
  writer.prepare('INSERT INTO monthly_goals VALUES (?, ?, ?, ?, ?, ?)')
    .run(config.groupId, MONTH, 'all', 50_000, 20_000, 'before');

  // Atualiza pelo writer após o SELECT de lançamentos, antes do SELECT mensal.
  let changed = false;
  const interleavedReader = {
    exec: (sql) => reader.exec(sql),
    prepare: (sql) => {
      if (!changed && sql.includes('FROM monthly_values')) {
        changed = true;
        writer.exec('BEGIN IMMEDIATE');
        monthly(writer, 'test-a', 'salary', 350_000);
        writer.prepare('UPDATE monthly_goals SET spending_cap_cents = ?, investment_goal_cents = ?, updated_at = ?')
          .run(60_000, 30_000, 'after');
        record(writer, { cents: 5_000 });
        writer.exec('COMMIT');
      }
      return reader.prepare(sql);
    },
  };
  const snapshot = buildState(interleavedReader, config, MONTH);
  assert.equal(changed, true);
  assert.equal(snapshot.summary.expenses, 10_000);
  assert.equal(snapshot.summary.salary, 300_000);
  assert.equal(snapshot.goals.spendingCap, 50_000);
  assert.equal(snapshot.goals.investmentGoal, 20_000);
  assert.equal(reader.isTransaction, false);
  const current = buildState(reader, config, MONTH);
  assert.equal(current.summary.expenses, 15_000);
  assert.equal(current.summary.salary, 350_000);
  assert.equal(current.goals.spendingCap, 60_000);
  assert.equal(current.goals.investmentGoal, 30_000);
});

test('snapshot de estado encerra falhas e preserva transação externa', (t) => {
  const db = openDb(':memory:'); t.after(() => db.close());
  assert.throws(() => buildState(db, config, '2026-13'), /Mês inválido/u);
  assert.equal(db.isTransaction, false);
  db.exec('BEGIN IMMEDIATE');
  monthly(db, 'test-a', 'salary', 0);
  assert.equal(buildState(db, config, MONTH).summary.salary, 0);
  assert.equal(db.isTransaction, true);
  assert.throws(() => buildState(db, config, MONTH, 'unknown'), /Pessoa inválida/u);
  assert.equal(db.isTransaction, true);
  assert.equal(buildState(db, config, MONTH).summary.salary, 0);
  db.exec('ROLLBACK');
  assert.equal(buildState(db, config, MONTH).summary.salary, null);
});

test('API cadastra, atualiza e remove valores mensais sem duplicar nem alterar lançamentos', async (t) => {
  const { db, send } = await fixture(t);
  const body = { personId: 'test-a', month: MONTH, kind: 'salary', cents: 300_000 };
  assert.deepEqual((await send('/api/monthly-values', { method: 'POST', body })).body, { saved: true, created: true });
  assert.deepEqual((await send('/api/monthly-values', { method: 'POST', body: { ...body, cents: 350_000 } })).body,
    { saved: true, created: false });
  assert.equal((await send('/api/monthly-values', { method: 'POST', body: { ...body, kind: 'card', cents: 0 } })).status, 200);
  assert.equal((await send('/api/monthly-values', { method: 'POST', body: { ...body, personId: 'test-b', cents: 0 } })).status, 200);
  assert.equal((await send('/api/monthly-values', { method: 'POST', body: { ...body, month: '2026-09', cents: 150_000 } })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
  const state = (await send(`/api/state?month=${MONTH}&scope=test-a`)).body;
  assert.equal(state.summary.salary, 350_000);
  assert.equal(state.summary.card, 0);
  assert.equal(state.summary.estimatedBalance, 350_000);
  assert.equal((await send('/api/monthly-values/remove', { method: 'POST', body })).status, 200);
  assert.equal((await send('/api/monthly-values/remove', { method: 'POST', body })).status, 404);
  assert.equal(buildState(db, config, MONTH, 'test-a').summary.salary, null);
  assert.equal(buildState(db, config, MONTH, 'test-b').summary.salary, 0);
  assert.equal(buildState(db, config, '2026-09', 'test-a').summary.salary, 150_000);
});

test('metas e correção de reserva antiga preservam valor, data e identidade da mensagem', async (t) => {
  const { db, send } = await fixture(t);
  const id = record(db, { description: 'reserva emergência', cents: 15_050, date: '2026-10-02' });
  const before = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  const update = await send('/api/records', { method: 'POST', body: {
    id, personId: 'test-a', description: before.description, cents: before.amount_cents, kind: 'investment', date: before.spent_date,
  } });
  assert.equal(update.status, 200);
  const after = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  for (const field of ['amount_cents', 'spent_date', 'message_id', 'created_at']) assert.equal(after[field], before[field]);
  assert.equal(after.kind, 'investment');
  const goals = { month: MONTH, scope: 'test-a', spendingCap: 0, investmentGoal: 20_000 };
  assert.equal((await send('/api/goals', { method: 'POST', body: goals })).status, 200);
  const state = buildState(db, config, MONTH, 'test-a');
  assert.equal(state.summary.expenses, 0);
  assert.equal(state.summary.investments, 15_050);
  assert.equal(state.goals.spendingCap, 0);
  assert.equal(state.goals.investmentGoal, 20_000);
  assert.equal((await send('/api/goals', { method: 'POST', body: { ...goals, spendingCap: null, investmentGoal: null } })).status, 200);
  assert.equal(buildState(db, config, MONTH, 'test-a').goals.investmentGoal, null);
  assert.equal((await send('/api/records/remove', { method: 'POST', body: { id } })).status, 200);
  assert.equal(buildState(db, config, MONTH).summary.count, 0);
  assert.ok(db.prepare('SELECT deleted_at FROM expenses WHERE id = ?').get(id).deleted_at);
  assert.equal((await send('/api/records/remove', { method: 'POST', body: { id } })).status, 404);
  const otherId = record(db, { groupId: 'other@g.us' });
  assert.equal((await send('/api/records/remove', { method: 'POST', body: { id: otherId } })).status, 404);
  const created = await send('/api/records', { method: 'POST', body: {
    personId: 'test-b', description: 'Teste manual', cents: 10787, kind: 'expense', date: '2026-10-08',
  } });
  assert.equal(created.status, 200);
  assert.equal(buildState(db, config, MONTH, 'test-b').summary.expenses, 10787);
});

test('API rejeita mês, pessoa, dinheiro e datas inválidas sem criar registros', async (t) => {
  const { db, send } = await fixture(t);
  const body = { personId: 'test-a', month: MONTH, kind: 'salary', cents: 0 };
  const invalid = [
    { month: '2026-13' }, { month: '26-10' }, { month: '2026-00' }, { month: '2200-01' },
    { personId: 'all' }, { personId: 'unknown' }, { kind: 'expense' },
    { cents: null }, { cents: -1 }, { cents: 1.5 }, { cents: '107,87' }, { cents: 1_000_000_000_001 },
  ];
  for (const invalidFields of invalid) {
    const response = await send('/api/monthly-values', { method: 'POST', body: { ...body, ...invalidFields } });
    assert.equal(response.status, 400, JSON.stringify(invalidFields));
  }
  for (const date of ['2026-02-30', '2026-00-01', '2026-10-32', '2026-10-1']) {
    assert.equal((await send('/api/records', { method: 'POST', body: {
      personId: 'test-a', description: 'Teste inválido', kind: 'expense', cents: 100, date,
    } })).status, 400);
  }
  for (const query of ['month=2026-13', 'month=2026-10&scope=unknown']) assert.equal((await send(`/api/state?${query}`)).status, 400);
  assert.equal((await send('/api/goals', { method: 'POST', body: { month: MONTH, scope: 'all', spendingCap: -1, investmentGoal: 0 } })).status, 400);
  assert.equal((await send('/api/monthly-values', { method: 'POST', raw: '{invalid' })).status, 400);
  assert.equal((await send('/api/monthly-values', { method: 'POST', raw: '[]' })).status, 400);
  assert.equal((await send('/api/monthly-values', { method: 'POST', body, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await send('/api/monthly-values', { method: 'POST', raw: JSON.stringify({ input: 'a'.repeat(17000) }) })).status, 413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
});

test('preserva proteção de host/origem/CSRF e usa CSP restritiva para scripts locais', async (t) => {
  const { db, send } = await fixture(t);
  const body = { personId: 'test-a', month: MONTH, kind: 'salary', cents: 100 };
  for (const headers of [
    { 'x-gastos-token': '' }, { 'x-gastos-token': 'wrong' }, { origin: '' },
    { origin: 'https://site-externo.invalid' }, { origin: 'null' }, { host: 'site-externo.invalid' },
  ]) assert.equal((await send('/api/monthly-values', { method: 'POST', body, headers })).status, 403);
  assert.equal((await send('/api/state', { headers: { host: 'site-externo.invalid' } })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
  const first = await send('/');
  const second = await send('/');
  assert.equal(first.status, 200);
  assert.ok(first.text.includes(TOKEN));
  assert.ok(!first.text.includes('__GASTOS_'));
  const csp = first.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' 'nonce-[^']+'/u);
  assert.doesNotMatch(csp.match(/script-src[^;]*/u)[0], /unsafe-inline|https?:/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.notEqual(first.headers['content-security-policy'], second.headers['content-security-policy']);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.headers['x-content-type-options'], 'nosniff');
});

test('origem pública é opcional e aceita somente uma origem HTTPS exata do Tailscale', () => {
  assert.equal(validatePublicOrigin(undefined), null);
  assert.equal(validatePublicOrigin(null), null);
  assert.equal(validatePublicOrigin(PUBLIC_ORIGIN), PUBLIC_ORIGIN);
  assert.equal(validatePublicOrigin(`${PUBLIC_ORIGIN}:8443`), `${PUBLIC_ORIGIN}:8443`);
  for (const value of [
    '', '*', ['https://dashboard.tail-example.ts.net'], 123,
    'http://dashboard.tail-example.ts.net', 'https://dashboard.example.invalid',
    'https://dashboard.tail-example.ts.net.evil.invalid', 'https://ts.net',
    'https://-dashboard.tail-example.ts.net', 'https://dashboard_.tail-example.ts.net',
    'https://127.0.0.1', 'https://[::1]', 'https://*.tail-example.ts.net',
    `${PUBLIC_ORIGIN}/`, `${PUBLIC_ORIGIN}/dashboard`, `${PUBLIC_ORIGIN}/..`,
    `${PUBLIC_ORIGIN}?query=1`, `${PUBLIC_ORIGIN}#fragment`, `${PUBLIC_ORIGIN}:443`,
    'https://user:password@dashboard.tail-example.ts.net',
    'https://DASHBOARD.tail-example.ts.net', ` ${PUBLIC_ORIGIN}`, `${PUBLIC_ORIGIN}\n`,
  ]) assert.throws(() => validatePublicOrigin(value), /DASHBOARD_PUBLIC_ORIGIN inválida/u, String(value));
  assert.throws(() => createDashboard({ publicOrigin: 'https://outside.invalid' }), /DASHBOARD_PUBLIC_ORIGIN inválida/u);
});

test('inicialização rejeita origem malformada antes de ler configuração ou criar o banco', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gastos-dashboard-startup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Run identical modules in isolation; never consult the real config/database.
  for (const file of ['dashboard.mjs', 'bot.mjs']) {
    writeFileSync(join(root, file), readFileSync(new URL(`../${file}`, import.meta.url)));
  }
  const result = spawnSync(process.execPath, [join(root, 'dashboard.mjs')], {
    cwd: root, env: { ...process.env, DASHBOARD_PUBLIC_ORIGIN: 'http://dashboard.tail-example.ts.net' },
    encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DASHBOARD_PUBLIC_ORIGIN inválida/u);
  assert.doesNotMatch(result.stderr, /Configure o bot/u);
  assert.equal(existsSync(join(root, 'dados')), false);
  assert.equal(existsSync(join(root, 'config.json')), false);
});

test('configuração autoriza um Host público exato e preserva Host, Origin e CSRF locais', async (t) => {
  const { db, server, send } = await fixture(t, { publicOrigin: PUBLIC_ORIGIN });
  const publicHost = new URL(PUBLIC_ORIGIN).host;
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  const body = { personId: 'test-a', month: MONTH, kind: 'salary', cents: 100 };
  assert.equal((await send('/', { headers: { host: publicHost } })).status, 200);
  assert.equal((await send('/api/state', { headers: { host: publicHost } })).status, 200);
  assert.equal((await send('/api/monthly-values', { method: 'POST', body,
    headers: { host: publicHost, origin: PUBLIC_ORIGIN } })).status, 200);
  for (const headers of [
    { host: publicHost, origin: localOrigin },
    { host: publicHost, origin: `http://${publicHost}` },
    { host: publicHost, origin: `${PUBLIC_ORIGIN}/` },
    { host: publicHost, origin: PUBLIC_ORIGIN, 'x-gastos-token': '' },
    { host: `${publicHost}:443`, origin: PUBLIC_ORIGIN },
    { host: 'another.tail-example.ts.net', origin: PUBLIC_ORIGIN },
    { host: `${publicHost}.evil.invalid`, origin: PUBLIC_ORIGIN },
    { origin: PUBLIC_ORIGIN },
  ]) assert.equal((await send('/api/monthly-values', { method: 'POST', body, headers })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 1);
  assert.equal((await send('/api/monthly-values', { method: 'POST', body })).status, 200);
  const localhost = `localhost:${server.address().port}`;
  assert.equal((await send('/api/monthly-values', { method: 'POST', body,
    headers: { host: localhost, origin: `http://${localhost}` } })).status, 200);
});

test('cabeçalhos Forwarded e X-Forwarded não autorizam hosts nem substituem a origem exigida', async (t) => {
  const { db, send } = await fixture(t, { publicOrigin: PUBLIC_ORIGIN });
  const publicHost = new URL(PUBLIC_ORIGIN).host;
  const forwarded = {
    forwarded: `host=${publicHost};proto=https`,
    'x-forwarded-host': publicHost, 'x-forwarded-proto': 'https',
  };
  const body = { personId: 'test-a', month: MONTH, kind: 'salary', cents: 100 };
  for (const headers of [
    { ...forwarded, host: 'outside.invalid', origin: PUBLIC_ORIGIN },
    { ...forwarded, origin: PUBLIC_ORIGIN },
    { ...forwarded, host: publicHost, origin: 'https://outside.invalid' },
  ]) assert.equal((await send('/api/monthly-values', { method: 'POST', body, headers })).status, 403);
  assert.equal((await send('/api/state', { headers: { ...forwarded, host: 'outside.invalid' } })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_values').get().n, 0);
  // Spoofed proxy metadata never changes the allowed local origin.
  assert.equal((await send('/api/monthly-values', { method: 'POST', body, headers: forwarded })).status, 200);
  const withoutPublicOrigin = await fixture(t);
  assert.equal((await withoutPublicOrigin.send('/api/state', { headers: { host: publicHost } })).status, 403);
  assert.equal((await withoutPublicOrigin.send('/api/monthly-values', { method: 'POST', body,
    headers: { ...forwarded, host: publicHost, origin: PUBLIC_ORIGIN } })).status, 403);
});

test('somente assets públicos explícitos são acessíveis, incluindo Motion local', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gastos-dashboard-assets-'));
  mkdirSync(join(root, 'public', 'assets'), { recursive: true });
  const files = ['dashboard.js', 'dashboard.css', 'public/assets/motion.js', 'config.json'];
  for (const file of files) writeFileSync(join(root, file), `fixture: ${file}`);
  t.after(() => {
    for (const file of files) unlinkSync(join(root, file));
    rmdirSync(join(root, 'public', 'assets')); rmdirSync(join(root, 'public')); rmdirSync(root);
  });
  const { send } = await fixture(t, { publicRoot: root });
  for (const path of ['/dashboard.js', '/dashboard.css', '/assets/motion.js']) {
    const response = await send(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers['content-type'], path.endsWith('.css') ? /^text\/css/u : /^text\/javascript/u);
    assert.match(response.text, /^fixture:/u);
  }
  for (const path of ['/config.json', '/dados/gastos.sqlite', '/sessao/creds.json', '/assets/../config.json', '/public/assets/motion.js', '/assets/unknown.js']) {
    assert.equal((await send(path)).status, 404, path);
  }
});
