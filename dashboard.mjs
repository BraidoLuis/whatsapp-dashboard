// Dashboard local: node dashboard.mjs -> http://127.0.0.1:3210
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { openDb, dateFor, setMonthlyValue } from './bot.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MONTH = /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u;
const MAX_CENTS = 1_000_000_000_000;
// Only these public files can be served. Configuration, session and database paths
// are never resolved from a request URL.
const PUBLIC_FILES = new Map([
  ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']],
  ['/dashboard.css', ['dashboard.css', 'text/css; charset=utf-8']],
  ['/assets/motion.js', ['public/assets/motion.js', 'text/javascript; charset=utf-8']],
]);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// An optional Tailscale Serve origin is authorized explicitly. Proxy headers are
// not evidence of an authorized Host or Origin and are intentionally ignored.
export function validatePublicOrigin(value) {
  if (value === undefined || value === null) return null;
  const invalid = () => new Error('DASHBOARD_PUBLIC_ORIGIN inválida: use uma origem HTTPS exata, em minúsculas, com hostname .ts.net, sem porta padrão explícita, caminho, credenciais, query ou fragmento.');
  if (typeof value !== 'string' || value.length > 300) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  const tailscaleHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/u;
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash || url.origin !== value || url.hostname.length > 253
    || !tailscaleHost.test(url.hostname)) throw invalid();
  return url.origin;
}

function checkConfig(config) {
  if (!config?.groupId?.endsWith('@g.us') || !Array.isArray(config.people) || config.people.length !== 2
    || !config.people.every((p) => typeof p.id === 'string' && p.id !== 'all' && typeof p.name === 'string')
    || new Set(config.people.map((p) => p.id)).size !== 2) {
    throw fail(409, 'Configure o bot primeiro: node bot.mjs configurar');
  }
  return config;
}

function checkMonth(month) {
  if (typeof month !== 'string' || !MONTH.test(month)) throw fail(400, 'Mês inválido.');
  return month;
}

function checkScope(scope, config) {
  if (scope !== 'all' && !config.people.some((p) => p.id === scope)) throw fail(400, 'Pessoa inválida.');
  return scope;
}

function checkCents(value, optional = false, allowZero = optional) {
  if (optional && value === null) return null;
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_CENTS) {
    throw fail(400, 'Informe um valor válido, em centavos.');
  }
  return value;
}

function checkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !MONTH.test(value.slice(0, 7))) {
    throw fail(400, 'Data inválida.');
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw fail(400, 'Data inválida.');
  return value;
}

function goalFor(db, group, month, scope) {
  return db.prepare(`SELECT spending_cap_cents AS spendingCap, investment_goal_cents AS investmentGoal
    FROM monthly_goals WHERE group_id = ? AND month = ? AND scope = ?`).get(group, month, scope)
    || { spendingCap: null, investmentGoal: null };
}

