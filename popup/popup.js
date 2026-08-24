const store = AC.store;
const toggle = document.getElementById('hideShops');
const seenOut = document.getElementById('seen');
const resetBtn = document.getElementById('reset');
const state = document.getElementById('state');
const stateText = document.getElementById('stateText');

// Сломанное хранилище важнее того, какая вкладка открыта: этот флаг не даёт
// проверке вкладки затереть красную строку про недоступное хранилище.
let storageBroken = false;

function setState(kind, text) {
  state.className = kind ? 'state ' + kind : 'state';
  stateText.textContent = text;
}

function showStorageError() {
  storageBroken = true;
  setState('error', 'Хранилище недоступно');
}

// Раньше здесь висела надпись «Работает на avito.ru» — она горела зелёным
// всегда, даже на пустой вкладке, и поэтому ничего не значила. Теперь строка
// говорит про текущую вкладку. Право читать её адрес даёт activeTab: оно
// выдаётся только в момент клика по иконке и не просит доступ к истории.
async function refreshWhere() {
  if (storageBroken) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const raw = tab && tab.url;
    if (!raw) {
      setState('', 'Работает на страницах Авито');
      return;
    }
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'www.avito.ru' || host === 'avito.ru') {
      setState('', 'Авито открыт, всё работает');
    } else {
      setState('idle', 'Сейчас вы не на Авито');
    }
  } catch (error) {
    // Нет доступа к вкладке — не повод пугать пользователя: показываем
    // нейтральное описание вместо статуса.
    setState('', 'Работает на страницах Авито');
  }
}

function showReady() {
  storageBroken = false;
  refreshWhere();
}

async function refreshPopup() {
  try {
    const { settings, seenCount } = await store.getSummary();
    toggle.checked = !!settings.hideShops;
    toggle.disabled = false;
    seenOut.textContent = seenCount;
    resetBtn.disabled = seenCount === 0;
    showReady();
  } catch (error) {
    console.warn('[Чистая выдача] popup не прочитал хранилище:', error);
    toggle.disabled = true;
    resetBtn.disabled = true;
    seenOut.textContent = '—';
    showStorageError();
  }
}

toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  const saved = await store.setHideShops(toggle.checked);
  toggle.disabled = false;
  if (!saved) showStorageError();
});

resetBtn.addEventListener('click', async () => {
  resetBtn.disabled = true;
  try {
    await store.clearHistory();
    await refreshPopup();
  } catch (error) {
    console.warn('[Чистая выдача] popup не очистил историю:', error);
    showStorageError();
  }
});

refreshPopup();
