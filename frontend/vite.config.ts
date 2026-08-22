import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const wsBackendUrl = backendUrl.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/ws': {
        target: wsBackendUrl,
        ws: true,
      },
    },
  },
});
