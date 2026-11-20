/**
 * Le Paquet du Destin (ch. I §5, ch. III).
 *
 * Deux paquets, le Tarot saint et le Tarot noir, en documents Cards (compendium « paquets »),
 * importés dans le monde par le MJ au premier lancement. Chaque carte renvoie à son objet arcane.
 * Règle : on mélange avant chaque tirage et la carte retourne dans le paquet ; un tirage choisit donc
 * une carte au hasard parmi les 22, sans déplacer les cartes (aucun droit nécessaire pour les joueurs).
 *
 * Contextes : grace (1 naturel), damnation (20 naturel), marque (paliers 3/6/9), creation (3 cartes).
 */

import { SYSTEME } from "../config.mjs";
import { terme } from "../lexique.mjs";
import { demander, escouade } from "../reserve/reserve.mjs";
import { CRAN_MAX, CORRUPTION_MAX, baisseAutorisee } from "../logique/regles.mjs";
import { themeSombre } from "../settings.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
const renderTemplate = (...a) => foundry.applications.handlebars.renderTemplate(...a);
export const CARTE_ARCANE = "systems/breviaire/templates/chat/arcane.hbs";

/* -------------------------------------------- */
/*  Paquets du monde                            */
/* -------------------------------------------- */

/** Au premier lancement (MJ) : importe les deux paquets du compendium dans le monde. */
export async function preparerPaquets() {
  if (!game.user.isGM) return;
  const ids = foundry.utils.deepClone(game.settings.get(SYSTEME, "paquets") ?? {});
  const pack = game.packs.get(`${SYSTEME}.paquets`);
  if (!pack) return;
  let change = false;
  for (const camp of ["fideles", "damnes"]) {
    if (ids[camp] && game.cards.get(ids[camp])) continue;
    const existant = game.cards.find(c => c.getFlag(SYSTEME, "camp") === camp && c.type === "deck");
    if (existant) { ids[camp] = existant.id; change = true; continue; }
    const index = await pack.getIndex({ fields: ["flags"] });
    const entree = index.find(e => e.flags?.[SYSTEME]?.camp === camp);
    if (!entree) continue;
    const source = (await pack.getDocument(entree._id)).toObject();
    source.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
    const deck = await Cards.implementation.create(source, { keepId: true });
    ids[camp] = deck.id;
    change = true;
  }
  if (change) await game.settings.set(SYSTEME, "paquets", ids);
}

/** Cartes disponibles pour un camp : celles du paquet du monde, sinon celles du compendium. */
async function cartes(camp) {
  const id = game.settings.get(SYSTEME, "paquets")?.[camp];
  const deck = id ? game.cards.get(id) : null;
  if (deck?.cards.size) {
    return deck.cards.contents.map(c => ({
      numero: c.value ?? c.getFlag(SYSTEME, "numero"),
      img: c.currentFace?.img ?? c.img,
      uuid: c.getFlag(SYSTEME, "arcane")
    }));
  }
  const pack = game.packs.get(`${SYSTEME}.arcanes-${camp}`);
  const index = await pack.getIndex({ fields: ["system.numero"] });
  return index.map(e => ({ numero: e.system.numero, img: e.img, uuid: e.uuid }));
}

/** Tire un arcane au hasard (hors numéros exclus). Renvoie l'objet arcane et l'image de la carte. */
export async function tirer(camp, exclure = []) {
  const toutes = (await cartes(camp)).filter(c => !exclure.includes(c.numero));
  if (!toutes.length) return null;
  const carte = toutes[Math.floor(CONFIG.Dice.randomUniform() * toutes.length)];
  const arcane = await fromUuid(carte.uuid);
  return arcane ? { arcane, img: carte.img || arcane.img } : null;
}

/* -------------------------------------------- */
/*  Tirage avec carte de chat                   */
/* -------------------------------------------- */

/**
 * Tire un arcane et publie sa carte dans le chat.
 * @param {object} o
 * @param {Actor} [o.actor]      personnage concerné
 * @param {string} o.contexte     grace | damnation | marque | creation
 * @param {string} [o.camp]       camp du paquet (celui du personnage par défaut)
 * @param {string} [o.position]   pour la création : Passé, Serment, Péché…
 * @param {number[]} [o.exclure]  numéros à ne pas tirer
 */
