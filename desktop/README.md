# Ekupkaran (Windows) — Electron client

Electron-based Windows front-end for the Ekupkaran automation stack. The app mirrors the macOS SwiftUI experience with:

- **Dashboard** with live daemon health, quick actions, model profile summary, and recent audit events.
- **Knowledge console** for indexing snippets, browsing documents, and running semantic search.
- **Planner** with temperature/token controls and optional knowledge grounding.
- **Settings** to configure backend host, model profile preferences, audit logging, and auto-refresh cadence.

The client communicates with the Python automation daemon via its HTTP runtime (`/health`, `/index`, `/documents`, `/query`, `/plan`, `/plugins`, `/audit`).

## Prerequisites

- Node.js 18+ (installed automatically in this workspace via Homebrew).
- Running Ekupkaran automation daemon (from the macOS project) listening on `http://127.0.0.1:9000`. Adjust the host/port inside the app if needed.

## Quick start

```bash
npm install
npm run lint    # optional static analysis
npm run start   # launches Electron in development mode
```

The app defaults to `http://127.0.0.1:9000`. Visit **Settings → Backend host** to point at a remote daemon.

### Packaging for Windows

```bash
npm run package        # win32 x64
npm run package:arm64  # win32 arm64 builds (Windows on ARM)
```

Artifacts are emitted to `dist/`. For production distribution you may integrate `electron-builder` or MSIX packaging.

## Project structure

- `main.js` — Electron main process (creates the browser window).
- `preload.js` — Secure bridge exposing backend request helpers to the renderer.
- `renderer/` — UI code (HTML/CSS/JS) that implements dashboard, knowledge console, planner, and settings views.
- `.eslintrc.cjs` — ESLint configuration (`npm run lint`).

## Backend endpoints used

- `GET /health` — daemon status and indexed document count.
- `POST /index` — index a new knowledge snippet.
- `GET /documents`, `GET /documents/:id` — list and inspect indexed documents.
- `POST /query` — semantic search.
- `POST /plan` — generate automation plan (temperature/token controls forwarded in `params`).
- `GET /plugins` — display registered plugins.
- `GET|POST /audit` — render audit events and record plan executions when audit logging is enabled.

## Preferences & persistence

Preferences (backend host, model profile, audit logging, auto-refresh, planner defaults) are persisted in `localStorage`. They are isolated per user profile and can be reset from **Settings → Reset to defaults**.

## Troubleshooting

- **Backend offline** — Ensure `automation_daemon.py` (or `make package`) is running locally and exposes the HTTP runtime on the host/port configured in Settings.
- **Missing Node/npm** — Install Node.js (e.g. `brew install node`) before running `npm install`.
- **Packaging errors** — Delete `dist/` and retry `npm run package`. Ensure the repository path contains no spaces for best results.
