# tools/mlx_runtime.py
from __future__ import annotations

import hashlib
import json
import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List

import numpy as np
from flask import Flask, jsonify, request

from core.audit import read_events, write_event
from core.plugins import PluginManifest


DATA_ROOT = Path(os.environ.get("EKUPKARAN_DATA_DIR", Path.home() / ".ekupkaran"))
MODELS_ROOT = Path(os.environ.get("ML_MODELS_DIR", DATA_ROOT / "models"))
PLANNER_DIR = MODELS_ROOT / "planner"
_DEFAULT_PLUGINS_DIR = Path(__file__).resolve().parents[1] / "plugins"
_PLUGINS_DIR = Path(os.environ.get("PLUGINS_DIR", DATA_ROOT / "plugins"))
DOCUMENTS_PATH = DATA_ROOT / "documents.json"

DATA_ROOT.mkdir(parents=True, exist_ok=True)
MODELS_ROOT.mkdir(parents=True, exist_ok=True)
_PLUGINS_DIR.mkdir(parents=True, exist_ok=True)


def _fallback_embed(text: str) -> np.ndarray:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    data = np.frombuffer(digest * 8, dtype=np.uint8)[:256].astype(np.float32)
    return data / 255.0


def _fallback_generate(prompt: str, **kwargs: Any) -> str:
    steps = [line.strip() for line in prompt.split(".") if line.strip()]
    if not steps:
        steps = [prompt.strip() or "analyze request"]
    return json.dumps(
        [
            {
                "name": f"step_{i+1}",
                "payload": json.dumps({"instruction": step}) if not step.startswith("{") else step,
                "sensitive": False,
                "preview_required": False,
            }
            for i, step in enumerate(steps[:4])
        ]
    )


embed_text = _fallback_embed
generate = _fallback_generate

try:  # pragma: no cover - optional dependency
    from mlx_lm import load_model  # type: ignore[import]

    _planner_target: Path | None
    env_target = os.environ.get("PLANNER_MODEL_PATH")
    if env_target:
        _planner_target = Path(env_target)
    elif PLANNER_DIR.exists():
        _planner_target = PLANNER_DIR
    else:
        _planner_target = None

    if _planner_target and _planner_target.exists():
        MODEL = load_model(str(_planner_target), device="metal")
    else:
        MODEL = load_model(os.environ.get("PLANNER_MODEL_NAME", "mlx-community/mistral-7b-instruct-q4_0"), device="metal")

    def _model_embed(text: str) -> np.ndarray:
        return np.array(MODEL.embed(text), dtype=np.float32)

    def _model_generate(prompt: str, **kwargs: Any) -> str:
        return MODEL.generate(prompt, **kwargs)

    embed_text = _model_embed
    generate = _model_generate
except Exception:  # pragma: no cover - deterministic fallback
    pass


app = Flask("mlx_runtime")

_DOCUMENTS: Dict[str, Dict[str, Any]] = {}
_VECTORS: Dict[str, np.ndarray] = {}
_STATE_LOCK = threading.Lock()


def _seed_plugins_directory() -> None:
    if not any(_PLUGINS_DIR.iterdir()) and _DEFAULT_PLUGINS_DIR.exists():
        for item in _DEFAULT_PLUGINS_DIR.iterdir():
            dest = _PLUGINS_DIR / item.name
            if dest.exists():
                continue
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)


def _load_documents() -> None:
    if not DOCUMENTS_PATH.exists():
        _seed_plugins_directory()
        return
    try:
        with DOCUMENTS_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return
    for doc in payload.get("documents", []):
        doc_id = doc.get("id")
        vector = doc.get("vector")
        if not doc_id or vector is None:
            continue
        _DOCUMENTS[doc_id] = {
            key: value for key, value in doc.items() if key not in {"vector"}
        }
        _VECTORS[doc_id] = np.array(vector, dtype=np.float32)


def _persist_documents() -> None:
    with _STATE_LOCK:
        serialisable: List[Dict[str, Any]] = []
        for doc_id, doc in _DOCUMENTS.items():
            vector = _VECTORS.get(doc_id)
            serialisable.append({
                **doc,
                "id": doc_id,
                "vector": vector.astype(float).tolist() if vector is not None else [],
            })
        DOCUMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with DOCUMENTS_PATH.open("w", encoding="utf-8") as handle:
            json.dump({"documents": serialisable}, handle, ensure_ascii=False, indent=2)


_load_documents()


