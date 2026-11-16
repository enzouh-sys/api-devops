# Dockerfile de l'API (TP2, version courte). Remplacez chaque trou (trois tirets bas).
# L'ordre des lignes est déjà celui qui profite du cache des couches : ne le changez pas.

# L'image de départ : Node 22 sur Alpine Linux, une base très petite.
FROM ___

WORKDIR /app

# Les fichiers de dépendances d'abord : cette couche ne change que si package*.json change.
COPY package*.json ./

# Installe uniquement les dépendances de production (pas jest, pas supertest).
RUN ___

# Puis le code de l'application.
COPY . .

ENV NODE_ENV=production
EXPOSE ___

# Ne pas exécuter l'application en root : l'image node fournit déjà l'utilisateur "node".
USER ___

CMD ["node", "server.js"]
