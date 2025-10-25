param(
    [string]$VenvPath = "$PSScriptRoot/../.venv",
    [string]$Host = "127.0.0.1",
    [int]$Port = 9000,
    [string]$GrpcHost = "[::]",
    [int]$GrpcPort = 50051
)

$python = Join-Path $VenvPath "Scripts/python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Python executable not found at $python. Create the virtual environment with 'python -m venv .venv'."
    exit 1
}

& $python "$PSScriptRoot/../automation_daemon.py" `
    --mlx-host $Host `
    --mlx-port $Port `
    --grpc-host $GrpcHost `
    --grpc-port $GrpcPort @args
