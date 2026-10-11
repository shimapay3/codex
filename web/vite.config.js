import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App này chỉ chạy phía trình duyệt (localStorage + WebAuthn), không có backend.
//
// Trong preview của Base44, dev server nằm sau proxy: mỗi phiên sandbox có một
// Host khác nhau (<port>-<sandbox id>.<BASE44_SANDBOX_HOST_DOMAIN>), nên phải mở
// allowlist cho miền con của sandbox. Chỉ bật khi BASE44_PREVIEW_MODE === '1';
// chạy local bình thường thì giữ nguyên mặc định của Vite. Nền tảng cũng đặt
// __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS (Vite >= 6.1 tự nối thêm vào allowlist).
const sandboxDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN;
const isPreview = process.env.BASE44_PREVIEW_MODE === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: isPreview && sandboxDomain ? [`.${sandboxDomain}`] : undefined,
    watch: { usePolling: true, interval: 400 },
  },
});
