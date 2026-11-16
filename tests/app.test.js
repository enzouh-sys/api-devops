const request = require('supertest');

// Le module de base de données est remplacé : ces tests n'ont besoin d'aucune base.
jest.mock('../src/db');
const db = require('../src/db');
const app = require('../src/app');

describe('GET /health', () => {
  test('répond 200 et ok', async () => {
    const reponse = await request(app).get('/health');
    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/version', () => {
  test('répond la version 1.0.0', async () => {
    const reponse = await request(app).get('/api/version');
    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ version: '1.0.0' });
  });
});

describe('GET /api/sum', () => {
  test('additionne deux nombres', async () => {
    const reponse = await request(app).get('/api/sum').query({ a: 2, b: 3 });
    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ result: 5 });
  });

  test('répond 400 si un paramètre n est pas un nombre', async () => {
    const reponse = await request(app).get('/api/sum').query({ a: 'abc', b: 3 });
    expect(reponse.status).toBe(400);
    expect(reponse.body).toHaveProperty('error');
  });
});

describe('GET /api/visites', () => {
  test('répond 503 si la base n est pas configurée', async () => {
    db.configuree.mockReturnValue(false);
    const reponse = await request(app).get('/api/visites');
    expect(reponse.status).toBe(503);
  });

  test('renvoie le total quand la base répond', async () => {
    db.configuree.mockReturnValue(true);
    db.compterVisite.mockResolvedValue(7);
    const reponse = await request(app).get('/api/visites');
    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ visites: 7 });
  });
});
