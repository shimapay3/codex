// JS mẫu: đánh dấu mọi liên kết trên trang để kiểm tra nhanh việc tiêm JS.
(() => {
  const cleanups = (window.__tabInjectorCleanups = window.__tabInjectorCleanups || {});

  const links = Array.from(document.querySelectorAll('a[href]'));
  links.forEach((link) => link.classList.add('tab-injector-link'));
  console.log('[Tab Injector] highlight-links.js: ' + links.length + ' liên kết');

  // Đăng ký hàm dọn dẹp để nút ⏸ Dừng bỏ tô sáng khỏi trang.
  cleanups['highlight-links'] = () => {
    document.querySelectorAll('.tab-injector-link').forEach((link) => link.classList.remove('tab-injector-link'));
  };
})();
