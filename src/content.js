(function () {
  const C = AC.CFG;
  const P = AC.parse;
  const R = AC.render;
  const S = AC.store;

  let lastUrl = location.href;
  let settleTimer = null;

  // Карточка может появиться раньше цены и продавца. Подпись описывает только
  // данные, влияющие на UI; anchorKind заставляет перенести host к поздней цене.
  function cardSignature(card, sellerCount, seen, hideShops, pro) {
    return [card.id, card.anchorKind, card.seller ? card.seller.id : '-',
      card.seller ? card.seller.name : '-', card.seller ? card.seller.reviews : '-',
      sellerCount, seen ? 1 : 0, hideShops ? 1 : 0, pro ? 1 : 0].join('|');
  }

  // Профессионала отличаем не по юридической форме — её в выдаче не видно и
  // родной фильтр Авито по ней уже отработал, — а по следам работы. Достаточно
  // одного признака: витрина, гора отзывов или несколько мест в одной выдаче.
  function isPro(seller, sellerCount) {
    if (!seller) return false;
    const { SHOWCASE, MIN_REVIEWS, MIN_LISTINGS } = C.PRO;
    if (SHOWCASE && seller.isShop) return true;
    if ((seller.reviewCount || 0) >= MIN_REVIEWS) return true;
    return sellerCount >= MIN_LISTINGS;
  }

  // Родной фильтр Авито живёт в адресе, поэтому включать его приходится
  // перезагрузкой. Правило одно: ОДИН поиск — ОДНА правка адреса. Если человек
  // после этого сам вернёт «Все» (Авито при этом просто убирает параметр),
  // мы не спорим и не подставляем его обратно — иначе родной фильтр площадки
  // становится невозможно выключить, пока не выключишь расширение.
  const FILTER_MEMO = 'avito-clean:filter:';

  function filterKey(url) {
    return FILTER_MEMO + url.pathname + '|' + (url.searchParams.get('q') || '');
  }

  // Человек нажал у Авито «Все» — параметр из адреса просто исчезает, никакой
  // отметки «я выключил» площадка не оставляет. Ловим это единственным
  // надёжным способом: переходом внутри одного и того же поиска, где параметр
  // был и пропал. Без этого приходилось бы выбирать между двумя бедами —
  // либо спорить с человеком и возвращать фильтр, либо (как было до этой
  // правки) не возвращать его никогда, и тогда любая потеря параметра
  // оставляла выдачу без фильтра, а расширение гасило 49 карточек из 50.
  function noticeManualReset(previousHref, nextHref) {
    const { param } = C.PRIVATE_FILTER;
    let before;
    let after;
    try {
      before = new URL(previousHref);
      after = new URL(nextHref);
    } catch (_) {
      return;
    }
    if (!before.searchParams.has(param) || after.searchParams.has(param)) return;
    if (filterKey(before) !== filterKey(after)) return;
    memo(filterKey(after), 'off');
  }

  function memo(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, value);
      return value;
    } catch (_) {
      // Приватный режим или запрет хранилища: работаем без памяти о поиске.
      return null;
    }
  }

  // Взведён с момента, когда мы решили уйти на перезагрузку. Навигация не
  // останавливает скрипт мгновенно: до её фиксации успевают отработать и
  // debounce-наблюдатель, и settle-таймер, и boot. Без флага каждый из них
  // звал бы location.replace заново, а на серию таких вызовов Chrome отвечает
  // «Throttling navigation to prevent the browser from hanging» и может
  // оборвать переход совсем.
  let navigating = false;

  function beginNavigation(href) {
    navigating = true;
    // Если браузер переход всё-таки не выполнил, через таймаут возвращаемся
    // к обычной отрисовке, а не висим в ожидании навсегда.
    setTimeout(() => {
      if (!navigating) return;
      navigating = false;
      scheduleRefresh();
    }, C.NAVIGATION_TIMEOUT_MS);
    location.replace(href);
  }

  const FILTER_TRIES = 'avito-clean:filter-tries:';

  function triesFor(key) {
    return Number(memo(FILTER_TRIES + key)) || 0;
  }

  // true — страница уже уходит на перезагрузку, рисовать по текущему DOM нечего.
  // force приходит только из явного переключения тумблера человеком: тогда его
  // решение важнее того, что мы запомнили про этот поиск раньше.
  function syncPrivateFilter(force) {
    if (navigating) return true;

    const { param, value } = C.PRIVATE_FILTER;
    // Адрес правим только у себя дома. Content script по манифесту и так живёт
    // на www.avito.ru, но переписывать чужой location — это последнее, что
    // можно делать по ошибке, поэтому проверка стоит на самом действии.
    if (!/(^|\.)avito\.ru$/i.test(location.hostname)) return false;

    let url;
    try { url = new URL(location.href); } catch (_) { return false; }

    const key = filterKey(url);
    const want = !!S.getHideShops();
    const applied = memo(key);
    const hasParam = url.searchParams.has(param);

    // Параметр на месте — прошлая попытка удержалась, счёт начинаем заново.
    if (hasParam) memo(FILTER_TRIES + key, '0');

    // Не ставим фильтр обратно только там, где человек сам его снял.
    if (want && !hasParam && (force || applied !== 'off')) {
      // Явное переключение тумблера — прямая просьба человека, ей даём
      // свежий бюджет попыток. Всё остальное считается по накопленному.
      const tries = force ? 0 : triesFor(key);
      // Параметр не пережил уже две загрузки: этот раздел его не держит.
      // Дальше не перезагружаемся, гасим на клиенте.
      if (tries >= C.MAX_FILTER_TRIES) return false;

      url.searchParams.set(param, value);
      memo(key, 'on');
      memo(FILTER_TRIES + key, String(tries + 1));
      beginNavigation(url.toString());
      return true;
    }

    // Выключили тумблер — снимаем и параметр, но только если его поставили мы.
    if (!want && url.searchParams.get(param) === value && applied === 'on') {
      url.searchParams.delete(param);
      memo(key, 'off');
      beginNavigation(url.toString());
      return true;
    }
    return false;
  }

  function renderListing(root) {
    const list = P.cards(root);
    if (!list.length) {
      R.cleanupListingUi();
      return;
    }

    // Один проход — одно вычисление темы страницы (см. render.js).
    R.beginPass();

    const sellerCounts = P.countSellers(list);
    let hideShops = !!S.getHideShops();
    let hiddenShopListings = 0;

    // Обещание, которое расширение обязано держать: пустого экрана не бывает.
    // Бывают выдачи (тот самый «iPhone 16»), где перекупы — вообще все, и
    // тогда честное гашение оставляет человека перед белым листом и плашкой
    // «Скрыто: 50». Это ровно то, на что жаловался владелец. В таком случае
    // не прячем НИЧЕГО: штампы на всех карточках сами говорят, что выдача
    // целиком коммерческая, и это полезнее пустоты.
    if (hideShops) {
      const survivors = list.filter((card) => {
        const count = card.seller ? (sellerCounts.get(card.seller.id) || 0) : 0;
        return !isPro(card.seller, count);
      }).length;
      if (survivors === 0) hideShops = false;
    }

    // Проход разложен на три фазы. Раньше всё делалось в одном цикле: карточке
    // переписывали классы, тут же читали её вычисленный стиль, тут же вставляли
    // узлы — и так пятьдесят раз подряд. Каждое чтение после записи заставляет
    // браузер пересчитать стиль заново, отсюда и секундное замирание на плотной
    // выдаче. Теперь: сначала считаем (без единой записи), потом ОДНИМ пакетом
    // читаем стиль там, где он реально нужен, и только потом пишем в DOM.

    // Фаза 1 — только вычисления и дешёвые запросы к DOM, ни одной записи.
    const plan = [];
    for (const card of list) {
      const sellerCount = card.seller ? (sellerCounts.get(card.seller.id) || 0) : 0;
      const seen = (S.isSeen(card.id) || card.viewedByAvito) && !S.isRestored(card.id);
      const pro = isPro(card.seller, sellerCount);
      // Отрисовка читает готовый флаг с продавца и сама ничего не решает.
      if (card.seller) card.seller.isPro = pro;

      if (pro && hideShops) hiddenShopListings++;

      const wantDuplicate = !!card.seller && sellerCount >= 2;
      const wantAny = seen || wantDuplicate;
      const signature = cardSignature(card, sellerCount, seen, hideShops, pro);
      const host = card.el.querySelector('.avito-clean-host');

      // Штамп проверяем отдельно: Авито умеет снести наш узел, оставив подпись
      // нетронутой, и тогда карточка навсегда осталась бы без метки.
      const unchanged = card.el.dataset.avitoCleanSig === signature
        && !!host === wantAny && R.hasStamp(card.el) === pro;

      plan.push({ card, sellerCount, seen, pro, wantDuplicate, wantAny, signature, host, unchanged });
    }

    // Фаза 2 — чтения стиля пакетом, до всех записей. Карточка, однажды
    // проверенная, второй раз не перечитывается (кэш живёт в render.js).
    for (const p of plan) {
      p.anchor = (!p.unchanged && p.pro) ? R.needsAnchor(p.card.el) : false;
    }

    // Фаза 3 — только записи.
    for (const p of plan) {
      const card = p.card;

      // Авито может переписать className корня карточки, поэтому состояние
      // восстанавливается на каждом проходе, даже если плашку менять не нужно.
      card.el.classList.toggle('avito-clean-hidden', p.pro && hideShops);
      card.el.classList.toggle('avito-clean-seen', p.seen);

      if (p.unchanged) continue;
      card.el.dataset.avitoCleanSig = p.signature;

      if (p.pro) R.stamp(card.el, card.seller, p.sellerCount, p.anchor);
      else R.removeStamp(card.el);

      if (!p.wantAny) {
        if (p.host) p.host.remove();
        continue;
      }

      const row = R.row(card.el, card.badgeAnchor);
      if (p.seen) {
        R.seenBadge(row, card.el, card.id, (id) => {
          S.restoreItem(id);
          refreshPage();
        });
      }
      if (p.wantDuplicate) R.dupBadge(row, card.seller, p.sellerCount);
    }

    R.counter(hiddenShopListings, async () => {
      await S.setHideShops(false);
      refreshPage();
    });
  }

  function refreshPage() {
    if (navigating) return;
    try {
      const context = P.pageContext();
      if (context.kind === 'search') {
        // Уходим на перезагрузку — рисовать по обречённому DOM смысла нет.
        if (syncPrivateFilter(false)) return;
        renderListing(context.root);
        return;
      }

      R.cleanupListingUi();
      if (context.kind === 'item') S.markSeen(context.itemId);
    } catch (error) {
      console.warn('[Чистая выдача] сбой отрисовки:', error);
    }
  }

  // Trailing debounce с maxWait: постоянные мутации не могут отложить проход
  // навсегда, но пачка изменений всё равно схлопывается в одну работу.
  function debounce(fn, ms, maxWait) {
    let timer = null;
    let first = 0;
    return function () {
      const now = Date.now();
      if (!first) first = now;
      if (now - first >= maxWait) {
        clearTimeout(timer);
        timer = null;
        first = 0;
        fn();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        first = 0;
        fn();
      }, ms);
    };
  }

  const scheduleRefresh = debounce(refreshPage, C.DEBOUNCE_MS, C.DEBOUNCE_MAX_MS);

  // Content script живёт в isolated world, поэтому SPA-переход ловится по
  // изменению location.href и несколькими settle-проходами по частично готовому DOM.
  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    noticeManualReset(lastUrl, location.href);
    lastUrl = location.href;
    document.querySelectorAll('[data-avito-clean-sig]')
      .forEach((el) => delete el.dataset.avitoCleanSig);

    clearInterval(settleTimer);
    let tries = 0;
    settleTimer = setInterval(() => {
      refreshPage();
      if (++tries >= 6) clearInterval(settleTimer);
    }, 400);
  }

  async function boot() {
    await S.load();
    refreshPage();

    new MutationObserver((records) => {
      onUrlMaybeChanged();
      for (const record of records) {
        const target = record.target;
        if (target && target.nodeType === 1 && target.closest
            && target.closest('.avito-clean-host, .avito-clean-counter')) continue;
        scheduleRefresh();
        return;
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'content', 'data-marker']
    });

    window.addEventListener('popstate', onUrlMaybeChanged);

    // Только title настоящей карточки внутри подтверждённой выдачи. Служебные
    // ссылки, профиль продавца и соседние карусели историю не загрязняют.
    const onOpen = (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      const context = P.pageContext();
      if (context.kind !== 'search') return;

      const link = event.target.closest && event.target.closest(C.SEL.title);
      const card = link && link.closest(C.SEL.card);
      if (!link || !card || !context.root.contains(card)) return;

      const id = card.getAttribute('data-item-id') || P.itemIdFromUrl(link.getAttribute('href'));
      if (id && S.markSeen(String(id))) scheduleRefresh();
    };
    document.addEventListener('click', onOpen, true);
    document.addEventListener('auxclick', onOpen, true);

    // Signature уже содержит seen/settings. Не удаляем её глобально: debounce
    // перерисует только карточки, чьё вычисленное состояние действительно изменилось.
    // Переключённый человеком тумблер — единственный случай, когда мы правим
    // адрес повторно на том же поиске: это его прямое решение, а не наша догадка.
    S.onChange((change) => {
      if (change && change.settingsChanged
          && P.pageContext().kind === 'search'
          && syncPrivateFilter(true)) return;
      scheduleRefresh();
    });
  }

  boot();
})();
