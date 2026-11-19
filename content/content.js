// Content script: chạy ở mỗi trang và báo cho service worker biết trang đã sẵn
// sàng. Nhờ đó bộ JS/CSS của tab được tiêm lại ngay sau mỗi lần tải lại trang.
(() => {
  if (window.__tabInjectorReady) return;
  window.__tabInjectorReady = true;

  try {
    chrome.runtime.sendMessage({ type: 'page-ready' }, () => {
      // Đọc lastError để không có cảnh báo "Unchecked runtime.lastError"
      // khi service worker vừa bị Chrome cho ngủ.
      void chrome.runtime.lastError;
    });
  } catch {
    // Trang chặn extension (ví dụ chrome://) — bỏ qua.
  }
})();
