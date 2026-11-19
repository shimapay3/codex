(() => {
  // Mock API chrome.* để render popup thật trong trang xem trước.
  // Chỉ dùng cho preview/ — không nằm trong extension.
  if (window.chrome && window.chrome.tabs) return;

  const tabs = [
    {
      id: 812,
      windowId: 1,
      index: 0,
      active: true,
      title: 'Trang chủ — example.com',
      url: 'https://example.com/',
    },
    {
      id: 813,
      windowId: 1,
      index: 1,
      active: false,
      title: 'Manifest V3 — Chrome for Developers',
      url: 'https://developer.chrome.com/docs/extensions/',
    },
    {
      id: 814,
      windowId: 1,
      index: 2,
      active: false,
      title: 'Ứng dụng của tôi — localhost:3000',
      url: 'http://localhost:3000/',
    },
  ];

  const store = {
    records: [
      {
        id: 'demo-record-1',
        name: 'Tô sáng liên kết',
        tabId: 813,
        jsFile: 'injected/scripts/highlight-links.js',
        cssFile: 'injected/styles/highlight-links.css',
        createdAt: Date.now(),
      },
      {
        id: 'demo-record-2',
        name: 'Huy hiệu thời gian',
        tabId: 814,
        jsFile: 'injected/scripts/hello-badge.js',
        cssFile: 'injected/styles/hello-badge.css',
        createdAt: Date.now(),
      },
    ],
  };

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const base = (path) => (path ? path.split('/').pop() : '');
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const log = (text, kind = 'inject') => {
    try {
      parent.postMessage({ source: 'tab-injector-demo', text, kind }, '*');
    } catch {
      /* ngoài iframe */
    }
  };

  async function sendMessage(message) {
    await delay(140);
    if (!message || message.type !== 'apply-record') return undefined;

    const record = store.records.find((item) => item.id === message.recordId);
    if (!record) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };

    const tab = tabs.find((item) => item.id === record.tabId);
    if (!tab) {
      log(`Tab #${record.tabId} đã đóng — không thể tiêm.`, 'error');
      return {
        ok: false,
        code: 'TAB_GONE',
        message: `Tab #${record.tabId} đã đóng. Mở lại tab rồi lưu bản ghi mới.`,
      };
    }

    if (message.activate) tabs.forEach((item) => (item.active = item.id === tab.id));

    const files = [record.jsFile, record.cssFile].filter(Boolean).map(base).join(' + ');
    log(`${message.activate ? 'Mở tab' : 'Tiêm vào'} #${tab.id} · ${files}`);

    return { ok: true, tabId: tab.id, js: record.jsFile, css: record.cssFile, errors: [] };
  }

  window.chrome = {
    runtime: {
      lastError: undefined,
      getURL: (path) => `/${String(path).replace(/^\/+/, '')}`,
      sendMessage,
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: clone(store[key]) };
          return clone(store);
        },
        async set(items) {
          Object.assign(store, clone(items));
        },
      },
    },
    tabs: {
      async query() {
        return clone(tabs);
      },
      async get(tabId) {
        const tab = tabs.find((item) => item.id === tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}`);
        return clone(tab);
      },
      async update(tabId, props) {
        const tab = tabs.find((item) => item.id === tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}`);
        Object.assign(tab, props);
        return clone(tab);
      },
    },
    windows: {
      async update(windowId, props) {
        return { id: windowId, ...props };
      },
    },
  };
})();
