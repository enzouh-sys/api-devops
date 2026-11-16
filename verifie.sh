#!/usr/bin/env bash
# Vérifie un TP et affiche le code de fin à coller dans le chat Teams.
# Usage : ./verifie.sh tp1   (puis tp2 ... tp6)      Option : --local (TP1 sans plateforme, voir PLAN-B)
# Le contrôle est écrit une seule fois, en Node.js (verif/verifie.mjs) : même code sous macOS, Linux et Windows.
cd "$(dirname "$0")" || exit 2
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est introuvable : installez Node 22 (https://nodejs.org) et ouvrez un nouveau terminal."
  exit 2
fi
exec node verif/verifie.mjs "$@"
