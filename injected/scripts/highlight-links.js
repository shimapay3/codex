// JS mẫu: đánh dấu mọi liên kết trên trang để kiểm tra nhanh việc tiêm JS.
(() => {
  const links = Array.from(document.querySelectorAll('a[href]'));
  links.forEach((link) => link.classList.add('tab-injector-link'));
  console.log('[Tab Injector] highlight-links.js: ' + links.length + ' liên kết');
})();
