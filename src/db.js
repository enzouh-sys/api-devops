// Accès à PostgreSQL. Le module "pg" n'est chargé que si DATABASE_URL est définie :
// sans base (TP1 à TP5), l'application démarre et les tests passent quand même.

let pool = null;

function configuree() {
  return Boolean(process.env.DATABASE_URL);
}

function obtenirPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  }
  return pool;
}

// Ajoute une visite et renvoie le total. La table est créée au premier appel.
async function compterVisite() {
  const p = obtenirPool();
  await p.query('CREATE TABLE IF NOT EXISTS visites (id SERIAL PRIMARY KEY, horodatage TIMESTAMPTZ NOT NULL DEFAULT now())');
  await p.query('INSERT INTO visites DEFAULT VALUES');
  const { rows } = await p.query('SELECT count(*)::int AS total FROM visites');
  return rows[0].total;
}

module.exports = { configuree, compterVisite };
