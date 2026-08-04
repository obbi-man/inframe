# InFrame

Open-source desktop helper for video editors.

Browse stock sites in an embedded browser, hover a photo or video, click **Insert** — and the file goes into **DaVinci Resolve**, **Premiere Pro**, **After Effects**, and **CapCut**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue.svg)

## Установка (Windows)

### Вариант A — готовый установщик (проще всего)

1. Откройте [Releases](https://github.com/obbi-man/inframe/releases)
2. Скачайте `InFrame-Setup-*.exe`
3. Установите и запустите **InFrame**

> Если релиза ещё нет: в репозитории нажмите **Actions → Build Windows installer → Run workflow**, либо соберите локально через `build-installer.cmd`.

### Вариант B — из исходников (для разработки)

1. Установите [Node.js LTS 20+](https://nodejs.org/) (галочка *Add to PATH*)
2. Скачайте репозиторий или:
   ```bash
   git clone https://github.com/obbi-man/inframe.git
   cd inframe
   ```
3. Дважды кликните **`install.cmd`**
4. Дважды кликните **`start.cmd`**

Или в терминале:

```bash
npm install
npm run dev
```

### Если `npm install` падает / Electron не качается

Частая причина — сеть при загрузке бинарника Electron. Попробуйте зеркало:

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

Потом снова `start.cmd`.

## Сборка установщика у себя

```bat
build-installer.cmd
```

или:

```bash
npm run dist
```

Готовые файлы появятся в папке `release/`.

## Requirements

- Windows 10/11
- Для варианта B: Node.js 20+
- Для автоимпорта в Resolve:
  - DaVinci Resolve запущен, проект открыт
  - **Preferences → System → General → External scripting = Local**
  - Python 3.6+ (64-bit)
- Опционально: Premiere Pro, After Effects, CapCut

## Usage

1. Выберите целевые программы слева (Resolve / Premiere / AE / CapCut).
2. Откройте сайт в адресной строке (по умолчанию Google — ищите стоки, картинки, видео).
3. Наведите на картинку или на странице видео нажмите **Вставить видео со страницы**.
4. Файлы сохраняются в `%USERPROFILE%\InFrame\inbox\` и импортируются куда возможно.

### Inbox layout

```
InFrame/inbox/
  premiere/
  aftereffects/
  resolve/
  capcut/
  _scripts/          # JSX / Resolve Python helpers
```

## Features

- Embedded browser (Pexels, Unsplash, Google Images, any site)
- One-click **Insert** / **Insert video** overlay on media
- Auto-import into **DaVinci Resolve** Media Pool via Scripting API
- Inbox folders + JSX helpers for Adobe apps
- Plugin / resource catalog with quick open in the built-in browser
- Downloads real JPEG/PNG (avoids AVIF that Resolve can't play)

## Scripts

| Command | Description |
|--------|-------------|
| `install.cmd` | Install dependencies (Windows) |
| `start.cmd` | Run in development mode |
| `build-installer.cmd` | Build `.exe` installer |
| `npm run dev` | Dev (Vite + Electron) |
| `npm run dist` | Production Windows build |

## Tech stack

- Electron
- React + Vite + TypeScript
- DaVinci Resolve Scripting API (Python)

## Contributing

Issues and pull requests are welcome. Keep changes focused; match the existing code style.

## License

[MIT](LICENSE) © Artem Savinykh