export function shiftDate(date, days) {
  const value = new Date(`${checkDate(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0,10);
}
export function weekFor(date) {
  checkDate(date);
  if (date < '1900-01-08' || date > '2199-12-24') throw fail(400, 'Escolha uma semana entre 08/01/1900 e 24/12/2199.');
  const start = shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  return { start, end: shiftDate(start, 6) };
}
export function comparison(current, previous, hasPrevious) {
  return { previous: hasPrevious ? previous : null, delta: hasPrevious ? current - previous : null,
    percent: hasPrevious && previous > 0 ? (current - previous) / previous * 100 : null };
}
export function buildState(db, config, month, scope = 'all', weekDate = dateFor(new Date())) {
  // O bot usa outra conexão: todos os SELECTs devem enxergar o mesmo instante.
  // SAVEPOINT também preserva uma eventual transação aberta pelo chamador.
  db.exec('SAVEPOINT dashboard_state_read');
  try {
    const state = readStateSnapshot(db, config, month, scope);
    const previousMonth = shiftDate(`${month}-01`, -1).slice(0,7);
    const prior = month === '1900-01' ? { summary: { expenses: 0 }, records: [] } : readStateSnapshot(db, config, previousMonth, scope);
    state.comparison = comparison(state.summary.expenses, prior.summary.expenses, prior.records.some(r => r.kind === 'expense'));
    const week = weekFor(weekDate);
    state.weekly = readStateSnapshot(db, config, month, scope, week);
    const previousWeek = { start: shiftDate(week.start,-7), end: shiftDate(week.end,-7) };
    const priorWeek = readStateSnapshot(db, config, month, scope, previousWeek);
    state.weekly.comparison = comparison(state.weekly.summary.expenses, priorWeek.summary.expenses, priorWeek.records.some(r => r.kind === 'expense'));
    state.weekly.period = week;
    state.weekly.undatedMonthlyCount = state.monthlyValues.filter(v => !v.date).length;
    db.exec('RELEASE dashboard_state_read');
    return state;
  } catch (error) {
    db.exec('ROLLBACK TO dashboard_state_read; RELEASE dashboard_state_read');
    throw error;
  }
}

function readStateSnapshot(db, config, month, scope, period = null) {
  checkConfig(config); checkMonth(month); checkScope(scope, config);
  const params = period ? [config.groupId, period.start, period.end] : [config.groupId, month];
  const personFilter = scope === 'all' ? '' : ' AND actor_id = ?';
  if (scope !== 'all') params.push(scope);
  const records = db.prepare(`SELECT id, actor_id AS personId, actor_name AS personName, description,
    amount_cents AS cents, kind, spent_date AS date, message_id AS messageId, COALESCE(category, 'Sem categoria') AS category FROM expenses
    WHERE group_id = ? AND ${period ? 'spent_date BETWEEN ? AND ?' : 'substr(spent_date, 1, 7) = ?'} AND deleted_at IS NULL ${personFilter}
    ORDER BY spent_date DESC, id DESC`).all(...params);
  if (records.length > 20_000) throw fail(413, 'Há muitos lançamentos neste mês para esta versão local.');
  const nameMap = new Map(config.people.map((p) => [p.id, p.name]));
  const selectedPeople = config.people.filter((p) => scope === 'all' || p.id === scope);
  const people = new Map(selectedPeople.map((p) => [p.id, {
    id: p.id, name: p.name, expenses: 0, investments: 0, salary: null, card: null, estimatedBalance: null,
  }]));
  const monthlyValues = period ? [] : db.prepare(`SELECT id, actor_id AS personId, kind, amount_cents AS cents, month,
    updated_at AS updatedAt, description, entry_date AS date, migrated FROM monthly_values WHERE group_id = ? AND month = ? AND deleted_at IS NULL
    AND actor_id IN (${selectedPeople.map(() => '?').join(',')}) ORDER BY actor_id, kind`)
    .all(config.groupId, month, ...selectedPeople.map((p) => p.id));
  for (const value of monthlyValues) {
    value.personName = nameMap.get(value.personId);
    people.get(value.personId)[value.kind] = (people.get(value.personId)[value.kind] ?? 0) + value.cents;
  }
  const daysCount = period ? 7 : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const days = Array.from({ length: daysCount }, (_, index) => ({ day: index + 1, date: period ? shiftDate(period.start,index) : `${month}-${String(index+1).padStart(2,'0')}`, expenses: 0, investments: 0 }));
  const descriptions = new Map();
  let expenses = 0; let investments = 0;
  for (const record of records) {
    record.personName = nameMap.get(record.personId) || record.personName;
    const field = record.kind === 'investment' ? 'investments' : 'expenses';
    if (!people.has(record.personId)) people.set(record.personId, {
      id: record.personId, name: record.personName, expenses: 0, investments: 0, salary: null, card: null, estimatedBalance: null,
    });
    people.get(record.personId)[field] += record.cents;
    const day = days.find(day => day.date === record.date);
    if (!day) throw fail(422, 'Há um lançamento com data inválida neste mês.');
    day[field] += record.cents;
    if (record.kind === 'investment') investments += record.cents;
    else {
      expenses += record.cents;
      const key = record.category.toLocaleLowerCase('pt-BR');
      const prior = descriptions.get(key) || { label: record.category, cents: 0 };
      prior.cents += record.cents;
      descriptions.set(key, prior);
    }
  }
  const salaries = monthlyValues.filter((value) => value.kind === 'salary');
  const cards = monthlyValues.filter((value) => value.kind === 'card');
  // Missing values remain null: explicitly entering zero still counts as informed.
  const salary = salaries.length ? salaries.reduce((sum, value) => sum + value.cents, 0) : null;
  const card = cards.length ? cards.reduce((sum, value) => sum + value.cents, 0) : null;
  const estimatedBalance = salary === null ? null : salary - expenses - investments;
  for (const person of people.values()) {
    person.estimatedBalance = person.salary === null ? null : person.salary - person.expenses - person.investments;
  }
  if (![expenses, investments, salary, card, estimatedBalance].every((value) => value === null || Number.isSafeInteger(value))) {
    throw fail(422, 'Os totais ultrapassam o limite de precisão.');
  }
  const goals = goalFor(db, config.groupId, month, scope);
  const categories = [...descriptions.values()].sort((a, b) => b.cents - a.cents).map(c => ({ ...c, percent: expenses ? c.cents / expenses * 100 : 0 }));
  const salaryCount = new Set(salaries.map(v => v.personId)).size;
  const cardCount = new Set(cards.map(v => v.personId)).size;
  return {
    groupName: config.groupName || 'Gastos do casal', month, scope,
    participants: config.people.map(({ id, name }) => ({ id, name })),
    summary: {
      expenses, investments, count: records.length,
      remaining: goals.spendingCap === null ? null : goals.spendingCap - expenses,
      salary, card, estimatedBalance, salaryInformedCount: salaryCount, cardInformedCount: cardCount,
      participantCount: selectedPeople.length, balancePartial: salaryCount > 0 && salaryCount < selectedPeople.length,
    },
    goals, days, categories, people: [...people.values()], records, monthlyValues,
    updatedAt: new Date().toISOString(), today: dateFor(new Date()),
  };
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers['content-type'] || '')) throw fail(415, 'Use JSON.');
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16_384) throw fail(413, 'Conteúdo muito grande.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw fail(400, 'JSON inválido.'); }
}

export function createDashboard({ db, getConfig, html, publicRoot = ROOT, token = randomBytes(24).toString('hex'), publicOrigin = null }) {
  const authorizedPublicOrigin = validatePublicOrigin(publicOrigin);
  const publicHost = authorizedPublicOrigin ? new URL(authorizedPublicOrigin).host : null;
  const server = createServer(async (request, response) => {
    const nonce = randomBytes(18).toString('base64');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`);
    const json = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    try {
      const port = server.address()?.port;
      const origins = new Map([
        [`127.0.0.1:${port}`, `http://127.0.0.1:${port}`],
        [`localhost:${port}`, `http://localhost:${port}`],
      ]);
      if (publicHost) origins.set(publicHost, authorizedPublicOrigin);
      const expectedOrigin = origins.get(request.headers.host);
      if (!expectedOrigin) throw fail(403, 'Endereço não permitido.');
      const url = new URL(request.url, expectedOrigin);
      const config = checkConfig(getConfig());
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html.replaceAll('__GASTOS_TOKEN__', token).replaceAll('__GASTOS_NONCE__', nonce));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      if (request.method === 'GET' && PUBLIC_FILES.has(url.pathname)) {
        const [file, contentType] = PUBLIC_FILES.get(url.pathname);
        let contents;
        try { contents = readFileSync(join(publicRoot, file)); }
        catch (error) {
          if (error.code === 'ENOENT') throw fail(404, 'Recurso não encontrado. Verifique os arquivos e o build da dashboard.');
          throw error;
        }
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(contents); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const month = url.searchParams.get('month') || dateFor(new Date()).slice(0, 7);
        json(200, buildState(db, config, month, url.searchParams.get('scope') || 'all', url.searchParams.get('week') || dateFor(new Date())));
        return;
      }
      if (request.method !== 'POST') throw fail(404, 'Página não encontrada.');
      const headerToken = request.headers['x-gastos-token'];
      const receivedToken = typeof headerToken === 'string' ? Buffer.from(headerToken) : Buffer.alloc(0);
      const expectedToken = Buffer.from(token);
      if (receivedToken.length !== expectedToken.length || !timingSafeEqual(receivedToken, expectedToken)
        || request.headers.origin !== expectedOrigin) throw fail(403, 'Reabra a dashboard para continuar.');
      const body = await readJson(request);
      if (url.pathname === '/api/monthly-values' || url.pathname === '/api/monthly-values/remove') {
        if (body.id !== undefined && (!Number.isSafeInteger(body.id) || body.id < 1)) throw fail(400, 'Lançamento inválido.');
        if (url.pathname.endsWith('/remove')) {
          if (!body.id) throw fail(400, 'Escolha o lançamento a remover.');
          const changed = db.prepare('UPDATE monthly_values SET deleted_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL')
            .run(new Date().toISOString(),body.id,config.groupId);
          if (!changed.changes) throw fail(404,'Lançamento não encontrado.');
          json(200,{ removed:true }); return;
        }
        const month = checkMonth(body.month);
        const person = config.people.find((p) => p.id === body.personId);
        if (!person) throw fail(400, 'Pessoa inválida.');
        if (!['salary', 'card'].includes(body.kind)) throw fail(400, 'Tipo inválido.');
        const cents = checkCents(body.cents, false, true);
        const description = body.description == null || body.description === '' ? null : body.description;
        if (description !== null && (typeof description !== 'string' || description.length > 120 || /[\r\n]/u.test(description))) throw fail(400,'Descrição inválida.');
        const date = body.date === undefined || body.date === null || body.date === '' ? null : checkDate(body.date);
        if (date && date.slice(0,7) !== month) throw fail(400,'A data deve pertencer ao mês selecionado.');
        if (body.id) {
          const changed = db.prepare(`UPDATE monthly_values SET month=?,actor_id=?,kind=?,amount_cents=?,description=?,entry_date=?,updated_at=?
            WHERE id=? AND group_id=? AND deleted_at IS NULL`).run(month,person.id,body.kind,cents,description,date,new Date().toISOString(),body.id,config.groupId);
          if (!changed.changes) throw fail(404,'Lançamento não encontrado.');
          json(200,{ saved:true,created:false,id:body.id }); return;
        }
        const result = setMonthlyValue(db, {
          groupId: config.groupId, month, actorId: person.id, kind: body.kind,
          amountCents: cents, updatedAt: new Date().toISOString(), description, date,
        });
        json(200, { saved: true, ...result }); return;
      }
      if (url.pathname === '/api/goals') {
        const month = checkMonth(body.month);
        const scope = checkScope(body.scope, config);
        const cap = checkCents(body.spendingCap, true);
        const goal = checkCents(body.investmentGoal, true);
        db.prepare(`INSERT INTO monthly_goals VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (group_id, month, scope) DO UPDATE SET spending_cap_cents = excluded.spending_cap_cents,
          investment_goal_cents = excluded.investment_goal_cents, updated_at = excluded.updated_at`).run(
          config.groupId, month, scope, cap, goal, new Date().toISOString(),
        );
        json(200, { saved: true }); return;
      }
      if (url.pathname === '/api/records') {
        const person = config.people.find((p) => p.id === body.personId);
        if (!person) throw fail(400, 'Pessoa inválida.');
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description || description.length > 120 || /[\r\n]/u.test(description)) throw fail(400, 'Descrição inválida.');
        if (!['expense', 'investment'].includes(body.kind)) throw fail(400, 'Tipo inválido.');
        const cents = checkCents(body.cents);
        const date = checkDate(body.date);
        const category = body.category == null || body.category === '' ? null : body.category;
        if (category !== null && (typeof category !== 'string' || !category.trim() || category.length > 60 || /[\r\n]/u.test(category))) throw fail(400,'Categoria inválida.');
        let id;
        if (body.id !== null && body.id !== undefined) {
          if (!Number.isSafeInteger(body.id) || body.id < 1) throw fail(400, 'Lançamento inválido.');
          const changed = db.prepare(`UPDATE expenses SET actor_id = ?, actor_name = ?, description = ?, amount_cents = ?, kind = ?, spent_date = ?, category = ?
            WHERE id = ? AND group_id = ? AND deleted_at IS NULL`).run(person.id, person.name, description, cents, body.kind, date, category?.trim() || null, body.id, config.groupId);
          if (!changed.changes) throw fail(404, 'Lançamento não encontrado.');
          id = body.id;
        } else {
          const inserted = db.prepare(`INSERT INTO expenses
            (group_id, message_id, actor_id, actor_name, description, amount_cents, kind, spent_date, created_at, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(config.groupId, `dashboard-${randomUUID()}`, person.id, person.name,
            description, cents, body.kind, date, new Date().toISOString(), category?.trim() || null);
          id = Number(inserted.lastInsertRowid);
        }
        json(200, { saved: true, id }); return;
      }
      if (url.pathname === '/api/records/remove') {
        if (!Number.isSafeInteger(body.id) || body.id < 1) throw fail(400, 'Lançamento inválido.');
        const changed = db.prepare(`UPDATE expenses SET deleted_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL`)
          .run(new Date().toISOString(), body.id, config.groupId);
        if (!changed.changes) throw fail(404, 'Lançamento não encontrado.');
        json(200, { removed: true }); return;
      }
      throw fail(404, 'Página não encontrada.');
    } catch (error) {
      const status = error.status || 500;
      if (!error.status) console.error('Falha da dashboard:', error.message);
      if (!response.headersSent) json(status, { error: error.status ? error.message : 'Não foi possível acessar os dados. Tente novamente.' });
      else response.end();
    }
  });
  return server;
}

function main() {
  // Fail before opening/migrating the database if the optional origin is invalid.
  const publicOrigin = validatePublicOrigin(process.env.DASHBOARD_PUBLIC_ORIGIN);
  const getConfig = () => checkConfig(JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8')));
  try { getConfig(); }
  catch { throw new Error('Configure o bot primeiro: node bot.mjs configurar'); }
  mkdirSync(join(ROOT, 'dados'), { recursive: true, mode: 0o700 });
  const db = openDb(join(ROOT, 'dados', 'gastos.sqlite'));
  const server = createDashboard({ db, getConfig, html: readFileSync(join(ROOT, 'dashboard.html'), 'utf8'), publicOrigin });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'A porta 3210 está ocupada. Verifique se a dashboard já está aberta.' : error.message);
    db.close(); process.exitCode = 1;
  });
  server.listen(3210, '127.0.0.1', () => {
    console.log('Dashboard: http://127.0.0.1:3210\nPode rodar ao mesmo tempo que o bot. Ctrl+C para parar.');
    console.log(publicOrigin ? 'Origem Tailscale autorizada pela configuração.'
      : 'Origem Tailscale não configurada. Para acesso pelo Tailscale Serve, defina DASHBOARD_PUBLIC_ORIGIN antes de atualizar o servidor.');
  });
  const stop = () => server.close(() => { db.close(); process.exit(); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
