// Bot pessoal de gastos. Node.js 24 LTS; Baileys 7.0.0-rc14.
// Execute: node bot.mjs configurar | node bot.mjs | node bot.mjs --verificar
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(ROOT, 'config.json');
const DATA_PATH = join(ROOT, 'dados');
const REPLY_PREFIX = '🤖 Gastos\n';
const TIME_ZONE = 'America/Sao_Paulo';
const MAX_CENTS = 1_000_000_000_000;
const HELP = [
  'Gastos: mercado 107,87 ou farmácia 40.',
  'Aportes: investimento CDB 200, aporte 150, reserva 200 ou reserva emergência 150,50.',
  'Fatura: cartao 850,90, fatura Nubank 300 ou cartão 2026-10 Visa 850,90.',
  'Receita: salario 3000 ou salário 2026-10 Empresa 3000.',
  'Cada salário e fatura adiciona um lançamento ao mês. Descrição opcional antes do valor. Zero é permitido. Sem mês, usa o mês da mensagem em São Paulo.',
  'A fatura é informativa: não entra nos gastos nem indica pagamento. Não registre seu pagamento novamente como gasto.',
  'Consultas: total mês, total 2026-10, listar ou listar 2026-10.',
  'Outros: desfazer e ajuda. Desfazer remove somente seu último gasto/aporte; edite ou remova salário e fatura na dashboard.',
].join('\n');

export function validMonth(value) {
  return typeof value === 'string' && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test(value);
}

function normalized(value) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function specificCommand(value) {
  // Dígitos encostados no comando indicam uma mensagem incompleta/malformada,
  // não uma descrição de despesa (ex.: cartao2026-10 850).
  return normalized(value).match(/^(reserva|investimento|aporte|cartao|fatura|salario|total|listar)(?=$|[^\p{L}_])/u)?.[1];
}

export function money(cents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(cents / 100);
}

