# Авито Помощник — контекст работы

Расширение Manifest V3, vanilla JS, без runtime dependencies.
Playwright — только для regression tests. Явное действие человека и автоматическая
навигация имеют разный бюджет; не снимать чужой нативный `user=1`.

После smoke 7 сентября временные Gde/Avito удалены; Developer mode снова false,
свои тестовые вкладки закрыты, исходная вкладка владельца сохранена; окно свёрнуто.

## Checkpoint 2026-09-07

- Baseline HEAD: `387680f8bd8e16fe01aaaf4cc82a765337f01864`.
- Сохранён WIP bounded retry при недоступном/частично работающем sessionStorage,
  tests/manifest checks, offline unpacked MV3 smoke и CI.
- Свежий независимый `npm run check` PASS: syntax шести runtime JS,
  retry 8/8, manifest 15 references/order, offline unpacked smoke,
  прежний DOM corpus 28/28. README.md и README.ru описывают все четыре runners.
- Старый ignored ZIP «Авито Помощник 1.1.2.zip» содержит baseline content.js,
  **не WIP**; его hash `367d3b908744216d3560609781119d269e414c4ccf74fbdff3dd167485a99182`.
- Read-only provenance закрыт: remote HEAD/master = `387680f`, remote v1.1.2 =
  `d3c1e84` (предок HEAD). Local v1.1.2 = `691de1a` — старый ref до исторического
  metadata rewrite, не повреждение runtime. Теги не перемещались.
- Public ZIP независимо скачан в память: CRC PASS, 28/28 файлов совпадают с
  public tag; SHA совпадает с GitHub digest. Подробности и exact hashes —
  [docs/verification-2026-09-07.md](docs/verification-2026-09-07.md).
- На remote нет workflows/runs; нынешний CI — только локальный WIP.
- После явного разрешения владельца координатор временно загрузил WIP в его
  авторизованный Brave и проверил ограниченный live сценарий iPhone 13:
  toggle on/off, seen/restore и сохранение заранее установленного чужого `user=1`.
  Ссылка следующей страницы содержала `user=1`; переход по ней не проверялся.
  Наблюдавшиеся extension runtime errors
  и manifest errors — 0; это не утверждение о чистой консоли самого сайта.
- Popup проверен как отдельная extension-вкладка, не через toolbar action:
  предоставление `activeTab` кликом по toolbar этим не доказано.

## Проверка и следующий шаг

`npm run check` — syntax + все четыре test runners, с имеющимися devDependencies.
MV3 smoke использует отдельную полностью перехваченную offline fixture, не профиль
владельца; обычный live browser review — через его Brave/CDP по правилам workspace.
Runtime ZIP проверен в памяти: 13 файлов, 19 локальных ссылок, CRC и bytes PASS;
файл релиза не создан. В профиль был временно загружен исходный WIP, не этот ZIP;
временная установка удалена, видимые настройки и вкладки возвращены как описано выше.
Обычная история посещений/session state площадок не объявляются побайтно восстановленными.
Далее: exact WIP whitelist/freeze, фактический release artifact и отдельный gate
публикации. Ограниченный live smoke не заменяет cross-browser/полный live regression.
Timings 186–199 ms, median 193 ms относятся к финальному историческому прогону
1.1.2, не к новому performance-тесту. Свежих commits/push/tag/release edits нет.
