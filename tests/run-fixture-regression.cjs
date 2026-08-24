const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('Brave CDP context not found');

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    const fixture = path.join(__dirname, process.argv[2] || 'fixture-regression.html');
    await page.goto(pathToFileURL(fixture).href);
    await page.waitForFunction(() => globalThis.__FIXTURE_DONE__ === true, null, { timeout: 5000 });
    const result = await page.evaluate(() => globalThis.__FIXTURE_RESULT__);

    for (const entry of result.results) {
      if (entry.ok) console.log(`PASS ${entry.name}`);
      else console.error(`FAIL ${entry.name}: ${entry.error}`);
    }
    console.log(`RESULT ${result.passed}/${result.total}`);
    await page.close();
    process.exit(result.failed ? 1 : 0);
  } catch (error) {
    for (const message of pageErrors) console.error(`PAGE_ERROR ${message}`);
    const state = await page.evaluate(() => ({ title: document.title, result: document.getElementById('result')?.textContent })).catch(() => null);
    if (state) console.error(`PAGE_STATE ${JSON.stringify(state)}`);
    await page.close().catch(() => {});
    console.error(error.stack || error);
    process.exit(1);
  }
})();
