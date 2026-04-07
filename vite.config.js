import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(__dirname, 'src/options/options.html'),
        splitter: resolve(__dirname, 'src/splitter/splitter.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'options') return 'options.js';
          if (chunkInfo.name === 'splitter') return 'splitter.js';
          return '[name].js';
        },
        chunkFileNames: 'vite-chunk-[name].js',
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names || [];
          const n = names[0] ?? assetInfo.name ?? '';
          if (typeof n === 'string' && n.endsWith('.html')) {
            if (n.includes('splitter')) return 'splitter.html';
            return 'options.html';
          }
          if (typeof n === 'string' && n.endsWith('.css')) {
            if (n.includes('splitter')) return 'splitter.css';
            return 'options.css';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    cssCodeSplit: true,
    minify: false // Keep readable for debugging
  },
  server: {
    port: 3000,
    open: false
  }
});
