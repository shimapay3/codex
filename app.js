/* ==========================================================================
   Trạm điều khiển — Chrome OS · Chrome App · Chrome passkey
   Một tệp, không bước build. Các khối:
     0 tiện ích                         1 danh mục ứng dụng (chỉ trong bộ nhớ)
     2 phát hiện môi trường             3 passkey (tạo / mở / xác thực lại)
     4 bảng chọn vẽ bằng canvas         5 khung xem + lớp chắn tương tác
     6 sửa URL (yêu cầu passkey)        7 lớp bảo vệ (cản devtools/copy)
   Lưu ý: URL không bao giờ được ghi vào HTML hay localStorage — chúng chỉ nằm
   trong bộ nhớ của phiên này và chỉ hiện ra dưới dạng điểm ảnh trên canvas.
   ========================================================================== */
'use strict';

(function () {

/* ---------------------------------------------------------------- 0. tiện ích */
const $ = (id) => document.getElementById(id);
const KEYS = { cred: 'passkey-demo.credId', user: 'passkey-demo.userId' };
const RP_NAME = 'Trạm điều khiển · Passkey';
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

const b64url = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

function explain(err) {
  const name = (err && err.name) || 'Error';
  const map = {
    NotAllowedError: 'Yêu cầu bị từ chối hoặc hết thời gian chờ (bạn bấm huỷ, hoặc môi trường hiện tại không cho dùng passkey).',
    SecurityError: 'Bị chặn vì lý do an toàn: cần HTTPS và tên miền khớp với rp.id.',
    InvalidStateError: 'Passkey cho tài khoản này đã tồn tại trên thiết bị.',
    NotSupportedError: 'Thiết bị hoặc trình duyệt này không hỗ trợ passkey (platform authenticator).',
    AbortError: 'Thao tác bị huỷ.',
    TimeoutError: 'Hết thời gian chờ xác thực passkey.'
  };
  return (map[name] || 'Lỗi (' + name + '): ' + ((err && err.message) || '')) + ' [' + name + ']';
}

/* -------------------------------------- 1. danh mục ứng dụng (chỉ trong bộ nhớ) */
/* Chỉ trang không gửi X-Frame-Options/frame-ancestors mới nhúng được — kiểm tra
   bằng `curl -sI <url> | grep -iE 'x-frame-options|frame-ancestors'`. */
const DEFAULT_APPS = [
  { name: 'Wikipedia',   url: 'https://vi.wikipedia.org/wiki/Trang_Ch%C3%ADnh' },
  { name: 'Bản đồ OSM',  url: 'https://www.openstreetmap.org/export/embed.html?bbox=105.74,20.95,105.92,21.12&layer=mapnik' },
  { name: 'Tin NPR',     url: 'https://text.npr.org/' },
  { name: 'Gutenberg',   url: 'https://www.gutenberg.org/' },
  { name: 'OpenLayers',  url: 'https://openlayers.org/' },
  { name: 'Example',     url: 'https://example.com/' }
];
const apps = DEFAULT_APPS.map((a) => ({ name: a.name, url: a.url }));
let selected = 0;

const hostOf = (url) => { try { return new URL(url).host; } catch (e) { return url; } };

/* ------------------------------------------------- 2. phát hiện môi trường */
const UA = navigator.userAgent;
const env = {
  crOS: /CrOS/i.test(UA),
  chrome: /Chrome\//.test(UA) && !/(Edg|OPR|SamsungBrowser|YaBrowser)\//.test(UA),
  app: !!(window.chrome && window.chrome.app && window.chrome.app.runtime),
  secure: window.isSecureContext !== false,
  passkey: typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials,
  platform: null
};

function chip(text, tone) { return '<span class="chip chip--' + tone + '">' + text + '</span>'; }
function row(label, note, text, tone) {
  return '<li><span class="label">' + label + '<span class="who">' + note + '</span></span>' + chip(text, tone) + '</li>';
}

function renderEnv() {
  let html = '';
  html += row('Hệ điều hành', 'navigator.userAgent · "CrOS"', env.crOS ? 'Chrome OS' : 'Không phải Chrome OS', env.crOS ? 'ok' : 'warn');
  html += row('Trình duyệt', 'navigator.userAgent · "Chrome/"', env.chrome ? 'Chrome' : 'Không phải Chrome', env.chrome ? 'ok' : 'warn');
  html += row('Ứng dụng Chrome', 'window.chrome.app.runtime', env.app ? 'Chrome App' : 'Trang web thường', env.app ? 'ok' : 'warn');
  html += row('Ngữ cảnh an toàn', 'window.isSecureContext', env.secure ? 'HTTPS' : 'Không an toàn', env.secure ? 'ok' : 'bad');
  html += row('Passkey (WebAuthn)', 'window.PublicKeyCredential', env.passkey ? 'Có hỗ trợ' : 'Không hỗ trợ', env.passkey ? 'ok' : 'bad');
  html += row('Passkey nền tảng', 'isUserVerifyingPlatformAuthenticatorAvailable()',
    env.platform === null ? 'Đang kiểm tra…' : (env.platform ? 'Sẵn sàng' : 'Không có'),
    env.platform === null ? 'wait' : (env.platform ? 'ok' : 'bad'));
  $('rows').innerHTML = html;

  $('cEnv').textContent = env.crOS ? (env.app ? 'Chrome OS · Chrome App' : 'Chrome OS · trang web') : 'Không phải Chrome OS';
  const target = env.crOS && env.chrome && env.app;
  $('envMeta').textContent = target ? 'ĐỦ ĐIỀU KIỆN' : 'THIẾU ĐIỀU KIỆN';
  $('envMeta').className = 'mono deck__meta ' + (target ? 'is-ok' : 'is-bad');

  const missing = [];
  if (!env.crOS) missing.push('Chrome OS');
  if (!env.chrome) missing.push('Chrome');
  if (!env.app) missing.push('ứng dụng Chrome');
  $('verdict').innerHTML = missing.length === 0
    ? '<b>Đúng môi trường mục tiêu:</b> đang chạy trong ứng dụng Chrome trên Chrome OS.'
    : '<b>Chưa đúng môi trường mục tiêu.</b> Còn thiếu: ' + missing.join(', ') +
      '. Kết quả này là bình thường khi mở trong tab Chrome thường, trên máy không phải Chrome OS, hoặc trong iframe xem trước.';

  $('ribbonDot').className = 'ribbon__dot ' + (env.passkey ? 'is-ok' : 'is-bad');
  $('ribbonText').textContent = 'HỆ THỐNG · ' + (env.crOS ? 'CHROME OS' : 'MÔI TRƯỜNG KHÁC') +
    ' · PASSKEY ' + (env.passkey ? 'SẴN SÀNG' : 'KHÔNG HỖ TRỢ');
}

/* ------------------------------------------------------------- 3. passkey */
function userId() {
  let id = localStorage.getItem(KEYS.user);
  if (!id) { id = b64url(rand(16)); localStorage.setItem(KEYS.user, id); }
  return fromB64url(id);
}
const storedCred = () => localStorage.getItem(KEYS.cred);

function createPasskey() {
  return navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { id: location.hostname, name: RP_NAME },
      user: { id: userId(), name: 'demo@chrome-os', displayName: 'Người dùng Chrome OS' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required'
      },
      attestation: 'none',
      timeout: 60000
    }
  });
}

