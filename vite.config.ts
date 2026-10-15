/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { resolveApiBase } from './src/lib/apiBase.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  resolveApiBase(env.VITE_API_BASE_URL, command === 'build')
  return {
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // In dev, the frontend calls `/api/...`; proxy those to the backend so the
    // browser stays same-origin (no CORS) and no secret ever reaches the client.
    // Override the target with VITE_DEV_API_PROXY if the backend runs elsewhere.
    proxy: {
      '/api': {
        target: env.VITE_DEV_API_PROXY ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // Vitest: speech modules touch browser globals, so run tests in jsdom.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  }
})
