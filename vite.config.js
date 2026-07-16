import { resolve } from 'path';
import { defineConfig } from 'vite';

// Local/dev: `/`. GitHub Pages project site: set VITE_BASE=/NapoleonAndBallerina.ru/
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu.html'),
        about: resolve(__dirname, 'about.html'),
        contacts: resolve(__dirname, 'contacts.html'),
        game: resolve(__dirname, 'game.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
