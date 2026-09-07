# Clean Listings for Avito

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4c8bf5)](manifest.json)
[![No dependencies](https://img.shields.io/badge/dependencies-none-2ea44f)](#stack)
[![No network calls](https://img.shields.io/badge/network%20calls-none-2ea44f)](#privacy)
[![Tests](https://img.shields.io/badge/test%20runners-4-2ea44f)](#tests)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**[Русская версия →](README.ru.md)**

A Chrome extension that makes a classifieds search page readable again. It dims listings you
have already opened, marks professional sellers, and shows how many slots on the page belong
to a single seller.

No build step. No dependencies. No network calls. Two permissions.

> Installed, it appears in the browser as **«Авито Помощник»** — the project name here is
> the English one.

---

## Why it exists

Search a popular item on a large classifieds site and almost every card belongs to a
professional seller rather than a private one. Measured on a live "iPhone 16" search:

> **47 of 50 cards were storefronts. The median seller had 868 reviews. Not a single seller
> had 20 reviews or fewer.**

The site does have a native "private sellers" filter, but it splits sellers by legal
registration, not by behaviour. Under "private", that same search still returns companies,
a phone-store chain, and a buy-back shop with 1,470 reviews.

So the extension does two things the site does not: it applies the native filter
**server-side through the URL**, so pagination stays dense, and then applies its own
behavioural test on top.

## What it does

| | |
|---|---|
| **Dims what you already opened** | Per-listing state, so two tabs do not overwrite each other. One click restores a card. |
| **Stamps professional sellers** | Storefront, agency, car dealer, employer — the word depends on the section. Sellers with no storefront but reseller behaviour get their own label. |
| **Counts page monopolisers** | "7 more listings from this seller", right on the card. |
| **One toggle** | Everything else works with zero configuration. |

The professional-seller test is composite: an actual storefront URL, **or** 20+ reviews,
**or** 3+ slots in the same result page. Thresholds live in one object in `src/config.js`.

## Results

Live pages, usable cards left after filtering:

| Section | Usable cards |
|---|---|
| Phones | 13 of 49 (was 1) |
| Furniture | 26 of 50 |
| Kids' clothing | 27 of 82 |
| Rentals | 43 of 58 |

## Install

**From source (any Chromium browser):**

1. Download this repository, or grab the zip from [Releases](../../releases).
2. Open `chrome://extensions/`
3. Turn on **Developer mode**
4. Click **Load unpacked** and select the folder.

The extension activates on the classifieds site only. Nothing to configure.

## Engineering notes

The parts that were not obvious, and what the measurements showed.

**Never leave the user with an empty page.**
If the filter would hide every card on the page, the extension hides nothing and shows only
the stamps. This is not theoretical: on a car-dealer search it triggered on 50 cards out of 50.
An earlier version dimmed everything and left a blank screen.

**A 0.8-second freeze, found with a profiler rather than by eye.**
Historical live measurements from the August 2026 release work, longest task:

| | Longest task |
|---|---|
| Without the extension | 109–125 ms |
| Version 1.1.1 | 732 / 933 / 732 ms |
| Version 1.1.2, final run | 186–199 ms, median 193 ms |

These are the final historical figures, not a new performance measurement of the current
working tree. See [verification notes](docs/verification-2026-09-07.md) for the distinction
between release provenance, offline checks and the bounded September live smoke.

The cause was interleaving DOM writes with reads of computed style, which forces the browser
to recalculate layout on every read. Across fifty cards it added up. What proved the diagnosis:
with the toggle on, 24 stamps are drawn instead of 47 and the delay dropped to 192 ms. The cost
scaled with the number of stamps.

**State is one key with a signed value.**
Two separate keys produced a race between browser tabs and cards that got stuck. The sign
carries the meaning: positive means seen, negative means the user restored it manually.

**Redraw is decided by a signature rather than a "processed" flag.**
The flag left 2 cards out of 50 unstamped during ordinary in-site navigation, because the site
re-renders cards under you.

**Client-side hiding cannot fix pagination.**
Paging is server-side, so hiding cards locally still forces the user through ten sparse pages.
The fix was to set the site's own filter parameter in the URL, with a rule for when *not* to
set it: the site signals "show all" by removing the parameter rather than by setting a value.

## Tests

`npm test` runs four test runners in sequence:

| Runner | Coverage |
|---|---|
| `tests/filter-retry-regression.cjs` | Eight Node VM cases over the production filter function with fake storage/navigation: retry budgets, unavailable or partially writable `sessionStorage`, explicit toggles, damaged counters and preservation of a native filter the extension does not own. |
| `tests/manifest-regression.cjs` | Content-script load order and all 15 JS/CSS/popup/icon references, restricted to files inside the project. |
| `tests/unpacked-smoke.cjs` | Loads the real unpacked MV3 extension in a separate offline Chromium profile and checks its stamp on an intercepted synthetic page; all other requests are blocked. |
| `tests/run.cjs` | The existing 28 regressions across five sanitized DOM-fixture suites: parsing/rendering, content script, rendering-structure/layout regressions, storage and popup. |

Test dependency setup and full gate:

```bash
npm install                      # playwright only, and only for the tests
npx playwright install chromium
npm run check                    # JavaScript syntax checks, then all four runners
```

The extension itself has no runtime dependencies; `playwright` is used only for browser tests.
`npm test` runs the same four runners without the preceding syntax checks. The DOM runner
launches its own headless browser by default. To debug only that corpus in an existing visible
browser, use `CDP_URL=http://127.0.0.1:9222 node tests/run.cjs`.
The MV3 smoke always uses its own temporary profile and removes it after the run.

They cover the failures that actually happened: the empty-page case, cross-tab storage races,
lazy-loaded cards, the stamp overlapping the site's own badge, and the counter covering the
site's filter column. Passing fixtures does not prove compatibility with today's live search
results, nor does the performance/layout fixture constitute a fresh live performance benchmark.
The limited live checks and their exclusions are recorded in the
[verification report](docs/verification-2026-09-07.md).

## Privacy

- **No network requests.** Verified: no `fetch`, no `XMLHttpRequest`, no beacons.
- **Two permissions:** `storage` and `activeTab`, no host permissions.
- **One site:** the content script matches a single domain.
- Everything the extension remembers stays in local browser storage and never leaves the device.

## Layout

```
.
├── manifest.json          MV3: two permissions, one domain, script load order
├── src/
│   ├── config.js          reseller thresholds, section names, filter retry cap
│   ├── parse.js           search DOM -> cards: id, price, seller, review count
│   ├── store.js           chrome.storage: viewed marks with TTL, settings
│   ├── render.js          stamps, dimming, the "hidden" bar — in three phases, with no
│   │                      reads interleaved between writes
│   └── content.js         entry point: page type, lazy-load observer, URL filter
├── popup/                 extension window: toggle and summary
├── tests/                 DOM corpus, filter retry, manifest checks and offline MV3 smoke
├── docs/
│   ├── live-test-2026-08-22.txt    live-site measurements: selectors, medians, pagination
│   └── store-listing.ru.txt        store listing copy
└── CHANGELOG.md           what changed, and the numbers behind it
```

Dependencies run one way: `content.js` conducts, the other modules know nothing about each other.
`parse` only reads the DOM, `render` only writes, `store` knows about neither — which is why each
one is testable against a fixture on its own.

## Stack

Manifest V3 · vanilla JavaScript, no framework and no build step · Shadow DOM for style
isolation · `chrome.storage` with change coalescing · DOM fixtures for tests.
About 2,300 lines.

## Credits

Version 1.1.1 was contributed by a collaborator who took 1.1.0 and fixed three issues:
a repeated-navigation guard, a cap on filter retries, and a manifest title. Those fixes are
in the code you see here. Versions 1.1.2 and later build on that work.

## License

[MIT](LICENSE) — Vadim Kubrak. *Avito is a trademark of its respective owner. This project is
an independent open-source tool and is not affiliated with or endorsed by them.*

---

*Store listing text (Russian): [`docs/store-listing.ru.txt`](docs/store-listing.ru.txt)*
