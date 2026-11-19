import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Mã phiên bản cho mỗi lần build: app đã cài so sánh với /version.json để tự tải bản mới
const APP_VERSION = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function versionFile(): Plugin {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
    }
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
