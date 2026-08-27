#!/usr/bin/env node
/**
 * Прогон регрессионных наборов на DOM-фикстурах.
 *
 * Поднимает собственный headless-браузер, поэтому работает на любой машине
 * сразу после `npm install`. Прежний запускатель требовал заранее открытый
 * браузер владельца на CDP :9222 — на чужом клоне тесты просто не шли.
 *
 * Если CDP всё-таки нужен (отладка в видимом окне), задайте CDP_URL:
 *   CDP_URL=http://127.0.0.1:9222 node tests/run.cjs
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const FIXTURES = [
  'fixture-regression.html',
  'content-regression.html',
  'performance-regression.html',
  'store-regression.html',
  'popup-regression.html',
];

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Не найден playwright. Установите зависимости разработки: npm install');
  process.exit(2);
}

async function openBrowser() {
  const cdp = process.env.CDP_URL;
  if (cdp) {
    const browser = await chromium.connectOverCDP(cdp);
    const context = browser.contexts()[0];
    if (!context) throw new Error(`нет контекста в браузере на ${cdp}`);
    return { browser, context, shouldClose: false };
  }
  const browser = await chromium.launch();
  return { browser, context: await browser.newContext(), shouldClose: true };
}

async function runFixture(context, name) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, name)).href);
    await page.waitForFunction(() => globalThis.__FIXTURE_DONE__ === true, null, { timeout: 15000 });
    const result = await page.evaluate(() => globalThis.__FIXTURE_RESULT__);
    return { result, pageErrors };
  } finally {
    await page.close();
  }
}

(async () => {
  const { browser, context, shouldClose } = await openBrowser();
  let passed = 0;
  let failed = 0;
  try {
    for (const name of FIXTURES) {
      const { result, pageErrors } = await runFixture(context, name);
      console.log(`\n── ${name}`);
      for (const entry of result.results) {
        if (entry.ok) {
          passed++;
          console.log(`  PASS  ${entry.name}`);
        } else {
          failed++;
          console.log(`  FAIL  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
        }
      }
      for (const message of pageErrors) {
        failed++;
        console.log(`  FAIL  ошибка страницы — ${message}`);
      }
    }
  } finally {
    if (shouldClose) await browser.close();
    else await browser.close().catch(() => {});
  }
  console.log(`\nИТОГ: ${passed} прошло, ${failed} упало`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
