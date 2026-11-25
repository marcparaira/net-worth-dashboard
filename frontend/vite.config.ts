import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Where the dev server forwards /api: the API container under compose, localhost otherwise.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
