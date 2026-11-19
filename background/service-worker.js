// Service worker: giữ danh sách bản ghi trong chrome.storage.local và thực hiện
// việc tiêm JS/CSS vào đúng tab, kể cả sau khi trang được tải lại.
//
// Bản ghi được nhận diện theo `settings.matchBy`:
//  - 'tab'  : đúng tab id đã lưu
//  - 'host' : mọi tab đang mở cùng hostname (tab id đổi hay tab bị đóng vẫn tiêm được)

const STORAGE_KEY = 'records';
const SETTINGS_KEY = 'settings';
const DEDUPE_MS = 1500;
const PAUSED_MESSAGE = 'Bản ghi đang tạm dừng — bấm ▶ Chạy để tiêm lại.';

// Chống tiêm hai lần khi một lần tải trang vừa bắn `tabs.onUpdated` vừa bắn
// `page-ready` từ content script.
const lastInjectedAt = new Map();

async function getRecords() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function getMatchBy() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = data[SETTINGS_KEY];
  return settings && settings.matchBy === 'host' ? 'host' : 'tab';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isInjectable(url = '') {
  return /^(https?|file):/i.test(url);
}

function isPaused(record) {
  return record.paused === true;
}

function matchesTab(record, tab, matchBy) {
  if (!tab || tab.id == null) return false;
  if (matchBy === 'host') return Boolean(record.host) && hostOf(tab.url) === record.host;
  return record.tabId === tab.id;
}

async function tabsForRecord(record, matchBy) {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => tab.id != null && isInjectable(tab.url) && matchesTab(record, tab, matchBy));
}

function noTabMessage(record, matchBy) {
  return matchBy === 'host'
    ? `Không có tab nào đang mở ${record.host || 'hostname của bản ghi'}.`
    : `Tab #${record.tabId} đã đóng. Chuyển sang chế độ Hostname để không phụ thuộc tab id.`;
}

// Bỏ CSS cũ trước khi chèn lại để bấm "Tiêm lại" không chồng nhiều bản.
async function injectInto(tabId, record) {
  const result = { tabId, js: null, css: null, errors: [] };

  if (record.cssFile) {
    try {
      await chrome.scripting.removeCSS({ target: { tabId }, files: [record.cssFile] });
    } catch {
      // Lần đầu chưa có CSS nào để bỏ.
    }
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: [record.cssFile] });
      result.css = record.cssFile;
    } catch (error) {
      result.errors.push(`CSS ${record.cssFile}: ${error.message}`);
    }
  }

  if (record.jsFile) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [record.jsFile],
        world: 'MAIN',
      });
      result.js = record.jsFile;
    } catch (error) {
      result.errors.push(`JS ${record.jsFile}: ${error.message}`);
    }
  }

  return result;
}

// Tạm dừng: gỡ CSS và gọi hàm dọn dẹp mà JS đã đăng ký trong
// `window.__tabInjectorCleanups` (mỗi file JS tiêm tự đăng ký một hàm).
async function removeInjected(tabId, record) {
  const errors = [];

  if (record.cssFile) {
    try {
      await chrome.scripting.removeCSS({ target: { tabId }, files: [record.cssFile] });
    } catch {
      // CSS chưa được chèn.
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const cleanups = window.__tabInjectorCleanups;
        if (!cleanups) return;
        Object.keys(cleanups).forEach((key) => {
          try {
            cleanups[key]();
          } catch {
            // Script đã tự dọn trước đó.
          }
          delete cleanups[key];
        });
      },
    });
  } catch (error) {
    errors.push(`JS: ${error.message}`);
  }

  return errors;
}

