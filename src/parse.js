AC.parse = (function () {
  const { SEL } = AC.CFG;

  function text(el) {
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  // id объявления лежит строго в конце pathname:
  // /moskva/telefony/iphone_13_128_gb_8331822423
  function itemIdFromUrl(href) {
    if (!href) return null;
    try {
      const url = new URL(String(href), document.baseURI);
      const match = url.pathname.match(/_(\d{6,})\/?$/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function pageContext(loc = location, doc = document) {
    const hostname = (loc.hostname || '').toLowerCase();
    const pathname = loc.pathname || '/';

    // Проверена только desktop-версия. На m.* и служебных поддоменах fail-closed.
    if (hostname !== 'www.avito.ru' && hostname !== 'avito.ru') {
      return { kind: 'unsupported' };
    }

    if (pathname === '/') return { kind: 'home' };
    if (/^\/favorites(?:\/|$)/.test(pathname)) return { kind: 'favorites' };
    if (/^\/profile\/items(?:\/|$)/.test(pathname)) return { kind: 'my-items' };
    if (/^\/profile\/messenger(?:\/|$)/.test(pathname)) return { kind: 'chat' };
    if (/^\/(?:brands|user)\//.test(pathname)) return { kind: 'seller-profile' };

    const params = new URLSearchParams(loc.search || '');
    if (params.has('map') || doc.querySelector(SEL.mapPage)) return { kind: 'map' };

    const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
    const reserved = /^(?:search|profile|favorites|brands|user)(?:_|$)/.test(firstSegment);
    const itemId = !reserved && itemIdFromUrl(loc.href || pathname);
    if (itemId && doc.querySelector(SEL.itemPage)) return { kind: 'item', itemId };

    const root = doc.querySelector(SEL.searchRoot);
    if (root) return { kind: 'search', root };

    return { kind: 'unsupported' };
  }

  // Профессионального продавца отличает сам факт наличия блока витрины.
  // У частника в ленте нет ни ссылки на профиль, ни рейтинга, ни отзывов.
  // Авито само делит продавцов на два типа, и мы просто отражаем его решение,
  // а не выдумываем своё:
  //   /brands/<id> — витрина, то есть магазин или профессиональный продавец;
  //   /user/<id>   — обычный профиль частника, у которого просто есть отзывы.
  // Проверено на живой выдаче детской одежды: 49 витрин, 2 частных профиля,
  // 31 карточка вообще без блока продавца. Раньше «магазином» называлось всё
  // подряд, включая частницу с 26 отзывами — это враньё, которое видно глазом.
  function seller(cardEl) {
    const link = cardEl.querySelector(SEL.sellerLink);
    if (!link) return null;

    const href = link.getAttribute('href') || '';
    let url;
    try { url = new URL(href, document.baseURI); } catch (_) { return null; }
    const match = url.pathname.match(/^\/(brands|user)\/([^/?#]+)/);
    const kind = match ? match[1] : 'unknown';
    const rawId = match ? match[2] : url.pathname;
    if (!rawId) return null;

    // На части карточек отзывы приходят в скобках: «(286 отзывов)». В плашке
    // скобки лишние, а имя по ним потом не разрежется.
    const reviews = (text(cardEl.querySelector(SEL.sellerReviews)) || '')
      .replace(/^[\s(]+|[\s)]+$/g, '') || null;
    return {
      id: `${kind}:${rawId}`,
      // витриной считаем только явный /brands/; неизвестную форму адреса
      // трактуем осторожно — как частника, чтобы не наклеить ярлык зря
      isShop: kind === 'brands',
      name: sellerName(link, reviews),
      reviews,
      reviewCount: reviewsToNumber(reviews)
    };
  }

  // «3 175 отзывов» → 3175. Пробел внутри числа у Авито неразрывный, поэтому
  // вычищаем все пробельные символы, а не только обычный пробел: иначе число
  // разваливается на «3» и порог перестаёт срабатывать ровно на тех, ради
  // кого он и заведён — на продавцах с тысячами сделок.
  function reviewsToNumber(text) {
    if (!text) return 0;
    const match = String(text).replace(/\s/g, '').match(/(\d+)отзыв/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  // В ссылке лежит имя, а следом рейтинг и отзывы — иногда одним куском текста,
  // иногда отдельными узлами. Отрезаем всё, что уже показано рядом.
  function sellerName(link, reviews) {
    let raw = Array.from(link.childNodes)
      .map((n) => (n.textContent || '').trim())
      .find((t) => t && !/^[\d.,(]/.test(t)) || text(link);
    if (!raw) return null;

    if (reviews) raw = raw.split(reviews)[0];
    // Отрезаем ТОЛЬКО хвост, похожий на рейтинг («4,7», «5.0») или на остаток
    // строки отзывов. Имя «Магазин 24» должно остаться «Магазин 24».
    return raw
      .replace(/[\s·(]*\d+[.,]\d+[\s·)]*$/, '')
      .replace(/[\s·(]*\d+\s*отзыв\S*[\s·)]*$/i, '')
      .replace(/[\s·(]+$/, '')
      .trim() || null;
  }

  function cards(root = document) {
    const out = [];
    for (const el of root.querySelectorAll(SEL.card)) {
      const link = el.querySelector(SEL.title);
      const id = el.getAttribute('data-item-id') || itemIdFromUrl(link && link.getAttribute('href'));
      if (!id) continue;

      const priceEl = el.querySelector(SEL.price);
      const badgeAnchor = (priceEl && priceEl.parentElement)
        || (link && link.parentElement)
        || el;
      const anchorKind = priceEl ? 'price' : (link ? 'title' : 'card');

      const photo = el.querySelector(SEL.photo);
      const viewedByAvito = !!photo && (photo.textContent || '').indexOf(AC.CFG.VIEWED_TEXT) !== -1;

      out.push({
        el,
        id: String(id),
        viewedByAvito,
        badgeAnchor,
        anchorKind,
        seller: seller(el)
      });
    }
    return out;
  }

  // Считаем, сколько раз каждый продавец встретился в этой выдаче.
  function countSellers(list) {
    const counts = new Map();
    for (const c of list) {
      if (c.seller) counts.set(c.seller.id, (counts.get(c.seller.id) || 0) + 1);
    }
    return counts;
  }

  return { cards, countSellers, itemIdFromUrl, pageContext, reviewsToNumber };
})();
