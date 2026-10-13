// Test-only in-memory preview. Never reads config.json, dados/ or sessao/.
import { readFileSync } from 'node:fs';
import { openDb, processText } from '../bot.mjs';
import { createDashboard } from '../dashboard.mjs';

const config = {
  groupId: 'preview-test@g.us', groupName: 'Prévia · dados de teste',
  people: [{ id: 'fixture-pessoa-a', name: 'Pessoa A' }, { id: 'fixture-pessoa-b', name: 'Pessoa B' }],
};
const db = openDb(':memory:');
let sequence = 0;
const add = (person, text, day) => processText(db, {
  groupId: config.groupId, messageId: `test-${++sequence}`,
  person: config.people[person], text, instant: new Date(`2026-10-${String(day).padStart(2, '0')}T15:00:00Z`),
});
for (const [person, text, day] of [
  [0, 'salario 3000', 1], [1, 'salario 2600', 1],
  [0, 'cartao 850,90', 1], [1, 'cartao 0', 1],
  [0, 'mercado 217,87', 2], [1, 'farmácia 48,90', 3],
  [0, 'almoço 35,50', 4], [1, 'mercado 128,40', 5],
  [0, 'transporte 42', 7], [1, 'livros 69,90', 9],
  [0, 'reserva emergência 200', 10], [1, 'aporte 150', 11],
  [0, 'reserva antiga 90', 12],
]) add(person, text, day);
// A historical misclassification to exercise an explicit type correction.
db.prepare("UPDATE expenses SET kind = 'expense' WHERE description = 'Reserva antiga'").run();
for (const [scope, cap, goal] of [['all', 220000, 80000], ['fixture-pessoa-a', 120000, 50000], ['fixture-pessoa-b', 100000, 30000]]) {
  db.prepare('INSERT INTO monthly_goals VALUES (?, ?, ?, ?, ?, ?)')
    .run(config.groupId, '2026-10', scope, cap, goal, new Date().toISOString());
}
const server = createDashboard({ db, getConfig: () => config, html: readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8') });
// Explicit test-only teardown avoids leaving a child server behind on Windows.
// This route is not part of dashboard.mjs and never opens the real database.
const dashboardHandler = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (request, response) => {
  if (request.method === 'POST' && request.url === '/__test/shutdown' && request.headers['x-test-preview'] === 'memory-only') {
    response.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' });
    response.end('Test preview stopped');
    server.close(() => { db.close(); process.exit(); });
    return;
  }
  void dashboardHandler(request, response);
});
server.listen(3219, '127.0.0.1', () => console.log('Prévia TESTE em http://127.0.0.1:3219 (SQLite em memória)'));
const stop = () => server.close(() => { db.close(); process.exit(); });
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
