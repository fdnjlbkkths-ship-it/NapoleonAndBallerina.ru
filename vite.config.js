import { resolve } from 'path';
import { defineConfig } from 'vite';

// Local/dev: `/`. GitHub Pages project site: set VITE_BASE=/NapoleonAndBallerina.ru/
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  build: {
    // Keep game.js self-contained for GitHub Pages (no extra chunk imports).
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu.html'),
        about: resolve(__dirname, 'about.html'),
        contacts: resolve(__dirname, 'contacts.html'),
        game: resolve(__dirname, 'game.html'),
      },
      output: {
        // Stable names so GitHub Pages can load committed assets without hash churn.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) => {
          const name = info.name || '';
          if (name.endsWith('.css')) {
            // game.html stylesheet → assets/game.css
            if (name.includes('game') || name.includes('style')) return 'assets/game.css';
            return 'assets/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  server: {
    host: true,
  },
});
