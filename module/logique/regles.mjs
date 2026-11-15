/**
 * Règles pures du Bréviaire : aucun appel à Foundry ici, pour pouvoir les tester avec `node --test`.
 * Chaque fonction renvoie au chapitre des règles qu'elle applique.
 */

/* -------------------------------------------- */
/*  Le jet d'action (ch. I, II)                 */
/* -------------------------------------------- */

export const SCORE_MAX = 19;
export const MALUS_PLANCHER = -6;
/** Rang d'une Spécialité : 0 non maîtrisée, 1 Formé, 2 Expert. */
export const BONUS_RANG = [0, 2, 4];

/**
 * Score à atteindre au d20.
 * Les modificateurs de situation s'additionnent sans descendre sous −6 ; le bonus de Spécialité
 * s'ajoute toujours ; le score final ne dépasse jamais 19.
 */
export function calculerScore({ carac, rang = 0, situation = [] }) {
  const brut = situation.reduce((s, m) => s + (Number(m) || 0), 0);
  const modificateur = Math.max(MALUS_PLANCHER, brut);
  const bonus = BONUS_RANG[rang] ?? 0;
  return {
    score: Math.min(SCORE_MAX, carac + bonus + modificateur),
    bonus,
    modificateur,
    plafonne: brut < MALUS_PLANCHER
  };
}

/** Favorisé et défavorisé ne se cumulent pas et s'annulent (ch. I). */
export function modeDuJet(favorise, defavorise) {
  if (favorise && !defavorise) return "favorise";
  if (defavorise && !favorise) return "defavorise";
  return "normal";
}

/** Dé gardé : le plus bas si favorisé, le plus haut si défavorisé. */
export function deGarde(des, mode) {
  if (mode === "favorise") return Math.min(...des);
  if (mode === "defavorise") return Math.max(...des);
  return des[0];
}

/**
 * Résultat d'un jet d'action. Le d20 se lit avant toute soustraction :
 * 1 naturel → Miracle (réussite), 20 naturel → Damnation (échec, même avec prière ou pacte).
 */
export function resoudreJet({ d20, score, soustraction = 0 }) {
  const total = d20 - soustraction;
  let naturel = null;
  let reussite = total <= score;
  if (d20 === 1) { naturel = "miracle"; reussite = true; }
  else if (d20 === 20) { naturel = "damnation"; reussite = false; }
  return { total, reussite, naturel, ecart: score - total };
}

/** Jet en opposition : celui qui réussit avec le résultat le plus élevé l'emporte (ch. I). */
export function resoudreOpposition(a, b) {
  if (a.reussite && !b.reussite) return "a";
  if (b.reussite && !a.reussite) return "b";
  if (!a.reussite && !b.reussite) return "blocage";
  if (a.total === b.total) return "egalite";
  return a.total > b.total ? "a" : "b";
}

/* -------------------------------------------- */
/*  Les dés d'usure (ch. I §3)                  */
/* -------------------------------------------- */

/** Cran d'un dé d'usure : 0 épuisé, 1 d4, 2 d6, 3 d8, 4 d10, 5 d12. */
export const FACES = [0, 4, 6, 8, 10, 12];
export const CRAN_MAX = 5;
export const CRAN_DEPART = 3;

export const faces = cran => FACES[Math.max(0, Math.min(CRAN_MAX, cran))];
export const changerCran = (cran, delta, plafond = CRAN_MAX) =>
  Math.max(0, Math.min(plafond, cran + delta));

/** Test d'usure : sur 1 ou 2, le dé descend d'un cran. Défavorisé : deux dés, on garde le plus bas. */
export function resoudreUsure(cran, des) {
  const resultat = Math.min(...des);
  const descend = resultat <= 2;
  return { resultat, descend, cran: descend ? changerCran(cran, -1) : cran };
}

/** Dés d'usure à la création : d8 puis ajustements, entre d4 et d12 (ch. VIII §6). */
export const cranDeCreation = (...ajustements) =>
  Math.max(1, Math.min(CRAN_MAX, CRAN_DEPART + ajustements.reduce((s, a) => s + (a || 0), 0)));

/* -------------------------------------------- */
/*  Corruption et Faveur (ch. IX)               */
/* -------------------------------------------- */

export const PALIERS = [3, 6, 9];
export const CORRUPTION_MAX = 10;

/** Dernier palier atteint pour une valeur donnée. */
export const palierDe = valeur => [...PALIERS].reverse().find(p => valeur >= p) ?? 0;

/** Faces du dé de Sang : d6 → d8 → d10 → d12. */
export function deSang(valeur) {
  if (valeur >= 9) return 12;
  if (valeur >= 6) return 10;
  if (valeur >= 3) return 8;
  return 6;
}

/** État : intact/touche/souille/sursis/perdu (Fidèles) — mêmes clés pour les Damnés, libellés différents. */
export function etatCorruption(valeur) {
  if (valeur >= 10) return "perdu";
  if (valeur >= 9) return "sursis";
  if (valeur >= 6) return "souille";
  if (valeur >= 3) return "touche";
  return "intact";
}

/** Paliers franchis en passant de `avant` à `apres` (chacun donne un tirage de Marque ou de Don). */
export const paliersFranchis = (avant, apres) => PALIERS.filter(p => avant < p && apres >= p);

/**
 * Baisse de Corruption : jamais sous le dernier palier atteint (le plus haut jamais atteint).
 * `palierAtteint` est mémorisé sur la fiche, parce que la valeur actuelle peut déjà être redescendue.
 */
export const baisseAutorisee = (valeur, palierAtteint) => Math.max(palierAtteint, valeur - 1);

/* -------------------------------------------- */
/*  Progression (ch. V)                         */
/* -------------------------------------------- */

export const TITRES = [
  { cle: "bleu", missions: 0 },
  { cle: "briscard", missions: 3 },
  { cle: "veteran", missions: 6 },
  { cle: "revenant", missions: 10 }
];
export const titreDe = missions => [...TITRES].reverse().find(t => missions >= t.missions).cle;

/** Épreuve : 1d20 strictement supérieur au score. */
export const epreuveReussie = (d20, score) => d20 > score;
export const CARAC_MAX_PROGRESSION = 16;

/* -------------------------------------------- */
/*  Combat (ch. IV)                             */
/* -------------------------------------------- */

/**
 * Dégâts d'un coup : dé − Protection (min 0). Brutal ignore 1 point de Protection.
 * Sacré contre une cible impie : (dé − Protection) × 2. Eau bénite : ignore la Protection.
 * Blessure grave si le coup retire 6 Blessures ou plus (après Protection).
 */
export function calculerDegats({ de, protection = 0, brutal = false, sacre = false, impie = false, ignoreProtection = false }) {
  const prot = ignoreProtection ? 0 : Math.max(0, protection - (brutal ? 1 : 0));
  let degats = Math.max(0, de - prot);
  if (sacre && impie) degats *= 2;
  return { degats, blessureGrave: degats >= 6 };
}

/** Phase d'initiative : 4 assaut éclair (1er tour), 3 rapide, 2 ennemis, 1 lente. */
export const PHASES = { eclair: 4, rapide: 3, ennemis: 2, lente: 1 };
