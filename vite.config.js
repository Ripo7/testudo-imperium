import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    // three.js is most of the bundle; keep it in its own chunk so game updates don't re-download it
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
