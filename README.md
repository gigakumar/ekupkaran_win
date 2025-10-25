# Ekupkaran Windows Workspace

Port of the Ekupkaran automation client for Windows. This repository contains:

- `desktop/`: Electron front-end for the Windows desktop experience.
- `ondevice-ai/`: Python automation daemon + supporting tooling.

## Prerequisites

- Node.js 18+ (tested with Node 24)
- Python 3.11 or newer
- Git

## Quick start

### 1. Set up the Python backend

```bash
cd /path/to/ekupkaran_win
python3 -m venv ondevice-ai/.venv
source ondevice-ai/.venv/bin/activate  # On Windows: ondevice-ai\.venv\Scripts\activate
pip install -r ondevice-ai/requirements.txt
python ondevice-ai/automation_daemon.py
```

Helper scripts are available under `ondevice-ai/scripts/` for both Windows and macOS shells.

### 2. Run the Electron client

```bash
cd /path/to/ekupkaran_win/desktop
npm install
npm run start
```

### 3. Lint & test

```bash
cd /path/to/ekupkaran_win/desktop
npm run lint

cd /path/to/ekupkaran_win/ondevice-ai
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pytest -q
```

## Repository hygiene

- Virtual environments, caches, and build outputs are ignored via the root `.gitignore`; the default backend env lives at `ondevice-ai/.venv`.
- Use the project-level READMEs in `desktop/` and `ondevice-ai/` for additional details.
