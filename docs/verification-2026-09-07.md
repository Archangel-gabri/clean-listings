# Avito: release provenance, offline gate и ограниченный live smoke

Проверено 2026-09-07. Repo: `Archangel-gabri/clean-listings`.
Read-only сверка происхождения опубликованного v1.1.2, независимый локальный gate
и отдельный ограниченный live smoke перечислены ниже раздельно.
Это **не** публикация локального WIP и **не** новый performance-прогон.

## Refs и происхождение расхождения

| Объект | Commit |
|---|---|
| Local HEAD, remote HEAD/master | `387680f8bd8e16fe01aaaf4cc82a765337f01864` |
| Local v1.1.2 | `691de1aa004d2a497a4f1d67846a027861dea2ca` |
| Remote v1.1.2 (предок HEAD) | `d3c1e8405c36188df2f8177b29083e1e06317bd7` |

У девяти пар старых/переписанных commits одинаковые trees: у первых семи
изменены author/committer metadata, у последних двух — только parents.
`691de1a` и переписанный `9801f21` имеют tree
`42d0f739cef7685468f4fb6d426641b88a69c330`; последующий public `d3c1e84`
уточняет README. Это согласуется с историческим owner-approved metadata rewrite.
Повторная перезапись истории/перемещение тега не нужны и не выполнялись.

## Два разных ZIP, оба объяснены

