import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: '.',
    emptyOutDir: false, // Don't delete other files
    rollupOptions: {
      input: {
        options: resolve(__dirname, 'src/options/options.html')
      },
      output: {
        entryFileNames: 'options.js',
        chunkFileNames: 'options-[name].js',
        assetFileNames: (assetInfo) => {
          // Handle HTML files
          if (assetInfo.name && assetInfo.name.includes('options.html')) {
            return 'options.html';
          }
          // Handle CSS files
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'options.css';
          }
          return 'assets/[name].[ext]';
        }
      }
    },
    cssCodeSplit: false, // Bundle all CSS into one file
    minify: false // Keep readable for debugging
  },
  server: {
    port: 3000,
    open: false
  }
});

