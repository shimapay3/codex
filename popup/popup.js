// Popup: quản lý danh sách bản ghi (tên + tab id + file JS + file CSS) và yêu cầu
// service worker tiêm đúng bộ file vào đúng tab.

const STORAGE_KEY = 'records';
const CATALOG_PATH = 'injected/catalog.json';
const TOAST_MS = 2600;

const state = {
  records: [],
  tabs: [],
  catalog: { scripts: [], styles: [] },
  selectedId: null,
};

const $ = (id) => document.getElementById(id);
let toastTimer = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  state.catalog = await loadCatalog();
  state.records = await loadRecords();
  await loadTabs();
  fillSelects();
  bindEvents();
  render();
}

/* ---------- Dữ liệu ---------- */

async function loadCatalog() {
  try {
    const response = await fetch(chrome.runtime.getURL(CATALOG_PATH));
    const data = await response.json();
    return { scripts: data.scripts || [], styles: data.styles || [] };
  } catch (error) {
    console.warn('[Tab Injector] Không đọc được injected/catalog.json', error);
    return { scripts: [], styles: [] };
  }
}

async function loadRecords() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function saveRecords() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state.records });
}

function isInjectable(url = '') {
  return /^(https?|file):/i.test(url);
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({});
  state.tabs = tabs.filter((tab) => tab.id != null && isInjectable(tab.url));
}

/* ---------- Render ---------- */

function render() {
  $('record-count').textContent = String(state.records.length);

  const list = $('record-list');
  list.replaceChildren(...state.records.map(recordRow));
  $('empty-state').hidden = state.records.length > 0;

  const selected = state.records.find((record) => record.id === state.selectedId) || null;
  $('selected-name').textContent = selected ? selected.name : '—';
  $('btn-apply').disabled = !selected;
  $('btn-reload').disabled = !selected;
}

function recordRow(record) {
  const tab = state.tabs.find((item) => item.id === record.tabId);

  const row = document.createElement('li');
  row.className = 'record' + (record.id === state.selectedId ? ' is-selected' : '');
  row.dataset.id = record.id;
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.title = 'Mở tab này và tiêm JS + CSS';

  const dot = document.createElement('span');
  dot.className = 'dot' + (tab ? '' : ' is-off');

  const main = document.createElement('div');
  main.className = 'record-main';

  const name = document.createElement('div');
  name.className = 'record-name';
  name.textContent = record.name;

  const meta = document.createElement('div');
  meta.className = 'record-meta';
  meta.textContent = tab ? `#${record.tabId} · ${tab.title || tab.url || ''}` : `#${record.tabId} · tab đã đóng`;

  const files = document.createElement('div');
  files.className = 'record-files';
  files.append(fileChip(record.jsFile, 'js'), fileChip(record.cssFile, 'css'));

  main.append(name, meta, files);

  const actions = document.createElement('div');
  actions.className = 'record-actions';
  actions.append(
    miniButton('✎', 'rename', 'Đổi tên'),
    miniButton('✕', 'delete', 'Xoá bản ghi', 'danger'),
  );

  row.append(dot, main, actions);
  return row;
}

function fileChip(path, kind) {
  const chip = document.createElement('span');
  chip.className = `chip ${kind}`;
  chip.textContent = path ? basename(path) : `không ${kind === 'js' ? 'JS' : 'CSS'}`;
  if (path) chip.title = path;
  return chip;
}

function miniButton(label, action, title, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mini ${extraClass}`.trim();
  button.dataset.act = action;
  button.title = title;
  button.textContent = label;
  return button;
}

function fillSelects() {
  const tabSelect = $('new-tab');
  tabSelect.replaceChildren();
  if (state.tabs.length === 0) {
    const option = new Option('Không có tab nào có thể tiêm', '');
    tabSelect.append(option);
    tabSelect.disabled = true;
  } else {
    tabSelect.disabled = false;
    state.tabs.forEach((tab) => {
      const label = `${tab.title || tab.url || 'Tab'} — #${tab.id}`;
      tabSelect.append(new Option(truncate(label, 64), String(tab.id)));
    });
  }

  fillFileSelect($('new-js'), state.catalog.scripts, 'Không dùng JS');
  fillFileSelect($('new-css'), state.catalog.styles, 'Không dùng CSS');
}

