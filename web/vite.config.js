import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API is reached through this dev server so the app stays on a single origin.
const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    watch: { usePolling: true, interval: 400 },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
