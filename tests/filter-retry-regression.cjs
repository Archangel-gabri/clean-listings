#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contentPath = path.join(__dirname, '..', 'src', 'content.js');
const source = fs.readFileSync(contentPath, 'utf8');
const bootPattern = /\n  boot\(\);\n\}\)\(\);\s*$/;

assert.match(source, bootPattern, 'Не найдена единственная финальная точка boot() в src/content.js');

// Исполняем настоящий content script, заменяя только автоматический boot на
// узкий тестовый экспорт. Так regression проверяет production-реализацию, а не
// скопированную в тест версию алгоритма.
const instrumentedSource = source.replace(
  bootPattern,
  '\n  globalThis.__FILTER_TEST__ = Object.freeze({ syncPrivateFilter });\n})();\n'
);

function sharedStorage(values = new Map()) {
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function blockedStorage() {
  return {
    getItem() {
      throw new Error('sessionStorage read blocked');
    },
    setItem() {
      throw new Error('sessionStorage write blocked');
    }
  };
}

function writeBlockedStorage(readValue = null) {
  return {
    getItem() {
      return readValue;
    },
    setItem() {
      throw new Error('sessionStorage write blocked');
    }
  };
}

function triesWriteBlockedStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key.startsWith('avito-clean:filter-tries:')) {
        throw new Error('retry counter write blocked');
      }
      values.set(key, String(value));
    }
  };
}

function runLoad({
  storage,
  force = false,
  hideShops = true,
  href = 'https://www.avito.ru/moskva/telefony?q=iphone'
}) {
  const initialUrl = new URL(href);
  const navigations = [];
  const context = {
    AC: {
      CFG: {
        PRIVATE_FILTER: { param: 'user', value: '1' },
        MAX_FILTER_TRIES: 2,
        NAVIGATION_TIMEOUT_MS: 5000,
        DEBOUNCE_MS: 200,
        DEBOUNCE_MAX_MS: 1000
      },
      parse: {},
      render: {},
      store: {
        getHideShops() {
          return hideShops;
        }
      }
    },
    URL,
    location: {
      href: initialUrl.href,
      hostname: initialUrl.hostname,
      replace(href) {
        navigations.push(href);
      }
    },
    sessionStorage: storage,
    // Навигационный watchdog не нужен в unit-harness и не должен удерживать Node.
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    console
  };

  vm.runInNewContext(instrumentedSource, context, { filename: contentPath });
  const result = context.__FILTER_TEST__.syncPrivateFilter(force);
  // refreshPage продолжает клиентскую фильтрацию только при false. Поэтому
  // отсутствие replace само по себе ещё не доказывает fail-safe поведение.
  assert.equal(
    result,
    navigations.length > 0,
    'syncPrivateFilter должен возвращать false без навигации и true при навигации'
  );
  return navigations.length;
}

const cases = [
  {
    name: 'устойчивое storage ограничивает auto-load двумя попытками',
    expected: [1, 1, 0],
    run() {
      const storage = sharedStorage();
      return [runLoad({ storage }), runLoad({ storage }), runLoad({ storage })];
    }
  },
  {
    name: 'полностью недоступное storage запрещает автоматические переходы',
    expected: [0, 0, 0],
    run() {
      const storage = blockedStorage();
      return [runLoad({ storage }), runLoad({ storage }), runLoad({ storage })];
    }
  },
  {
    name: 'явный toggle может перейти один раз, следующая auto-load не повторяет',
    expected: [1, 0],
    run() {
      const storage = blockedStorage();
      return [runLoad({ storage, force: true }), runLoad({ storage })];
    }
  },
  {
    name: 'успешное чтение и ошибка записи также запрещают auto-load переход',
    expected: [0],
    run() {
      return [runLoad({ storage: writeBlockedStorage() })];
    }
  },
  {
    name: 'ошибка записи запрещает auto-load снятие параметра, но не явный toggle',
    expected: [0, 1],
    run() {
      const storage = writeBlockedStorage('on');
      const options = {
        storage,
        hideShops: false,
        href: 'https://www.avito.ru/moskva/telefony?q=iphone&user=1'
      };
      return [
        runLoad(options),
        runLoad({ ...options, force: true })
      ];
    }
  },
  {
    name: 'toggle не снимает нативный user=1 без маркера расширения',
    expected: [0],
    run() {
      return [runLoad({
        storage: sharedStorage(),
        force: true,
        hideShops: false,
        href: 'https://www.avito.ru/moskva/telefony?q=iphone&user=1'
      })];
    }
  },
  {
    name: 'частичная запись не оставляет ложный маркер поставленного фильтра',
    expected: [0, 0],
    run() {
      const storage = triesWriteBlockedStorage();
      return [
        runLoad({ storage }),
        runLoad({
          storage,
          hideShops: false,
          href: 'https://www.avito.ru/moskva/telefony?q=iphone&user=1'
        })
      ];
    }
  },
  {
    name: 'повреждённый отрицательный счётчик не расширяет бюджет переходов',
    expected: [0],
    run() {
      const values = new Map([
        ['avito-clean:filter-tries:avito-clean:filter:/moskva/telefony|iphone', '-1000000']
      ]);
      return [runLoad({ storage: sharedStorage(values) })];
    }
  }
];

let failed = 0;
for (const testCase of cases) {
  let actual;
  try {
    actual = testCase.run();
    assert.deepEqual(actual, testCase.expected);
    console.log(`PASS  ${testCase.name}: ${JSON.stringify(actual)}`);
  } catch (error) {
    failed++;
    console.error(`FAIL  ${testCase.name}`);
    if (actual !== undefined) {
      console.error(`      ожидалось ${JSON.stringify(testCase.expected)}, получено ${JSON.stringify(actual)}`);
    }
    console.error(`      ${error.message.split('\n')[0]}`);
  }
}

console.log(`ИТОГ: ${cases.length - failed} прошло, ${failed} упало`);
process.exitCode = failed ? 1 : 0;
