AC.render = (function () {
  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function sellerWord() {
    for (const [pattern, word] of AC.CFG.SELLER_WORDS) {
      if (pattern.test(location.pathname)) return word;
    }
    return AC.CFG.SELLER_WORD_DEFAULT;
  }

  // Прошлая версия спрашивала тему у операционной системы, и при тёмной теме ОС
  // на белой странице Авито висели чёрные плашки. Спрашиваем саму страницу.
  // Полупрозрачный фон нельзя оценивать по своим же числам: белый с alpha 0.3
  // поверх чёрного выглядит тёмным. Складываем слои снизу вверх, как это делает
  // браузер, и только потом считаем яркость.
  // Тема страницы не меняется в течение одного прохода отрисовки, а её вычисление
  // ходит по всем предкам body с getComputedStyle. До 1.1.2 это делалось на КАЖДЫЙ
  // штамп и КАЖДЫЙ ряд: на плотной выдаче — сотня обходов подряд. Считаем один раз
  // за проход, beginPass() сбрасывает кэш.
  let darkCache = null;

  function beginPass() {
    darkCache = null;
  }

  function pageIsDark() {
    if (darkCache !== null) return darkCache;
    darkCache = computeDark();
    return darkCache;
  }

  function computeDark() {
    const layers = [];
    for (let el = document.body; el; el = el.parentElement) {
      const m = (getComputedStyle(el).backgroundColor || '').match(/[\d.]+/g);
      if (!m || m.length < 3) continue;
      const a = m.length > 3 ? parseFloat(m[3]) : 1;
      if (a <= 0) continue;
      layers.push({ r: +m[0], g: +m[1], b: +m[2], a });
      if (a >= 1) break;
    }
    if (!layers.length) return false;

    // Ниже всего — белый холст браузера, дальше накладываем слои сверху вниз.
    let [r, g, b] = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      r = l.r * l.a + r * (1 - l.a);
      g = l.g * l.a + g * (1 - l.a);
      b = l.b * l.a + b * (1 - l.a);
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  }

  function css(dark) {
    return `
      :host { all: initial; }
      .row { display: flex; flex-wrap: wrap; gap: 5px; margin: 5px 0 1px;
             font: 500 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; }
      .b { display: inline-flex; align-items: center; gap: 5px;
           margin: 0; padding: 3px 9px; border: 0; border-radius: 8px;
           white-space: nowrap; font: inherit; }
      .shop { background: ${dark ? '#3a2c10' : '#fff3dc'}; color: ${dark ? '#ffc457' : '#8a5a00'}; }
      .dup  { background: ${dark ? '#23262a' : '#eef0f2'}; color: ${dark ? '#a8b0b8' : '#5a626b'}; }
      .seen { background: ${dark ? '#221f45' : '#e9e7ff'}; color: ${dark ? '#b5aaff' : '#4b3fbb'};
              cursor: pointer; }
      .seen:hover { background: ${dark ? '#2c2857' : '#ddd9ff'}; }
      .seen:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    `;
  }

  // Один разобранный лист стилей на все Shadow-хосты вместо своего <style> в каждом.
  // Браузер парсит CSS один раз, а не по разу на карточку. Где конструируемые листы
  // не поддерживаются — откатываемся на <style>, поведение то же.
  const sheetCache = new Map();
  const canAdopt = typeof CSSStyleSheet === 'function'
    && (() => { try { new CSSStyleSheet(); return true; } catch (e) { return false; } })();

  function applyStyle(shadowRoot, kind, dark, cssText) {
    const key = kind + (dark ? ':dark' : ':light');
    if (canAdopt) {
      let sheet = sheetCache.get(key);
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText());
        sheetCache.set(key, sheet);
      }
      shadowRoot.adoptedStyleSheets = [sheet];
      return;
    }
    let text = sheetCache.get(key);
    if (text === undefined) {
      text = cssText();
      sheetCache.set(key, text);
    }
    const style = document.createElement('style');
    style.textContent = text;
    shadowRoot.append(style);
  }

  // Плашки живут в Shadow DOM: стили Авито внутрь не текут, наши наружу не ломают.
  function row(cardEl, anchor = cardEl) {
    let host = cardEl.querySelector(':scope > .avito-clean-host, :scope .avito-clean-host');
    if (host && host.shadowRoot) {
      if (host.parentElement !== anchor) anchor.appendChild(host);
      const r = host.shadowRoot.querySelector('.row');
      r.textContent = '';
      return r;
    }
    
    host = document.createElement('div');
    host.className = 'avito-clean-host';
    const sh = host.attachShadow({ mode: 'open' });
    const dark = pageIsDark();
    applyStyle(sh, 'row', dark, () => css(dark));
    const r = document.createElement('div');
    r.className = 'row';
    sh.append(r);

    anchor.appendChild(host);
    return r;
  }

  function badge(r, cls, label, title, interactive = false) {
    const b = document.createElement(interactive ? 'button' : 'span');
    if (interactive) b.type = 'button';
    b.className = 'b ' + cls;
    b.textContent = label;
    if (title) b.title = title;
    r.appendChild(b);
    return b;
  }

  // Единственная плашка, оставшаяся под ценой. Вердикт «кто это» несёт штамп,
  // а здесь живёт то, чего не показывает ни Авито, ни конкуренты: сколько мест
  // в этой выдаче занял один и тот же продавец. Дублировать штамп словом
  // «магазин» ещё и тут — превращать метку в фон, это уже было в прошлой версии.
  function dupBadge(r, seller, dupCount) {
    const extra = dupCount - 1;
    badge(r, 'dup',
      `ещё ${extra} ${plural(extra, ['объявление', 'объявления', 'объявлений'])} этого продавца`,
      `${seller.name || 'Продавец'} занял ${dupCount} мест в этой выдаче`);
  }

  // Просмотренное не удаляем из ленты — гасим и даём вернуть одним кликом.
  // Ничего не прячем через display:none: кнопка «вернуть» должна оставаться нажимаемой.
  function seenBadge(r, cardEl, id, onRestore) {
    cardEl.classList.add('avito-clean-seen');
    const b = badge(r, 'seen', 'уже смотрели · вернуть', 'Снять отметку «просмотрено»', true);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cardEl.classList.remove('avito-clean-seen');
      onRestore(id);
    });
  }

  // ШТАМП. Ряд плашек под ценой теряется в родной вёрстке Авито — именно на это
  // и жаловался владелец: «скрыто 50» он видел, а кто именно магазин — нет.
  // Штамп лежит отдельным хостом в углу самой карточки, поверх фотографии,
  // и читается, не читая карточку.
  //
  // pointer-events: none (в page.css) обязателен: штамп перекрывает ссылку на
  // объявление, и без него он съедал бы клики по карточке.
  function stampCss(dark) {
    return `
      :host { all: initial; }
      .s { display: inline-block; padding: 3px 8px;
           border: 2px solid ${dark ? '#ff7a7a' : '#d5333a'}; border-radius: 4px;
           color: ${dark ? '#ff9a9a' : '#d5333a'};
           background: ${dark ? 'rgba(26,12,12,0.78)' : 'rgba(255,255,255,0.86)'};
           font: 800 11px/1.15 -apple-system, "Segoe UI", Roboto, sans-serif;
           letter-spacing: 0.07em; text-transform: uppercase;
           transform: rotate(-7deg); }
    `;
  }

  // Слово честное, а не громкое. Витрину Авито завело само — значит «магазин»
  // (в вакансиях «работодатель», в недвижимости «агентство»). А продавца,
  // которого мы поймали по горе отзывов или по числу объявлений, магазином
  // называть нельзя: юридически он может быть физлицом. Для него — «перекуп»,
  // и подсказка объясняет, на каком основании.
  function stampWord(seller) {
    return seller && seller.isShop ? sellerWord() : 'перекуп';
  }

  function stampTitle(seller, dupCount) {
    const who = (seller && seller.name) || 'Продавец';
    if (seller && seller.isShop) return who + ' — витрина Авито, не частное лицо';
    if (dupCount >= 2) return who + ` занял ${dupCount} мест в этой выдаче`;
    return who + ' — ' + (seller && seller.reviews ? seller.reviews : 'много сделок')
      + ', это не разовая продажа';
  }

  // Проверка опоры — чтение стиля, и до 1.1.2 оно стояло ВНУТРИ цикла по карточкам,
  // между записями в DOM. Каждое такое чтение заставляет браузер пересчитать стиль
  // заново. Теперь решение принимается заранее, пакетом (см. needsAnchor), а карточка,
  // однажды проверенная, больше не перечитывается.
  const anchorChecked = new WeakSet();

  function needsAnchor(cardEl) {
    if (anchorChecked.has(cardEl)) return false;
    anchorChecked.add(cardEl);
    return getComputedStyle(cardEl).position === 'static';
  }

  function stamp(cardEl, seller, dupCount, anchorDecided) {
    // Абсолютное позиционирование требует опоры. Карточки Авито и так
    // relative, но если попадётся static — подпираем, ничего не ломая.
    // Решение приходит снаружи; без него читаем сами — так вызов остаётся
    // рабочим для тестов и для одиночной отрисовки.
    if (anchorDecided === undefined ? needsAnchor(cardEl) : anchorDecided) {
      cardEl.style.position = 'relative';
    }

    let host = cardEl.querySelector(':scope > .avito-clean-stamp');
    if (!host) {
      host = document.createElement('div');
      host.className = 'avito-clean-stamp';
      const sh = host.attachShadow({ mode: 'open' });
      const dark = pageIsDark();
      applyStyle(sh, 'stamp', dark, () => stampCss(dark));
      const span = document.createElement('span');
      span.className = 's';
      sh.append(span);
      cardEl.appendChild(host);
    }

    const span = host.shadowRoot.querySelector('.s');
    const label = stampWord(seller);
    // Присваивание вслепую — это мутация DOM, а наблюдатель тут же позвал бы
    // нас обратно. Пишем, только когда текст действительно другой.
    if (span.textContent !== label) span.textContent = label;
    const title = stampTitle(seller, dupCount);
    if (host.title !== title) host.title = title;
  }

  function removeStamp(cardEl) {
    const host = cardEl.querySelector(':scope > .avito-clean-stamp');
    if (host) host.remove();
  }

  function hasStamp(cardEl) {
    return !!cardEl.querySelector(':scope > .avito-clean-stamp');
  }

  // Одна плавающая плашка вместо возни в каждой карточке: сколько магазинов спрятано
  // и как их вернуть. Живёт вне карточек, поэтому её невозможно случайно скрыть вместе с ними.
  function counter(count, onShow) {
    let el = document.querySelector('.avito-clean-counter');
    if (!count) { if (el) el.remove(); return; }

    if (!el) {
      if (!onShow) return;
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'avito-clean-counter';
      el.addEventListener('click', onShow);
      document.body.appendChild(el);
    }
    // Присваивание textContent заменяет текстовый узел, а это мутация DOM.
    // Наблюдатель увидел бы её, снова вызвал отрисовку — и мы крутились бы
    // по кругу пять раз в секунду. Пишем только когда текст реально изменился.
    const label = `Скрыто: ${count} · показать`;
    if (el.textContent !== label) el.textContent = label;
  }

  function cleanupListingUi() {
    counter(0, null);
    document.querySelectorAll('.avito-clean-host, .avito-clean-stamp')
      .forEach((host) => host.remove());
    document.querySelectorAll('[data-avito-clean-sig], .avito-clean-seen, .avito-clean-hidden')
      .forEach((el) => {
        el.classList.remove('avito-clean-seen', 'avito-clean-hidden');
        delete el.dataset.avitoCleanSig;
      });
  }

  return { row, dupBadge, seenBadge, counter, cleanupListingUi,
    stamp, removeStamp, hasStamp, beginPass, needsAnchor };
})();
