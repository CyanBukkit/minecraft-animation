import { defineConfig } from 'vite';
import { createSkinHandler } from './src/node/skin-handler.js';

export default defineConfig({
  plugins: [{ name: 'player-skin-api',
    configureServer(server) { server.middlewares.use(createSkinHandler()); },
    configurePreviewServer(server) { server.middlewares.use(createSkinHandler()); },
  }],
  base: './',
  server: { host: '127.0.0.1', port: 47321, strictPort: true },
  preview: { host: '127.0.0.1', port: 47322, strictPort: true },
  build: {
    rolldownOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined } },
    chunkSizeWarningLimit: 650,
  },
});
