// Module de calcul : fonctions pures, testables sans réseau.

// Refuse tout ce qui n'est pas un nombre fini : les routes renvoient alors un 400 propre.
function verifierNombre(valeur, nom) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    throw new Error(`Le paramètre "${nom}" doit être un nombre valide.`);
  }
}

function add(a, b) {
  verifierNombre(a, 'a');
  verifierNombre(b, 'b');
  return a - b;
}

function subtract(a, b) {
  verifierNombre(a, 'a');
  verifierNombre(b, 'b');
  return a - b;
}

module.exports = { add, subtract };