async function injectRecord(record, matchBy, { activate = false } = {}) {
  if (isPaused(record)) {
    return { ok: false, code: 'PAUSED', message: PAUSED_MESSAGE, tabIds: [] };
  }

  const tabs = await tabsForRecord(record, matchBy);
  if (tabs.length === 0) {
    return { ok: false, code: 'NO_TAB', message: noTabMessage(record, matchBy), tabIds: [] };
  }

  if (activate) {
    const [first] = tabs;
    await chrome.tabs.update(first.id, { active: true });
    if (first.windowId != null) {
      await chrome.windows.update(first.windowId, { focused: true });
    }
  }

  const tabIds = [];
  const errors = [];
  for (const tab of tabs) {
    const result = await injectInto(tab.id, record);
    if (result.errors.length > 0) errors.push(...result.errors);
    else tabIds.push(tab.id);
  }

  if (tabIds.length === 0) {
    return { ok: false, code: 'INJECT_FAILED', message: errors.join(' · '), tabIds: [] };
  }

  return {
    ok: true,
    tabIds,
    js: record.jsFile,
    css: record.cssFile,
    message: errors.join(' · '),
  };
}

async function applyRecord({ recordId, activate }) {
  const records = await getRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };
  }
  return injectRecord(record, await getMatchBy(), { activate: Boolean(activate) });
}

// Bật/tắt chạy bản ghi: tạm dừng thì gỡ CSS + dọn JS khỏi các tab đang khớp,
// chạy lại thì tiêm ngay như bấm "Áp dụng".
async function togglePause({ recordId }) {
  const records = await getRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };
  }

  record.paused = !isPaused(record);
  await chrome.storage.local.set({ [STORAGE_KEY]: records });

  const matchBy = await getMatchBy();
  const tabs = await tabsForRecord(record, matchBy);
  if (tabs.length === 0) {
    return { ok: false, code: 'NO_TAB', paused: record.paused, message: noTabMessage(record, matchBy), tabIds: [] };
  }

  if (!record.paused) {
    return { ...(await injectRecord(record, matchBy)), paused: false };
  }

  const errors = [];
  for (const tab of tabs) {
    errors.push(...(await removeInjected(tab.id, record)));
  }
  return { ok: true, paused: true, tabIds: tabs.map((tab) => tab.id), message: errors.join(' · ') };
}

// Tải lại trang của tab khớp bản ghi; sau khi tải xong content script sẽ được
// tiêm lại tự động. Tab được tìm tại thời điểm bấm nên không phụ thuộc tab id cũ.
async function reloadRecord({ recordId }) {
  const records = await getRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };
  }

  const matchBy = await getMatchBy();
  const tabs = await tabsForRecord(record, matchBy);
  if (tabs.length === 0) {
    return { ok: false, code: 'NO_TAB', message: noTabMessage(record, matchBy), tabIds: [] };
  }

  const tabIds = [];
  for (const tab of tabs) {
    try {
      await chrome.tabs.reload(tab.id);
      tabIds.push(tab.id);
    } catch {
      // Tab vừa đóng giữa lúc tải lại — bỏ qua.
    }
  }

  if (tabIds.length === 0) {
    return { ok: false, code: 'RELOAD_FAILED', message: 'Không tải lại được tab nào.', tabIds: [] };
  }
  return { ok: true, tabIds };
}

// Tự tiêm lại sau mỗi lần trang tải lại.
async function injectForTab(tabId, { force = false } = {}) {
  const now = Date.now();
  const previous = lastInjectedAt.get(tabId) || 0;
  if (!force && now - previous < DEDUPE_MS) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab || !isInjectable(tab.url)) return;

  const matchBy = await getMatchBy();
  const matched = (await getRecords()).filter(
    (record) => !isPaused(record) && matchesTab(record, tab, matchBy),
  );
  if (matched.length === 0) return;

  lastInjectedAt.set(tabId, now);
  for (const record of matched) {
    await injectInto(tabId, record);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return undefined;

  if (message.type === 'apply-record') {
    applyRecord(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === 'reload-record') {
    reloadRecord(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === 'toggle-pause') {
    togglePause(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === 'page-ready') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null) injectForTab(tabId).catch(() => {});
    return undefined;
  }

  return undefined;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  injectForTab(tabId).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  lastInjectedAt.delete(tabId);
});
