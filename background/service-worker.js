// Service worker: giữ danh sách bản ghi trong chrome.storage.local và thực hiện
// việc tiêm JS/CSS vào đúng tab id, kể cả sau khi trang được tải lại.

const STORAGE_KEY = 'records';
const DEDUPE_MS = 1500;

// Chống tiêm hai lần khi một lần tải trang vừa bắn `tabs.onUpdated` vừa bắn
// `page-ready` từ content script.
const lastInjectedAt = new Map();

async function getRecords() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

function findRecordForTab(records, tabId) {
  return records.find((record) => record.tabId === tabId) || null;
}

async function tabExists(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return Boolean(tab);
  } catch {
    return false;
  }
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

async function injectRecord(record) {
  if (!(await tabExists(record.tabId))) {
    return {
      ok: false,
      code: 'TAB_GONE',
      message: `Tab #${record.tabId} đã đóng. Mở lại tab rồi lưu bản ghi mới.`,
    };
  }

  const result = await injectInto(record.tabId, record);
  if (result.errors.length > 0) {
    return {
      ok: false,
      code: 'INJECT_FAILED',
      message: result.errors.join(' · '),
      ...result,
    };
  }
  return { ok: true, ...result };
}

async function applyRecord({ recordId, activate }) {
  const records = await getRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };
  }

  if (activate) {
    try {
      const tab = await chrome.tabs.update(record.tabId, { active: true });
      if (tab && tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch {
      return {
        ok: false,
        code: 'TAB_GONE',
        message: `Tab #${record.tabId} đã đóng. Mở lại tab rồi lưu bản ghi mới.`,
      };
    }
  }

  return injectRecord(record);
}

// Tự tiêm lại sau mỗi lần trang tải lại (tab id giữ nguyên khi reload).
async function injectForTab(tabId, { force = false } = {}) {
  const now = Date.now();
  const previous = lastInjectedAt.get(tabId) || 0;
  if (!force && now - previous < DEDUPE_MS) return;

  const record = findRecordForTab(await getRecords(), tabId);
  if (!record) return;

  lastInjectedAt.set(tabId, now);
  await injectInto(tabId, record);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return undefined;

  if (message.type === 'apply-record') {
    applyRecord(message)
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
