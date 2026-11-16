// Vérification des TP et code de fin. Lancé par verifie.sh (macOS, Linux, Git Bash)
// ou verifie.ps1 (PowerShell) : les deux appellent ce même fichier, donc le même code partout.
//
// Usage : node verif/verifie.mjs tp1|tp2|tp3|tp4|tp5|tp6 [--local]
//
// Codes de sortie : 0 = tout est OK (le code FIN-TPn-XXXXXX est affiché)
//                   1 = au moins une vérification a échoué (rien à coller dans le chat)
//                   2 = vérification impossible (outil manquant, e-mail git absent, Docker arrêté...)
//
// Le code de fin dépend de l'état réel vérifié : il n'est affiché que si TOUTES les lignes sont OK,
// et il change avec l'e-mail git de l'étudiant (un code copié chez un voisin ne passe pas).
//
// Ne modifiez pas ce fichier : le formateur recalcule le code attendu avec le même algorithme.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEL = 'inf236-metier-devops-2026';
const TESTS_DE_DEPART = 11;
const SEUIL_COUVERTURE_MIN = 90;
const WIN = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Code de fin (exporté : le formateur le recalcule avec corriges/code-attendu.mjs)
// ---------------------------------------------------------------------------
export function calculerCode(tp, email, faits) {
  const brut = createHash('sha256').update(`${SEL}|${tp}|${email.trim().toLowerCase()}|${faits}`).digest('hex');
  return `FIN-${tp.toUpperCase()}-${brut.slice(0, 6).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
const couleur = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, t) => (couleur ? `\x1b[${code}m${t}\x1b[0m` : t);
let nbRate = 0;
let nbOk = 0;
const ok = (msg) => { nbOk += 1; console.log(`  ${c(32, 'OK   ')}  ${msg}`); };
const rate = (msg, aide) => { nbRate += 1; console.log(`  ${c(31, 'RATE ')}  ${msg}`); if (aide) console.log(`         -> ${aide}`); };
const info = (msg) => console.log(`  ${c(36, '...  ')}  ${msg}`);
const verifier = (condition, msgOk, msgRate, aide) => { if (condition) ok(msgOk); else rate(msgRate, aide); return Boolean(condition); };
class Impossible extends Error {}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const RACINE = process.cwd();

function lancer(cmd, args, options = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: options.cwd ?? RACINE, encoding: 'utf8', shell: WIN, timeout: options.timeout ?? 180000, env: { ...process.env, ...(options.env ?? {}), CI: '1' }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? (r.error ? 127 : 1), out: `${r.stdout ?? ''}${r.stderr ?? ''}`, secondes: (Date.now() - t0) / 1000, erreur: r.error };
}

function outilPresent(cmd) {
  return lancer(cmd, ['--version'], { timeout: 20000 }).code === 0;
}

function emailGit() {
  const r = lancer('git', ['config', 'user.email'], { timeout: 10000 });
  const email = r.out.trim();
  if (r.code !== 0 || !email) {
    throw new Impossible('Votre e-mail git n\'est pas configuré (il entre dans le code de fin).\n         -> git config --global user.email "prenom.nom@exemple.fr"   puis relancez.');
  }
  return email;
}

function lire(chemin) {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
}

function sansCommentairesGroovy(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
}

function portLibre() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, attenteMax = 0) {
  const fin = Date.now() + attenteMax;
  for (;;) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const texte = await r.text();
      return { status: r.status, texte };
    } catch (e) {
      if (Date.now() >= fin) return { status: 0, texte: String(e.message ?? e) };
      await dormir(500);
    }
  }
}

// Les lignes utiles d'une sortie d'outil : échecs, seuils, erreurs, sinon les trois dernières.
function resume(sortie) {
  const lignes = sortie.split('\n').map((l) => l.trim()).filter(Boolean);
  const utiles = lignes.filter((l) => /^(●|Tests:|Jest:|npm error|Error|ERR)/.test(l));
  return (utiles.length ? utiles.slice(0, 4) : lignes.slice(-3)).join(' | ');
}

function pidVivant(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function chargerYaml() {
  try {
    return import(pathToUrl(join(RACINE, 'node_modules', 'yaml', 'dist', 'index.js'))).then((m) => m.default ?? m);
  } catch {
    return Promise.reject(new Impossible('La bibliothèque "yaml" est absente. -> npm ci'));
  }
}
function pathToUrl(p) { return new URL(`file://${WIN ? '/' : ''}${p.replace(/\\/g, '/')}`).href; }

const nettoyer = (d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignoré */ } };

function jestJson(cwd, extra = []) {
  const bin = join(cwd, 'node_modules', 'jest', 'bin', 'jest.js');
  const sortie = join(mkdtempSync(join(tmpdir(), 'inf236-json-')), 'jest.json');
  const r = lancer(process.execPath, [bin, '--json', '--silent', `--outputFile=${sortie}`, ...extra], { cwd });
  let json = null;
  try { json = JSON.parse(readFileSync(sortie, 'utf8')); } catch { /* jest n'a pas pu écrire son rapport */ }
  nettoyer(join(sortie, '..'));
  return { ...r, json };
}

// Copie temporaire du projet (sans node_modules, qu'on relie) pour tester des variantes sans toucher aux fichiers de l'étudiant.
function copieTemporaire() {
  const dossier = mkdtempSync(join(tmpdir(), 'inf236-verif-'));
  for (const nom of ['src', 'tests', 'package.json', 'package-lock.json', 'server.js']) {
    if (existsSync(join(RACINE, nom))) cpSync(join(RACINE, nom), join(dossier, nom), { recursive: true });
  }
  symlinkSync(join(RACINE, 'node_modules'), join(dossier, 'node_modules'), 'junction');
  return dossier;
}

function verifierProjet() {
  if (!existsSync(join(RACINE, 'package.json')) || !existsSync(join(RACINE, 'src'))) {
    throw new Impossible('Lancez ce script depuis la racine du projet (le dossier qui contient package.json et src/).');
  }
  if (!existsSync(join(RACINE, 'node_modules', 'jest'))) {
    throw new Impossible('Les dépendances ne sont pas installées. -> npm ci');
  }
}

// ---------------------------------------------------------------------------
// TP1 · premier pipeline CI
// ---------------------------------------------------------------------------
async function tp1(local) {
  verifierProjet();
  const email = emailGit();
  const faits = [];

  // 1. Les tests passent en local
  const t = jestJson(RACINE);
  const total = t.json?.numTotalTests ?? 0;
  verifier(t.code === 0 && total >= TESTS_DE_DEPART, `les tests passent en local (${total} tests)`, 'les tests ne passent pas en local', 'lancez npm test et corrigez ce qui est rouge');
  faits.push('tests-verts');

  // 2. Le fichier de pipeline
  const YAML = await chargerYaml();
  const ghDir = join(RACINE, '.github', 'workflows');
  const ghFichier = existsSync(ghDir) ? readdirSync(ghDir).find((f) => /\.ya?ml$/.test(f)) : null;
  const glFichier = existsSync(join(RACINE, '.gitlab-ci.yml')) ? '.gitlab-ci.yml' : null;
  let type = null;

  if (!ghFichier && !glFichier) {
    rate('aucun fichier de pipeline trouvé', 'créez .github/workflows/ci.yml (GitHub) ou .gitlab-ci.yml (GitLab) : modèles dans le dossier modeles/');
  } else if (ghFichier && glFichier) {
    rate('deux pipelines présents (GitHub et GitLab)', 'gardez celui de la plateforme que vous utilisez, supprimez l\'autre');
  } else {
    type = ghFichier ? 'github' : 'gitlab';
    const chemin = ghFichier ? join(ghDir, ghFichier) : join(RACINE, glFichier);
    const brut = lire(chemin);
    let doc = null;
    try { doc = YAML.parse(brut); ok(`${ghFichier ? `.github/workflows/${ghFichier}` : glFichier} : YAML valide`); } catch (e) { rate(`${ghFichier ? `.github/workflows/${ghFichier}` : glFichier} : YAML invalide`, `${String(e.message).split('\n')[0]} (l'indentation est la cause n°1)`); }
    if (doc) {
      verifier(!brut.includes('___'), 'plus aucun trou ___ dans le pipeline', 'il reste des ___ à remplacer dans le pipeline');
      const texte = JSON.stringify(doc);
      if (type === 'github') {
        const declencheurs = JSON.stringify(doc.on ?? doc.true ?? '');
        verifier(/push/.test(declencheurs), 'déclenché par un push', 'pas de déclencheur push', 'bloc on: avec push:');
        verifier(/actions\/checkout/.test(texte), 'récupère le code (actions/checkout)', 'actions/checkout manquant', 'sans lui le runner n\'a pas votre code');
        verifier(/actions\/setup-node/.test(texte), 'installe Node (actions/setup-node)', 'actions/setup-node manquant');
        const m = texte.match(/"node-version":"?(\d+)/);
        verifier(m && Number(m[1]) >= 22, `Node ${m ? m[1] : '?'} dans le pipeline`, 'node-version doit être 22 ou plus', 'même version que votre poste');
        verifier(/"run":"npm ci"/.test(texte) || /npm ci/.test(texte), 'installe avec npm ci', 'npm ci manquant', 'installation reproductible depuis package-lock.json');
        verifier(/npm test/.test(texte), 'lance npm test', 'npm test manquant');
      } else {
        const image = JSON.stringify(doc.image ?? '') + texte;
        const m = image.match(/node:(\d+)/);
        verifier(m && Number(m[1]) >= 22, `image node:${m ? m[1] : '?'}`, 'l\'image doit être node:22 (ou plus)', 'image: node:22-alpine');
        verifier(/npm ci/.test(texte), 'installe avec npm ci', 'npm ci manquant');
        verifier(/npm test/.test(texte), 'lance npm test', 'npm test manquant');
        verifier(/"script"/.test(texte), 'au moins un job avec script:', 'aucun job avec script:');
      }
    }
  }
  faits.push(`ci=${type ?? 'aucun'}`);

  // 3. Git : dépôt, commits, et l'historique montre un rouge puis un vert
  const dansGit = lancer('git', ['rev-parse', '--is-inside-work-tree']).code === 0;
  if (!verifier(dansGit, 'le dossier est un dépôt git', 'ce dossier n\'est pas un dépôt git', 'git init, puis git add . et git commit')) {
    return { faits };
  }
  const commits = lancer('git', ['rev-list', '--reverse', 'HEAD']).out.split('\n').filter(Boolean);
  verifier(commits.length >= 3, `${commits.length} commits dans l'historique`, `${commits.length} commit(s) seulement, il en faut au moins 3`, 'un commit pour le pipeline, un pour casser, un pour réparer');

  let rouge = false;
  let dernierVert = false;
  const aTester = commits.slice(-15);
  for (const [i, sha] of aTester.entries()) {
    const dossier = mkdtempSync(join(tmpdir(), 'inf236-hist-'));
    const tar = spawnSync('git', ['archive', sha], { cwd: RACINE, maxBuffer: 64 * 1024 * 1024 });
    if (tar.status === 0) {
      spawnSync('tar', ['-x', '-C', dossier], { input: tar.stdout });
      try { symlinkSync(join(RACINE, 'node_modules'), join(dossier, 'node_modules'), 'junction'); } catch { /* ignoré */ }
      const r = jestJson(dossier);
      const echecs = r.json?.numFailedTests ?? 0;
      if (echecs > 0) rouge = true;
      if (i === aTester.length - 1) dernierVert = r.code === 0;
    }
    nettoyer(dossier);
  }
  verifier(rouge, 'un commit de l\'historique a des tests rouges (vous avez cassé volontairement)', 'aucun commit de l\'historique n\'a de test rouge', 'étape 5 : cassez calc.js, commitez et poussez AVANT de réparer');
  verifier(dernierVert, 'le dernier commit est vert (réparé)', 'le dernier commit n\'est pas vert', 'réparez, commitez, poussez');
  faits.push('rouge-puis-vert');

  // 4. Poussé sur la plateforme
  if (local) {
    info('mode --local : le push n\'est pas vérifié (le code le signale)');
    faits.push('local');
  } else {
    const url = lancer('git', ['remote', 'get-url', 'origin']);
    if (!verifier(url.code === 0 && /github\.com|gitlab/.test(url.out), `remote origin : ${url.out.trim()}`, 'pas de remote origin vers GitHub ou GitLab', 'git remote add origin <url>   (ou relancez avec --local, voir PLAN-B)')) {
      return { faits };
    }
    const distant = lancer('git', ['ls-remote', 'origin', 'HEAD'], { timeout: 30000 });
    const local1 = lancer('git', ['rev-parse', 'HEAD']).out.trim();
    verifier(distant.code === 0 && distant.out.startsWith(local1), 'le dernier commit est bien sur la plateforme', 'le dernier commit n\'est pas (ou pas encore) poussé', 'git push, puis relancez');
    faits.push('pousse');
  }
  return { faits };
}

// ---------------------------------------------------------------------------
// TP2 · Jenkinsfile
// ---------------------------------------------------------------------------
function extraireStages(source) {
  // Découpe grossière mais fiable pour un Jenkinsfile déclaratif : on suit les accolades.
  const texte = sansCommentairesGroovy(source);
  const stages = [];
  const re = /stage\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(texte))) {
    let profondeur = 1;
    let i = re.lastIndex;
    while (i < texte.length && profondeur > 0) {
      if (texte[i] === '{') profondeur += 1;
      else if (texte[i] === '}') profondeur -= 1;
      i += 1;
    }
    const corps = texte.slice(re.lastIndex, i - 1);
    const commandes = [...corps.matchAll(/\bsh\s*\(?\s*(?:'''|"""|'|")([\s\S]*?)(?:'''|"""|'|")\s*\)?/g)].flatMap((x) => x[1].split('\n').map((l) => l.trim()).filter(Boolean));
    stages.push({ nom: m[1], corps, commandes });
  }
  return { texte, stages };
}

async function tp2() {
  verifierProjet();
  const email = emailGit();
  const source = lire(join(RACINE, 'Jenkinsfile'));
  if (!verifier(source !== null, 'Jenkinsfile présent à la racine', 'pas de Jenkinsfile à la racine', 'copiez modeles/Jenkinsfile à la racine du projet')) return { faits: [] };
  verifier(!source.includes('___'), 'plus aucun trou ___', 'il reste des ___ à remplacer');
  const { texte, stages } = extraireStages(source);
  const ouvrantes = (texte.match(/\{/g) ?? []).length;
  const fermantes = (texte.match(/\}/g) ?? []).length;
  verifier(ouvrantes === fermantes, `accolades équilibrées (${ouvrantes})`, `accolades déséquilibrées : ${ouvrantes} ouvrantes, ${fermantes} fermantes`, 'une accolade manque ou est en trop');
  verifier(/^\s*pipeline\s*\{/m.test(texte), 'bloc pipeline { ... }', 'bloc pipeline { manquant');
  verifier(/\bagent\s+(any|\{)/.test(texte), 'agent déclaré', 'agent manquant', 'agent any');
  verifier(/\bstages\s*\{/.test(texte), 'bloc stages { ... }', 'bloc stages { manquant');
  verifier(stages.length >= 3, `${stages.length} étapes : ${stages.map((s) => s.nom).join(', ')}`, `${stages.length} étape(s) seulement, il en faut au moins 3`, 'Checkout, Installation, Tests');

  const iInstall = stages.findIndex((s) => s.commandes.some((x) => /^npm (ci|install)\b/.test(x)));
  const iTest = stages.findIndex((s) => s.commandes.some((x) => /^npm (test|run test)/.test(x)));
  verifier(iInstall >= 0, `l'étape "${stages[iInstall]?.nom}" installe les dépendances (npm ci)`, 'aucune étape ne lance npm ci', 'sh \'npm ci\' dans une étape');
  verifier(iTest >= 0, `l'étape "${stages[iTest]?.nom}" lance les tests`, 'aucune étape ne lance npm test', 'sh \'npm test\' dans une étape');
  verifier(iInstall >= 0 && iTest > iInstall, 'les tests passent après l\'installation', 'les tests doivent venir après l\'installation', 'l\'ordre des stages est l\'ordre d\'exécution');
  verifier(/\bcheckout\s+scm\b/.test(texte), 'checkout scm (récupération du code)', 'checkout scm manquant', 'sans lui l\'agent n\'a pas votre code');

  // Rejeu local : on exécute les commandes npm du Jenkinsfile, dans l'ordre, comme le ferait Jenkins.
  let rejeu = true;
  for (const s of stages) {
    for (const cmd of s.commandes) {
      if (!/^npm /.test(cmd)) { info(`étape "${s.nom}" : "${cmd}" non rejoué (seules les commandes npm le sont)`); continue; }
      const [bin, ...args] = cmd.split(/\s+/);
      const r = lancer(bin, args);
      if (r.code !== 0) { rejeu = false; rate(`rejeu local de "${cmd}" (étape ${s.nom}) : code ${r.code}`, resume(r.out)); }
      else ok(`rejeu local de "${cmd}" (étape ${s.nom}) : code 0 en ${r.secondes.toFixed(1)} s`);
    }
  }
  return { faits: [`rejeu=${rejeu}`], email };
}

// ---------------------------------------------------------------------------
// TP3 · tests en continu, seuil de couverture
// ---------------------------------------------------------------------------
async function tp3() {
  verifierProjet();
  emailGit();
  const pkg = JSON.parse(lire(join(RACINE, 'package.json')));
  const seuil = pkg.jest?.coverageThreshold?.global ?? {};
  const valeurs = ['statements', 'lines'].map((k) => seuil[k]).filter((v) => typeof v === 'number');
  const max = valeurs.length ? Math.max(...valeurs) : 0;
  verifier(max >= SEUIL_COUVERTURE_MIN, `seuil de couverture ${max} % configuré (statements ou lines)`, `seuil de couverture ${max} % : il faut au moins ${SEUIL_COUVERTURE_MIN} % sur statements ou lines`, 'package.json, section jest, coverageThreshold.global');

  const cov = lancer('npm', ['run', 'test:coverage', '--silent']);
  const m = cov.out.match(/Statements\s*:\s*([\d.]+)%/);
  verifier(cov.code === 0, `npm run test:coverage réussit${m ? ` (statements ${m[1]} %)` : ''}`, 'npm run test:coverage échoue', 'lisez la ligne "coverage threshold ... not met" : ajoutez des tests sur les lignes non couvertes');

  const t = jestJson(RACINE);
  const total = t.json?.numTotalTests ?? 0;
  verifier(total > TESTS_DE_DEPART, `${total} tests (${TESTS_DE_DEPART} au départ)`, `${total} tests : aucun test ajouté`, 'ajoutez au moins un test dans tests/app.test.js');

  // Les tests servent-ils vraiment ? On casse une copie du projet de deux façons : ils doivent devenir rouges.
  const mutations = [
    { fichier: 'src/calc.js', de: 'return a + b;', vers: 'return a - b;', nom: 'add() qui soustrait' },
    { fichier: 'src/app.js', de: "version: '1.0.0'", vers: "version: '9.9.9'", nom: 'une mauvaise version' },
  ];
  for (const mu of mutations) {
    const d = copieTemporaire();
    const f = join(d, mu.fichier);
    const avant = readFileSync(f, 'utf8');
    if (!avant.includes(mu.de)) { rate(`mutation "${mu.nom}" impossible : ${mu.fichier} a changé`, 'ne modifiez pas calc.js ni app.js dans ce TP, sauf pour l\'étape 3 (puis annulez)'); nettoyer(d); continue; }
    writeFileSync(f, avant.replace(mu.de, mu.vers));
    const r = jestJson(d);
    verifier(r.code !== 0 && (r.json?.numFailedTests ?? 0) > 0, `vos tests détectent ${mu.nom}`, `vos tests ne détectent pas ${mu.nom}`, 'un test qui ne peut pas échouer ne protège rien');
    nettoyer(d);
  }

  // Le pipeline applique le seuil
  const candidats = ['Jenkinsfile', '.gitlab-ci.yml'].map((f) => lire(join(RACINE, f)) ?? '');
  const ghDir = join(RACINE, '.github', 'workflows');
  if (existsSync(ghDir)) for (const f of readdirSync(ghDir)) candidats.push(lire(join(ghDir, f)) ?? '');
  verifier(candidats.some((x) => /test:coverage|--coverage/.test(sansCommentairesGroovy(x))), 'le pipeline lance les tests avec couverture', 'le pipeline ne lance pas la couverture', 'dans le Jenkinsfile, remplacez sh \'npm test\' par sh \'npm run test:coverage\'');
  return { faits: ['seuil>=90', 'couvert', 'mutations-detectees'] };
}

// ---------------------------------------------------------------------------
// TP4 · deploy.sh idempotent avec contrôle de santé
// ---------------------------------------------------------------------------
const vivant = (pid) => lancer('bash', ['-c', `kill -0 ${pid}`], { timeout: 10000 }).code === 0;

async function tp4() {
  verifierProjet();
  emailGit();
  const script = lire(join(RACINE, 'deploy.sh'));
  if (!verifier(script !== null, 'deploy.sh présent', 'pas de deploy.sh à la racine', 'copiez modeles/deploy.sh à la racine')) return { faits: [] };
  verifier(!script.includes('___'), 'plus aucun trou ___', 'il reste des ___ à remplacer dans deploy.sh');
  if (!outilPresent('bash')) throw new Impossible('bash est introuvable. Sous Windows, lancez ce script depuis Git Bash.');
  const syntaxe = lancer('bash', ['-n', 'deploy.sh']);
  verifier(syntaxe.code === 0, 'syntaxe bash valide (bash -n)', 'erreur de syntaxe bash', syntaxe.out.trim().split('\n')[0]);
  verifier(/set\s+-[a-z]*e[a-z]*u[a-z]*|set\s+-euo\s+pipefail/.test(script), 'set -euo pipefail activé', 'set -euo pipefail manquant', 'la première ligne utile du script');

  const port = await portLibre();
  const env = { PORT: String(port) };
  const url = `http://127.0.0.1:${port}/health`;
  const pidFichier = join(RACINE, '.app.pid');
  const vus = new Set();
  const lirePid = () => { const n = Number((lire(pidFichier) ?? '').trim()); if (n > 0) vus.add(n); return n; };

  try {
    const r1 = lancer('bash', ['deploy.sh'], { env, timeout: 60000 });
    verifier(r1.code === 0, `1er déploiement : code ${r1.code} en ${r1.secondes.toFixed(1)} s`, `1er déploiement : code ${r1.code} (0 attendu)`, r1.out.trim().split('\n').slice(-3).join(' | '));
    const h1 = await http(url, 3000);
    verifier(h1.status === 200, '/health répond 200 après le 1er déploiement', `/health répond ${h1.status} après le 1er déploiement`);
    const pid1 = lirePid();
    verifier(pid1 > 0 && vivant(pid1), `.app.pid contient un processus vivant (${pid1})`, '.app.pid absent ou processus mort', 'le script doit écrire le PID dans .app.pid (echo $! > "$PID_FILE")');

    const r2 = lancer('bash', ['deploy.sh'], { env, timeout: 60000 });
    verifier(r2.code === 0, `2e déploiement (relance) : code ${r2.code}`, `2e déploiement : code ${r2.code} (0 attendu)`, 'un script idempotent se relance sans erreur : arrêtez l\'ancienne instance avant de démarrer');
    const pid2 = lirePid();
    verifier(pid2 > 0 && vivant(pid2), `après la relance, le PID du fichier est vivant (${pid2})`, 'après la relance, le processus du .app.pid est mort', 'la nouvelle instance a sans doute échoué (port déjà pris) pendant que l\'ancienne répondait au contrôle de santé');
    verifier(pid1 !== pid2 && !vivant(pid1), 'l\'ancienne instance a été arrêtée, une seule reste', 'l\'ancienne instance tourne encore', 'stop avant start : kill du PID lu dans .app.pid');

    const r3 = lancer('bash', ['deploy.sh'], { env: { ...env, SIMULER_PANNE: '1' }, timeout: 90000 });
    verifier(r3.code !== 0, `déploiement d'une application malade : code ${r3.code} (différent de 0, c'est voulu)`, 'déploiement d\'une application malade : code 0, le script a laissé passer une panne', 'health_check doit se terminer par return 1 / exit 1 après les essais');
    const h3 = await http(url, 1500);
    verifier(h3.status !== 503, h3.status === 0 ? 'après l\'échec, plus d\'instance malade qui répond' : `après l'échec, le service répond ${h3.status}`, 'après l\'échec, l\'instance malade (503) tourne encore', 'à l\'échec, arrêtez l\'instance malade (fonction arreter dans le trap ou après le health check)');
    lirePid();

    const r4 = lancer('bash', ['deploy.sh'], { env, timeout: 60000 });
    verifier(r4.code === 0, 'redéploiement sain après l\'échec : code 0', `redéploiement après l'échec : code ${r4.code}`, 'le script doit repartir proprement après une panne');
    const h4 = await http(url, 3000);
    verifier(h4.status === 200, '/health répond 200 à la fin', `/health répond ${h4.status} à la fin`);
    lirePid();
  } finally {
    lirePid();
    for (const pid of vus) if (vivant(pid)) { lancer('bash', ['-c', `kill ${pid}`], { timeout: 10000 }); }
    try { rmSync(pidFichier, { force: true }); } catch { /* ignoré */ }
  }
  return { faits: ['idempotent', 'sante', 'echec-detecte'] };
}

// ---------------------------------------------------------------------------
// TP5 · Dockerfile
// ---------------------------------------------------------------------------
function exigerDocker() {
  const r = lancer('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 30000 });
  if (r.code !== 0) throw new Impossible('Docker ne répond pas. Lancez Docker Desktop, attendez qu\'il soit vert, puis relancez.\n         (sans Docker : PLAN-B.md, partie "Pas de Docker")');
}

async function tp5() {
  verifierProjet();
  emailGit();
  const df = lire(join(RACINE, 'Dockerfile'));
  if (!verifier(df !== null, 'Dockerfile présent', 'pas de Dockerfile à la racine', 'copiez modeles/Dockerfile à la racine')) return { faits: [] };
  verifier(!df.includes('___'), 'plus aucun trou ___', 'il reste des ___ à remplacer dans le Dockerfile');
  exigerDocker();
  const sansCom = df.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  verifier(/^FROM\s+node:(2[2-9]|[3-9]\d)/m.test(sansCom), 'image de base node:22 ou plus', 'FROM node:22-alpine (ou plus récent) attendu');
  verifier(/^FROM\s+node:\S*alpine/m.test(sansCom), 'variante alpine (image légère)', 'variante alpine attendue', 'node:22-alpine');
  verifier(/^USER\s+(?!root\b)\S+/m.test(sansCom), 'USER non root déclaré', 'pas de USER non root', 'USER node');
  verifier(/^EXPOSE\s+3000/m.test(sansCom), 'EXPOSE 3000', 'EXPOSE 3000 manquant');
  const ign = lire(join(RACINE, '.dockerignore')) ?? '';
  verifier(/^node_modules\s*$/m.test(ign), '.dockerignore exclut node_modules', '.dockerignore ne contient pas node_modules', 'sans lui, COPY . . écrase les dépendances de l\'image par celles de votre poste');

  const tag = 'inf236-verif-tp5:local';
  const b1 = lancer('docker', ['build', '-t', tag, '.'], { timeout: 600000 });
  if (!verifier(b1.code === 0, `docker build réussi en ${b1.secondes.toFixed(0)} s`, 'docker build échoue', b1.out.trim().split('\n').slice(-4).join(' | '))) return { faits: [] };

  // Le cache fonctionne : modifier un fichier de code ne doit pas relancer npm ci.
  const marqueur = join(RACINE, 'src', '.verif-cache');
  writeFileSync(marqueur, String(Date.now()));
  const b2 = lancer('docker', ['build', '--progress=plain', '-t', tag, '.'], { timeout: 600000 });
  rmSync(marqueur, { force: true });
  const mises = b2.out.split('\n');
  const ligneNpm = mises.find((l) => /RUN .*npm (ci|install)/.test(l) && /#\d+ \[/.test(l));
  const numNpm = ligneNpm?.match(/^#(\d+)/)?.[1];
  const npmEnCache = numNpm ? mises.some((l) => l.startsWith(`#${numNpm} CACHED`)) : false;
  verifier(npmEnCache, 'cache des couches : npm ci n\'est pas relancé quand seul le code change', 'npm ci est relancé à chaque modification du code', 'copiez package*.json et lancez npm ci AVANT de copier le reste du code');

  const port = await portLibre();
  const nom = `inf236-verif-tp5-${process.pid}`;
  try {
    const run = lancer('docker', ['run', '-d', '--rm', '--name', nom, '-p', `127.0.0.1:${port}:3000`, tag], { timeout: 60000 });
    if (!verifier(run.code === 0, 'conteneur démarré', 'docker run échoue', run.out.trim().split('\n').slice(-3).join(' | '))) return { faits: [] };
    const h = await http(`http://127.0.0.1:${port}/health`, 15000);
    verifier(h.status === 200, 'le conteneur répond 200 sur /health', `le conteneur répond ${h.status} sur /health`, 'docker logs pour comprendre ; l\'application doit écouter sur 3000');
    const uid = lancer('docker', ['exec', nom, 'id', '-u']).out.trim();
    verifier(uid !== '' && uid !== '0', `le processus ne tourne pas en root (uid ${uid})`, 'le processus tourne en root (uid 0)', 'USER node avant CMD');
    const jest = lancer('docker', ['exec', nom, 'sh', '-c', 'test -d node_modules/jest && echo present || echo absent']).out.trim();
    verifier(jest === 'absent', 'image de production : jest n\'y est pas', 'jest est dans l\'image (dépendances de développement)', 'npm ci --omit=dev');
    const taille = Number(lancer('docker', ['image', 'inspect', tag, '--format', '{{.Size}}']).out.trim());
    info(`taille de l'image : ${(taille / 1e6).toFixed(0)} Mo (contenu décompressé)`);
    verifier(taille > 0 && taille < 400e6, 'taille de l\'image raisonnable (moins de 400 Mo)', 'image trop grosse (plus de 400 Mo)', 'node:22-alpine et pas node:22');
  } finally {
    lancer('docker', ['rm', '-f', nom], { timeout: 30000 });
    lancer('docker', ['rmi', '-f', tag], { timeout: 30000 });
  }
  return { faits: ['image', 'non-root', 'cache', 'prod'] };
}

// ---------------------------------------------------------------------------
// TP6 · Docker Compose
// ---------------------------------------------------------------------------
async function tp6() {
  verifierProjet();
  emailGit();
  exigerDocker();
  const fichier = ['docker-compose.yml', 'compose.yaml', 'compose.yml', 'docker-compose.yaml'].find((f) => existsSync(join(RACINE, f)));
  if (!verifier(Boolean(fichier), `${fichier} présent`, 'pas de docker-compose.yml à la racine', 'copiez modeles/docker-compose.yml à la racine')) return { faits: [] };
  verifier(!lire(join(RACINE, fichier)).includes('___'), 'plus aucun trou ___', `il reste des ___ à remplacer dans ${fichier}`);
  const conf = lancer('docker', ['compose', 'config', '--format', 'json']);
  if (!verifier(conf.code === 0, 'docker compose config : fichier valide', 'docker compose config refuse le fichier', conf.out.trim().split('\n')[0])) return { faits: [] };
  const cfg = JSON.parse(conf.out.slice(conf.out.indexOf('{')));
  const app = cfg.services?.app;
  const db = cfg.services?.db;
  verifier(app && db, 'deux services : app et db', 'il faut deux services nommés app et db');
  if (!app || !db) return { faits: [] };
  verifier(/^postgres:/.test(db.image ?? ''), `db utilise ${db.image}`, 'db doit utiliser une image postgres:...');
  verifier(Boolean(app.build), 'app est construite depuis le Dockerfile (build:)', 'app doit avoir un bloc build:');
  verifier(app.depends_on?.db?.condition === 'service_healthy', 'app attend que db soit saine (depends_on + service_healthy)', 'app ne dépend pas de db avec condition: service_healthy');
  verifier(Boolean(db.healthcheck?.test), 'db a un healthcheck', 'db n\'a pas de healthcheck', 'pg_isready');
  verifier(/@db[:/]/.test(app.environment?.DATABASE_URL ?? ''), 'DATABASE_URL vise le service db par son nom', 'DATABASE_URL doit contenir @db (le nom du service) et pas localhost');
  const volumeDb = (db.volumes ?? []).find((v) => /postgresql\/data/.test(v.target ?? ''));
  verifier(volumeDb?.type === 'volume', 'les données de db sont dans un volume nommé', 'db doit monter un volume nommé sur /var/lib/postgresql/data');
  const portPublie = Number((app.ports ?? []).find((p) => Number(p.target) === 3000)?.published);
  if (!verifier(portPublie > 0, `app publie le port ${portPublie}`, 'app doit publier le port 3000')) return { faits: [] };
  if (!(await libre(portPublie))) throw new Impossible(`Le port ${portPublie} est déjà pris (votre stack tourne encore ?). -> docker compose down, puis relancez.`);

  const projet = ['compose', '-p', `inf236verif${process.pid}`];
  try {
    const up = lancer('docker', [...projet, 'up', '-d', '--build', '--wait', '--wait-timeout', '120'], { timeout: 600000 });
    if (!verifier(up.code === 0, `docker compose up --wait réussi en ${up.secondes.toFixed(0)} s`, 'docker compose up échoue', up.out.trim().split('\n').slice(-4).join(' | '))) return { faits: [] };
    const base = `http://127.0.0.1:${portPublie}`;
    const v1 = await http(`${base}/api/visites`, 20000);
    verifier(v1.status === 200, `/api/visites répond 200 : ${v1.texte}`, `/api/visites répond ${v1.status}`, 'docker compose logs app : l\'application joint-elle db ?');
    const n1 = JSON.parse(v1.texte || '{}').visites;
    const v2 = await http(`${base}/api/visites`);
    const n2 = JSON.parse(v2.texte || '{}').visites;
    verifier(n2 === n1 + 1, `le compteur avance (${n1} puis ${n2}) : l'application écrit dans PostgreSQL`, 'le compteur n\'avance pas');
    lancer('docker', [...projet, 'down'], { timeout: 120000 });
    const up2 = lancer('docker', [...projet, 'up', '-d', '--wait', '--wait-timeout', '120'], { timeout: 300000 });
    const v3 = await http(`${base}/api/visites`, 20000);
    const n3 = JSON.parse(v3.texte || '{}').visites;
    verifier(up2.code === 0 && n3 === n2 + 1, `après down puis up, le compteur continue (${n3}) : le volume a gardé les données`, `après down puis up, le compteur est ${n3} (${n2 + 1} attendu) : les données sont perdues`, 'volume nommé sur /var/lib/postgresql/data, et jamais docker compose down -v');
  } finally {
    lancer('docker', [...projet, 'down', '-v', '--rmi', 'local'], { timeout: 180000 });
  }
  return { faits: ['stack', 'sante', 'persistance'] };
}

function libre(port) {
  return new Promise((res) => {
    const s = createServer();
    s.once('error', () => res(false));
    s.listen(port, () => s.close(() => res(true)));
  });
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
const TPS = { tp1, tp2, tp3, tp4, tp5, tp6 };

async function main() {
  const [, , tpArg, ...options] = process.argv;
  const tp = (tpArg ?? '').toLowerCase();
  if (!TPS[tp]) {
    console.log('Usage : ./verifie.sh tp1|tp2|tp3|tp4|tp5|tp6   (PowerShell : .\\verifie.ps1 tpN)');
    process.exit(2);
  }
  console.log(`\nVérification du ${tp.toUpperCase()} (Node ${process.version}, ${process.platform})\n`);
  try {
    const email = emailGit();
    const { faits } = await TPS[tp](options.includes('--local'));
    console.log('');
    if (nbRate === 0 && nbOk > 0) {
      console.log(`${c(32, `${nbOk} vérifications OK.`)} Collez cette ligne dans le chat Teams :\n`);
      console.log(`${calculerCode(tp, email, faits.join(';'))}\n`);
      process.exit(0);
    }
    console.log(`${c(31, `${nbRate} vérification(s) à corriger.`)} Pas de code de fin tant qu'une ligne est RATE. Corrigez la première, relancez.\n`);
    process.exit(1);
  } catch (e) {
    if (e instanceof Impossible) {
      console.log(`  ${c(33, 'IMPOSSIBLE')}  ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
