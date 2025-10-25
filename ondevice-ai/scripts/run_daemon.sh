#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
VENV_PATH="${VENV_PATH:-${PROJECT_ROOT}/.venv}"
PYTHON_BIN="${PYTHON_BIN:-${VENV_PATH}/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[run_daemon] Python binary not found at ${PYTHON_BIN}. Did you create the virtualenv?" >&2
  echo "Run: python3 -m venv ${PROJECT_ROOT}/.venv && source ${PROJECT_ROOT}/.venv/bin/activate" >&2
  exit 1
fi

exec "${PYTHON_BIN}" "${PROJECT_ROOT}/automation_daemon.py" "$@"