/** Xác thực lại bằng passkey đã lưu — dùng cho cửa khoang và cho việc sửa URL. */
async function assertPasskey() {
  const id = storedCred();
  if (!id) throw new Error('NO_CRED');
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64url(id) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return b64url(assertion.rawId);
}

/* -------------------------------------------- 4. bảng chọn vẽ bằng canvas */
const dockC = $('dock');
const dockX = dockC.getContext('2d');
const D = { pad: 14, gap: 12, tileH: 78 };
let rects = [];
let hoverIdx = -1;
let cols = 3;

function rr(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawDock() {
  const w = dockC.clientWidth || 320;
  cols = w >= 680 ? 3 : w >= 440 ? 2 : 1;
  const tileW = (w - D.pad * 2 - D.gap * (cols - 1)) / cols;
  const rows = Math.ceil(apps.length / cols);
  const h = D.pad * 2 + rows * D.tileH + (rows - 1) * D.gap;

  const dpr = window.devicePixelRatio || 1;
  dockC.width = Math.round(w * dpr);
  dockC.height = Math.round(h * dpr);
  dockC.style.height = h + 'px';
  dockX.setTransform(dpr, 0, 0, dpr, 0, 0);
  dockX.clearRect(0, 0, w, h);

  rects = [];
  apps.forEach((app, i) => {
    const r = {
      x: D.pad + (i % cols) * (tileW + D.gap),
      y: D.pad + Math.floor(i / cols) * (D.tileH + D.gap),
      w: tileW, h: D.tileH
    };
    rects.push(r);

    const on = i === selected;
    const hot = i === hoverIdx;
    rr(dockX, r.x, r.y, r.w, r.h, 12);
    dockX.fillStyle = on ? 'rgba(124,243,255,.14)' : hot ? 'rgba(124,243,255,.07)' : 'rgba(233,244,255,.035)';
    dockX.fill();
    dockX.lineWidth = 1;
    dockX.strokeStyle = on ? 'rgba(124,243,255,.75)' : 'rgba(124,243,255,.18)';
    dockX.stroke();

    dockX.font = '620 15px ' + SANS;
    dockX.fillStyle = on ? '#e9f4ff' : 'rgba(233,244,255,.86)';
    dockX.fillText(fit(dockX, app.name, r.w - 26), r.x + 13, r.y + 33);

    dockX.font = '11px ' + MONO;
    dockX.fillStyle = 'rgba(233,244,255,.42)';
    dockX.fillText(fit(dockX, hostOf(app.url), r.w - 26), r.x + 13, r.y + 55);

    dockX.beginPath();
    dockX.arc(r.x + r.w - 15, r.y + 15, 3, 0, Math.PI * 2);
    dockX.fillStyle = on ? '#5ef2b0' : 'rgba(233,244,255,.25)';
    dockX.fill();
  });
}

function indexAt(x, y) {
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function selectApp(i) {
  selected = Math.max(0, Math.min(apps.length - 1, i));
  drawDock();
  openFrame();
}

dockC.addEventListener('mousemove', (e) => {
  const r = dockC.getBoundingClientRect();
  const i = indexAt(e.clientX - r.left, e.clientY - r.top);
  if (i !== hoverIdx) { hoverIdx = i; drawDock(); }
});
dockC.addEventListener('mouseleave', () => { if (hoverIdx !== -1) { hoverIdx = -1; drawDock(); } });
dockC.addEventListener('click', (e) => {
  const r = dockC.getBoundingClientRect();
  const i = indexAt(e.clientX - r.left, e.clientY - r.top);
  if (i >= 0) selectApp(i);
});
dockC.addEventListener('keydown', (e) => {
  if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].indexOf(e.key) < 0) return;
  e.preventDefault();
  if (e.key === 'Enter' || e.key === ' ') { openFrame(); return; }
  let i = selected;
  if (e.key === 'ArrowRight') i += 1;
  if (e.key === 'ArrowLeft') i -= 1;
  if (e.key === 'ArrowDown') i += cols;
  if (e.key === 'ArrowUp') i -= cols;
  if (e.key === 'Home') i = 0;
  if (e.key === 'End') i = apps.length - 1;
  selected = Math.max(0, Math.min(apps.length - 1, i));
  drawDock();
  openFrame();
});

