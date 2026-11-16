// Point d'entrée : démarre l'écoute réseau. Toute la logique est dans src/app.js.
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
