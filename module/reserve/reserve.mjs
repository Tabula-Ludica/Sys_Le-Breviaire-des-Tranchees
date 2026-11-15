/**
 * Réserve commune de l'escouade : le Chapelet (Fidèles) ou le Calice (Damnés), ch. I §4.
 *
 * L'état { des, perdus } est un réglage du monde que seul le MJ écrit.
 * Les autres clients passent par la requête « breviaire.reserve » (CONFIG.queries, v13+),
 * exécutée par le MJ actif. Tout changement est diffusé par Foundry à tous les clients
 * (onChange du réglage), qui redessinent leur widget.
 */

import { SYSTEME } from "../config.mjs";

const REQUETE = `${SYSTEME}.reserve`;

/** Dés par joueur en début de mission et à la Messe : 3 (Chapelet) ou 2 (Calice). */
export const parJoueur = () => (game.settings.get(SYSTEME, "camp") === "damnes" ? 2 : 3);

export function etat() {
  const r = game.settings.get(SYSTEME, "reserve") ?? {};
  return { des: Math.max(0, r.des ?? 0), perdus: Math.max(0, r.perdus ?? 0) };
}

/** Personnages de l'escouade : la liste du MJ, sinon tous les personnages possédés par un joueur. */
export function escouade() {
  const ids = game.settings.get(SYSTEME, "escouade") ?? [];
  const liste = ids.map(id => game.actors.get(id)).filter(a => a?.type === "personnage");
  if (liste.length) return liste;
  return game.actors.filter(a => a.type === "personnage" && a.hasPlayerOwner);
}

/** Le MJ actif peut-il traiter une demande ? */
export const mjDisponible = () => game.user.isGM || !!game.users.activeGM;

/* -------------------------------------------- */
/*  Opérations (exécutées par le MJ)            */
/* -------------------------------------------- */

const OPERATIONS = {
  /** Prière : le dé est lancé par le joueur ; s'il fait 1 (ou 1–2 si Souillé), il est perdu jusqu'à la Messe. */
  priere({ retire }) {
    const r = etat();
    if (r.des <= 0) return { ok: false, raison: "vide" };
    if (retire) { r.des -= 1; r.perdus += 1; }
    return { ok: true, etat: r };
  },
  /** Rite : un dé dépensé, sans être lancé (ch. X). */
  depenser({ n = 1 }) {
    const r = etat();
    if (r.des < n) return { ok: false, raison: "vide" };
    r.des -= n;
    return { ok: true, etat: r };
  },
  ajouter({ n = 1 }) {
    const r = etat();
    r.des = Math.max(0, r.des + n);
    return { ok: true, etat: r };
  },
  /** Début de mission : 3d6 (ou 2d6) par joueur, + Bénédiction papale ; les reliques redeviennent utilisables. */
  remplir() {
    const membres = escouade();
    const benedictions = membres.filter(a => a.system.origine.cle === "pontifical").length;
    return { ok: true, etat: { des: parJoueur() * membres.length + benedictions, perdus: 0 }, benedictions, mission: true };
  },
  /** Messe (ou Messe noire) : retour au niveau de départ, les dés perdus reviennent. */
  messe() {
    return { ok: true, etat: { des: parJoueur() * escouade().length, perdus: 0 } };
  },
  fixer({ des, perdus }) {
    return { ok: true, etat: { des: Math.max(0, des ?? etat().des), perdus: Math.max(0, perdus ?? etat().perdus) } };
  }
};

/** Exécution côté MJ : applique l'opération, enregistre l'état, effets secondaires. */
async function executer({ operation, ...donnees }) {
  if (!game.user.isGM) throw new Error("Bréviaire | seule l'instance du MJ modifie la réserve");
  const fn = OPERATIONS[operation];
  if (!fn) return { ok: false, raison: "inconnue" };
  const resultat = fn(donnees);
  if (!resultat.ok) return resultat;
  await game.settings.set(SYSTEME, "reserve", resultat.etat);
  if (resultat.mission) {
    // Une relique sert une fois par mission : on les réarme pour la nouvelle mission
    for (const a of escouade()) {
      const reliques = a.items.filter(i => i.type === "relique" && i.system.utilisee);
      if (reliques.length) await a.updateEmbeddedDocuments("Item", reliques.map(i => ({ _id: i.id, "system.utilisee": false })));
    }
  }
  return resultat;
}

/**
 * Demande une opération sur la réserve : directement si on est MJ, sinon par requête au MJ actif.
 * @returns {Promise<{ok: boolean, etat?: object, raison?: string}>}
 */
export async function demander(operation, donnees = {}) {
  if (game.user.isGM) return executer({ operation, ...donnees });
  const mj = game.users.activeGM;
  if (!mj) {
    ui.notifications.warn("BREVIAIRE.Reserve.sansMJ", { localize: true });
    return { ok: false, raison: "sansMJ" };
  }
  try {
    return await mj.query(REQUETE, { operation, ...donnees }, { timeout: 10000 });
  } catch (err) {
    console.error("Bréviaire | requête sur la réserve refusée", err);
    ui.notifications.error("BREVIAIRE.Reserve.erreur", { localize: true });
    return { ok: false, raison: "erreur" };
  }
}

export function enregistrerRequetes() {
  CONFIG.queries[REQUETE] = executer;
}