export function dateFor(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (name) => parts.find((part) => part.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parseMoney(input, { allowZero = false } = {}) {
  if (typeof input !== 'string' || /[\r\n]/u.test(input)) return null;
  let value = input.trim().replace(/^R\$\s*/u, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/u.test(value)) {
    value = value.replaceAll('.', '').replace(',', '.');
  } else if (/^\d+(?:[.,]\d{1,2})?$/u.test(value)) {
    value = value.replace(',', '.');
  } else {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  // Guardar centavos inteiros evita erros de soma de números decimais.
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents < (allowZero ? 0n : 1n) || cents > BigInt(MAX_CENTS)) return null;
  return Number(cents);
}

export function parseExpense(input) {
  // Aceita vírgula decimal, ponto decimal e milhares no padrão brasileiro.
  if (typeof input !== 'string' || input.startsWith(REPLY_PREFIX) || /[\r\n]/u.test(input)) return null;
  const match = input.trim().match(/^(.+?)\s+(?:R\$\s*)?(\d[\d.,]*)$/u);
  if (!match) return null;
  const description = match[1].trim();
  if (!/\p{L}/u.test(description) || description.length > 120) return null;
  const cents = parseMoney(match[2]);
  if (cents === null) return null;
  return { description, cents };
}

export function parseEntry(input) {
  if (typeof input !== 'string' || /[\r\n]/u.test(input)) return null;
  const command = specificCommand(input);
  // A palavra reservada nunca deve ser reconhecida como descrição de um gasto.
  if (['cartao', 'fatura', 'salario'].includes(command)) return null;
  const investment = input.trim().match(/^(investimento|aporte|reserva)\s+(.+)$/iu);
  if (command && !investment) return null;
  const fallback = command === 'reserva' ? 'Reserva' : 'Investimento';
  const amountOnly = investment ? parseMoney(investment[2]) : null;
  const value = investment
    ? (amountOnly === null ? parseExpense(investment[2]) : { description: fallback, cents: amountOnly })
    : parseExpense(input);
  if (value && command === 'reserva' && value.description !== 'Reserva') {
    value.description = `Reserva ${value.description}`;
    if (value.description.length > 120) return null;
  }
  return value ? { ...value, kind: investment ? 'investment' : 'expense' } : null;
}

export function parseMonthlyValue(input, instant = new Date()) {
  if (typeof input !== 'string' || /[\r\n]/u.test(input)) return null;
  const match = normalized(input).match(/^(cartao|fatura|salario)\s+(?:(\d{4}-\d{2})\s+)?(.+)$/u);
  if (!match) return null;
  const month = match[2] || dateFor(instant).slice(0, 7);
  // Lê o texto original para preservar R$ e o formato monetário.
  const amount = input.trim().replace(/^\S+\s+/u, '').replace(/^\d{4}-\d{2}\s+/u, '');
  let cents = parseMoney(amount, { allowZero: true });
  let description;
  if (cents === null) {
    const parts = amount.match(/^(.+?)\s+(?:R\$\s*)?(\d[\d.,]*)$/u);
    if (!parts || !/\p{L}/u.test(parts[1]) || parts[1].length > 120 || /^\d{4}-/u.test(parts[1]) || /(?:^|\s)-\d/u.test(parts[1])) return null;
    description = parts[1].trim();
    cents = parseMoney(parts[2], { allowZero: true });
  }
  if (!validMonth(month) || cents === null) return null;
  return { kind: match[1] === 'salario' ? 'salary' : 'card', month, cents, ...(description ? { description } : {}) };
}

export function openDb(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; BEGIN IMMEDIATE');
    db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'investment')),
      spent_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (group_id, message_id, actor_id)
    );
    CREATE INDEX IF NOT EXISTS expense_month ON expenses (group_id, spent_date);
    CREATE TABLE IF NOT EXISTS processed_messages (
      group_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY (group_id, message_id, actor_id)
    );
    `);
    const columns = db.prepare('PRAGMA table_info(expenses)').all();
    if (!columns.some((column) => column.name === 'kind')) {
      db.exec("ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'investment'))");
    }
    if (!columns.some((column) => column.name === 'category')) db.exec('ALTER TABLE expenses ADD COLUMN category TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS monthly_goals (
    group_id TEXT NOT NULL,
    month TEXT NOT NULL,
    scope TEXT NOT NULL,
    spending_cap_cents INTEGER CHECK (spending_cap_cents IS NULL OR spending_cap_cents >= 0),
    investment_goal_cents INTEGER CHECK (investment_goal_cents IS NULL OR investment_goal_cents >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, month, scope)
    );
    CREATE TABLE IF NOT EXISTS monthly_values (
      group_id TEXT NOT NULL,
      month TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('salary', 'card')),
      amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0 AND amount_cents <= 1000000000000),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (group_id, month, actor_id, kind)
    );
    INSERT OR IGNORE INTO processed_messages (group_id, message_id, actor_id, processed_at)
      SELECT group_id, message_id, actor_id, created_at FROM expenses;
    `);
    // The legacy timestamp is an update time, never evidence of a receipt date.
    if (!db.prepare('PRAGMA table_info(monthly_values)').all().some((column) => column.name === 'id')) {
      db.exec(`ALTER TABLE monthly_values RENAME TO monthly_values_legacy_v1;
        CREATE TABLE monthly_values (
          id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, month TEXT NOT NULL,
          actor_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('salary','card')),
          amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 0 AND 1000000000000),
          updated_at TEXT NOT NULL, description TEXT, entry_date TEXT, message_id TEXT,
          migrated INTEGER NOT NULL DEFAULT 0 CHECK (migrated IN (0,1)), deleted_at TEXT,
          UNIQUE (group_id, message_id, actor_id)
        );
        INSERT INTO monthly_values (group_id,month,actor_id,kind,amount_cents,updated_at,migrated)
          SELECT group_id,month,actor_id,kind,amount_cents,updated_at,1 FROM monthly_values_legacy_v1;
        CREATE INDEX monthly_entries_period ON monthly_values(group_id,month,actor_id);
      `);
    }
    db.exec('PRAGMA user_version = 2; COMMIT');
    return db;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    throw error;
  }
}

