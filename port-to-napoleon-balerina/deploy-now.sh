#!/usr/bin/env bash
# One-shot deploy of Sweet Rush onto the live bakery site (napoleon-balerina).
# Pushes straight to main so GitHub Pages Actions can publish.
set -euo pipefail

SITE_DIR="${1:-$HOME/napoleon-balerina}"
PKG_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$SITE_DIR/.git" ]]; then
  echo "Клонирую рабочий сайт…"
  git clone https://github.com/fdnjlbkkths-ship-it/napoleon-balerina.git "$SITE_DIR"
fi

cd "$SITE_DIR"
git fetch origin
git checkout main
git pull origin main

echo "Копирую игру…"
cp "$PKG_DIR/game.html" .
mkdir -p src/game
cp -R "$PKG_DIR/src/game/." src/game/

# vite.config.js — add game entry if missing
if ! grep -q "game.html" vite.config.js; then
  python3 - <<'PY'
from pathlib import Path
p = Path('vite.config.js')
t = p.read_text()
needle = "checkout: resolve(__dirname, 'checkout.html'),"
insert = "checkout: resolve(__dirname, 'checkout.html'),\n          game: resolve(__dirname, 'game.html'),"
if needle not in t:
    raise SystemExit('vite.config.js: checkout entry not found — add game manually')
if "game: resolve(__dirname, 'game.html')" not in t:
    p.write_text(t.replace(needle, insert, 1))
print('vite.config.js updated')
PY
fi

# package.json — add test:game if missing
if ! grep -q 'test:game' package.json; then
  python3 - <<'PY'
from pathlib import Path
import json
p = Path('package.json')
data = json.loads(p.read_text())
data.setdefault('scripts', {})['test:game'] = 'node src/game/engine.test.mjs && node src/game/promo.test.mjs'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('package.json updated')
PY
fi

# index.html — careful links
if ! grep -q 'game.html' index.html; then
  python3 - <<'PY'
from pathlib import Path
p = Path('index.html')
t = p.read_text()
t2 = t.replace(
    '<a href="menu.html" class="btn btn--primary btn--hero">Смотреть меню</a>\n            <a href="#categories-title" class="btn btn--ghost">Категории</a>',
    '<a href="menu.html" class="btn btn--primary btn--hero">Смотреть меню</a>\n            <a href="game.html" class="btn btn--ghost">Sweet Rush</a>\n            <a href="#categories-title" class="btn btn--ghost">Категории</a>',
    1,
)
if t2 == t:
    # fallback: only add footer link
    t2 = t.replace(
        '<a href="contacts.html" class="footer__link">Контакты</a>',
        '<a href="contacts.html" class="footer__link">Контакты</a>\n          <a href="game.html" class="footer__link">Sweet Rush</a>',
        1,
    )
p.write_text(t2)
print('index.html links updated')
PY
fi

npm ci
npm run test:game
GITHUB_ACTIONS=true GITHUB_REPOSITORY=fdnjlbkkths-ship-it/napoleon-balerina npm run build

git add game.html src/game vite.config.js package.json index.html
if git diff --cached --quiet; then
  echo "Изменений нет — игра уже в репозитории."
else
  git commit -m "Add Sweet Rush bonus game"
fi

echo "Пушу в main…"
git push origin main

echo ""
echo "OK: код в main. Через 1–2 мин Actions выложит Pages."
echo "Игра: https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/game.html"
echo "Меню: https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/menu.html"