export async function tirerArcane({ actor = null, contexte, camp, position = null, exclure = [] }) {
  camp ??= actor?.system?.camp ?? game.settings.get(SYSTEME, "camp");
  // Une Marque déjà portée : on retire une carte (ch. III)
  if (contexte === "marque" && actor) {
    exclure = [...exclure, ...actor.items.filter(i => i.type === "arcane" && i.system.camp === camp).map(i => i.system.numero)];
  }
  const tire = await tirer(camp, exclure);
  if (!tire) return null;
  const { arcane, img } = tire;

  // La Marque (ou le Don) rejoint la fiche : ses bonus comptent aussitôt dans les scores
  if (contexte === "marque" && actor?.isOwner) {
    const donnees = arcane.toObject();
    delete donnees._id;
    foundry.utils.setProperty(donnees, `flags.${SYSTEME}.source`, arcane.uuid);
    await actor.createEmbeddedDocuments("Item", [donnees]);
  }

  const d = {
    contexte, camp, position,
    acteur: actor?.uuid ?? null,
    arcane: arcane.uuid,
    numero: arcane.system.numero,
    effets: ["grace", "damnation"].includes(contexte) ? effetsChiffres(effetDe(arcane, contexte).texte) : [],
    appliques: []
  };
  const message = await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    content: await rendreCarteArcane(d, arcane, img),
    flags: { [SYSTEME]: { arcane: d, img } }
  });
  return { arcane, message };
}

function effetDe(arcane, contexte) {
  const s = arcane.system;
  if (contexte === "grace") return s.grace;
  if (contexte === "damnation") return s.damnation;
  if (contexte === "marque") return s.marque;
  return { titre: "", texte: "" };
}

async function rendreCarteArcane(d, arcane, img) {
  const t = cle => terme(cle, d.camp);
  const s = arcane.system;
  const effet = effetDe(arcane, d.contexte);
  const intitules = {
    grace: loc("BREVIAIRE.Objet.grace"), damnation: loc("BREVIAIRE.Objet.damnation"),
    marque: t("Marque"), creation: d.position ?? loc("BREVIAIRE.Arcane.creation")
  };
  const actor = d.acteur ? fromUuidSync(d.acteur) : null;
  return renderTemplate(CARTE_ARCANE, {
    d, img, camp: d.camp,
    nom: arcane.name, chiffre: s.chiffre, sens: s.sens,
    paquet: t("Paquet"),
    intitule: intitules[d.contexte],
    acteur: actor?.name,
    effet: effet.titre ? effet : null,
    // À la création, on montre les trois faces pour inspirer l'histoire
    toutes: d.contexte === "creation" ? [
      { label: loc("BREVIAIRE.Objet.grace"), ...s.grace },
      { label: loc("BREVIAIRE.Objet.damnation"), ...s.damnation },
      { label: t("Marque"), ...s.marque }
    ] : null,
    marqueAjoutee: d.contexte === "marque" && actor ? fmt("BREVIAIRE.Arcane.marqueAjoutee", { marque: t("Marque"), nom: actor.name }) : null,
    effets: d.effets.map((e, i) => ({ ...e, index: i, libelle: libelleEffet(e, d.camp), fait: d.appliques.includes(i) }))
  });
}

/* -------------------------------------------- */
/*  Effets chiffrés : bouton Appliquer          */
/* -------------------------------------------- */

const USURES_TEXTE = { nerfs: "nerfs", munitions: "munitions", vivres: "vivres", foi: "foi", haine: "foi" };

/**
 * Repère dans le texte d'un effet ce qui peut s'appliquer d'un clic :
 * « +2d6 au Chapelet », « ses Nerfs descendent d'un cran », « les Vivres de toute l'escouade remontent d'un cran »…
 * Le reste est narratif : le MJ l'applique.
 */
