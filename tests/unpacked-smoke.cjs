#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const TARGET_URL = 'https://www.avito.ru/moskva/telefony?q=smoke';
const SYNTHETIC_PAGE = `<!doctype html>
<html lang="ru">
<head><link rel="icon" href="data:,"></head>
<body>
  <main data-marker="catalog-serp">
    <article data-marker="item" data-item-id="1234567">
      <a data-marker="item-title" href="https://www.avito.ru/moskva/test/item_1234567">Товар</a>
      <span itemprop="price" content="1000"></span>
      <a href="https://www.avito.ru/brands/shop-1?src=search_seller_info">Магазин</a>
    </article>
  </main>
</body>
</html>`;

(async () => {
  const extensionPath = path.resolve(__dirname, '..');
  const tempRoot = await fs.realpath(os.tmpdir());
  const profilePath = await fs.mkdtemp(path.join(tempRoot, 'avito-helper-smoke-'));
  const safeProfilePath = path.dirname(profilePath) === tempRoot
    && /^avito-helper-smoke-/.test(path.basename(profilePath));
  const interceptedRequests = [];
  const pageErrors = [];
  let context;

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      channel: 'chromium',
      headless: true,
      offline: true,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    await context.route('**/*', async (route) => {
      const url = route.request().url();
      interceptedRequests.push(url);
      if (url === TARGET_URL) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: SYNTHETIC_PAGE
        });
        return;
      }
      await route.abort('blockedbyclient');
    });

    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelectorAll('.avito-clean-stamp').length === 1,
      null,
      { timeout: 10000 }
    );

    const result = await page.evaluate(() => {
      const stamp = document.querySelector('.avito-clean-stamp');
      return {
        count: document.querySelectorAll('.avito-clean-stamp').length,
        text: stamp.shadowRoot.textContent
      };
    });

    assert.deepEqual(pageErrors, [], 'Unpacked content script вызвал ошибку страницы');
    assert.deepEqual(interceptedRequests, [TARGET_URL], 'Synthetic smoke запросил внешние ресурсы');
    assert.equal(result.count, 1, 'Content script не добавил stamp');
    assert.match(result.text, /магазин/i, 'Stamp не описывает профессионального продавца');
    console.log('PASS  unpacked MV3 расширение обработало полностью перехваченную synthetic-страницу');
  } finally {
    let closeError;
    if (context) {
      try { await context.close(); } catch (error) { closeError = error; }
    }
    assert.ok(safeProfilePath, 'Небезопасный путь временного профиля');
    await fs.rm(profilePath, { recursive: true, force: true });
    if (closeError) throw closeError;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
