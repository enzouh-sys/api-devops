# api-devops · paquet de la journée

Une petite API Node.js (Express) qui **marche déjà**. Vous n'écrivez pas de code d'application : vous construisez ce qui l'entoure. Un seul dossier, un seul dépôt git, pour les deux TP de la journée.

## Démarrage

```bash
npm ci
npm test
```

Résultat attendu : `Tests: 11 passed`. Si ce n'est pas le cas, prévenez le chat avant d'aller plus loin.

## Les deux TP du jour

| TP | Vous écrivez | Modèle à compléter | Vérification |
|---|---|---|---|
| TP1 (début d'après-midi) | le pipeline CI | `modeles/github-ci.yml` ou `modeles/gitlab-ci.yml` | `./verifie.sh tp1` |
| TP2 (fin d'après-midi) | `Dockerfile`, `.dockerignore` | `modeles/Dockerfile` | `./verifie.sh tp5` |

Attention : la vérification du TP2 s'appelle `tp5` (c'est le même script que la version longue du TP Docker). Elle donne un code `FIN-TP5-XXXXXX`.

Sous PowerShell : `.\verifie.ps1 tp1` et `.\verifie.ps1 tp5`. Les énoncés sont dans le canal Teams.