def plugin_list() -> List[Dict[str, Any]]:
    manifests: List[Dict[str, Any]] = []
    for base in (_PLUGINS_DIR, _DEFAULT_PLUGINS_DIR):
        manifest_path = base / "plugin-manifest.yaml"
        if not manifest_path.exists():
            continue
        try:
            manifest = PluginManifest.load(str(manifest_path))
        except Exception:
            continue
        manifests.append(manifest.__dict__)
    return manifests


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _doc_preview(text: str) -> str:
    return text[:200]


@app.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({
        "status": "ok",
        "documents": len(_DOCUMENTS),
        "backend": {
            "host": request.host,
            "plugins": len(list(plugin_list())),
            "storage": str(DOCUMENTS_PATH),
        },
    })


@app.route("/embed", methods=["POST"])
def embed() -> Any:
    payload = request.get_json(silent=True) or {}
    texts: Iterable[str] = payload.get("texts", [])
    vectors = [embed_text(text).astype(float).tolist() for text in texts]
    return jsonify({"vectors": vectors})


@app.route("/predict", methods=["POST"])
def predict() -> Any:
    payload = request.get_json(silent=True) or {}
    prompt = payload.get("prompt", "")
    params = payload.get("params", {}) or {}
    return jsonify({"text": generate(prompt, **params)})


@app.route("/index", methods=["POST"])
def index_document() -> Any:
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    source = (payload.get("source") or "api").strip() or "api"
    doc_id = str(uuid.uuid4())
    ts = int(time.time())
    vector = embed_text(text)
    _DOCUMENTS[doc_id] = {"id": doc_id, "source": source, "ts": ts, "text": text}
    _VECTORS[doc_id] = vector
    write_event({"type": "document_indexed", "id": doc_id, "source": source})
    _persist_documents()
    return jsonify({"id": doc_id, "source": source, "ts": ts, "preview": _doc_preview(text)})


@app.route("/query", methods=["POST"])
def semantic_query() -> Any:
    payload = request.get_json(silent=True) or {}
    query = str(payload.get("query", "")).strip()
    limit = int(payload.get("limit", 5) or 5)
    if not query:
        return jsonify({"hits": []})
    q_vec = embed_text(query)
    scored: List[Dict[str, Any]] = []
    for doc_id, vector in _VECTORS.items():
        score = _cosine(q_vec, vector)
        doc = _DOCUMENTS[doc_id]
        scored.append({"doc_id": doc_id, "score": score, "preview": _doc_preview(doc["text"])})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return jsonify({"hits": scored[: limit if limit > 0 else 5]})


@app.route("/plan", methods=["POST"])
def plan() -> Any:
    payload = request.get_json(silent=True) or {}
    goal = payload.get("goal", "")
    try:
        actions = json.loads(generate(f"Plan steps for: {goal}"))
        if isinstance(actions, list):
            return jsonify({"actions": actions})
    except Exception:
        pass
    return jsonify({
        "actions": [
            {"name": "research", "payload": json.dumps({"goal": goal}), "sensitive": False, "preview_required": False},
            {"name": "summarize", "payload": json.dumps({"goal": goal}), "sensitive": False, "preview_required": False},
        ]
    })


@app.route("/documents", methods=["GET"])
def list_documents() -> Any:
    docs = [
        {"id": doc_id, "source": doc["source"], "ts": doc["ts"], "preview": _doc_preview(doc["text"])}
        for doc_id, doc in _DOCUMENTS.items()
    ]
    docs.sort(key=lambda d: d["ts"], reverse=True)
    return jsonify({"documents": docs})


@app.route("/documents/<doc_id>", methods=["GET"])
def document_detail(doc_id: str) -> Any:
    doc = _DOCUMENTS.get(doc_id)
    if not doc:
        return jsonify({"error": "not_found"}), 404
    return jsonify(doc)


@app.route("/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id: str) -> Any:
    if doc_id not in _DOCUMENTS:
        return jsonify({"status": "not_found"}), 404
    _DOCUMENTS.pop(doc_id, None)
    _VECTORS.pop(doc_id, None)
    write_event({"type": "document_deleted", "id": doc_id})
    _persist_documents()
    return jsonify({"status": "deleted"})


@app.route("/audit", methods=["GET", "POST"])
def audit() -> Any:
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        write_event(payload)
        return jsonify({"status": "ok"}), 201
    events = list(read_events())
    return jsonify({"events": events})


@app.route("/plugins", methods=["GET"])
def plugins() -> Any:
    return jsonify({"plugins": plugin_list()})


if __name__ == "__main__":  # pragma: no cover
    app.run(host="127.0.0.1", port=9000)
