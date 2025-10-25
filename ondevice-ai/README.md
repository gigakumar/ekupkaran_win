# ondevice-ai

Minimal local-first assistant runtime with gRPC, deterministic embeddings, and a SwiftUI front-end scaffold.

## Quickstart

Requirements:
- Python 3.11+
- Optional: Xcode if you want to build the macOS SwiftUI client

Create an isolated environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
make proto
```

Launch the automation daemon (gRPC server + MLX-compatible HTTP runtime):

```bash
scripts/run_daemon.sh
```

Run the CLI helpers from the same environment:

```bash
scripts/run_daemon.sh --help  # shows daemon options
python -m cli.index index "hello world"
python -m cli.index query "hello"
python -m cli.index plan "organise my notes"
```

Run tests:

```bash
pytest -q
```

## Windows quickstart

> 💡 The Windows desktop client expects the HTTP runtime on `http://127.0.0.1:9000`. Use the helper script below to launch it.

1. Open **Windows PowerShell** and change into this folder:

	```powershell
	cd ondevice-ai
	```

2. Create the virtual environment and install dependencies (first run only):

	```powershell
	python -m venv .venv
	.\.venv\Scripts\Activate.ps1
	pip install -r requirements.txt
	```

3. Launch the daemon using the helper script (this reuses `.venv` automatically):

	```powershell
	.\scripts\run_daemon.ps1
	```

	- Use `-Port 9100` to change the HTTP port (also update the Electron app Settings).
	- `-VenvPath` lets you point at a custom environment; defaults to `./.venv`.

When the daemon starts, it stores data under `%USERPROFILE%\.ekupkaran` by default:

- `documents.json` — persisted knowledge base used by the Windows client.
- `logs\audit.jsonl` — audit trail for planner actions.
- `plugins\` — user-editable plugin manifests. Bundled plugins are copied here on first run.

## Layout

- `proto/assistant.proto` — gRPC schema
- `core/` — vector store, orchestrator, adapter, gRPC server
- `automation_daemon.py` — unified entry (runs gRPC server + HTTP runtime)
- `tools/` — MLX runtime server and utilities
- `cli/` — CLI subcommand runner (`index`, `query`, `plan`)
- `tests/` — unit and e2e tests

## License

MIT

- The HTTP runtime persists documents in-memory, exposes `/documents`, `/query`, `/plan`, `/audit`, and `/plugins`.
- gRPC server stores embeddings in SQLite (`VectorStore`) and logs actions through `core.audit`.

## SwiftUI client

The `swift/` directory contains a Swift Package with basic views. Open the package in Xcode or run:

```bash
open swift/OnDeviceAIApp/Package.swift
```

Ensure the Python daemon is running locally before launching the SwiftUI previews.
