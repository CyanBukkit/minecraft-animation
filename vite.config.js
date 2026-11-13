import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 47321, strictPort: true },
  preview: { host: '127.0.0.1', port: 47322, strictPort: true },
  build: {
    rolldownOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined } },
    chunkSizeWarningLimit: 650,
  },
});
