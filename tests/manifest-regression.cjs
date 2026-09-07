#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const expectedContentOrder = [
  'src/config.js',
  'src/store.js',
  'src/parse.js',
  'src/render.js',
  'src/content.js'
];

assert.equal(manifest.content_scripts.length, 1, 'Ожидался один content_scripts блок');
assert.deepEqual(
  manifest.content_scripts[0].js,
  expectedContentOrder,
  'Нарушен порядок загрузки зависимостей content script'
);

const referencedFiles = [
  ...manifest.content_scripts.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
  manifest.action && manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {})
].filter(Boolean);

for (const relativePath of referencedFiles) {
  assert.equal(typeof relativePath, 'string', 'Путь в manifest должен быть строкой');
  const absolutePath = path.resolve(root, relativePath);
  assert.ok(
    absolutePath.startsWith(`${root}${path.sep}`),
    `Manifest ссылается за пределы проекта: ${relativePath}`
  );
  assert.ok(fs.statSync(absolutePath).isFile(), `Файл из manifest не найден: ${relativePath}`);
}

console.log(`PASS  порядок content scripts: ${expectedContentOrder.join(' -> ')}`);
console.log(`PASS  существуют все ${referencedFiles.length} JS/CSS/popup/icon ссылок manifest`);
