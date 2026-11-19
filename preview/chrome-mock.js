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
    settings: { matchBy: 'tab' },
    records: [
      {
        id: 'demo-record-1',
        name: 'Tô sáng liên kết',
        tabId: 813,
        host: 'developer.chrome.com',
        jsFile: 'injected/scripts/highlight-links.js',
        cssFile: 'injected/styles/highlight-links.css',
        paused: false,
        createdAt: Date.now(),
      },
      {
        id: 'demo-record-2',
        name: 'Huy hiệu thời gian',
        tabId: 814,
        host: 'localhost',
        jsFile: 'injected/scripts/hello-badge.js',
        cssFile: 'injected/styles/hello-badge.css',
        paused: false,
        createdAt: Date.now(),
      },
    ],
  };

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const base = (path) => (path ? path.split('/').pop() : '');
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const hostOf = (url) => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  };

  const matchBy = () => (store.settings && store.settings.matchBy === 'host' ? 'host' : 'tab');

  const matchedTabs = (record) => {
    const mode = matchBy();
    return tabs.filter((tab) => (mode === 'host' ? hostOf(tab.url) === record.host : tab.id === record.tabId));
  };

  const log = (text, kind = 'inject') => {
    try {
      parent.postMessage({ source: 'tab-injector-demo', text, kind }, '*');
    } catch {
      /* ngoài iframe */
    }
  };

  async function sendMessage(message) {
    await delay(140);
    if (!message) return undefined;

    if (message.type === 'apply-record') {
      const record = store.records.find((item) => item.id === message.recordId);
      if (!record) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };
      if (record.paused) {
        const text = 'Bản ghi đang tạm dừng — bấm ▶ Chạy để tiêm lại.';
        log(text, 'error');
        return { ok: false, code: 'PAUSED', message: text, tabIds: [] };
      }

      const targets = matchedTabs(record);
      if (targets.length === 0) {
        const text =
          matchBy() === 'host'
            ? `Không có tab nào đang mở ${record.host || 'hostname của bản ghi'}.`
            : `Tab #${record.tabId} đã đóng. Chuyển sang chế độ Hostname để không phụ thuộc tab id.`;
        log(text, 'error');
        return { ok: false, code: 'NO_TAB', message: text, tabIds: [] };
      }

      if (message.activate) tabs.forEach((item) => (item.active = item.id === targets[0].id));

      const files = [record.jsFile, record.cssFile].filter(Boolean).map(base).join(' + ');
      targets.forEach((tab) => {
        log(`${message.activate ? 'Mở tab' : 'Tiêm vào'} #${tab.id} · ${files}`);
      });
      return {
        ok: true,
        tabIds: targets.map((tab) => tab.id),
        js: record.jsFile,
        css: record.cssFile,
      };
    }

    if (message.type === 'toggle-pause') {
      const record = store.records.find((item) => item.id === message.recordId);
      if (!record) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };

      record.paused = !record.paused;

      const targets = matchedTabs(record);
      if (targets.length === 0) {
        const text =
          matchBy() === 'host'
            ? `Không có tab nào đang mở ${record.host || 'hostname của bản ghi'}.`
            : `Tab #${record.tabId} đã đóng. Chuyển sang chế độ Hostname để không phụ thuộc tab id.`;
        log(text, 'error');
        return { ok: false, code: 'NO_TAB', paused: record.paused, message: text, tabIds: [] };
      }

      const files = [record.jsFile, record.cssFile].filter(Boolean).map(base).join(' + ');
      targets.forEach((tab) => {
        log(`${record.paused ? 'Tạm dừng' : 'Chạy lại'} #${tab.id} · ${files}`);
      });
      return { ok: true, paused: record.paused, tabIds: targets.map((tab) => tab.id) };
    }

    if (message.type === 'reload-record') {
      const record = store.records.find((item) => item.id === message.recordId);
      if (!record) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi.' };

      const targets = matchedTabs(record);
      if (targets.length === 0) {
        const text =
          matchBy() === 'host'
            ? `Không có tab nào đang mở ${record.host || 'hostname của bản ghi'}.`
            : `Tab #${record.tabId} đã đóng. Chuyển sang chế độ Hostname để không phụ thuộc tab id.`;
        log(text, 'error');
        return { ok: false, code: 'NO_TAB', message: text, tabIds: [] };
      }

      targets.forEach((tab) => log(`Tải lại #${tab.id} · sẽ tiêm lại khi tải xong`));
      const files = [record.jsFile, record.cssFile].filter(Boolean).map(base).join(' + ');
      setTimeout(() => {
        targets.forEach((tab) => log(`Tiêm lại #${tab.id} · ${files}`));
      }, 700);

      return { ok: true, tabIds: targets.map((tab) => tab.id) };
    }

    return undefined;
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
      async reload() {
        return undefined;
      },
    },
    windows: {
      async update(windowId, props) {
        return { id: windowId, ...props };
      },
    },
  };
})();
