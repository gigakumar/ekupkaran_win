@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..

if not defined PYTHON set PYTHON=python

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_backend.ps1" -Python "%PYTHON%" %*