/* ------------------------------- 5. khung xem, URL vẽ canvas, lớp chắn */
const frame = $('frame');
const viewport = $('viewport');
const shield = $('shield');
const shieldX = shield.getContext('2d');
let unlocked = false;
let armed = true;

function drawUrl() {
  const c = $('urlCanvas');
  const w = c.clientWidth || 260;
  const h = 34;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px ' + MONO;
  ctx.fillStyle = 'rgba(124,243,255,.6)';
  ctx.fillText('ĐANG XEM · URL ĐƯỢC VẼ BẰNG CANVAS', 0, 9);
  ctx.font = '12.5px ' + MONO;
  ctx.fillStyle = '#e9f4ff';
  ctx.fillText(fit(ctx, apps[selected].url, w - 4), 0, 27);
}

function drawShield() {
  const w = shield.clientWidth;
  const h = shield.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  if (shield.width !== Math.round(w * dpr) || shield.height !== Math.round(h * dpr)) {
    shield.width = Math.round(w * dpr);
    shield.height = Math.round(h * dpr);
  }
  shieldX.setTransform(dpr, 0, 0, dpr, 0, 0);
  shieldX.clearRect(0, 0, w, h);

  const g = shieldX.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(6,12,24,.34)');
  g.addColorStop(.5, 'rgba(6,12,24,.12)');
  g.addColorStop(1, 'rgba(6,12,24,.36)');
  shieldX.fillStyle = g;
  shieldX.fillRect(0, 0, w, h);

  if (!REDUCE) {
    const t = (performance.now() % 4600) / 4600;
    const sx = t * (w + 260) - 130;
    const sg = shieldX.createLinearGradient(sx - 110, 0, sx + 110, 0);
    sg.addColorStop(0, 'rgba(124,243,255,0)');
    sg.addColorStop(.5, 'rgba(124,243,255,.10)');
    sg.addColorStop(1, 'rgba(124,243,255,0)');
    shieldX.fillStyle = sg;
    shieldX.fillRect(0, 0, w, h);
  }

  shieldX.save();
  shieldX.translate(w / 2, h / 2);
  shieldX.rotate(-Math.PI / 9);
  shieldX.textAlign = 'center';
  shieldX.font = '620 ' + Math.max(18, Math.round(w * 0.042)) + 'px ' + SANS;
  shieldX.fillStyle = 'rgba(233,244,255,.07)';
  shieldX.fillText('ĐƯỢC BẢO VỆ · CANVAS', 0, 0);
  shieldX.restore();

  if (armed) {
    const label = 'BẤM ĐỂ TƯƠNG TÁC · LỚP CHẮN ĐANG BẬT';
    shieldX.font = '600 12px ' + MONO;
    shieldX.textAlign = 'center';
    const bw = shieldX.measureText(label).width + 30;
    const bh = 34;
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;
    rr(shieldX, bx, by, bw, bh, 999);
    shieldX.fillStyle = 'rgba(4,9,18,.92)';
    shieldX.fill();
    shieldX.strokeStyle = 'rgba(124,243,255,.55)';
    shieldX.stroke();
    shieldX.fillStyle = '#7cf3ff';
    shieldX.fillText(label, w / 2, by + 22);
  }
}

