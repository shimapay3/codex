import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8000'
const wsTarget = apiTarget.replace(/^http/, 'ws')

// Allow the preview proxy host only while running inside the sandbox preview.
// BASE44_PREVIEW_MODE is unset (or any other value) for real deployments, where
// the allow-list stays exactly as Vite ships it.
const previewAllowedHosts: string[] = []
if (process.env.BASE44_PREVIEW_MODE === '1') {
  if (process.env.BASE44_SANDBOX_HOST_DOMAIN) {
    previewAllowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`)
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    ...(previewAllowedHosts.length ? { allowedHosts: previewAllowedHosts } : {}),
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws': { target: wsTarget, ws: true, changeOrigin: true },
    },
  },
})
