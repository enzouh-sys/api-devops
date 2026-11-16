// L'application Express. Elle est exportée sans écouter de port : les tests
// l'appellent directement avec Supertest. Le démarrage réseau est dans server.js.

const express = require('express');
const { add, subtract } = require('./calc');
const db = require('./db');

const app = express();
app.use(express.json());

// Santé : lue par deploy.sh (TP4), par HEALTHCHECK Docker (TP5) et par Compose (TP6).
// SIMULER_PANNE=1 rend l'application "malade" pour tester un déploiement qui doit échouer.
app.get('/health', (req, res) => {
  if (process.env.SIMULER_PANNE === '1') {
    return res.status(503).json({ status: 'panne' });
  }
  return res.status(200).json({ status: 'ok' });
});

app.get('/api/version', (req, res) => {
  res.status(200).json({ version: '1.0.0' });
});

// GET /api/sum?a=2&b=3 -> { "result": 5 }
app.get('/api/sum', (req, res) => {
  try {
    res.status(200).json({ result: add(Number(req.query.a), Number(req.query.b)) });
  } catch (erreur) {
    res.status(400).json({ error: erreur.message });
  }
});

// GET /api/diff?a=5&b=3 -> { "result": 2 }
app.get('/api/diff', (req, res) => {
  try {
    res.status(200).json({ result: subtract(Number(req.query.a), Number(req.query.b)) });
  } catch (erreur) {
    res.status(400).json({ error: erreur.message });
  }
});

// Compteur de visites stocké dans PostgreSQL (TP6) : il montre qu'un volume conserve les données.
app.get('/api/visites', async (req, res) => {
  if (!db.configuree()) {
    return res.status(503).json({ error: 'DATABASE_URL non définie' });
  }
  try {
    return res.status(200).json({ visites: await db.compterVisite() });
  } catch (erreur) {
    return res.status(503).json({ error: `base injoignable : ${erreur.code || erreur.message || erreur}` });
  }
});

module.exports = app;