function armShield() { armed = true; viewport.classList.add('is-armed'); drawShield(); }
function disarmShield() { armed = false; viewport.classList.remove('is-armed'); drawShield(); }

shield.addEventListener('click', () => { disarmShield(); $('viewGuard').textContent = 'ĐANG TƯƠNG TÁC'; });
viewport.addEventListener('mouseleave', () => {
  if (unlocked && !armed) { armShield(); $('viewGuard').textContent = 'LỚP BẢO VỆ'; }
});
viewport.addEventListener('contextmenu', (e) => { e.preventDefault(); flag('chuột phải trên khung'); });

/** Mở ứng dụng đang chọn: URL chỉ được gán bằng JS, không có trong HTML. */
function openFrame() {
  $('viewName').textContent = apps[selected].name;
  frame.src = apps[selected].url;
  armShield();
  $('viewGuard').textContent = 'LỚP BẢO VỆ';
  drawUrl();
}

$('btnReload').addEventListener('click', () => { frame.src = apps[selected].url; armShield(); });
$('btnWiden').addEventListener('click', () => {
  const on = viewport.classList.toggle('viewport--wide');
  document.body.classList.toggle('is-wide', on);
  $('btnWiden').textContent = on ? 'Thu lại' : 'Mở rộng';
  drawShield();
});

/* ---------------------------------- 6. sửa URL — yêu cầu quyền passkey */
const urlEdit = $('urlEdit');
const urlInput = $('urlInput');

function setUrlMsg(text, tone) {
  const el = $('urlMsg');
  el.textContent = text || '';
  el.className = 'msg msg--sm' + (tone ? ' is-' + tone : '');
}
function closeEditor() {
  urlEdit.hidden = true;
  $('btnEdit').hidden = false;
  urlInput.value = '';
}

