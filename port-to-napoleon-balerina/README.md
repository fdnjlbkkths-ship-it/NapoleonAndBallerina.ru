# Перенос Sweet Rush на napoleon-balerina

Рабочий сайт: https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/

## Быстрый перенос (на Mac)

```bash
cd ~/napoleon-balerina   # путь к клону рабочего репозитория
git pull origin main
git checkout -b cursor/sweet-rush-game

# Скопируйте файлы из этого пакета:
# - game.html                  → корень репо
# - src/game/                  → src/game/
```

### 1) `vite.config.js`
В `build.rollupOptions.input` добавьте строку:

```js
game: resolve(__dirname, 'game.html'),
```

### 2) `package.json`
В `scripts` добавьте:

```json
"test:game": "node src/game/engine.test.mjs && node src/game/promo.test.mjs"
```

### 3) Ссылка на главной (`index.html`) — опционально
В hero рядом с «Смотреть меню»:

```html
<a href="game.html" class="btn btn--ghost">Sweet Rush</a>
```

В футере в блок навигации:

```html
<a href="game.html" class="footer__link">Sweet Rush</a>
```

### 4) Проверка и деплой

```bash
npm run test:game
npm run build
git add game.html src/game vite.config.js package.json index.html
git commit -m "Add Sweet Rush bonus game"
git push -u origin cursor/sweet-rush-game
# затем merge в main — GitHub Actions задеплоит Pages
```

Игра будет здесь:
https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/game.html

Меню как и раньше:
https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/menu.html
