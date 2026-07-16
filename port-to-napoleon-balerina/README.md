# Перенос Sweet Rush на napoleon-balerina

Рабочий сайт: https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/

## Самый простой способ (с телефона)

1. Откройте: https://github.com/settings/installations  
2. Найдите **Cursor** → Configure  
3. В Repository access добавьте репозиторий **`napoleon-balerina`** (или All repositories)  
4. Сохраните и напишите агенту «готово» — он сам запушит игру

## Деплой одной командой (с Mac / ПК)

```bash
git clone https://github.com/fdnjlbkkths-ship-it/NapoleonAndBallerina.ru.git /tmp/nb-kit
cd /tmp/nb-kit
git checkout cursor/port-game-to-real-site-e563
bash port-to-napoleon-balerina/deploy-now.sh
```

Скрипт копирует игру, собирает сайт и **сразу пушит в `main`**.  
Через 1–2 минуты: https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/game.html