| Объект | Размер | Состав | SHA-256 |
|---|---:|---|---|
| Старый ignored `Авито Помощник 1.1.2.zip` | 57000 B | 28 entries: 24 файла + 4 каталога | `367d3b908744216d3560609781119d269e414c4ccf74fbdff3dd167485a99182` |
| [Public asset](https://github.com/Archangel-gabri/clean-listings/releases/download/v1.1.2/clean-listings-1.1.2.zip) | 65902 B | 34 entries: 28 файлов + 6 каталогов, корень `clean-listings/` | `202d57327c425b2fde0839dcc11ae64590b7ac89d185e6c115080fb2802f93de` |

Все 24 файла старого ZIP совпадают с tree `91fd055` / переписанным `ec0dbfd`
(упаковка исключала `.gitignore`). Это историческая упаковка до public repackage,
не текущий WIP и не испорченный public asset.

Public asset получен анонимным GET целиком в память: CRC PASS, SHA совпадает с
GitHub digest, все 28 файлов побайтно соответствуют public tag, нет лишних/пропущенных.
Asset uploaded `2026-08-24T22:19:45Z`; release опубликован, не draft/prerelease.
Runtime public tag и HEAD одинаков; новые архивы на диск не записывались.

`src/content.js` у baseline/public/старого ZIP:
`2882aa1ddadbd9a13af01499074b1d1bbd762fb603b3cea682b5726796e9587c`.
Текущий WIP отличается:
`12c659d3b3b3d6028a13c897f878ca3b2162e98a36be9e530836de7621b1eb2a`.
Поэтому проверенный public ZIP не доказывает публикацию retry-исправления.

## Независимый offline gate текущего WIP

`npm run check` повторно выполнен 2026-09-07 без установки пакетов, с имеющимися
devDependencies: PASS, exit code 0. Команда проверяет syntax шести runtime JS,
после чего последовательно запускает все четыре runners:

| Runner | Результат |
|---|---|
| `tests/filter-retry-regression.cjs` | 8/8 PASS: retry budget, storage read/write/partial failure, explicit toggle, повреждённый счётчик и чужой `user=1`. |
| `tests/manifest-regression.cjs` | PASS: порядок пяти content scripts и все 15 локальных JS/CSS/popup/icon references. |
| `tests/unpacked-smoke.cjs` | PASS: настоящий unpacked MV3 обрабатывает полностью перехваченную synthetic-страницу в отдельном offline Chromium. |
| `tests/run.cjs` | Прежние 28/28 DOM regressions PASS, пять fixture suites. |

MV3 runner создаёт собственный временный профиль и удаляет его в cleanup;
авторизованный профиль владельца этот локальный gate не использует.
`CDP_URL=http://127.0.0.1:9222 node tests/run.cjs` относится только к отладке
DOM-корпуса, а не к режиму запуска всех четырёх runners.
Retry runner исполняет production-функцию в Node VM с fake storage/navigation,
а не настоящими перезагрузками. Manifest runner проверяет прямые ссылки/порядок,
не всю schema или релизный ZIP. Performance fixture проверяет структуру рендеринга,
переиспользование стилей и расположение элементов, не timings/CPU/FPS.

## Ограниченный live smoke 2026-09-07

Источник этого раздела — наблюдения координатора в авторизованном Brave владельца
через CDP; независимый docs/gate lane браузер повторно не менял. Владелец явно
разрешил временную загрузку текущего unpacked WIP. Runtime-код в ходе этого
продолжения не менялся: проверялся сохранённый WIP.
Локальный screenshot выбранной публичной карточки в seen-состоянии:
`scratch/avito-live-card-2026-09-07.png` относительно корня workspace
(ignored; визуально просмотрен координатором, не включён в Git).

Проверена текущая выдача iPhone 13, без обобщения на другие категории/браузеры:

| Действие/состояние | Наблюдавшийся результат |
|---|---|
| Выдача до включения фильтра расширения | 50 карточек, 49 штампов. |
| Toggle on | Переход к URL с `user=1`; после перехода 50 карточек, 46 штампов, 46 скрытых и 4 видимых; счётчик 46. |
| Пагинация | Проверенная ссылка следующей страницы содержит `user=1`; переход по ней отдельно не проверялся. |
| Открытие публичного объявления и восстановление отметки | Seen-счётчик стал 1; действие restore вернуло его к 0. |
| Toggle off для фильтра, поставленного расширением | Собственный `user` удалён из URL; скрытых карточек 0. |

Отдельная новая вкладка проверяла владение **заранее установленным** нативным
`user=1`, при начальной настройке расширения `hideShops=false`:

| Состояние | Наблюдавшийся результат |
|---|---|
| До toggle | `user=1` уже есть; filter memo пуст (`[]`). |
| Toggle on | `user=1` сохранён; memo по-прежнему `[]`; скрытых карточек 46. |
| Toggle off | Чужой `user=1` сохранён; memo `[]`; скрытых 0, counter отсутствует; popup показывает `hideShops=false`, seen 0. |

В проверенном срезе extension runtime errors = 0 и manifest errors = 0.
У сайта были собственные warnings; этот результат **не** означает «консоль чистая».
Popup открывался как отдельная extension-вкладка, **не** как настоящий toolbar
popup: его UI/storage поведение проверено, но выдача разрешения `activeTab`
кликом по toolbar этим не доказана.

Ограничения: нет нового performance/A-B замера, полного cross-browser прогона,
проверки всех категорий или live-симуляции отказов sessionStorage. Последнее
подтверждено локальным retry runner, а не поломкой storage в профиле владельца.
После smoke координатор удалил оба временных расширения (Avito/Gde): их отсутствие
проверено через browser API; Developer mode снова false. Тестовые вкладки закрыты,
исходная вкладка владельца сохранена, окно свёрнуто. Вспомогательный input daemon
остановлен, его private socket удалён. Настройки auth/профиль на диск не копировались.

## Что остаётся до нового выпуска

- Runtime-only ZIP проверен в памяти отдельно:
  13 файлов / 19 ссылок; это не public ZIP из таблицы.
- GitHub workflows.total_count = 0, runs пусты. Локальный новый CI пока не опубликован.
- Release body и исторический CHANGELOG всё ещё содержат промежуточные timings
  214/196/211 ms; они не переписывались в этом пакете.
  Источник финальных 186–199 ms, median 193 ms — итоговый Duo-checkpoint
  выпуска 1.1.2 от 24.08.2026, после промежуточного замера. Ни те ни другие числа
  не являются свежим performance smoke. Release body без отдельного gate не менять.
- Остались точный whitelist/freeze, release artifact и отдельное решение
  о публикации. Локальный CI/WIP не объявляется опубликованным по итогам smoke.

Ни commits, ни push, ни tag/release edits при этой проверке не выполнялись.
