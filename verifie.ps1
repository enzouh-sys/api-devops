# Vérifie un TP et affiche le code de fin à coller dans le chat Teams.
# Usage : .\verifie.ps1 tp1   (puis tp2 ... tp6)      Option : --local (TP1 sans plateforme, voir PLAN-B)
# Si PowerShell refuse le script : powershell -ExecutionPolicy Bypass -File .\verifie.ps1 tp1
# Le contrôle est écrit une seule fois, en Node.js (verif/verifie.mjs) : même code sous macOS, Linux et Windows.
Set-Location -Path $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js est introuvable : installez Node 22 (https://nodejs.org) et ouvrez un nouveau terminal."
    exit 2
}
& node verif/verifie.mjs @args
exit $LASTEXITCODE