$('btnEdit').addEventListener('click', async () => {
  if (!storedCred()) { setUrlMsg('Chưa có passkey trên máy này — hãy tạo passkey ở mục 02.', 'bad'); return; }
  setUrlMsg('Đang xác thực passkey để mở quyền sửa URL…');
  try {
    await assertPasskey();
  } catch (err) {
    setUrlMsg('Không mở được quyền sửa URL: ' + explain(err), 'bad');
    return;
  }
  urlInput.value = apps[selected].url;
  urlEdit.hidden = false;
  $('btnEdit').hidden = true;
  urlInput.focus();
  setUrlMsg('Đã xác thực passkey. Sửa URL rồi bấm “Lưu URL”.', 'ok');
});

$('btnSave').addEventListener('click', () => {
  let next;
  try { next = new URL(urlInput.value.trim()); }
  catch (e) { setUrlMsg('URL không hợp lệ.', 'bad'); return; }
  if (next.protocol !== 'https:' && next.protocol !== 'http:') { setUrlMsg('Chỉ hỗ trợ http/https.', 'bad'); return; }
  apps[selected].url = next.href;
  closeEditor();
  drawDock();
  openFrame();
  setUrlMsg('Đã cập nhật URL cho “' + apps[selected].name + '” (chỉ trong bộ nhớ của phiên này).', 'ok');
});

$('btnCancel').addEventListener('click', () => { closeEditor(); setUrlMsg('Đã huỷ.'); });

/* ------------------------------ 7. lớp bảo vệ: cản devtools / copy / chọn */
let blockedCount = 0;
let toastTimer = 0;

function flag(what) {
  blockedCount += 1;
  const t = $('toast');
  t.hidden = false;
  t.textContent = 'ĐÃ CHẶN · ' + what + ' · TỔNG ' + blockedCount + ' LẦN';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toUpperCase();
  const mod = e.ctrlKey || e.metaKey;
  const combo = (mod && e.shiftKey && ['I', 'J', 'C', 'K'].indexOf(k) >= 0)
    || (e.metaKey && e.altKey && ['I', 'J', 'C'].indexOf(k) >= 0)
    || (mod && ['U', 'S', 'P'].indexOf(k) >= 0);
  if (k === 'F12' || combo) {
    e.preventDefault();
    e.stopPropagation();
    flag(k === 'F12' ? 'F12 · devtools' : 'phím tắt xem nguồn / lưu trang');
  }
}, true);

document.addEventListener('contextmenu', (e) => { e.preventDefault(); flag('menu chuột phải'); }, true);
['selectstart', 'copy', 'cut', 'dragstart'].forEach((type) => {
  document.addEventListener(type, (e) => {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    e.preventDefault();
    flag('sao chép / bôi đen');
  }, true);
});

/* ------------------------------------------------ khoá / mở khoang làm việc */
const lockbay = $('lockbay');
const bay = $('bay');

function setGate(state, text, tone) {
  $('gateMeta').textContent = state;
  $('gateMeta').className = 'mono deck__meta' + (tone ? ' is-' + tone : '');
  $('msg').textContent = text || '';
  $('msg').className = 'msg' + (tone ? ' is-' + tone : '');
}

function refreshGateState() {
  const saved = !!storedCred();
  $('btnLogin').disabled = !env.passkey || !saved;
  $('btnRegister').disabled = !env.passkey || saved;
  $('btnReset').disabled = !saved && !localStorage.getItem(KEYS.user);
  $('cPass').textContent = unlocked
    ? 'ĐÃ XÁC THỰC'
    : (env.platform === null ? 'ĐANG KIỂM TRA' : (env.platform ? 'SẴN SÀNG' : 'KHÔNG HỖ TRỢ'));
}

function openBay() {
  unlocked = true;
  lockbay.hidden = true;
  bay.hidden = false;
  $('bayMeta').textContent = 'ĐANG MỞ';
  $('bayMeta').className = 'mono deck__meta is-ok';
  refreshGateState();
  drawDock();
  drawUrl();
  openFrame();
  setTimeout(() => dockC.focus(), 30);
}

function closeBay() {
  unlocked = false;
  bay.hidden = true;
  lockbay.hidden = false;
  $('bayMeta').textContent = 'ĐANG KHOÁ';
  $('bayMeta').className = 'mono deck__meta';
  closeEditor();
  setUrlMsg('');
  frame.src = 'about:blank';
  $('viewName').textContent = '—';
  refreshGateState();
}

