import importlib
import sys


def _load_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("EKUPKARAN_DATA_DIR", str(tmp_path / "data"))
    # ensure a clean module import so persistence is reloaded each time
    sys.modules.pop("tools.mlx_runtime", None)
    return importlib.import_module("tools.mlx_runtime")


def test_index_query_and_persist(tmp_path, monkeypatch):
    runtime = _load_runtime(tmp_path, monkeypatch)
    with runtime.app.test_client() as client:
        index_resp = client.post("/index", json={"text": "hello world", "source": "test"})
        assert index_resp.status_code == 200
        doc_id = index_resp.json["id"]

        docs_resp = client.get("/documents")
        assert docs_resp.status_code == 200
        assert docs_resp.json["documents"]

        hit_resp = client.post("/query", json={"query": "hello", "limit": 1})
        assert hit_resp.status_code == 200
        hits = hit_resp.json["hits"]
        assert hits and hits[0]["doc_id"] == doc_id

        plan_resp = client.post("/plan", json={"goal": "test"})
        assert plan_resp.status_code == 200
        assert plan_resp.json["actions"]

        delete_resp = client.delete(f"/documents/{doc_id}")
        assert delete_resp.status_code == 200
        docs_after = client.get("/documents")
        assert docs_after.status_code == 200
        assert doc_id not in {doc["id"] for doc in docs_after.json["documents"]}

    # re-import runtime to ensure persisted state is honoured
    runtime_reloaded = _load_runtime(tmp_path, monkeypatch)
    with runtime_reloaded.app.test_client() as client:
        docs = client.get("/documents")
        assert docs.status_code == 200
        assert docs.json["documents"] == []

    # audit log should live inside the data dir
    expected_log = tmp_path / "data" / "logs" / "audit.jsonl"
    assert expected_log.exists()
