// Trang xem trước: render popup.html thật trong iframe, với chrome.* được mô phỏng
// bởi preview/chrome-mock.js (chèn vào trước các script của popup).
const POPUP_PATH = '/popup/popup.html';
const LOG_LIMIT = 6;

const frame = document.getElementById('popup-frame');
const logList = document.getElementById('demo-log');

// Trình quét trước của Chrome tải các URL tương đối trong srcdoc theo địa chỉ
// trang cha (bỏ qua <base>), nên đổi hết sang đường dẫn tuyệt đối để không có
// request 404 nào bị bắn ra.
const ABSOLUTE_ATTR = /(href|src)="(?!\/|https?:|data:|blob:|#|mailto:)([^"]+)"/g;
const absolutize = (html) => html.replace(ABSOLUTE_ATTR, (_, attr, url) => `${attr}="/popup/${url}"`);

async function mountPopup() {
  try {
    const response = await fetch(POPUP_PATH);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = absolutize(await response.text());

    const injected = '<base href="/popup/">\n<script src="/preview/chrome-mock.js"><\/script>';
    frame.srcdoc = html.replace('<head>', `<head>\n${injected}`);
  } catch (error) {
    frame.srcdoc = `<p style="padding:24px;font:14px system-ui">Không tải được popup: ${error.message}</p>`;
  }
}

function pushLog(text, kind) {
  logList.querySelector('.log-empty')?.remove();

  const item = document.createElement('li');
  item.className = 'log-item' + (kind === 'error' ? ' is-error' : '');

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date().toLocaleTimeString('vi-VN');

  const body = document.createElement('span');
  body.textContent = text;

  item.append(time, body);
  logList.prepend(item);

  while (logList.children.length > LOG_LIMIT) {
    logList.lastElementChild.remove();
  }
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.source !== 'tab-injector-demo') return;
  pushLog(data.text, data.kind);
});

mountPopup();
