"""Simple JSONL audit log writer and reader."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator


def _default_log_path() -> Path:
    root = os.environ.get("ONDEVICE_AUDIT_DIR")
    if root:
        base = Path(root)
    else:
        data_root = os.environ.get("EKUPKARAN_DATA_DIR")
        if data_root:
            base = Path(data_root) / "logs"
        else:
            base = Path.home() / ".ekupkaran" / "logs"
    base.mkdir(parents=True, exist_ok=True)
    return base / "audit.jsonl"


DEFAULT_LOG = os.environ.get("ONDEVICE_AUDIT_LOG")


def _resolve_path(path: str | None = None) -> Path:
    if path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        return target
    if DEFAULT_LOG:
        target = Path(DEFAULT_LOG)
        target.parent.mkdir(parents=True, exist_ok=True)
        return target
    return _default_log_path()


def write_event(event: Dict[str, Any], path: str | None = None) -> None:
    evt = dict(event)
    evt.setdefault("ts", int(time.time()))
    target = _resolve_path(path)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(evt, ensure_ascii=False) + "\n")


def read_events(path: str | None = None) -> Iterable[Dict[str, Any]]:
    target = _resolve_path(path)
    if not target.exists():
        return []

    def _generator() -> Iterator[Dict[str, Any]]:
        with target.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except Exception:
                    continue

    return _generator()
