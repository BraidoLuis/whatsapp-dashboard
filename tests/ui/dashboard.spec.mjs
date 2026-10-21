import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

const brl = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
async function navigate(page,screen) { await page.locator('[data-screen="'+screen+'"]').click(); }
async function selectMonth(page, month) {
  await page.locator('#month').fill(month);
  await page.locator('#month').dispatchEvent('change');
  await expect(page.locator('#data-region')).toBeVisible();
  await expect(page.locator('#data-region')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.locator('#chart-month').textContent()).not.toBe('');
}
async function load(page, month = '2026-10') {
  await page.goto('/');
  await expect(page.locator('#data-region')).toBeVisible();
  await selectMonth(page, month);
}
async function scope(page, id) {
  await page.locator(`#scope-tabs [data-scope="${id}"]`).click();
  await expect(page.locator(`#scope-tabs [data-scope="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#data-region')).toHaveAttribute('aria-busy', 'false');
}
async function currentState(page, month, person = 'all') {
  return page.evaluate(async ({ month, person }) => (await fetch('/api/state?' + new URLSearchParams({ month, scope: person }))).json(), { month, person });
}
async function createRecord(page, { description, kind = 'expense', cents = '107,87', date, person = 'fixture-pessoa-a' }) {
  await page.locator('#new-record').click();
  await expect(page.locator('#record-dialog')).toBeVisible();
  await page.locator('#record-kind').selectOption(kind);
  await page.locator('#record-person').selectOption(person);
  await page.locator('#record-description').fill(description);
  await page.locator('#record-value').fill(cents);
  await page.locator('#record-date').fill(date);
  await page.locator('#record-form button[type=submit]').click();
  await expect(page.locator('#record-dialog')).not.toBeVisible();
  await expect(page.locator('#data-region')).toHaveAttribute('aria-busy', 'false');
}
async function saveMonthly(page, kind, person, amount) {
  await navigate(page,"planning");
  await page.locator(`[data-monthly-kind="${kind}"][data-person-id="${person}"]`).first().click();
  await page.locator('#monthly-person').selectOption(person);
  await page.locator('#monthly-kind').selectOption(kind);
  await page.locator('#monthly-amount').fill(amount);
  await page.locator('#monthly-form button[type=submit]').click();
  await expect(page.locator('#monthly-dialog')).not.toBeVisible();
  await expect(page.locator('#data-region')).toHaveAttribute('aria-busy', 'false');
}

for (const width of [360, 390, 430, 1440]) {
  test(`layout, temas, controles e filtros em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
    const pageErrors = [];
    const urls = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => urls.push(request.url()));
    await load(page);
    await expect(page.locator('#expenses-value')).toHaveText(brl(63257));
    await expect(page.locator('#salary-value')).toHaveText(brl(560000));
    await expect(page.locator('#investments-value')).toHaveText(brl(35000));
    await expect(page.locator('#card-value')).toHaveText(brl(85090));
    await expect(page.locator('#balance-value')).toHaveText(brl(461743));
    await navigate(page,'analysis');
    await expect(page.locator('#chart svg')).toBeVisible();
    await expect(page.locator('#people .person')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'ready');
    await scope(page, 'fixture-pessoa-a');
    await expect(page.locator('#expenses-value')).toHaveText(brl(38537));
    await expect(page.locator('#investments-value')).toHaveText(brl(20000));
    await expect(page.locator('#people .person')).toHaveCount(1);
    await expect(page.locator('#people')).toContainText('Pessoa A');
    await expect(page.locator('#people')).not.toContainText('Pessoa B');
    await expect(page.locator('#records')).not.toContainText('Pessoa B');
    await expect(page.locator('#spending-limit')).toContainText(brl(120000));
    await scope(page, 'fixture-pessoa-b');
    await expect(page.locator('#expenses-value')).toHaveText(brl(24720));
    await expect(page.locator('#card-value')).toHaveText(brl(0));
    await expect(page.locator('#spending-limit')).toContainText(brl(100000));
    await expect(page.locator('#people')).not.toContainText('Pessoa A');
    await expect(page.locator('#breakdown')).not.toContainText('transporte');
    await scope(page, 'all');
    await page.locator('#new-record').click();
    await expect(page.locator('#record-dialog')).toBeVisible();
    await expect.poll(() => page.locator('#record-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#record-dialog [data-close]').first().click();
    // Motion's JS fallback can still be between frames when a screenshot is
    // taken. Freeze all motion for readable final-state visual review.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/preview-${width}-light.png`, fullPage: true, animations: 'disabled' });
    if (width === 390) {
      await page.screenshot({ path: 'artifacts/preview-mobile.png', animations: 'disabled' });
      await page.locator('#chart').screenshot({ path: 'artifacts/preview-chart-mobile.png', animations: 'disabled' });
      await scope(page, 'fixture-pessoa-a');
      await page.screenshot({ path: 'artifacts/preview-individual-390.png', fullPage: true, animations: 'disabled' });
      await scope(page, 'all');
    }
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/preview-${width}-dark.png`, fullPage: true, animations: 'disabled' });
    for (const theme of ['light','dark']) {
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme-toggle').click();
      for(const screen of ['summary','weekly','analysis','history','planning']) {
        await navigate(page,screen);
        if(screen==='weekly') { await page.locator('#week-date').fill('2026-10-01');await page.locator('#week-date').dispatchEvent('change');await expect(page.locator('#data-region')).toHaveAttribute('aria-busy','false'); }
        await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`artifacts/preview-${width}-${theme}-${screen}.png`,fullPage:true,animations:'disabled'});
      }
    }
    if(await page.locator('html').getAttribute('data-theme')!=='dark')await page.locator('#theme-toggle').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(pageErrors).toEqual([]);
    expect(urls.every((url) => url.startsWith('http://127.0.0.1:3219/'))).toBe(true);
  });
}

test('mensais distinguem ausência/zero, saldo parcial e fatura sem dupla contagem', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, '2025-04');
  await expect(page.locator('#salary-note')).toContainText('Não informado');
  await expect(page.locator('#card-note')).toContainText('Não informada');
  await expect(page.locator('#balance-value')).toHaveText('—');
  await saveMonthly(page, 'salary', 'fixture-pessoa-a', '1.000,00');
  await expect(page.locator('#salary-value')).toHaveText(brl(100000));
  await expect(page.locator('#balance-note')).toContainText(/parcial/i);
  await createRecord(page, { description: 'Despesa de teste mensal', cents: '110', date: '2025-04-02' });
  await createRecord(page, { description: 'Reserva de teste mensal', kind: 'investment', cents: '200', date: '2025-04-03' });
  await expect(page.locator('#balance-value')).toHaveText(brl(69000));
  await saveMonthly(page, 'card', 'fixture-pessoa-a', '850,90');
  await expect(page.locator('#balance-value')).toHaveText(brl(69000));
  await expect(page.locator('#expenses-value')).toHaveText(brl(11000));
  await navigate(page,'planning');
  await page.locator('.monthly-entry').filter({hasText:'850,90'}).locator('[data-edit-monthly]').click();
  await page.locator('#monthly-amount').fill('0');
  await page.locator('#monthly-form button[type=submit]').click();
  await expect(page.locator('#monthly-dialog')).not.toBeVisible();
  await expect(page.locator('#card-value')).toHaveText(brl(0));
  await saveMonthly(page, 'salary', 'fixture-pessoa-b', '0');
  await expect(page.locator('#balance-note')).not.toContainText(/parcial/i);
  let state = await currentState(page, '2025-04');
  expect(state.monthlyValues).toHaveLength(3);
  expect(state.summary.salaryInformedCount).toBe(2);
  await page.locator('.monthly-person[data-person-id="fixture-pessoa-b"] [data-edit-monthly]').click();
  await page.locator('#remove-monthly').click();
  await expect(page.locator('#remove-dialog')).toBeVisible();
  await page.locator('#remove-form button[type=submit]').click();
  await expect(page.locator('#remove-dialog')).not.toBeVisible();
  await expect(page.locator('#balance-note')).toContainText(/parcial/i);
  state = await currentState(page, '2025-04', 'fixture-pessoa-b');
  expect(state.summary.salary).toBeNull();
  expect(state.summary.estimatedBalance).toBeNull();
  await scope(page, 'fixture-pessoa-b');
  await expect(page.locator('#balance-value')).toHaveText('—');
  await selectMonth(page, '2025-03');
  await expect(page.locator('#salary-value')).toHaveText('—');
});

test('criação, correção de tipo, edição e exclusão de lançamento preservam os campos', async ({ page }) => {
  await load(page, '2025-05');
  await createRecord(page, { description: 'reserva emergência legada de teste', cents: '150,50', date: '2025-05-07' });
  const before = (await currentState(page, '2025-05')).records[0];
  await navigate(page,'history');
  const row = page.locator(`.record[data-record-id="${before.id}"]`);
  await row.locator('[data-edit-record]').click();
  await expect(page.locator('#record-value')).toHaveValue('150,50');
  await expect(page.locator('#record-date')).toHaveValue('2025-05-07');
  await page.locator('#record-kind').selectOption('investment');
  await page.locator('#record-form button[type=submit]').click();
  await expect(page.locator('#record-dialog')).not.toBeVisible();
  await scope(page, 'fixture-pessoa-a');
  await row.locator('[data-edit-record]').click();
  await expect(page.locator('#record-person option')).toHaveCount(2);
  await page.locator('#record-dialog [data-close]').first().click();
  await scope(page, 'all');
  await expect(page.locator('#investments-value')).toHaveText(brl(15050));
  const after = (await currentState(page, '2025-05')).records[0];
  expect(after.kind).toBe('investment');
  for (const field of ['id', 'messageId', 'cents', 'date', 'personId']) expect(after[field]).toBe(before[field]);
  await row.locator('[data-edit-record]').click();
  await page.locator('#record-person').selectOption('fixture-pessoa-b');
  await page.locator('#record-description').fill('Reserva corrigida de teste');
  await page.locator('#record-form button[type=submit]').click();
  await expect(page.locator('#record-dialog')).not.toBeVisible();
  await scope(page, 'fixture-pessoa-a');
  await expect(page.locator('#records .record')).toHaveCount(0);
  await scope(page, 'fixture-pessoa-b');
  await expect(page.locator('#records .record')).toHaveCount(1);
  await page.locator('[data-remove-record]').click();
  await expect(page.locator('#remove-dialog')).toBeVisible();
  await page.locator('#remove-dialog [data-close]').first().click();
  await expect(page.locator('#records .record')).toHaveCount(1);
  await page.locator('[data-remove-record]').click();
  await page.locator('#remove-form button[type=submit]').click();
  await expect(page.locator('#remove-dialog')).not.toBeVisible();
  await expect(page.locator('#records .record')).toHaveCount(0);
  await expect(page.locator('#investments-value')).toHaveText(brl(0));
});

test('metas individuais e conjuntas com zero, campos em branco e validação', async ({ page }) => {
  await load(page, '2025-06');
  await scope(page, 'fixture-pessoa-a');
  await navigate(page,'planning');
  await page.locator('#edit-goals').click();
  await page.locator('#spending-input').fill('0');
  await page.locator('#investment-input').fill('1.234,56');
  await page.locator('#goals-form button[type=submit]').click();
  await expect(page.locator('#goals-dialog')).not.toBeVisible();
  await expect(page.locator('#spending-limit')).toContainText(brl(0));
  await expect(page.locator('#investment-limit')).toContainText(brl(123456));
  await scope(page, 'all');
  await expect(page.locator('#investment-limit')).not.toContainText(brl(123456));
  await navigate(page,'planning');
  await page.locator('#edit-goals').click();
  await page.locator('#spending-input').fill('-1');
  await page.locator('#goals-form button[type=submit]').click();
  await expect(page.locator('#goals-dialog .form-error')).toBeVisible();
  await page.locator('#spending-input').fill('');
  await page.locator('#investment-input').fill('0');
  await page.locator('#goals-form button[type=submit]').click();
  await expect(page.locator('#goals-dialog')).not.toBeVisible();
  const all = await currentState(page, '2025-06');
  expect(all.goals).toEqual({ spendingCap: null, investmentGoal: 0 });
  expect((await currentState(page, '2025-06', 'fixture-pessoa-a')).goals.investmentGoal).toBe(123456);
});

test('busca, tipo e CSV respeitam pessoa e filtros; mensais exportam zero', async ({ page }) => {
  await load(page);
  await scope(page, 'fixture-pessoa-b');
  await navigate(page,'history');
  await page.locator('#search').fill('mercado');
  await expect(page.locator('#records .record')).toHaveCount(1);
  await page.locator('#kind-filter').selectOption('investment');
  await expect(page.locator('#records .record')).toHaveCount(0);
  await page.locator('#kind-filter').selectOption('expense');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Pessoa B');
  expect(csv).toContain('mercado');
  expect(csv).toContain('128,40');
  expect(csv).not.toContain('Pessoa A');
  expect(csv).not.toContain('farmácia');
  await navigate(page,'planning');
  const monthlyDownload = page.waitForEvent('download');
  await page.locator('#export-monthly-csv').click();
  const monthlyCsv = await readFile(await (await monthlyDownload).path(), 'utf8');
  expect(monthlyCsv).toContain('Pessoa B');
  expect(monthlyCsv).toContain('0,00');
  expect(monthlyCsv).not.toContain('Pessoa A');
});

test('Motion local e movimento reduzido em mudança dinâmica não bloqueiam ações', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await scope(page, 'fixture-pessoa-b');
  await expect(page.locator('#expenses-value')).toHaveText(brl(24720));
  await navigate(page,'planning');
  await page.locator('#edit-goals').click();
  await expect(page.locator('#goals-dialog')).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('#expenses-value')).toHaveText(brl(24720));
});

test('falha de carregamento Motion mantém leitura, metas e formulários', async ({ page }) => {
  await page.route('**/assets/motion.js', (route) => route.abort());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'fallback');
  await expect(page.locator('#expenses-value')).toHaveText(brl(63257));
  await expect.poll(() => page.locator('#spending-bar').evaluate((el) => getComputedStyle(el).transform)).not.toBe('matrix(0, 0, 0, 1, 0, 0)');
  await page.locator('#new-record').click();
  await expect(page.locator('#record-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await scope(page, 'fixture-pessoa-a');
  await expect(page.locator('#expenses-value')).toHaveText(brl(38537));
  expect(errors).toEqual([]);
});

test('falha de animação não bloqueia o formulário nem oculta os valores finais', async ({ page }) => {
  await page.route('**/assets/motion.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export function animate(){ throw new Error("falha simulada"); }' }));
  await load(page);
  await expect(page.locator('#expenses-value')).toHaveText(brl(63257));
  await navigate(page,'planning');
  await page.locator('#edit-goals').click();
  await expect(page.locator('#goals-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await scope(page, 'fixture-pessoa-b');
  await expect(page.locator('#expenses-value')).toHaveText(brl(24720));
});

test('carregamento, vazio, falha da API e retry não exibem valores de outros filtros', async ({ page }) => {
  let release;
  let requests = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/state?*', async (route) => { requests++; await gate; await route.continue(); });
  await page.goto('/');
  await expect(page.locator('#loading-state')).toBeVisible();
  await expect(page.locator('#data-region')).not.toBeVisible();
  await page.locator('#month').dispatchEvent('change');
  release();
  await expect(page.locator('#data-region')).toBeVisible();
  expect(requests).toBe(1);
  await page.unroute('**/api/state?*');
  await selectMonth(page, '2025-07');
  await expect(page.locator('#records')).toContainText(/nenhum/i);
  await expect(page.locator('#chart')).toContainText(/gasto/i);
  await expect(page.locator('#balance-value')).toHaveText('—');
  await page.route('**/api/state?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Falha de teste temporária"}' }));
  await page.locator('#month').fill('2025-08');
  await page.locator('#month').dispatchEvent('change');
  await expect(page.locator('#error-banner')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('Falha de teste');
  await expect(page.locator('#data-region')).not.toBeVisible();
  await expect(page.locator('#new-record')).toBeDisabled();
  await page.unroute('**/api/state?*');
  await page.locator('#retry').click();
  await expect(page.locator('#data-region')).toBeVisible();
  await expect(page.locator('#error-banner')).not.toBeVisible();
  await expect(page.locator('#salary-value')).toHaveText('—');
});

async function postFromPage(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Gastos-Token': document.querySelector('meta[name="gastos-token"]').content,
    }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, { path, body });
}

test('histórico longo pagina e exporta todos os resultados; textos não executam HTML ou fórmula CSV', async ({ page }) => {
  await load(page, '2025-09');
  for (let index = 0; index < 25; index++) {
    await postFromPage(page, '/api/records', {
      personId: index % 2 ? 'fixture-pessoa-a' : 'fixture-pessoa-b', description: `Paginação teste ${index}`,
      kind: index % 3 ? 'expense' : 'investment', cents: 100 + index, date: '2025-09-01',
    });
  }
  for (const description of ['=SUM(1,1) mercado', '<img src=x onerror="window.injected=true"> texto']) {
    await postFromPage(page, '/api/records', { personId: 'fixture-pessoa-a', description, kind: 'expense', cents: 100, date: '2025-09-02' });
  }
  await page.locator('#refresh').click();
  await expect(page.locator('#records .record')).toHaveCount(20);
  await navigate(page,'history');
  await expect(page.locator('#more-records')).toBeVisible();
  await page.locator('#more-records').click();
  await expect(page.locator('#records .record')).toHaveCount(27);
  await expect(page.locator('#more-records')).not.toBeVisible();
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('#records img')).toHaveCount(0);
  await navigate(page,'analysis');
  await expect(page.locator('#breakdown .break-row')).toHaveCount(1);
  await navigate(page,'history');
  const downloading = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const csv = await readFile(await (await downloading).path(), 'utf8');
  expect(csv.trim().split('\n')).toHaveLength(28);
  expect(csv).toContain("'=SUM(1,1) mercado");
  await page.locator('#search').fill('Paginação');
  await expect(page.locator('#records .record')).toHaveCount(20);
  await page.locator('#kind-filter').selectOption('investment');
  await expect(page.locator('#records .record')).toHaveCount(9);
});

test('atualização automática mantém a tela estável e respeita formulários abertos', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Install the clock before the app registers its interval.
  await page.clock.install();
  await load(page, '2025-10');
  await page.evaluate(() => {
    window.regionHiddenDuringRefresh = false;
    new MutationObserver(() => { if (document.getElementById('data-region').hidden) window.regionHiddenDuringRefresh = true; })
      .observe(document.getElementById('data-region'), { attributes: true, attributeFilter: ['hidden'] });
  });
  await postFromPage(page, '/api/records', { personId: 'fixture-pessoa-a', description: 'Atualização teste', kind: 'expense', cents: 321, date: '2025-10-01' });
  await page.clock.fastForward(15000);
  await expect(page.locator('#expenses-value')).toHaveText(brl(321));
  expect(await page.evaluate(() => window.regionHiddenDuringRefresh)).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('data-background-refresh','idle');
  await page.evaluate(() => { window.unchangedPersonNode = document.querySelector('#people .person'); });
  await page.clock.fastForward(15000);
  await expect(page.locator('html')).toHaveAttribute('data-background-refresh','idle');
  expect(await page.evaluate(() => window.unchangedPersonNode === document.querySelector('#people .person'))).toBe(true);
  await page.locator('#new-record').click();
  await page.locator('#record-description').fill('Formulário em edição');
  await postFromPage(page, '/api/records', { personId: 'fixture-pessoa-a', description: 'Atualização teste 2', kind: 'expense', cents: 100, date: '2025-10-02' });
  await page.clock.fastForward(15000);
  await expect(page.locator('#expenses-value')).toHaveText(brl(321));
  await expect(page.locator('#record-description')).toHaveValue('Formulário em edição');
  await page.keyboard.press('Escape');
  await page.clock.fastForward(15000);
  await expect(page.locator('#expenses-value')).toHaveText(brl(421));
});

test('mês vazio oculta o snapshot anterior e retorna ao funcionamento com mês válido', async ({ page }) => {
  await load(page);
  await page.locator('#month').fill('');
  await page.locator('#month').dispatchEvent('change');
  await expect(page.locator('#data-region')).not.toBeVisible();
  await expect(page.locator('#error-banner')).toBeVisible();
  await expect(page.locator('#new-record')).toBeDisabled();
  await selectMonth(page, '2026-10');
  await expect(page.locator('#expenses-value')).toHaveText(brl(63257));
});

test('recebimentos e faturas acumulam; editar e excluir afetam somente um item', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await load(page,'2025-11');
  await saveMonthly(page,'salary','fixture-pessoa-a','2000');
  await saveMonthly(page,'salary','fixture-pessoa-a','800');
  await expect(page.locator('#salary-value')).toHaveText(brl(280000));
  await saveMonthly(page,'card','fixture-pessoa-a','500');
  await saveMonthly(page,'card','fixture-pessoa-a','300');
  await expect(page.locator('#card-value')).toHaveText(brl(80000));
  await expect(page.locator('#balance-value')).toHaveText(brl(280000));
  await expect(page.locator('.monthly-entry')).toHaveCount(4);
  await page.locator('.monthly-entry').filter({hasText:'2.000,00'}).locator('[data-edit-monthly]').click();
  await expect(page.locator('#monthly-form-title')).toHaveText('Editar recebimento');
  await page.locator('#monthly-amount').fill('2100');
  await page.locator('#monthly-description').fill('Empresa fictícia');
  await page.locator('#monthly-date').fill('2025-11-02');
  await page.locator('#monthly-form button[type=submit]').click();
  await expect(page.locator('#monthly-dialog')).not.toBeVisible();
  await expect(page.locator('#salary-value')).toHaveText(brl(290000));
  await expect(page.locator('.monthly-entry')).toHaveCount(4);
  await page.locator('.monthly-entry').filter({hasText:'800,00'}).locator('[data-edit-monthly]').click();
  await page.locator('#remove-monthly').click();
  await page.locator('#remove-form button[type=submit]').click();
  await expect(page.locator('#remove-dialog')).not.toBeVisible();
  await expect(page.locator('#salary-value')).toHaveText(brl(210000));
  await scope(page,'fixture-pessoa-b');await expect(page.locator('#monthly-values')).not.toContainText('Empresa fictícia');
  await expect(page.locator('#salary-value')).toHaveText('—');
});

test('semana entre meses, seleção de categoria e teclado preservam filtros e percentuais', async ({ page }) => {
  await load(page,'2026-10');
  await navigate(page,'weekly');
  await page.locator('#week-date').fill('2026-10-01');await page.locator('#week-date').dispatchEvent('change');
  await expect(page.locator('#week-range')).toContainText('28/09/2026 a 04/10/2026');
  await expect(page.locator('#week-total')).toHaveText(brl(30227));
  await expect(page.locator('#week-days .daily-row')).toHaveCount(7);
  await expect(page.locator('#week-undated')).toContainText('sem data');
  const category=page.locator('#week-categories button').filter({hasText:'Saúde'});
  await category.focus();await page.keyboard.press('Enter');
  await expect(category).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#week-records')).toContainText('farmácia');
  await expect(page.locator('#week-records')).not.toContainText('mercado');
  await page.locator('#clear-week-category').click();
  await scope(page,'fixture-pessoa-a');await expect(page.locator('#week-total')).toHaveText(brl(25337));
  await page.locator('#next-week').click();await expect(page.locator('#week-range')).toContainText('05/10/2026 a 11/10/2026');
  await page.locator('#previous-week').click();await expect(page.locator('#week-range')).toContainText('28/09/2026');
  await page.locator('#current-week').click();await expect(page.locator('#data-region')).toHaveAttribute('aria-busy','false');
  await scope(page,'all');await navigate(page,'analysis');
  await expect(page.locator('#monthly-donut svg')).toBeVisible();
  await page.locator('#breakdown button').filter({hasText:'Alimentação'}).click();
  await navigate(page,'history');
  await expect(page.locator('#category-filter')).toHaveValue('Alimentação');
  await expect(page.locator('#records .record')).toHaveCount(3);
  await page.locator('#category-filter').selectOption('');
  await expect(page.locator('#records .record')).toHaveCount(9);
});

test('categoria pode ser criada e corrigida pelo formulário, com CSV e vazio acessíveis', async ({ page }) => {
  await load(page,'2025-12');
  await createRecord(page,{description:'Despesa fictícia categorizável',cents:'100',date:'2025-12-02'});
  await navigate(page,'history');
  await page.locator('[data-edit-record]').click();
  await page.locator('#record-category').fill('Estudos');
  await page.locator('#record-form button[type=submit]').click();
  await expect(page.locator('#record-dialog')).not.toBeVisible();
  await navigate(page,'analysis');
  await expect(page.locator('#breakdown button')).toContainText('Estudos');
  await expect(page.locator('#breakdown button')).toContainText('100,0%');
  await page.locator('#breakdown button').click();
  await navigate(page,'history');
  const downloading=page.waitForEvent('download');await page.locator('#export-csv').click();
  expect(await readFile(await (await downloading).path(),'utf8')).toContain('Estudos');
  await page.locator('[data-edit-record]').click();await page.locator('#record-category').fill('');
  await page.locator('#record-form button[type=submit]').click();
  await expect(page.locator('#record-dialog')).not.toBeVisible();
  await expect(page.locator('#category-filter')).toHaveValue('');
  await navigate(page,'analysis');await expect(page.locator('#breakdown button')).toContainText('Sem categoria');
  await selectMonth(page,'2025-01');await expect(page.locator('#monthly-donut svg')).toHaveCount(0);
  await expect(page.locator('#breakdown')).toContainText('Sem gastos');
});
