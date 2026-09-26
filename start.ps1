$env:SESSION_SECRET = "super_secret_session_key_123"
$env:JWT_SECRET_KEY = "super_secret_jwt_key_456"
$env:PORT = "8000"
$env:DATABASE_URL = "sqlite:///$((Get-Item .).FullName.Replace('\', '/'))/instance/neurobeat.db"

# Free ports 8000 and 5000 if already occupied
try {
    Get-NetTCPConnection -LocalPort 8000, 5000 -ErrorAction Stop | 
        Select-Object -ExpandProperty OwningProcess -Unique | 
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch {}

Write-Host "Starting API backend on port 8000..."
$backend = Start-Process -PassThru -NoNewWindow -FilePath "uv" -ArgumentList "run", "python", "api_main.py"

Start-Sleep -Seconds 3

Write-Host "Starting Vite frontend on port 5000..."
$npmCmd = (Get-Command npm.cmd, npm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
if (-not $npmCmd) { $npmCmd = "npm" }
$frontend = Start-Process -PassThru -NoNewWindow -WorkingDirectory ".\frontend-react" -FilePath $npmCmd -ArgumentList "run", "dev"

Write-Host "`n==============================================="
Write-Host "  Nuro-Beats is running!"
Write-Host "  Web App: http://localhost:5000"
Write-Host "  API:     http://localhost:8000"
Write-Host "==============================================="
Write-Host "Press any key to stop all services..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "`nStopping services..."
if ($backend -and $backend.Id) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}
if ($frontend -and $frontend.Id) {
    Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
}

# Ensure ports are released
try {
    Get-NetTCPConnection -LocalPort 8000, 5000 -ErrorAction Stop | 
        Select-Object -ExpandProperty OwningProcess -Unique | 
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch {}

Write-Host "Done."

