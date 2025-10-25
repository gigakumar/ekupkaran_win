param(
    [string]$Python = "python",
    [string]$Port = "9000",
    [string]$GrpcPort = "50051",
    [string]$ModelsDir = "",
    [switch]$NoVenv
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$venvPath = Join-Path $root ".venv"

function Ensure-Venv {
    if ($NoVenv) { return $Python }
    if (-not (Test-Path $venvPath)) {
        Write-Host "Creating virtual environment at $venvPath" -ForegroundColor Cyan
        & $Python -m venv $venvPath
    }
    $venvPython = Join-Path $venvPath "Scripts/python.exe"
    if (-not (Test-Path $venvPython)) {
        throw "Virtual environment python executable not found at $venvPython"
    }
    Write-Host "Upgrading pip" -ForegroundColor Cyan
    & $venvPython -m pip install --upgrade pip | Out-Null
    Write-Host "Installing backend requirements" -ForegroundColor Cyan
    & $venvPython -m pip install -r (Join-Path $root "requirements.txt") | Out-Null
    return $venvPython
}

$pythonExe = Ensure-Venv
$env:PYTHONPATH = "$root;$env:PYTHONPATH"
if ($ModelsDir) {
    $env:ML_MODELS_DIR = (Resolve-Path $ModelsDir)
}

Write-Host "Starting Ekupkaran automation daemon..." -ForegroundColor Green
& $pythonExe (Join-Path $root "automation_daemon.py") --mlx-port ([int]$Port) --grpc-port ([int]$GrpcPort)