$('btnRegister').addEventListener('click', async () => {
  if (storedCred()) {
    setGate('ĐÃ CÓ PASSKEY', 'Máy này đã có passkey cho trang — hãy dùng “Mở bằng passkey đã lưu”, hoặc xoá passkey trước khi tạo mới.', 'bad');
    return;
  }
  setGate('ĐANG CHỜ…', 'Đang chờ bạn xác nhận passkey trên thiết bị…');
  try {
    const cred = await createPasskey();
    localStorage.setItem(KEYS.cred, b64url(cred.rawId));
    setGate('ĐÃ MỞ', 'Đã tạo passkey và mở khoang làm việc.', 'ok');
    openBay();
  } catch (err) {
    setGate('LỖI XÁC THỰC', explain(err), 'bad');
  }
});

$('btnLogin').addEventListener('click', async () => {
  if (!storedCred()) {
    setGate('CHƯA CÓ PASSKEY', 'Chưa có passkey nào trên máy này — hãy tạo passkey trước.', 'bad');
    return;
  }
  setGate('ĐANG CHỜ…', 'Đang chờ bạn xác nhận passkey trên thiết bị…');
  try {
    await assertPasskey();
    setGate('ĐÃ MỞ', 'Đăng nhập bằng passkey thành công.', 'ok');
    openBay();
  } catch (err) {
    setGate('LỖI XÁC THỰC', explain(err), 'bad');
  }
});

$('btnReset').addEventListener('click', () => {
  localStorage.removeItem(KEYS.cred);
  localStorage.removeItem(KEYS.user);
  closeBay();
  setGate('CHƯA MỞ', 'Đã xoá dấu vết trên máy này. Passkey trong hệ thống Chrome vẫn còn — xoá trong cài đặt Chrome nếu cần.');
});

/* ----------------------------------------------------------- nền: sao trời */
const starsC = $('stars');
const starsX = starsC.getContext('2d');
let stars = [];

function sizeStars() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  starsC.width = Math.round(w * dpr);
  starsC.height = Math.round(h * dpr);
  starsX.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.round((w * h) / 14000);
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.25,
      a: Math.random() * 0.5 + 0.18,
      s: Math.random() * 0.014 + 0.004,
      p: Math.random() * Math.PI * 2
    });
  }
}

function drawStars(t) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  starsX.clearRect(0, 0, w, h);
  stars.forEach((s) => {
    const y = REDUCE ? s.y : (s.y + t * s.s) % h;
    const a = REDUCE ? s.a : s.a * (0.62 + 0.38 * Math.sin(t * 0.0016 + s.p));
    starsX.beginPath();
    starsX.arc(s.x, y, s.r, 0, Math.PI * 2);
    starsX.fillStyle = 'rgba(233,244,255,' + a.toFixed(3) + ')';
    starsX.fill();
  });
}

function tick(now) {
  drawStars(now);
  if (unlocked) drawShield();
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------- khởi động */
function startClock() {
  const tickClock = () => {
    const d = new Date();
    $('ribbonClock').textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join(':');
  };
  tickClock();
  setInterval(tickClock, 1000);
}

env.platform = null;
renderEnv();
refreshGateState();
setGate(env.passkey ? 'CHƯA MỞ' : 'KHÔNG HỖ TRỢ',
  env.passkey ? 'Chưa mở khoang. Hãy tạo passkey hoặc mở bằng passkey đã lưu.'
              : 'Trình duyệt này không hỗ trợ WebAuthn/passkey.');
sizeStars();
drawStars(0);
drawDock();
drawUrl();
drawShield();
startClock();
if (!REDUCE) requestAnimationFrame(tick);

if (env.passkey && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
  window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    .then((ok) => { env.platform = !!ok; renderEnv(); refreshGateState(); })
    .catch(() => { env.platform = false; renderEnv(); refreshGateState(); });
}

const ro = new ResizeObserver(() => { drawDock(); drawUrl(); drawShield(); });
ro.observe(dockC);
ro.observe($('urlCanvas'));
ro.observe(viewport);
window.addEventListener('resize', () => { sizeStars(); if (REDUCE) drawStars(0); });

})();
