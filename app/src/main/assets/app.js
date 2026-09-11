/* Ровно: packaged interface. Rates come only from a real provider or its cache. */
(function () {
  'use strict';

  const Core = window.RovnoCore;
  const $ = (id) => document.getElementById(id);
  const native = window.Android || null;
  const STORE = 'rovno.preferences.v1';
  const CACHE = 'rovno.rates.v1';
  const SOURCE_URL = 'https://github.com/fawazahmed0/exchange-api';
  const DEFAULT_CODES = ['PLN', 'USD', 'EUR', 'BYN', 'RUB'];
  const SHORT_NAMES = { PLN: 'Злотый', USD: 'Доллар США', EUR: 'Евро', BYN: 'Бел. рубль', RUB: 'Росс. рубль' };
  const metadata = new Map(Core.CURRENCIES.map((currency) => [currency.code, currency]));
  const calculator = new Core.Calculator();
  let rateState = { rates: null, date: null, provider: null, fetchedAt: null, error: null, refreshing: false };
  let preferences = readStorage(STORE) || {};
  let selectedCodes = Array.isArray(preferences.currencies)
    ? [...new Set(preferences.currencies.filter((code) => metadata.has(code)))] : DEFAULT_CODES.slice();
  if (!selectedCodes.length) selectedCodes = DEFAULT_CODES.slice();
  let activeCode = selectedCodes.includes(preferences.activeCode) ? preferences.activeCode : selectedCodes[0];
  let theme = ['system', 'light', 'dark'].includes(preferences.theme) ? preferences.theme : 'dark';
  let currentSheet = null;
  let previousFocus = null;
  let toastTimeout;
  let longPressTimeout;
  let longPressCode = null;
  let suppressClickUntil = 0;
  let browserRefresh = null;
  let calcState = calculator.state();
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

  if (typeof preferences.expression === 'string' && preferences.expression.length < 200) {
    try {
      const restored = new Core.Calculator(preferences.expression);
      if (Number.isFinite(restored.state().value)) calculator.expression = preferences.expression;
    } catch (_) { /* Invalid stored input starts again at zero. */ }
    calcState = calculator.state();
  }

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Private browsing or full storage. */ }
  }

  function persist() {
    writeStorage(STORE, { currencies: selectedCodes, activeCode, theme, expression: calcState.expression });
  }

  function safeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function haptic() {
    try { if (native && native.haptic) native.haptic(); } catch (_) { /* Optional device feedback. */ }
  }

  function applyTheme() {
    const resolved = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]').content = resolved === 'dark' ? '#141a1b' : '#f2f3ec';
    try { if (native && native.setTheme) native.setTheme(resolved); } catch (_) { /* Browser preview. */ }
  }

  function dateLabel(date, full) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'не загружены';
    const value = new Date(date + 'T12:00:00');
    if (Number.isNaN(value.getTime())) return 'не загружены';
    return value.toLocaleDateString('ru-RU', { day: 'numeric', month: full ? 'long' : 'short', ...(full ? { year: 'numeric' } : {}) }).replace(/\s?г\.$/, '');
  }

  function snapshotOld() {
    if (!rateState.date) return false;
    const time = new Date(rateState.date + 'T23:59:59Z').getTime();
    return Number.isFinite(time) && Date.now() - time > 48 * 60 * 60 * 1000;
  }

  function renderStatus() {
    let label;
    const hasRates = !!rateState.rates;
    if (rateState.refreshing) label = hasRates ? 'Обновляем · ' + dateLabel(rateState.date) : 'Загружаем курсы';
    else if (!hasRates) label = 'Курсы недоступны · повторить';
    else if (rateState.error) label = 'Сохранённые курсы · ' + dateLabel(rateState.date);
    else label = (snapshotOld() ? 'Курсы устарели · ' : 'Курсы на ') + dateLabel(rateState.date);
    $('rates-status').textContent = label;
    $('status-dot').classList.toggle('warning', !rateState.refreshing && (!hasRates || !!rateState.error || snapshotOld()));
    $('status-dot').classList.toggle('loading', !!rateState.refreshing);
    $('refresh-button').classList.toggle('loading', !!rateState.refreshing);
    $('refresh-button').disabled = !!rateState.refreshing;
    $('refresh-button').setAttribute('aria-label', rateState.refreshing ? 'Курсы обновляются' : 'Обновить курсы');
    $('unavailable-note').hidden = hasRates || !!rateState.refreshing;
  }

  function convertedValue(code) {
    const value = calcState.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (code === activeCode) return value;
    if (!rateState.rates) return null;
    try {
      const converted = Core.convert(value, activeCode, code, rateState.rates);
      return Number.isFinite(converted) ? converted : null;
    } catch (_) { return null; }
  }

  function displayAmount(code, value) {
    if (value === null) return '—';
    const expression = String(calcState.expression || '0');
    if (code === activeCode && /^-?\d+(?:[.,]\d*)?$/.test(expression)) {
      const parts = expression.replace(',', '.').split('.');
      const integer = Number(parts[0]);
      const grouped = Object.is(integer, -0) ? '−0' : Core.format(integer, 0);
      return grouped + (parts.length > 1 ? ',' + parts[1] : '');
    }
    return Core.format(value, code === activeCode ? 6 : 2);
  }

  function renderCurrencies() {
    const fragment = document.createDocumentFragment();
    for (const code of selectedCodes) {
      const currency = metadata.get(code);
      const amount = convertedValue(code);
      const formatted = displayAmount(code, amount);
      const active = code === activeCode;
      const row = document.createElement('button');
      row.className = 'currency-row' + (active ? ' active' : '');
      row.dataset.currency = code;
      row.setAttribute('aria-pressed', String(active));
      row.setAttribute('aria-label', currency.name + ', ' + (amount === null ? 'курс недоступен' : formatted) + (active ? ', ввод суммы' : ', выбрать для ввода'));
      row.title = 'Нажмите для ввода. Удерживайте, чтобы скопировать.';
      const length = formatted.replace(/[\s\u00a0\u202f]/g, '').length;
      const sizeClass = length > 13 ? ' long' : length > 9 ? ' medium' : '';
      row.innerHTML = '<span class="currency-badge" aria-hidden="true">' + safeText(currency.symbol || code.slice(0, 1)) + '</span>'
        + '<span class="currency-meta"><span class="currency-code">' + safeText(code) + '</span><span class="currency-name">' + safeText(SHORT_NAMES[code] || currency.name) + '</span></span>'
        + '<span class="currency-result"><span class="currency-amount' + sizeClass + (amount === null ? ' unavailable' : '') + '">' + safeText(formatted) + '</span></span>';
      fragment.appendChild(row);
    }
    $('currency-list').replaceChildren(fragment);
    $('input-label').textContent = 'Ввод в ' + activeCode;
    const expression = String(calcState.expression || '0').replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/-/g, '−').replace(/\./g, ',');
    $('expression').textContent = calcState.error || expression;
    $('expression').classList.toggle('error', !!calcState.error);
    $('copy-button').disabled = !Number.isFinite(Number(calcState.value)) || !!calcState.error;
  }

  function selectCurrency(code) {
    if (code === activeCode) return;
    if (calcState.error || !Number.isFinite(calcState.value)) {
      showToast('Сначала исправьте выражение или нажмите AC');
      return;
    }
    const value = convertedValue(code);
    if (value === null && Number(calcState.value) !== 0) {
      showToast('Для смены валюты сначала загрузите курсы');
      return;
    }
    activeCode = code;
    calculator.setValue(value === null ? 0 : value);
    calcState = calculator.state();
    haptic();
    renderCurrencies();
    persist();
  }

  function press(key) {
    calcState = calculator.press(key);
    haptic();
    renderCurrencies();
    persist();
  }

  async function copyAmount(code) {
    const value = convertedValue(code);
    if (value === null || calcState.error) { showToast('Сумма пока недоступна'); return; }
    const text = Core.format(value, code === activeCode ? 6 : 2).replace(/[\s\u00a0\u202f]/g, '');
    try {
      if (native && native.copy) native.copy(text);
      else if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard unavailable');
      }
      haptic();
      showToast('Скопировано: ' + text + ' ' + code);
    } catch (_) { showToast('Не удалось скопировать сумму'); }
  }

  function showToast(message) {
    clearTimeout(toastTimeout);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 2400);
  }

  function showSheet(kind) {
    if (!currentSheet) previousFocus = document.activeElement;
    currentSheet = kind;
    $('sheet-backdrop').hidden = false;
    document.querySelector('.app-shell').inert = true;
    if (kind === 'settings') renderSettings();
    else if (kind === 'currencies') renderPicker();
    else renderInfo();
    $('sheet-content').scrollTop = 0;
    $('sheet').focus({ preventScroll: true });
  }

  function closeSheet() {
    currentSheet = null;
    $('sheet-backdrop').hidden = true;
    document.querySelector('.app-shell').inert = false;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
  }

  function renderSettings() {
    $('sheet-title').textContent = 'Настройки';
    $('sheet-content').innerHTML = '<p class="setting-label">Оформление</p>'
      + '<div class="theme-picker" role="group" aria-label="Тема оформления">'
      + [['system', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([value, label]) => '<button class="theme-choice' + (theme === value ? ' selected' : '') + '" data-theme-choice="' + value + '" aria-pressed="' + (theme === value) + '">' + label + '</button>').join('')
      + '</div><p class="setting-label">Под себя</p>'
      + '<button class="settings-action" data-action="currencies"><span><strong>Мои валюты</strong><small>' + safeText(selectedCodes.join(' · ')) + '</small></span><span class="chevron" aria-hidden="true">›</span></button>'
      + '<button class="settings-action" data-action="info"><span><strong>О курсах и приложении</strong><small>Источник, обновление и работа без интернета</small></span><span class="chevron" aria-hidden="true">›</span></button>'
      + '<p class="settings-footnote">Нажмите на валюту, чтобы считать в ней.<br>Удерживайте сумму, чтобы скопировать.<br>Ровно · без рекламы и регистрации</p>';
  }

  function renderPicker() {
    $('sheet-title').textContent = 'Мои валюты';
    $('sheet-content').innerHTML = '<div class="currency-search-wrap"><input class="currency-search" id="currency-search" type="search" autocomplete="off" spellcheck="false" autocapitalize="characters" aria-label="Поиск валюты" placeholder="Код или название валюты"></div>'
      + '<div class="currency-picker-list" id="currency-picker-list"></div><button class="picker-done" id="picker-done" data-action="done">Готово</button>';
    $('currency-search').addEventListener('input', () => renderPickerList($('currency-search').value));
    renderPickerList('');
  }

  function renderPickerList(query) {
    const search = String(query).trim().toLocaleLowerCase('ru-RU');
    const ordered = Core.CURRENCIES.slice().sort((a, b) => {
      const ai = selectedCodes.indexOf(a.code);
      const bi = selectedCodes.indexOf(b.code);
      if (ai >= 0 || bi >= 0) return ai < 0 ? 1 : bi < 0 ? -1 : ai - bi;
      return a.name.localeCompare(b.name, 'ru');
    });
    const matches = ordered.filter((currency) => (currency.code + ' ' + currency.name).toLocaleLowerCase('ru-RU').includes(search));
    $('currency-picker-list').innerHTML = matches.length ? matches.map((currency) => {
      const selected = selectedCodes.includes(currency.code);
      return '<button class="picker-row' + (selected ? ' selected' : '') + '" data-toggle-currency="' + safeText(currency.code) + '" aria-pressed="' + selected + '" aria-label="' + safeText(currency.code + ', ' + currency.name) + '"><span class="currency-badge" aria-hidden="true">' + safeText(currency.symbol || currency.code.slice(0, 1)) + '</span><span class="currency-meta"><span class="currency-code">' + safeText(currency.code) + '</span><span class="currency-name">' + safeText(currency.name) + '</span></span><span class="picker-check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3.5 3.5L15 7"/></svg></span></button>';
    }).join('') : '<p class="picker-empty">Такой валюты нет в списке. Попробуйте международный код, например GBP.</p>';
    $('picker-done').textContent = 'Готово · ' + selectedCodes.length + ' ' + pluralCurrencies(selectedCodes.length);
  }

  function pluralCurrencies(number) {
    const tens = number % 100;
    if (tens >= 11 && tens <= 14) return 'валют';
    if (number % 10 === 1) return 'валюта';
    if (number % 10 >= 2 && number % 10 <= 4) return 'валюты';
    return 'валют';
  }

  function toggleCurrency(code) {
    if (!metadata.has(code)) return;
    if (selectedCodes.includes(code)) {
      if (selectedCodes.length === 1) { showToast('Оставьте хотя бы одну валюту'); return; }
      if (code === activeCode) {
        const next = selectedCodes.find((item) => item !== code);
        selectCurrency(next);
        if (activeCode === code) return;
      }
      selectedCodes = selectedCodes.filter((item) => item !== code);
    } else selectedCodes.push(code);
    haptic();
    persist();
    renderCurrencies();
    renderPickerList($('currency-search').value);
  }

  function renderInfo() {
    $('sheet-title').textContent = 'Просто посчитать';
    const fetched = rateState.fetchedAt ? new Date(rateState.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ещё не загружены';
    $('sheet-content').innerHTML = '<p class="info-intro">Нужные валюты.<br>Один калькулятор.<br><em>Ничего лишнего.</em></p>'
      + '<div class="info-card"><dl><div><dt>Источник</dt><dd>' + safeText(rateState.provider || 'Currency API') + '</dd></div><div><dt>Дата курсов</dt><dd>' + safeText(dateLabel(rateState.date, true)) + '</dd></div><div><dt>Загружены</dt><dd>' + safeText(fetched) + '</dd></div></dl></div>'
      + (rateState.error ? '<p class="info-error">Не удалось обновить курсы. Проверьте подключение и нажмите кнопку обновления.' + (rateState.rates ? ' Расчёты используют сохранённые данные.' : '') + '</p>' : '')
      + '<p class="info-paragraph">Курсы справочные. Поставщик обновляет их ежедневно. Приложение проверяет обновления при открытии; можно обновить вручную кнопкой ↻.</p>'
      + '<p class="info-paragraph">Без интернета работают последние сохранённые курсы. Дата рядом с кнопкой обновления — дата самих курсов, а не время загрузки.</p>'
      + '<p class="info-paragraph">Банк или обменник может использовать другой курс и комиссию. Для RUB и BYN разница с доступным вам курсом может быть особенно заметной.</p>'
      + '<button class="source-link" data-action="source">Открыть источник курсов ↗</button>'
      + '<p class="settings-footnote">Ровно 0.1.0 · Личный конвертер валют<br>Без рекламы, аккаунтов и аналитики.<br>Настройки и последние курсы хранятся на устройстве.</p>';
  }

  function validateState(state) {
    if (!state || typeof state !== 'object') return null;
    const clean = { ...state, rates: null };
    if (state.rates && typeof state.rates === 'object') {
      const rates = {};
      for (const [code, value] of Object.entries(state.rates)) {
        if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value;
      }
      if (rates.USD && rates.PLN && rates.EUR && rates.BYN && rates.RUB) clean.rates = rates;
    }
    return clean;
  }

  function receiveRates(state) {
    if (typeof state === 'string') {
      try { state = JSON.parse(state); } catch (_) { return; }
    }
    const validated = validateState(state);
    if (!validated) return;
    rateState = { rates: null, date: null, provider: null, fetchedAt: null, error: null, refreshing: false, ...validated };
    renderStatus();
    renderCurrencies();
    if (currentSheet === 'info') renderInfo();
  }

  async function fetchSnapshot(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !data.usd) throw new Error('Invalid snapshot');
      const rates = {};
      for (const [code, value] of Object.entries(data.usd)) rates[code.toUpperCase()] = value;
      const state = validateState({ rates, date: data.date, provider: 'Currency API', fetchedAt: Date.now(), error: null, refreshing: false });
      if (!state.rates) throw new Error('Required currencies unavailable');
      return state;
    } finally { clearTimeout(timeout); }
  }

  async function refreshRates() {
    if (rateState.refreshing || browserRefresh) return;
    if (native && native.refresh) {
      receiveRates({ ...rateState, refreshing: true });
      try { native.refresh(); }
      catch (_) { receiveRates({ ...rateState, refreshing: false, error: 'Не удалось обновить курсы' }); }
      return;
    }
    receiveRates({ ...rateState, refreshing: true });
    browserRefresh = (async () => {
      const urls = ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'];
      let best = null;
      const today = new Date().toISOString().slice(0, 10);
      for (const url of urls) {
        try {
          const state = await fetchSnapshot(url);
          if (rateState.date && state.date < rateState.date) continue;
          if (!best || state.date > best.date) best = state;
          if (best.date >= today) break;
        } catch (_) { /* Try the independent CDN before retaining cached rates. */ }
      }
      if (best) {
        writeStorage(CACHE, best);
        receiveRates(best);
        return;
      }
      receiveRates({ ...rateState, refreshing: false, error: 'Не удалось загрузить курсы' });
    })();
    try { await browserRefresh; } finally { browserRefresh = null; }
  }

  $('settings-button').addEventListener('click', () => showSheet('settings'));
  $('add-currency').addEventListener('click', () => showSheet('currencies'));
  $('status-detail').addEventListener('click', () => rateState.rates ? showSheet('info') : refreshRates());
  $('refresh-button').addEventListener('click', refreshRates);
  $('copy-button').addEventListener('click', () => copyAmount(activeCode));
  $('close-sheet').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', (event) => { if (event.target === $('sheet-backdrop')) closeSheet(); });
  $('keypad').addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]');
    if (key) press(key.dataset.key);
  });
  $('currency-list').addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil) return;
    const row = event.target.closest('[data-currency]');
    if (row) selectCurrency(row.dataset.currency);
  });
  $('currency-list').addEventListener('pointerdown', (event) => {
    const row = event.target.closest('[data-currency]');
    if (!row) return;
    clearTimeout(longPressTimeout);
    longPressCode = row.dataset.currency;
    const code = longPressCode;
    longPressTimeout = setTimeout(() => {
      if (longPressCode === code) { suppressClickUntil = Date.now() + 700; copyAmount(code); }
    }, 550);
  });
  function cancelLongPress() { clearTimeout(longPressTimeout); longPressCode = null; }
  $('currency-list').addEventListener('pointerup', cancelLongPress);
  $('currency-list').addEventListener('pointercancel', cancelLongPress);
  $('currency-list').addEventListener('pointerleave', cancelLongPress);
  $('currency-list').addEventListener('pointermove', cancelLongPress);
  $('currency-list').addEventListener('contextmenu', (event) => event.preventDefault());
  $('sheet-content').addEventListener('click', (event) => {
    const themeChoice = event.target.closest('[data-theme-choice]');
    if (themeChoice) { theme = themeChoice.dataset.themeChoice; applyTheme(); persist(); renderSettings(); return; }
    const currency = event.target.closest('[data-toggle-currency]');
    if (currency) { toggleCurrency(currency.dataset.toggleCurrency); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'done') closeSheet();
    else if (action.dataset.action === 'source') {
      try {
        if (native && native.openSource) native.openSource();
        else window.open(SOURCE_URL, '_blank', 'noopener,noreferrer');
      } catch (_) { showToast('Не удалось открыть источник'); }
    } else showSheet(action.dataset.action);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentSheet) { event.preventDefault(); closeSheet(); return; }
    if (currentSheet) {
      if (event.key === 'Tab') {
        const focusable = [...$('sheet').querySelectorAll('button, input, [tabindex="0"]')].filter((element) => !element.disabled && element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === $('sheet'))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Enter' && event.target.closest('button') && !event.target.closest('#keypad')) return;
    const key = /^[0-9.,+*/%=-]$/.test(event.key) ? event.key : ({ Enter: '=', Backspace: 'BACK', Delete: 'AC', Escape: 'AC' }[event.key]);
    if (key) {
      event.preventDefault();
      press(key);
      const button = [...$('keypad').querySelectorAll('[data-key]')].find((element) => element.dataset.key === (key === '.' ? ',' : key));
      if (button) { button.classList.add('pressed'); setTimeout(() => button.classList.remove('pressed'), 100); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!rateState.fetchedAt || Date.now() - rateState.fetchedAt > 6 * 60 * 60 * 1000)) refreshRates();
  });
  window.addEventListener('online', () => { if (!rateState.rates || rateState.error) refreshRates(); });
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', applyTheme);
  else if (systemTheme.addListener) systemTheme.addListener(applyTheme);

  window.onRatesUpdated = receiveRates;
  window.onNativeBack = function () { if (currentSheet) { closeSheet(); return true; } return false; };
  applyTheme();
  renderCurrencies();
  if (native && native.getState) {
    try { receiveRates(native.getState()); }
    catch (_) { receiveRates({ ...rateState, error: 'Не удалось прочитать сохранённые курсы' }); }
    if (!rateState.refreshing && (!rateState.fetchedAt || rateState.error || Date.now() - rateState.fetchedAt >= 6 * 60 * 60 * 1000)) refreshRates();
  } else {
    const cached = readStorage(CACHE);
    if (cached) receiveRates({ ...cached, refreshing: false });
    else renderStatus();
    refreshRates();
  }
})();
