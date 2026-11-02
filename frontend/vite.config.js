import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    // changeOrigin off: the backend's Origin check compares Origin with Host, so Host must stay localhost:5190.
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: false } },
  },
});