function fillFileSelect(select, entries, emptyLabel) {
  select.replaceChildren(new Option(emptyLabel, ''));
  entries.forEach((entry) => select.append(new Option(entry.label || entry.file, entry.file)));
  if (entries.length > 0) select.selectedIndex = 1;
}

/* ---------- Hành động ---------- */

function bindEvents() {
  $('record-list').addEventListener('click', onListClick);
  $('record-list').addEventListener('keydown', onListKeydown);
  $('add-form').addEventListener('submit', onAddSubmit);
  $('btn-apply').addEventListener('click', () => applySelected(false));
  $('btn-reload').addEventListener('click', () => applySelected(true));
  $('btn-refresh').addEventListener('click', async () => {
    await loadTabs();
    fillSelects();
    render();
  });
}

async function onListClick(event) {
  const row = event.target.closest('.record');
  if (!row) return;

  const action = event.target.closest('[data-act]')?.dataset.act;
  if (action === 'rename') {
    startRename(row);
    return;
  }
  if (action === 'delete') {
    await deleteRecord(row.dataset.id);
    return;
  }

  state.selectedId = row.dataset.id;
  render();
  await applySelected(true);
}

function onListKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('.record');
  if (!row || event.target.closest('[data-act]')) return;
  event.preventDefault();
  row.click();
}

async function applySelected(activate) {
  const record = state.records.find((item) => item.id === state.selectedId);
  if (!record) return;

  const response = await chrome.runtime.sendMessage({
    type: 'apply-record',
    recordId: record.id,
    activate,
  });

  if (!response) {
    showToast('Extension không phản hồi. Hãy thử mở lại popup.', 'error');
    return;
  }
  if (!response.ok) {
    showToast(response.message || 'Không thể tiêm vào tab này.', 'error');
    return;
  }

  const files = [response.js, response.css].filter(Boolean).map(basename).join(' + ');
  showToast(`${activate ? 'Đã mở tab và tiêm' : 'Đã tiêm'} ${files}`, 'ok');

  if (activate) {
    await loadTabs();
    render();
  }
}

async function onAddSubmit(event) {
  event.preventDefault();

  const name = $('new-name').value.trim();
  const tabId = Number($('new-tab').value);
  const jsFile = $('new-js').value;
  const cssFile = $('new-css').value;

  if (!name) return showToast('Nhập tên cho bản ghi.', 'error');
  if (!Number.isFinite(tabId) || tabId <= 0) return showToast('Chọn một tab để tiêm.', 'error');
  if (!jsFile && !cssFile) return showToast('Chọn ít nhất một file JS hoặc CSS.', 'error');

  // Mỗi tab chỉ có một bản ghi: nếu tab đã có thì cập nhật lại.
  const existing = state.records.find((record) => record.tabId === tabId);
  if (existing) {
    Object.assign(existing, { name, jsFile, cssFile });
    state.selectedId = existing.id;
    await saveRecords();
    render();
    showToast(`Đã cập nhật bản ghi cho tab #${tabId}.`, 'ok');
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    name,
    tabId,
    jsFile,
    cssFile,
    createdAt: Date.now(),
  };

  state.records.push(record);
  state.selectedId = record.id;
  await saveRecords();
  $('new-name').value = '';
  render();
  showToast(`Đã thêm bản ghi cho tab #${tabId}.`, 'ok');
}

function startRename(row) {
  const record = state.records.find((item) => item.id === row.dataset.id);
  const nameEl = row.querySelector('.record-name');
  if (!record || !nameEl || row.querySelector('.rename-input')) return;

  const input = document.createElement('input');
  input.className = 'rename-input';
  input.type = 'text';
  input.maxLength = 60;
  input.value = record.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const nextName = input.value.trim();
    if (save && nextName && nextName !== record.name) {
      record.name = nextName;
      await saveRecords();
      showToast('Đã đổi tên bản ghi.', 'ok');
    }
    render();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

async function deleteRecord(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return;

  state.records = state.records.filter((item) => item.id !== recordId);
  if (state.selectedId === recordId) state.selectedId = null;
  await saveRecords();
  render();
  showToast(`Đã xoá bản ghi "${record.name}".`, 'ok');
}

/* ---------- Tiện ích ---------- */

function basename(path) {
  if (!path) return '';
  return path.split('/').pop();
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function showToast(text, kind = 'ok') {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.toggle('is-error', kind === 'error');
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), TOAST_MS);
}
