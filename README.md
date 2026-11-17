# Rionina Launcher

Лаунчер Minecraft в стиле Apple: компьютер (Windows, macOS, Linux) и телефон (Android, iPhone).

## Что умеет

**Компьютер (`/`)**
- Вход через **Microsoft** (почта, телефон или Skype — аккаунт с купленным Minecraft) или **офлайн** по никнейму.
- **Новости** — официальная лента Mojang: новости, обновления Java и Bedrock. Нажмите на карточку, чтобы прочитать полностью.
- **Версии** — все выпуски Java Edition, от `rd-132211` (2009) до последней: релизы, снапшоты, Beta и Alpha, с поиском.
  «Установить» → версия скачивается и сама появляется в «Мои версии».
- **Играть** — запускает выбранную версию. Если версия не установлена, лаунчер сначала её установит.
- **Java ставится сама**: нужная версия (8, 17, 21…) скачивается с серверов Mojang.
- **Bedrock** (Windows 10/11) — устанавливается автоматически при первом запуске (через winget из Microsoft Store, нужен аккаунт Microsoft с купленным Minecraft) и запускается одной кнопкой.
- **Настройки**: память, полный экран, скрытие лаунчера, журнал игры.

**Телефон (`/mobile`)** — Minecraft Bedrock:
- Запуск Minecraft одной кнопкой; если игры нет — открывается Google Play или App Store.
- Новости Bedrock.
- Серверы: «Играть» открывает Minecraft и добавляет сервер в список.

## Запуск на компьютере

Нужен [Node.js 20+](https://nodejs.org).

```bash
npm install
npm start
```

Установщик: `npm run dist:win` (.exe), `npm run dist:mac` (.dmg) или `npm run dist:linux` (.AppImage) — результат в `dist/`.

Игра и Java хранятся в папке `.rionina`: `%APPDATA%\.rionina` на Windows, `~/Library/Application Support/.rionina` на macOS, `~/.config/.rionina` на Linux.

## Телефон

Нужны Android Studio (для Android) или Xcode на Mac (для iPhone).

```bash
cd mobile
npm install
npm run android      # или: npm run ios
npx cap open android # откроется Android Studio → Run
```

Сборка без своей машины: загрузите проект на GitHub → вкладка **Actions** → «Сборка Rionina Launcher» → Run.
Готовые .exe, .dmg, .AppImage и .apk появятся в артефактах.

## Важно

- Сама Bedrock Edition — платная игра из Google Play, App Store и Microsoft Store. Лаунчер её запускает и открывает страницу установки, но не скачивает сам.
- В офлайн-режиме работают одиночная игра и серверы без проверки лицензии.
- Rionina Launcher не связан с Mojang или Microsoft. Minecraft — товарный знак Mojang AB.
