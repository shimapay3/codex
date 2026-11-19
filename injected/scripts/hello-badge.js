// JS mẫu: gắn một huy hiệu nhỏ ở góc phải dưới của trang.
// Chạy lại nhiều lần vẫn an toàn vì luôn dùng lại đúng một phần tử.
(() => {
  const ID = 'tab-injector-badge';
  const cleanups = (window.__tabInjectorCleanups = window.__tabInjectorCleanups || {});

  let badge = document.getElementById(ID);
  if (!badge) {
    badge = document.createElement('div');
    badge.id = ID;
    badge.className = 'tab-injector-badge';
    document.documentElement.appendChild(badge);
  }

  badge.textContent = 'Tab Injector · ' + new Date().toLocaleTimeString('vi-VN');
  console.log('[Tab Injector] hello-badge.js chạy lúc', new Date().toISOString());

  // Đăng ký hàm dọn dẹp để nút ⏸ Dừng gỡ được huy hiệu khỏi trang.
  cleanups['hello-badge'] = () => document.getElementById(ID)?.remove();
})();