export function effetsChiffres(html) {
  const texte = String(html ?? "").replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  const effets = [];
  for (const m of texte.matchAll(/\+(\d+)d6 (?:au|dans le|du) (Chapelet|Calice)/gi)) effets.push({ type: "reserve", n: Number(m[1]) });
  // Le Jugement (−1), Le Diable / Le Prince (+1) : Corruption ou Faveur du personnage
  for (const m of texte.matchAll(/(perd|gagne) 1 point de (?:Corruption|Faveur)/gi)) {
    effets.push({ type: "corruption", cible: "soi", delta: m[1].toLowerCase() === "perd" ? -1 : 1 });
  }
  // « ses Munitions ou ses Vivres remontent » : deux boutons, un seul utilisable (même groupe)
  const usure = /(?:(Nerfs|Munitions|Vivres|Foi|Haine) ou (?:les |ses |sa |son )?)?(?:les |ses |sa |son )?(Nerfs|Munitions|Vivres|Foi|Haine)( de toute l'escouade)?(?: du personnage)? (remontent|remonte|descendent|descend) d'un cran/gi;
  let groupe = 0;
  for (const m of texte.matchAll(usure)) {
    groupe++;
    for (const nom of [m[1], m[2]].filter(Boolean)) {
      effets.push({
        type: "usure", usure: USURES_TEXTE[nom.toLowerCase()], groupe,
        cible: m[3] ? "escouade" : "soi",
        delta: /remont/i.test(m[4]) ? 1 : -1
      });
    }
  }
  return effets;
}

function libelleEffet(e, camp) {
  if (e.type === "corruption") return `${terme("Corruption", camp)} ${e.delta > 0 ? "+1" : "−1"}`;
  if (e.type === "reserve") return fmt("BREVIAIRE.Arcane.effetReserve", { n: e.n, reserve: terme("Chapelet", camp) });
  const usure = e.usure === "foi" ? terme("Foi", camp) : loc(`BREVIAIRE.Usure.${e.usure}`);
  return fmt(e.cible === "escouade" ? "BREVIAIRE.Arcane.effetUsureEscouade" : "BREVIAIRE.Arcane.effetUsure",
    { usure, signe: e.delta > 0 ? "+1" : "−1" });
}

/** Branche les boutons « Appliquer » d'une carte d'arcane. */
export function brancherCarteArcane(message, html) {
  const d = message.getFlag(SYSTEME, "arcane");
  if (!d) return;
  html.querySelector(".brev-carte-arcane")?.classList.add(themeSombre(d.camp) ? "brev-sombre" : "brev-clair");
  for (const bouton of html.querySelectorAll("[data-brev-arcane]")) {
    const e = d.effets[Number(bouton.dataset.brevArcane)];
    const actor = d.acteur ? fromUuidSync(d.acteur) : null;
    // Effets sur l'escouade : le MJ ; sur le personnage ou la réserve : son propriétaire (qui peut réécrire la carte)
    const autorise = game.user.isGM || (e?.cible !== "escouade" && actor?.isOwner && message.isOwner);
    if (!autorise) { bouton.remove(); continue; }
    bouton.addEventListener("click", async ev => {
      ev.preventDefault();
      bouton.disabled = true;
      await appliquerEffet(message, Number(bouton.dataset.brevArcane));
    });
  }
}

async function appliquerEffet(message, index) {
  const d = foundry.utils.deepClone(message.getFlag(SYSTEME, "arcane"));
  if (d.appliques.includes(index)) return;
  const e = d.effets[index];
  if (e.type === "reserve") {
    const res = await demander("ajouter", { n: e.n });
    if (!res.ok) return;
  } else if (e.type === "corruption") {
    // La baisse respecte le dernier palier atteint (ch. IX) ; la hausse peut faire tirer une Marque
    const a = fromUuidSync(d.acteur);
    if (!a?.isOwner || a.type !== "personnage") return;
    const c = a.system.corruption;
    await a.update({ "system.corruption.value": e.delta < 0 ? baisseAutorisee(c.value, c.palier) : Math.min(CORRUPTION_MAX, c.value + 1) });
  } else {
    const cibles = e.cible === "escouade" ? escouade() : [fromUuidSync(d.acteur)].filter(Boolean);
    for (const a of cibles) {
      if (!a.isOwner || a.type !== "personnage") continue;
      const u = a.system.usure[e.usure];
      await a.update({ [`system.usure.${e.usure}.value`]: Math.clamp(u.value + e.delta, 0, CRAN_MAX) });
    }
  }
  // Un choix (« X ou Y ») ne s'applique qu'une fois : les autres boutons du groupe sont grisés
  d.effets.forEach((x, i) => { if (i === index || (e.groupe && x.groupe === e.groupe)) d.appliques.push(i); });
  const arcane = await fromUuid(d.arcane);
  const img = message.getFlag(SYSTEME, "img");
  await message.update({ content: await rendreCarteArcane(d, arcane, img), [`flags.${SYSTEME}.arcane`]: d });
}

