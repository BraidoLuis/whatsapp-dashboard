// The interface works without Motion; animations never gate data or actions.
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const token = document.querySelector('meta[name="gastos-token"]').content;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const iconPaths = {
  trend: '<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1a8 8 0 0 1 13.1 3M4.8 14.9a8 8 0 0 0 13.1 3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 12h6v5h-6z"/>',
  income: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  card: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20M6 15h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  edit: '<path d="m16 3 5 5L8 21H3v-5zM14 5l5 5"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V7m5 9v-8"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  download: '<path d="M21 15v6H3v-6M12 3v12m-5-5 5 5 5-5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = iconPaths[name] || iconPaths.info; // Static, trusted paths only.
  return svg;
}
function el(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function setText(id, text) { $(id).textContent = text; }
function currency(cents) { return cents === null || cents === undefined ? '—' : money.format(cents / 100); }
function inputMoney(cents) { return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','); }
function monthLabel(month) { return monthFormatter.format(new Date(`${month}-01T12:00:00Z`)); }
function dateLabel(date) { return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`; }
function selectedName() { return state.scope === 'all' ? 'Casal' : state.participants.find((person) => person.id === state.scope)?.name || 'Pessoa'; }
function parseMoney(input, { optional = false, zero = true } = {}) {
  let value = input.trim();
  if (!value && optional) return null;
  if (value.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/u.test(value)) throw new Error('Use um valor como 107,87 ou 1.234,56.');
    value = value.replaceAll('.', '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/u.test(value)) {
    value = value.replaceAll('.', '');
  } else if (!/^\d+(?:\.\d{1,2})?$/u.test(value)) throw new Error('Use um valor como 107,87 ou 1.234,56.');
  const [units, fraction = ''] = value.split('.');
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000_000 || cents < (zero ? 0 : 1)) throw new Error(zero ? 'Informe um valor de zero a R$ 10 bilhões.' : 'Informe um valor maior que zero e de até R$ 10 bilhões.');
  return cents;
}

let state = null;
let requestId = 0;
let controller;
let visibleRecords = 20;
let showAllDescriptions = false;
let editingRecord = null;
let removal = null;
let monthlyContext = null;
let goalsContext = null;
let motionAnimate;
let toastTimer;
let backgroundRequest = null;
let allowAnimation = true;
const animations = new Set();
function stopAnimations() {
  for (const job of animations) { try { job.control.stop(); } catch {} job.finish(); }
  animations.clear();
}
function animate(subject, frames, options, finish = () => {}) {
  if (!motionAnimate || reducedMotion.matches || !allowAnimation) { finish(); return; }
  try {
    const control = motionAnimate(subject, frames, { duration: 0.25, ease: 'easeOut', ...options });
    const job = { control, finish }; animations.add(job);
    Promise.resolve(control).then(() => { finish(); animations.delete(job); }, () => { finish(); animations.delete(job); });
  } catch { finish(); }
}
function entrance(node, delay = 0) {
  animate(node, { opacity: [0.55, 1], transform: ['translateY(7px)', 'translateY(0px)'] }, { delay }, () => { node.style.opacity = ''; node.style.transform = ''; });
}
function setBar(node, ratio) {
  const scale = Math.max(0, Math.min(1, ratio));
  node.style.transform = `scaleX(${scale})`;
  animate(node, { transform: ['scaleX(0)', `scaleX(${scale})`] }, { duration: 0.4 }, () => { node.style.transform = `scaleX(${scale})`; });
}
document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'loading';
import('/assets/motion.js').then((module) => {
  if (typeof module.animate !== 'function') throw new Error('Motion indisponível');
  motionAnimate = module.animate;
  document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'ready';
  if (state && !$('data-region').hidden) document.querySelectorAll('.animate-card').forEach((card, index) => entrance(card, Math.min(index * 0.015, 0.1)));
}).catch(() => { document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'fallback'; });
reducedMotion.addEventListener('change', () => {
  stopAnimations();
  document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : motionAnimate ? 'ready' : 'fallback';
});
document.querySelectorAll('[data-icon]').forEach((node) => node.replaceChildren(icon(node.dataset.icon)));

async function api(path, body, signal) {
  let response;
  try {
    response = await fetch(path, body === undefined ? { signal, cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gastos-Token': token }, body: JSON.stringify(body), signal, cache: 'no-store' });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar à dashboard. Confira se o serviço está ativo e tente novamente.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('A dashboard retornou uma resposta inválida. Tente novamente.'); }
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
function setLoading(loading) {
  document.body.classList.toggle('is-loading', loading);
  $('loading-state').hidden = !loading;
  $('data-region').setAttribute('aria-busy', String(loading));
  $('new-record').disabled = loading || !state;
  $('refresh').disabled = loading;
  $('retry').disabled = loading;
}
async function loadState() {
  const month = $('month').value; const scope = $('scope').value;
  if (!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    ++requestId; controller?.abort(); backgroundRequest = null; stopAnimations(); state = null;
    $('data-region').hidden = true; $('records').replaceChildren(); $('error-banner').hidden = false;
    setText('error-message', 'Escolha um mês entre janeiro de 1900 e dezembro de 2199.');
    setText('updated', 'Escolha um mês válido');
    document.documentElement.dataset.state = 'error'; document.documentElement.dataset.backgroundRefresh = 'idle';
    updateMonthButtons(); setLoading(false); $('month').reportValidity(); return false;
  }
  const current = ++requestId;
  controller?.abort(); controller = new AbortController();
  backgroundRequest = null;
  document.documentElement.dataset.backgroundRefresh = 'idle';
  stopAnimations();
  // Clear the displayed snapshot before requesting a different month/person.
  // An error can never leave old totals under new filter labels.
  state = null;
  $('data-region').hidden = true;
  $('error-banner').hidden = true;
  $('records').replaceChildren();
  setText('updated', 'Carregando…');
  setLoading(true);
  updateMonthButtons();
  try {
    const fresh = await api(`/api/state?${new URLSearchParams({ month, scope })}`, undefined, controller.signal);
    if (current !== requestId) return false;
    if (fresh.month !== month || fresh.scope !== scope) throw new Error('Os dados recebidos não correspondem aos filtros selecionados. Atualize novamente.');
    state = fresh;
    $('data-region').hidden = false;
    render();
    document.documentElement.dataset.state = 'ready';
    document.querySelectorAll('.animate-card').forEach((card, index) => entrance(card, Math.min(index * 0.015, 0.1)));
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || current !== requestId) return false;
    state = null;
    $('data-region').hidden = true;
    $('error-banner').hidden = false;
    setText('error-message', error.message);
    setText('updated', 'Atualização indisponível');
    document.documentElement.dataset.state = 'error';
    return false;
  } finally { if (current === requestId) setLoading(false); }
}
function canRefreshQuietly() {
  return state && !document.hidden && !document.body.classList.contains('is-loading')
    && !document.querySelector('dialog[open]') && !document.querySelector('form[data-busy="true"]');
}
function snapshotKey(snapshot) {
  const { updatedAt, ...values } = snapshot;
  return JSON.stringify(values);
}
async function refreshQuietly() {
  if (!canRefreshQuietly() || backgroundRequest) return;
  const month = $('month').value; const scope = $('scope').value;
  if (state.month !== month || state.scope !== scope) return;
  const current = ++requestId;
  controller?.abort(); controller = new AbortController();
  backgroundRequest = current;
  document.documentElement.dataset.backgroundRefresh = 'pending';
  try {
    const fresh = await api(`/api/state?${new URLSearchParams({ month, scope })}`, undefined, controller.signal);
    if (current !== requestId || !canRefreshQuietly() || $('month').value !== month || $('scope').value !== scope) return;
    if (fresh.month !== month || fresh.scope !== scope) throw new Error('Os dados recebidos não correspondem aos filtros selecionados. Atualize novamente.');
    const changed = snapshotKey(state) !== snapshotKey(fresh);
    state = fresh;
    if (changed) {
      // WhatsApp updates do not replay entrance/progress animations or hide the snapshot.
      allowAnimation = false;
      try { render(); } finally { allowAnimation = true; }
    } else updateTimestamp();
    $('error-banner').hidden = true;
  } catch (error) {
    if (error.name === 'AbortError' || current !== requestId || !canRefreshQuietly()) return;
    // These values still belong to the displayed filters; retain them with an explicit refresh error.
    $('error-banner').hidden = false;
    setText('error-message', `${error.message} Os valores exibidos correspondem à última atualização destes filtros.`);
    setText('updated', 'Atualização automática indisponível');
  } finally {
    if (backgroundRequest === current) {
      backgroundRequest = null;
      document.documentElement.dataset.backgroundRefresh = 'idle';
    }
  }
}
function updateMonthButtons() {
  const valid = /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test($('month').value);
  $('previous-month').disabled = !valid || $('month').value === '1900-01';
  $('next-month').disabled = !valid || $('month').value === '2199-12';
}
function moveMonth(delta) {
  const [year, month] = $('month').value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  if (value < '1900-01' || value > '2199-12') return;
  $('month').value = value; resetHistory(); loadState();
}
function resetHistory() { visibleRecords = 20; showAllDescriptions = false; }
function informedNote(count, total, feminine = false) {
  if (!count) return feminine ? 'Não informada neste mês' : 'Não informado neste mês';
  if (total === 1) return feminine ? 'Informada neste mês' : 'Informado neste mês';
  return `${count} de ${total} pessoas · ${count < total ? 'valor parcial' : 'total do casal'}`;
}
function render() {
  const { summary, goals } = state;
  setText('group-name', state.groupName);
  renderScopes();
  for (const [id, amount] of [['salary-value', summary.salary], ['expenses-value', summary.expenses], ['card-value', summary.card], ['investments-value', summary.investments], ['balance-value', summary.estimatedBalance]]) {
    setText(id, currency(amount));
    $(id).setAttribute('aria-label', currency(amount));
    // Keep the final amount readable throughout its brief reveal.
    entrance($(id));
  }
  setText('salary-note', informedNote(summary.salaryInformedCount, summary.participantCount));
  setText('card-note', informedNote(summary.cardInformedCount, summary.participantCount, true));
  setText('expenses-note', `${state.records.filter((record) => record.kind === 'expense').length} gastos neste mês`);
  setText('investments-note', `${state.records.filter((record) => record.kind === 'investment').length} aportes · inclui reserva`);
  setText('balance-status', summary.balancePartial ? 'Resultado parcial' : summary.salary === null ? 'Salário não informado' : 'Mês selecionado');
  setText('balance-note', summary.salary === null ? 'Informe o salário deste mês para calcular.' : summary.balancePartial ? 'Parcial: salário informado para apenas uma pessoa. Os gastos e aportes de ambas estão incluídos.' : 'Calculado com os salários, gastos e aportes registrados.');
  setText('chart-month', monthLabel(state.month));
  setText('chart-subtitle', `Gastos acumulados · ${selectedName()}`);
  setText('goals-subtitle', `Planejamento de ${selectedName()} · ${monthLabel(state.month)}`);
  setText('goals-form-context', `${selectedName()} · ${monthLabel(state.month)}. As metas valem apenas para esta visão e este mês.`);
  renderGoal('spending', summary.expenses, goals.spendingCap);
  renderGoal('investment', summary.investments, goals.investmentGoal);
  setText('people-title', state.scope === 'all' ? 'O mês de vocês' : 'Seu mês em números');
  setText('people-subtitle', state.scope === 'all' ? 'Salário, gastos e aportes por pessoa' : `Somente os valores de ${selectedName()}`);
  setText('history-subtitle', `Gastos e aportes · ${selectedName()} · ${monthLabel(state.month)}`);
  setText('record-count', `${summary.count} ${summary.count === 1 ? 'lançamento' : 'lançamentos'}`);
  updateTimestamp();
  setText('footer-scope', `${selectedName()} · ${monthLabel(state.month)}`);
  renderChart(); renderBreakdown(); renderPeople(); renderMonthly(); renderRecords();
}
function updateTimestamp() {
  setText('updated', `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(state.updatedAt))}`);
}
function renderScopes() {
  const tabs = $('scope-tabs');
  const active = document.activeElement?.dataset.scope;
  tabs.replaceChildren();
  for (const person of [{ id: 'all', name: 'Casal' }, ...state.participants]) {
    const button = el('button', '', person.name);
    button.type = 'button'; button.dataset.scope = person.id;
    button.setAttribute('aria-pressed', String(state.scope === person.id));
    tabs.append(button);
  }
  if (active) [...tabs.children].find((button) => button.dataset.scope === active)?.focus({ preventScroll: true });
}
function renderGoal(prefix, current, target) {
  const spending = prefix === 'spending';
  setText(`${prefix}-current`, currency(current));
  setText(`${prefix}-limit`, target === null ? (spending ? 'sem limite definido' : 'sem meta definida') : `/ ${currency(target)}`);
  const ratio = target === null ? 0 : target === 0 ? (current > 0 ? 1 : 0) : current / target;
  const percent = target === null ? '—' : target === 0 ? (current > 0 ? 'Acima de zero' : '0%') : `${Math.round(ratio * 100)}%`;
  setText(`${prefix}-percent`, percent);
  const progress = $(`${prefix}-progress`);
  progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', String(Math.round(Math.min(ratio, 1) * 100)));
  progress.setAttribute('aria-valuetext', target === null ? 'Meta não definida' : `${currency(current)} de ${currency(target)}`);
  $(`${prefix}-bar`).classList.toggle('over-budget', spending && target !== null && current > target);
  setBar($(`${prefix}-bar`), ratio);
  const note = target === null ? (spending ? 'Defina um limite para acompanhar seus gastos.' : 'Defina uma meta para acompanhar seus aportes.') : spending ? (current > target ? `${currency(current - target)} acima do limite definido.` : `${currency(target - current)} disponíveis dentro do limite.`) : current >= target ? 'Meta de aportes alcançada.' : `Faltam ${currency(target - current)} para a meta.`;
  setText(`${prefix}-goal-note`, note);
}
function empty(title, description, image = 'list') {
  const node = el('div', 'empty'); node.append(icon(image), el('strong', '', title), el('p', '', description)); return node;
}
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderChart() {
  const container = $('chart'); container.replaceChildren();
  if (!state.summary.expenses) { container.append(empty('Nenhum gasto neste mês', 'Os gastos registrados aparecerão aqui, dia a dia.', 'chart')); return; }
  // Match the SVG viewBox to CSS pixels so mobile axis text remains 11px instead of shrinking.
  const width = Math.max(250, container.clientWidth); const height = Math.max(180, container.clientHeight);
  const left = 50; const right = 15; const top = 14; const bottom = 33;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  let total = 0; const totals = state.days.map((day) => { total += day.expenses; return total; });
  const max = Math.max(total, 1);
  const x = (index) => left + index / Math.max(1, totals.length - 1) * plotWidth;
  const y = (amount) => top + plotHeight - amount / max * plotHeight;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'trend-title trend-description', preserveAspectRatio: 'xMidYMid meet' });
  svg.append(svgNode('title', { id: 'trend-title' }, `Evolução dos gastos de ${selectedName()} em ${monthLabel(state.month)}`), svgNode('desc', { id: 'trend-description' }, `Gastos acumulados de ${currency(total)}. ${state.days.filter((day) => day.expenses > 0).map((day) => `Dia ${day.day}: ${currency(day.expenses)}`).join('; ')}.`));
  for (let index = 0; index <= 3; index++) {
    const amount = max * index / 3;
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(amount), y2: y(amount), class: 'gridline', 'stroke-width': 1 }), svgNode('text', { x: left - 9, y: y(amount) + 4, 'text-anchor': 'end' }, new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(amount / 100)));
  }
  const ticks = [...new Set([0, 6, 13, 20, totals.length - 1])];
  for (const index of ticks) svg.append(svgNode('text', { x: x(index), y: height - 9, 'text-anchor': 'middle' }, index + 1));
  const points = totals.map((amount, index) => `${x(index)},${y(amount)}`).join(' ');
  svg.append(svgNode('polygon', { points: `${left},${y(0)} ${points} ${x(totals.length - 1)},${y(0)}`, fill: 'var(--chart-line)', opacity: 0.08 }), svgNode('polyline', { points, fill: 'none', class: 'trendline', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  state.days.forEach((day, index) => {
    if (!day.expenses) return;
    const point = svgNode('circle', { cx: x(index), cy: y(totals[index]), r: 4, class: 'trendpoint', 'stroke-width': 2 });
    point.append(svgNode('title', {}, `Dia ${day.day}: ${currency(day.expenses)}; acumulado ${currency(totals[index])}`)); svg.append(point);
  });
  container.append(svg);
}
function renderBreakdown() {
  const container = $('breakdown'); container.replaceChildren();
  const categories = showAllDescriptions ? state.categories : state.categories.slice(0, 5);
  $('more-descriptions').hidden = state.categories.length <= 5;
  setText('more-descriptions', showAllDescriptions ? 'Mostrar menos descrições' : `Ver todas as ${state.categories.length} descrições`);
  if (!categories.length) { container.append(empty('Sem gastos para distribuir', 'As descrições dos seus gastos serão agrupadas aqui.', 'chart')); return; }
  for (const category of categories) {
    const ratio = category.cents / state.summary.expenses;
    const row = el('div', 'break-row'); const label = el('div', 'break-label');
    const value = el('strong', '', currency(category.cents)); value.append(el('small', '', `${Math.round(ratio * 100)}%`));
    label.append(el('span', '', category.label), value);
    const bar = el('div', 'bar'); const fill = el('div', 'bar-fill'); bar.append(fill); row.append(label, bar); container.append(row); setBar(fill, ratio);
  }
}
function initials(name) { return name.trim().split(/\s+/u).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR'); }
function renderPeople() {
  const container = $('people'); container.replaceChildren();
  const max = Math.max(1, ...state.people.flatMap((person) => [person.salary || 0, person.expenses, person.investments]));
  for (const person of state.people) {
    const node = el('article', 'person'); node.dataset.personId = person.id;
    const title = el('div', 'person-title'); title.append(el('span', 'avatar', initials(person.name)), el('strong', '', person.name));
    const metrics = el('div', 'person-stats');
    for (const [kind, label, amount] of [['salary', 'Salário', person.salary], ['expense', 'Gastos', person.expenses], ['investment', 'Aportes', person.investments]]) {
      const metric = el('div', `person-metric ${kind}`); const bar = el('div', 'bar'); const fill = el('div', 'bar-fill');
      bar.append(fill); metric.append(el('span', '', label), el('strong', '', currency(amount)), bar); metrics.append(metric); setBar(fill, (amount || 0) / max);
    }
    node.append(title, metrics); container.append(node);
  }
}
function actionButton(iconName, label, data) {
  const button = el('button', 'icon-btn'); button.type = 'button'; button.setAttribute('aria-label', label); button.title = label; button.append(icon(iconName));
  for (const [key, value] of Object.entries(data)) button.dataset[key] = value;
  return button;
}
function renderMonthly() {
  const container = $('monthly-values'); container.replaceChildren();
  for (const person of state.people) {
    // Older actors may appear in history; monthly edits are restricted to the configured participants.
    if (!state.participants.some((participant) => participant.id === person.id)) continue;
    const node = el('div', 'monthly-person'); node.dataset.personId = person.id; node.append(el('strong', '', person.name));
    for (const [kind, label] of [['salary', 'Salário'], ['card', 'Fatura do cartão']]) {
      const row = el('div', 'monthly-row'); row.dataset.monthlyKind = kind;
      const amount = el('strong', person[kind] === null ? 'missing' : '', currency(person[kind]));
      if (person[kind] === null) amount.setAttribute('aria-label', 'Não informado');
      row.append(el('span', '', label), amount, actionButton('edit', `${person[kind] === null ? 'Informar' : 'Editar'} ${kind === 'salary' ? 'salário' : 'fatura'} de ${person.name}`, { monthlyKind: kind, personId: person.id }));
      container.append(node); node.append(row);
    }
  }
}
function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR'); }
function filteredRecords() {
  if (!state) return [];
  const search = normalize($('search').value.trim()); const kind = $('kind-filter').value;
  return state.records.filter((record) => (kind === 'all' || record.kind === kind) && (!search || normalize(`${record.description} ${record.personName}`).includes(search)));
}
function renderRecords() {
  const records = filteredRecords(); const shown = records.slice(0, visibleRecords); const container = $('records'); container.replaceChildren();
  $('more-records').hidden = shown.length >= records.length;
  $('export-csv').disabled = !records.length;
  setText('table-count', `${shown.length} de ${records.length} ${records.length === 1 ? 'lançamento' : 'lançamentos'}${records.length !== state.records.length ? ' encontrados' : ''}`);
  if (!records.length) { container.append(empty(state.records.length ? 'Nenhum resultado encontrado' : 'Nenhum lançamento neste mês', state.records.length ? 'Ajuste a busca ou o tipo de lançamento para encontrar seus registros.' : 'Registre um gasto ou aporte pelo WhatsApp ou em “Lançar valor”.')); return; }
  for (const record of shown) {
    const investment = record.kind === 'investment'; const node = el('article', `record ${investment ? 'investment' : ''}`); node.dataset.recordId = record.id;
    const title = el('div', 'record-title'); const mark = el('span', 'record-icon'); mark.append(icon(investment ? 'trend' : 'wallet'));
    const description = el('div'); description.append(el('strong', '', record.description), el('small', '', record.personName)); title.append(mark, description);
    const actions = el('div', 'actions'); actions.append(actionButton('edit', `Editar ${record.description}`, { editRecord: record.id }), actionButton('trash', `Remover ${record.description}`, { removeRecord: record.id })); actions.lastChild.classList.add('danger');
    node.append(title, el('span', 'record-date', dateLabel(record.date)), el('span', `kind ${investment ? 'investment' : ''}`, investment ? 'Aporte' : 'Gasto'), el('strong', 'record-money', currency(record.cents)), actions); container.append(node);
  }
}
function formError(form, message = '') { const node = form.querySelector('.form-error'); node.textContent = message; node.hidden = !message; }
function openDialog(id) {
  const dialog = $(id); formError(dialog.querySelector('form')); dialog.showModal(); entrance(dialog);
}
function closeDialog(id) { $(id).close(); }
function personOptions(select, preferred, allParticipants = false) {
  select.replaceChildren();
  const people = state.participants.filter((person) => allParticipants || state.scope === 'all' || person.id === state.scope);
  for (const person of people) { const option = el('option', '', person.name); option.value = person.id; select.append(option); }
  if (people.some((person) => person.id === preferred)) select.value = preferred;
}
function openRecord(record = null) {
  if (!state) return;
  editingRecord = record ? { ...record } : null;
  $('record-form').reset();
  setText('record-title', record ? 'Editar lançamento' : 'Lançar valor');
  personOptions($('record-person'), record?.personId || state.scope, Boolean(record));
  if (record && ![...$('record-person').options].some((option) => option.value === record.personId)) {
    const option = el('option', '', record.personName); option.value = record.personId; $('record-person').append(option); $('record-person').value = record.personId;
  }
  $('record-kind').value = record?.kind || 'expense';
  $('record-description').value = record?.description || '';
  $('record-value').value = record ? inputMoney(record.cents) : '';
  $('record-date').value = record?.date || (state.today.slice(0, 7) === state.month ? state.today : `${state.month}-01`);
  openDialog('record-dialog');
}
function monthlyValue(personId, kind) { return state?.monthlyValues.find((value) => value.personId === personId && value.kind === kind); }
function syncMonthlyForm() {
  if (!state) return;
  const value = monthlyValue($('monthly-person').value, $('monthly-kind').value);
  const salary = $('monthly-kind').value === 'salary';
  setText('monthly-form-title', salary ? 'Salário do mês' : 'Fatura do cartão');
  setText('monthly-form-context', `${monthLabel(monthlyContext.month)} · um valor por pessoa`);
  $('monthly-amount').value = value ? inputMoney(value.cents) : '';
  setText('monthly-existing', value ? `Valor atual: ${currency(value.cents)}. Salvar substitui este valor.` : 'Ainda não informado neste mês. Zero é um valor válido.');
  setText('monthly-form-hint', salary ? 'O salário é uma receita deste mês. Ele não será copiado para os meses seguintes.' : 'A fatura é apenas um indicador separado. Não soma aos gastos, não reduz o saldo novamente e não indica pagamento.');
  $('remove-monthly').hidden = !value;
  formError($('monthly-form'));
}
function openMonthly(kind, personId) {
  if (!state) return;
  monthlyContext = { month: state.month };
  personOptions($('monthly-person'), personId || state.scope);
  $('monthly-kind').value = kind;
  syncMonthlyForm(); openDialog('monthly-dialog');
}
function openRemoval(record) {
  removal = { type: 'record', id: record.id };
  setText('remove-title', 'Remover lançamento?');
  setText('remove-context', `${record.description} · ${record.personName} · ${currency(record.cents)} · ${dateLabel(record.date)}. O registro sairá dos totais e do histórico.`);
  openDialog('remove-dialog');
}
function toast(message) {
  clearTimeout(toastTimer); setText('toast', message); $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000);
}
async function submit(form, task) {
  if (form.dataset.busy === 'true') return;
  formError(form); form.dataset.busy = 'true'; form.setAttribute('aria-busy', 'true');
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach((button) => { button.disabled = true; });
  try { await task(); } catch (error) { formError(form, error.message); }
  finally { form.dataset.busy = 'false'; form.setAttribute('aria-busy', 'false'); buttons.forEach((button) => { button.disabled = false; }); }
}
async function saved(dialog, message) {
  closeDialog(dialog);
  const refreshed = await loadState();
  toast(refreshed ? message : `${message} A consulta falhou; tente atualizar os dados.`);
}
function csvCell(value) {
  let text = String(value ?? '');
  // Text from descriptions/names must not become a spreadsheet formula.
  if (/^[\s]*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadCsv(rows, name) {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportRecords() {
  if (!state) return;
  const rows = [['Data', 'Pessoa', 'Descrição', 'Tipo', 'Valor (R$)', 'Centavos', 'ID'], ...filteredRecords().map((record) => [record.date, record.personName, record.description, record.kind === 'investment' ? 'Aporte' : 'Gasto', inputMoney(record.cents), record.cents, record.id])];
  downloadCsv(rows, `lancamentos-${state.month}-${state.scope === 'all' ? 'casal' : 'individual'}.csv`);
  toast('CSV dos lançamentos filtrados exportado.');
}
function exportMonthly() {
  if (!state) return;
  const rows = [['Mês', 'Pessoa', 'Tipo', 'Informado', 'Valor (R$)', 'Centavos', 'Pessoa ID']];
  for (const person of state.people.filter((item) => state.participants.some((participant) => participant.id === item.id))) {
    for (const [kind, label] of [['salary', 'Salário'], ['card', 'Fatura']]) rows.push([state.month, person.name, label, person[kind] === null ? 'Não' : 'Sim', inputMoney(person[kind]), person[kind] ?? '', person.id]);
  }
  downloadCsv(rows, `valores-mensais-${state.month}-${state.scope === 'all' ? 'casal' : 'individual'}.csv`);
  toast('CSV dos salários e faturas exportado.');
}

$('scope-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-scope]');
  if (!button || button.dataset.scope === $('scope').value) return;
  $('scope').value = button.dataset.scope;
  $('scope-tabs').querySelectorAll('button').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
  resetHistory(); loadState();
});
$('month').addEventListener('change', () => { resetHistory(); loadState(); });
$('previous-month').addEventListener('click', () => moveMonth(-1));
$('next-month').addEventListener('click', () => moveMonth(1));
$('refresh').addEventListener('click', loadState); $('retry').addEventListener('click', loadState);
$('new-record').addEventListener('click', () => openRecord());
$('search').addEventListener('input', () => { visibleRecords = 20; if (state) renderRecords(); });
$('kind-filter').addEventListener('change', () => { visibleRecords = 20; if (state) renderRecords(); });
$('more-records').addEventListener('click', () => { visibleRecords += 20; if (state) renderRecords(); });
$('more-descriptions').addEventListener('click', () => { showAllDescriptions = !showAllDescriptions; if (state) renderBreakdown(); });
$('export-csv').addEventListener('click', exportRecords);
$('export-monthly-csv').addEventListener('click', exportMonthly);
document.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close]'); if (close && !close.disabled) closeDialog(close.dataset.close);
  const monthly = event.target.closest('button[data-monthly-kind]'); if (monthly) openMonthly(monthly.dataset.monthlyKind, monthly.dataset.personId);
  const edit = event.target.closest('[data-edit-record]'); if (edit && state) openRecord(state.records.find((record) => record.id === Number(edit.dataset.editRecord)));
  const remove = event.target.closest('[data-remove-record]'); if (remove && state) openRemoval(state.records.find((record) => record.id === Number(remove.dataset.removeRecord)));
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('cancel', (event) => { if (dialog.querySelector('form').dataset.busy === 'true') event.preventDefault(); });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || dialog.querySelector('form').dataset.busy === 'true') return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
$('record-form').addEventListener('submit', (event) => {
  event.preventDefault(); submit(event.currentTarget, async () => {
    const description = $('record-description').value.trim();
    if (!description || description.length > 120 || /[\r\n]/u.test(description)) throw new Error('Informe uma descrição de até 120 caracteres.');
    await api('/api/records', { id: editingRecord?.id ?? null, personId: $('record-person').value, kind: $('record-kind').value, description, cents: parseMoney($('record-value').value, { zero: false }), date: $('record-date').value });
    await saved('record-dialog', editingRecord ? 'Lançamento atualizado.' : 'Lançamento registrado.');
  });
});
$('edit-goals').addEventListener('click', () => {
  if (!state) return;
  goalsContext = { month: state.month, scope: state.scope };
  $('spending-input').value = inputMoney(state.goals.spendingCap); $('investment-input').value = inputMoney(state.goals.investmentGoal); openDialog('goals-dialog');
});
$('goals-form').addEventListener('submit', (event) => {
  event.preventDefault(); submit(event.currentTarget, async () => {
    await api('/api/goals', { ...goalsContext, spendingCap: parseMoney($('spending-input').value, { optional: true }), investmentGoal: parseMoney($('investment-input').value, { optional: true }) });
    await saved('goals-dialog', 'Metas atualizadas para esta visão e este mês.');
  });
});
$('monthly-person').addEventListener('change', syncMonthlyForm); $('monthly-kind').addEventListener('change', syncMonthlyForm);
$('monthly-form').addEventListener('submit', (event) => {
  event.preventDefault(); submit(event.currentTarget, async () => {
    await api('/api/monthly-values', { month: monthlyContext.month, personId: $('monthly-person').value, kind: $('monthly-kind').value, cents: parseMoney($('monthly-amount').value) });
    await saved('monthly-dialog', 'Valor mensal atualizado, sem acumular.');
  });
});
$('remove-monthly').addEventListener('click', () => {
  const personId = $('monthly-person').value; const kind = $('monthly-kind').value;
  const value = monthlyValue(personId, kind); if (!value) return;
  removal = { type: 'monthly', month: monthlyContext.month, personId, kind };
  setText('remove-title', `Remover ${kind === 'salary' ? 'salário' : 'fatura'} informado?`);
  setText('remove-context', `${value.personName} · ${monthLabel(monthlyContext.month)} · ${currency(value.cents)}. O valor passará a “não informado”. Os lançamentos de gastos e aportes serão mantidos.`);
  openDialog('remove-dialog');
});
$('remove-form').addEventListener('submit', (event) => {
  event.preventDefault(); submit(event.currentTarget, async () => {
    if (!removal) return;
    if (removal.type === 'record') await api('/api/records/remove', { id: removal.id });
    else await api('/api/monthly-values/remove', { month: removal.month, personId: removal.personId, kind: removal.kind });
    if (removal.type === 'monthly') closeDialog('monthly-dialog');
    await saved('remove-dialog', removal.type === 'record' ? 'Lançamento removido.' : 'Valor mensal removido.'); removal = null;
  });
});
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark'; $('theme-toggle').setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro'); $('theme-toggle').replaceChildren(icon(dark ? 'sun' : 'moon'));
}
let theme;
try { theme = localStorage.getItem('gastos-theme'); } catch {}
applyTheme(theme === 'dark' || theme === 'light' ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('theme-toggle').addEventListener('click', () => {
  const selected = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(selected);
  try { localStorage.setItem('gastos-theme', selected); } catch {}
});
document.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav a').forEach((item) => item.removeAttribute('aria-current')); link.setAttribute('aria-current', 'location');
}));
const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
$('month').value = `${todayParts.find((part) => part.type === 'year').value}-${todayParts.find((part) => part.type === 'month').value}`;
let chartResizeFrame;
let lastChartSize = '';
const chartResizeObserver = new ResizeObserver(([entry]) => {
  const size = `${Math.round(entry.contentRect.width)}:${Math.round(entry.contentRect.height)}`;
  if (size === lastChartSize) return;
  lastChartSize = size;
  cancelAnimationFrame(chartResizeFrame);
  chartResizeFrame = requestAnimationFrame(() => { if (state && !$('data-region').hidden) renderChart(); });
});
chartResizeObserver.observe($('chart'));
document.documentElement.dataset.backgroundRefresh = 'idle';
setInterval(refreshQuietly, 15_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQuietly(); });
loadState();
