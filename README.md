# InFrame

Open-source desktop helper for video editors.

Browse stock sites in an embedded browser, hover a photo or video, click **Insert** — and the file goes into **DaVinci Resolve**, **Premiere Pro**, **After Effects**, and **CapCut**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue.svg)

## Features

- Embedded browser (Pexels, Unsplash, Google Images, any site)
- One-click **Insert** / **Insert video** overlay on media
- Auto-import into **DaVinci Resolve** Media Pool via Scripting API
- Inbox folders + JSX helpers for Adobe apps
- Plugin / resource catalog with quick open in the built-in browser
- Downloads real JPEG/PNG (avoids AVIF that Resolve can't play)

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+
- For Resolve auto-import:
  - DaVinci Resolve running with a project open
  - **Preferences → System → General → External scripting = Local**
  - Python 3.6+ (64-bit)
- Optional: Premiere Pro, After Effects, CapCut

## Setup

```bash
git clone https://github.com/obbi-man/inframe.git
cd inframe
npm install
npm run dev
```

## Usage

1. Pick target apps in the left panel (Resolve / Premiere / AE / CapCut).
2. Open a site in the address bar.
3. Hover an image or play a video → click **Insert**.
4. Files land in `%USERPROFILE%\InFrame\inbox\` and are imported where possible.

### Inbox layout

```
InFrame/inbox/
  premiere/
  aftereffects/
  resolve/
  capcut/
  _scripts/          # JSX / Resolve Python helpers
```

## Tech stack

- Electron
- React + Vite + TypeScript
- DaVinci Resolve Scripting API (Python)

## Contributing

Issues and pull requests are welcome. Keep changes focused; match the existing code style.

## License

[MIT](LICENSE) © Artem Savinykh