export function setMonthlyValue(db, { groupId, month, actorId, kind, amountCents, updatedAt = new Date().toISOString(), description = null, date = null, messageId = null }) {
  const parsedDate = typeof date === 'string' ? new Date(`${date}T12:00:00Z`) : null;
  const validDate = date === null || (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(date)
    && date.slice(0, 7) === month && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date);
  if (typeof groupId !== 'string' || !groupId || typeof actorId !== 'string' || !actorId
    || !validMonth(month) || !['salary', 'card'].includes(kind)
    || !Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > MAX_CENTS
    || (description !== null && (typeof description !== 'string' || description.length > 120 || /[\r\n]/u.test(description)))
    || !validDate) {
    throw new TypeError('Pessoa, mês, tipo ou valor mensal inválido.');
  }
  // O savepoint mantém a inclusão atômica inclusive dentro de processText.
  db.exec('SAVEPOINT monthly_value_write');
  try {
    const inserted = db.prepare(`INSERT INTO monthly_values (group_id, month, actor_id, kind, amount_cents, updated_at, description, entry_date, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      groupId, month, actorId, kind, amountCents, updatedAt, description, date, messageId,
    );
    db.exec('RELEASE monthly_value_write');
    return { created: true, id: Number(inserted.lastInsertRowid) };
  } catch (error) {
    db.exec('ROLLBACK TO monthly_value_write; RELEASE monthly_value_write');
    throw error;
  }
}

export function processText(db, event) {
  const { groupId, messageId, person, text, instant = new Date() } = event;
  if (!groupId || !messageId || !person?.id || typeof text !== 'string') return null;
  if (text.startsWith(REPLY_PREFIX)) return null;
  const command = normalized(text);
  const specific = specificCommand(text);
  const report = command.match(/^(total|listar)(?:\s+(mes|(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])))?$/u);
  const monthly = ['cartao', 'fatura', 'salario'].includes(specific) ? parseMonthlyValue(text, instant) : null;
  const expense = report || monthly ? null : parseEntry(text);
  if (!report && !expense && !monthly && !specific && !['desfazer', 'ajuda'].includes(command)) return null;
  const month = report && report[2] && report[2] !== 'mes' ? report[2] : dateFor(instant).slice(0, 7);
  const stamp = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const prior = db.prepare(`SELECT 1 FROM processed_messages
      WHERE group_id = ? AND message_id = ? AND actor_id = ?`).get(groupId, messageId, person.id);
    if (prior) { db.exec('COMMIT'); return null; }
    let reply;
    if (monthly) {
      setMonthlyValue(db, {
        groupId, month: monthly.month, actorId: person.id, kind: monthly.kind, amountCents: monthly.cents, updatedAt: stamp,
        description: monthly.description || null, date: dateFor(instant).slice(0,7) === monthly.month ? dateFor(instant) : null, messageId,
      });
      const salary = monthly.kind === 'salary';
      reply = `${salary ? 'Salário cadastrado' : 'Fatura cadastrada'} para ${person.name}:\nMês: ${monthly.month}\nValor: ${money(monthly.cents)}${monthly.description ? `\nDescrição: ${monthly.description}` : ''}\nNovo lançamento adicionado ao total do mês.`;
      if (!salary) reply += '\nFatura informativa: não soma aos gastos e não indica pagamento. Não registre seu pagamento novamente como gasto.';
    } else if (expense) {
      db.prepare(`INSERT INTO expenses
        (group_id, message_id, actor_id, actor_name, description, amount_cents, kind, spent_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        groupId, messageId, person.id, person.name, expense.description, expense.cents, expense.kind, dateFor(instant), stamp,
      );
      reply = `${expense.kind === 'investment' ? 'Aporte registrado' : 'Registrado'} por ${person.name}:\n${expense.description}: ${money(expense.cents)}\nData: ${dateFor(instant).split('-').reverse().join('/')}`;
    } else if (report?.[1] === 'total') {
      const rows = db.prepare(`SELECT actor_id, MAX(actor_name) AS actor_name, SUM(amount_cents) AS cents
        FROM expenses WHERE group_id = ? AND substr(spent_date, 1, 7) = ? AND deleted_at IS NULL AND kind = 'expense'
        GROUP BY actor_id ORDER BY actor_name`).all(groupId, month);
      const total = rows.reduce((sum, row) => sum + Number(row.cents), 0);
      if (!Number.isSafeInteger(total)) throw new Error('Total acima do limite de precisão.');
      reply = `Total de ${month}: ${money(total)}`;
      for (const row of rows) reply += `\n${row.actor_name}: ${money(Number(row.cents))}`;
      if (!rows.length) reply += '\nNenhum gasto registrado neste mês.';
      const investments = db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM expenses
        WHERE group_id = ? AND substr(spent_date, 1, 7) = ? AND deleted_at IS NULL AND kind = 'investment'`).get(groupId, month);
      reply += `\nAportes do mês: ${money(Number(investments.cents))}`;
    } else if (report?.[1] === 'listar') {
      const rows = db.prepare(`SELECT actor_name, description, amount_cents, spent_date, kind FROM expenses
        WHERE group_id = ? AND substr(spent_date, 1, 7) = ? AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 10`).all(groupId, month);
      reply = `Últimos 10 lançamentos de ${month}:`;
      for (const row of rows) reply += `\n${row.spent_date.split('-').reverse().join('/')} — ${row.actor_name} — ${row.kind === 'investment' ? '[Aporte] ' : ''}${row.description}: ${money(row.amount_cents)}`;
      if (!rows.length) reply += '\nNenhum lançamento registrado neste mês.';
    } else if (command === 'desfazer') {
      const last = db.prepare(`SELECT id, description, amount_cents FROM expenses
        WHERE group_id = ? AND actor_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`).get(groupId, person.id);
      if (last) {
        db.prepare('UPDATE expenses SET deleted_at = ? WHERE id = ?').run(stamp, last.id);
        reply = `${person.name}, seu último lançamento foi removido:\n${last.description}: ${money(last.amount_cents)}`;
      } else reply = `${person.name}, você não tem gastos para desfazer.`;
    } else if (specific) {
      const consultation = ['total', 'listar'].includes(specific);
      const examples = ['cartao', 'fatura'].includes(specific) ? 'cartao 850,90 ou fatura 2026-10 Visa 850,90'
        : specific === 'salario' ? 'salario 3000 ou salário 2026-10 3000'
          : specific === 'reserva' ? 'reserva 200 ou reserva emergência 150,50'
            : consultation ? `${specific} mês ou ${specific} 2026-10`
            : `${specific} 200 ou ${specific} CDB 200`;
      const instruction = consultation ? 'Informe um mês válido (AAAA-MM) ou use mês para consultar o mês atual.'
        : ['cartao', 'fatura', 'salario'].includes(specific) ? 'Informe um valor igual ou maior que zero e um mês válido (AAAA-MM).'
          : 'Informe um valor maior que zero.';
      reply = `Comando inválido. Use: ${examples}.\n${instruction} Nenhum valor foi registrado.`;
    } else reply = HELP;
    db.prepare('INSERT INTO processed_messages VALUES (?, ?, ?, ?)').run(groupId, messageId, person.id, stamp);
    db.exec('COMMIT');
    return REPLY_PREFIX + reply;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function normalJid(value) {
  if (typeof value !== 'string' || !value) return '';
  if (/^\+?\d+$/u.test(value)) return `${value.replace('+', '')}@s.whatsapp.net`;
  return value.replace(/:\d+(?=@)/u, '');
}

export function resolveActor(config, message) {
  if (message.key?.fromMe) {
    return config.receiveOwnMessages ? config.people.find((person) => person.isSelf) : undefined;
  }
  const ids = [message.key?.participant, message.key?.participantAlt, message.participant].map(normalJid).filter(Boolean);
  return config.people.find((person) => person.aliases.some((id) => ids.includes(id)));
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!config.groupId?.endsWith('@g.us') || !Array.isArray(config.people) || config.people.length !== 2
    || !config.people.every((p) => p.id && typeof p.name === 'string' && Array.isArray(p.aliases) && p.aliases.length)) {
    throw new Error('Configuração inválida. Execute node bot.mjs configurar.');
  }
  if (config.receiveOwnMessages && config.people.filter((p) => p.isSelf).length !== 1) {
    throw new Error('Falta identificar sua conta. Execute node bot.mjs configurar.');
  }
  return config;
}

async function configure(socket, previousConfig) {
  const groups = Object.values(await socket.groupFetchAllParticipating()).sort((a, b) => a.subject.localeCompare(b.subject));
  if (!groups.length) throw new Error('Crie o grupo e adicione a conta conectada antes de configurar.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  async function choose(question, max) {
    while (true) {
      const value = (await rl.question(question)).trim();
      const number = Number(value);
      if (/^\d+$/u.test(value) && number >= 1 && number <= max) return number - 1;
      console.log(`Digite um número de 1 a ${max}.`);
    }
  }
  try {
    console.log('\nGrupos da conta conectada:');
    groups.forEach((group, index) => console.log(`${index + 1}. ${group.subject}`));
    const group = groups[await choose('\nNúmero do grupo de gastos: ', groups.length)];
    const metadata = await socket.groupMetadata(group.id);
    const members = metadata.participants;
    if (members.length < 2) throw new Error('O grupo precisa ter vocês dois como participantes.');
    console.log('\nParticipantes:');
    members.forEach((p, i) => console.log(`${i + 1}. ${p.phoneNumber || p.id}`));
    const selected = [];
    while (selected.length < 2) {
      const index = await choose(`Número da pessoa ${selected.length + 1} que pode registrar: `, members.length);
      if (selected.includes(index)) { console.log('Selecione outra pessoa.'); continue; }
      selected.push(index);
    }
    const ownAnswer = (await rl.question('\nVocê conectou a SUA conta e quer registrar também suas próprias mensagens? [s/N]: ')).trim().toLowerCase();
    const receiveOwnMessages = ['s', 'sim'].includes(ownAnswer);
    const people = [];
    for (const index of selected) {
      const member = members[index];
      let name = '';
      while (!name || name.length > 40 || /[\r\n]/u.test(name)) {
        name = (await rl.question(`Nome para ${member.phoneNumber || member.id} (até 40 letras): `)).trim();
      }
      const aliases = [...new Set([member.id, member.phoneNumber, member.lid, member.jid, member.pn].map(normalJid).filter(Boolean))];
      // Manter a identidade já configurada preserva os totais individuais.
      const previous = previousConfig?.people.find((p) => p.aliases.some((alias) => aliases.includes(alias)));
      people.push({ id: previous?.id || `p-${Date.now()}-${index}`, name, aliases, isSelf: false });
    }
    if (receiveOwnMessages) {
      people.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
      const selfIndex = await choose('Qual dessas pessoas é a conta que você conectou? ', people.length);
      people[selfIndex].isSelf = true;
      for (const id of [socket.user?.id, socket.user?.lid].map(normalJid).filter(Boolean)) {
        if (!people[selfIndex].aliases.includes(id)) people[selfIndex].aliases.push(id);
      }
    }
    const config = { groupId: group.id, groupName: group.subject, receiveOwnMessages, people };
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    console.log(`\nConfigurado: ${group.subject}. Só ${people.map((p) => p.name).join(' e ')} podem registrar gastos.`);
    return config;
  } finally { rl.close(); }
}

async function loadDependencies() {
  try {
    const [baileys, qr, pino] = await Promise.all([
      import('@whiskeysockets/baileys'), import('qrcode-terminal'), import('pino'),
    ]);
    return { baileys, qr: qr.default, pino: pino.default };
  } catch (cause) {
    throw new Error('Não foi possível carregar as dependências. Use Node.js 24 LTS e execute o npm install indicado no guia.', { cause });
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode && !['configurar', '--verificar'].includes(mode)) {
    console.log('Uso: node bot.mjs configurar | node bot.mjs | node bot.mjs --verificar');
    process.exitCode = 1;
    return;
  }
  const { baileys, qr, pino } = await loadDependencies();
  if (mode === '--verificar') {
    const check = openDb(':memory:');
    check.close();
    console.log('Baileys, QR Code e SQLite carregados. Pronto para configurar; nenhuma conta foi conectada.');
    return;
  }
  mkdirSync(DATA_PATH, { recursive: true, mode: 0o700 });
  const gitIgnore = join(ROOT, '.gitignore');
  if (!existsSync(gitIgnore)) writeFileSync(gitIgnore, 'node_modules/\nsessao/\ndados/\nconfig.json\n');
  let config;
  try { config = loadConfig(); }
  catch (error) {
    if (mode !== 'configurar') throw error;
    console.log('A configuração anterior não pôde ser lida. Vamos configurar novamente; o banco será preservado.');
    config = null;
  }
  const { state, saveCreds } = await baileys.useMultiFileAuthState(join(ROOT, 'sessao'));
  const db = openDb(join(DATA_PATH, 'gastos.sqlite'));
  const groupCache = new Map();
  let socket;
  let stopping = false;
  let configureJob;
  let needsConfiguration = mode === 'configurar' || !config;
  let retryTimer;
  let attempts = 0;
  let queue = Promise.resolve();

  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    clearTimeout(retryTimer);
    socket?.end(new Error('Encerramento solicitado.'));
    await queue.catch(() => {});
    db.close();
    console.log('\nBot parado. Os gastos continuam salvos em dados/gastos.sqlite.');
    process.exit(code);
  }
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());

  async function handle(message) {
    if (!config || needsConfiguration || stopping || message.key?.remoteJid !== config.groupId) return;
    const textContent = baileys.extractMessageContent(message.message);
    const text = textContent?.conversation ?? textContent?.extendedTextMessage?.text;
    if (typeof text !== 'string' || text.startsWith(REPLY_PREFIX)) return;
    const person = resolveActor(config, message);
    if (!person) return;
    const seconds = Number(message.messageTimestamp);
    const instant = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
    let reply;
    try {
      reply = processText(db, {
        groupId: config.groupId, messageId: message.key.id, person, text, instant,
      });
    } catch (error) {
      console.error('Falha ao registrar ou consultar o banco:', error.message);
      return;
    }
    if (reply) {
      try { await socket.sendMessage(config.groupId, { text: reply }); }
      catch { console.error('O banco foi atualizado, mas a resposta não foi enviada. Confira com total mês; não repita o gasto sem conferir.'); }
    }
  }

  function connect() {
    if (stopping) return;
    const current = baileys.default({
      auth: state,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async () => undefined,
      cachedGroupMetadata: async (id) => groupCache.get(id),
    });
    socket = current;
    current.ev.on('creds.update', () => {
      void saveCreds().catch(() => console.error('Falha ao salvar a sessão. Verifique as permissões da pasta sessao.'));
    });
    current.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || current !== socket || stopping) return;
      queue = queue.then(async () => {
        for (const message of messages) await handle(message);
      }).catch((error) => console.error('Falha no processamento:', error.message));
    });
    current.ev.on('groups.update', (groups) => {
      for (const group of groups) groupCache.delete(group.id);
    });
    current.ev.on('group-participants.update', ({ id }) => groupCache.delete(id));
    current.ev.on('connection.update', ({ qr: code, connection, lastDisconnect }) => {
      if (stopping || current !== socket) return;
      if (code) {
        console.log('\nNo celular: WhatsApp > Aparelhos conectados > Conectar aparelho. Leia este QR Code:');
        qr.generate(code, { small: true });
      }
      if (connection === 'open') {
        attempts = 0;
        if (needsConfiguration && !configureJob) {
          configureJob = configure(current, config).then(async () => {
            console.log('Execute node bot.mjs para iniciar os registros.');
            await stop();
          }).catch(async (error) => {
            console.error('Falha na configuração:', error.message);
            await stop(1);
          });
        } else if (!needsConfiguration) {
          console.log(`Bot conectado. Grupo: ${config.groupName}. Ctrl+C para parar.`);
          void current.groupMetadata(config.groupId).then((data) => groupCache.set(config.groupId, data))
            .catch(() => console.error('Não foi possível consultar o grupo. Verifique se a conta ainda participa dele.'));
        }
      }
      if (connection === 'close') {
        const status = lastDisconnect?.error?.output?.statusCode;
        if ([baileys.DisconnectReason.loggedOut, baileys.DisconnectReason.connectionReplaced, baileys.DisconnectReason.forbidden,
          baileys.DisconnectReason.badSession, baileys.DisconnectReason.multideviceMismatch].includes(status)) {
          console.error(`Sessão interrompida (código ${status}). Não execute duas cópias do bot. Consulte o guia para reconectar.`);
          void stop(1);
          return;
        }
        clearTimeout(retryTimer);
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5));
        console.log(`Conexão caiu. Nova tentativa em ${delay / 1000}s.`);
        retryTimer = setTimeout(connect, delay);
      }
    });
  }
  connect();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
