npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host ".env créé : remplis-le !" }
Write-Host "Prêt. Lance : npm run dev"