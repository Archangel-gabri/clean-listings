// Состояние одного объявления — один атомарно переписываемый ключ "v:<id>".
// Положительное значение означает «просмотрено», отрицательное — «вернуть»;
// модуль значения хранит timestamp, поэтому TTL одинаков для обоих состояний.
AC.store = (function () {
  const { SEEN_TTL_DAYS, DEFAULTS } = AC.CFG;
  const MARK_PREFIX = 'v:';
  const listeners = [];
  const queuedChanges = [];
  const state = {
    marks: Object.create(null),
    settings: settingsWithDefaults()
  };
  let loading = false;

  function warn(error) {
    console.warn('[Чистая выдача] хранилище недоступно:', error);
  }

  function settingsWithDefaults(value) {
    return { ...DEFAULTS, ...(value || {}) };
  }

  function cutoff() {
    return Date.now() - SEEN_TTL_DAYS * 864e5;
  }

  function applyChanges(changes) {
    let touched = false;
    const changedIds = [];
    let settingsChanged = false;

    for (const key in changes) {
      if (key === 'settings') {
        state.settings = settingsWithDefaults(changes[key].newValue);
        settingsChanged = true;
        touched = true;
        continue;
      }
      if (!key.startsWith(MARK_PREFIX)) continue;

      const id = key.slice(MARK_PREFIX.length);
      const value = changes[key].newValue;
      if (typeof value === 'number' && Math.abs(value) >= cutoff()) state.marks[id] = value;
      else delete state.marks[id];
      changedIds.push(id);
      touched = true;
    }

    if (touched) {
      const change = { ids: changedIds, settingsChanged };
      listeners.forEach((listener) => listener(change));
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (loading) {
      queuedChanges.push(changes);
      return;
    }
    applyChanges(changes);
  });

  async function load() {
    loading = true;
    queuedChanges.length = 0;
    try {
      const all = await chrome.storage.local.get(null);
      const oldestAllowed = cutoff();
      const marks = Object.create(null);
      const stale = [];

      for (const key in all) {
        if (!key.startsWith(MARK_PREFIX)) continue;
        const value = all[key];
        if (typeof value !== 'number' || Math.abs(value) < oldestAllowed) {
          stale.push(key);
          continue;
        }
        marks[key.slice(MARK_PREFIX.length)] = value;
      }

      state.marks = marks;
      state.settings = settingsWithDefaults(all.settings);
      if (stale.length) {
        try { await chrome.storage.local.remove(stale); }
        catch (error) { warn(error); }
      }
    } catch (error) {
      // Fail-open: UI продолжает работать с пустой историей и defaults.
      warn(error);
      state.marks = Object.create(null);
      state.settings = settingsWithDefaults();
    } finally {
      loading = false;
      for (const changes of queuedChanges.splice(0)) applyChanges(changes);
    }
  }

  function isSeen(id) {
    return state.marks[id] > 0;
  }

  function isRestored(id) {
    return state.marks[id] < 0;
  }

  function markSeen(id) {
    if (!id || state.marks[id] > 0) return false;
    const value = Date.now();
    state.marks[id] = value;
    chrome.storage.local.set({ [MARK_PREFIX + id]: value }).catch(warn);
    return true;
  }

  // «Вернуть» — явное отрицательное состояние: иначе нативная метка Авито
  // немедленно погасила бы карточку снова.
  function restoreItem(id) {
    if (!id) return false;
    const value = -Date.now();
    state.marks[id] = value;
    chrome.storage.local.set({ [MARK_PREFIX + id]: value }).catch(warn);
    return true;
  }

  function getHideShops() {
    return !!state.settings.hideShops;
  }

  async function setHideShops(value) {
    try {
      const stored = await chrome.storage.local.get('settings');
      const settings = {
        ...settingsWithDefaults(stored.settings),
        hideShops: !!value
      };
      state.settings = settings;
      await chrome.storage.local.set({ settings });
      return true;
    } catch (error) {
      warn(error);
      return false;
    }
  }

  async function getSummary() {
    const all = await chrome.storage.local.get(null);
    const oldestAllowed = cutoff();
    let seenCount = 0;
    for (const key in all) {
      if (key.startsWith(MARK_PREFIX)
          && typeof all[key] === 'number'
          && all[key] > 0
          && all[key] >= oldestAllowed) seenCount++;
    }
    return {
      settings: settingsWithDefaults(all.settings),
      seenCount
    };
  }

  async function clearHistory() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(MARK_PREFIX));
    state.marks = Object.create(null);
    if (keys.length) await chrome.storage.local.remove(keys);
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  return {
    load,
    isSeen,
    isRestored,
    markSeen,
    restoreItem,
    getHideShops,
    setHideShops,
    getSummary,
    clearHistory,
    onChange
  };
})();
