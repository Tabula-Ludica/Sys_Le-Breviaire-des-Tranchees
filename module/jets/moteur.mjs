/**
 * Moteur de jet du Bréviaire (ch. I, II, V, IX).
 *
 * Un jet = un dialogue (options), un seul Roll (d20 ou 2d20, d6 de prière, dé de Sang, pour Dice So Nice),
 * une carte de chat, et des suites appliquées à la fiche (Foi, Corruption, coche d'expérience, jet de Mort).
 * Les données du jet sont gardées dans le message (flags.breviaire.jet) : les boutons de la carte
 * peuvent ainsi le compléter après coup, même après un rechargement.
 */

import { SYSTEME, SPECIALITES, SUBSTITUTIONS, DIFFICULTES, COUVERTS, PORTEES } from "../config.mjs";
import * as R from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { themeSombre } from "../settings.mjs";

export const CARTE = "systems/breviaire/templates/chat/jet.hbs";
const loc = cle => game.i18n.localize(cle);
const renderTemplate = (...a) => foundry.applications.handlebars.renderTemplate(...a);

/* -------------------------------------------- */
/*  Score                                       */
/* -------------------------------------------- */

/**
 * Caractéristique, rang et score d'un jet, à partir des options du dialogue.
 * Ennemi : la Menace sert à tout. Jet de Mort : la Chair, sans Spécialité.
 */
export function calculer(actor, opts) {
  const sys = actor.system;
  const situation = [
    DIFFICULTES[opts.difficulte] ?? 0,
    opts.couvert ? COUVERTS[opts.couvert] ?? 0 : 0,
    opts.portee ? PORTEES[opts.portee] ?? 0 : 0,
    Number(opts.malus) || 0
  ];

  if (actor.type === "ennemi") {
    return { carac: null, base: sys.menace, rang: 0, ...R.calculerScore({ carac: sys.menace, situation }) };
  }

  let carac = opts.carac || "chair";
  let rang = 0;
  if (opts.specialite) {
    rang = sys.specialites[opts.specialite]?.rang ?? 0;
    if (!opts.carac) {
      carac = opts.substitution && sys.substitutions.has(opts.substitution)
        ? SUBSTITUTIONS[opts.substitution].carac
        : SPECIALITES[opts.specialite];
    }
  }
  const base = sys.caracs[carac];
  return { carac, base, rang, ...R.calculerScore({ carac: base, rang, situation }) };
}

/** Spécialité utilisée par une arme (ch. IV §3). */
export function specialiteDeLArme(arme) {
  return { melee: "melee", distance: "tir", lancer: "lancer", explosif: "lancer" }[arme?.system.categorie] ?? "melee";
}

/** Peut-on prier ? (null si oui, sinon la clé de la raison) */
export function raisonSansPriere(actor) {
  if (actor.type !== "personnage") return "ennemi";
  const sys = actor.system;
  return R.raisonSansPriere({ foi: sys.usure.foi.value, corruption: sys.corruption.value, excommunie: sys.excommunie });
}

/* -------------------------------------------- */
/*  Lancer                                      */
/* -------------------------------------------- */

/**
 * Point d'entrée : ouvre le dialogue, lance, publie la carte.
 * @param {Actor} actor
 * @param {object} demande  { type: "action"|"mort", carac?, specialite?, substitution?, armeId? }
 */
export async function lancerJet(actor, demande = {}) {
  const { DialogueJet } = await import("./dialogue-jet.mjs");
  const opts = await DialogueJet.demander(actor, demande);
  if (!opts) return null;
  return executerJet(actor, { ...demande, ...opts });
}

/** Lance sans dialogue (macros, Vade, tests) avec des options complètes. */
export async function executerJet(actor, opts) {
  const sys = actor.system;
  const personnage = actor.type === "personnage";
  const calcul = calculer(actor, opts);
  const mode = R.modeDuJet(opts.favorise, opts.defavorise);

  const priere = personnage && opts.priere && !raisonSansPriere(actor);
  const pacte = personnage && opts.pacte;

  const parties = [`${mode === "normal" ? "1d20" : mode === "favorise" ? "2d20kl" : "2d20kh"}`];
  if (priere) parties.push("1d6");
  if (pacte) parties.push(`1d${sys.deSang}`);
  const roll = await new Roll(parties.join(" + ")).evaluate();

  const [termeD20, ...autres] = roll.dice;
  const des = termeD20.results.map(r => r.result);
  const d20 = R.deGarde(des, mode);
  const dePriere = priere ? autres.shift().total : null;
  const deSang = pacte ? autres.shift().total : null;

  const arme = opts.armeId ? actor.items.get(opts.armeId) : null;
  const d = {
    type: opts.type ?? "action",
    acteur: actor.uuid,
    camp: personnage ? sys.camp : game.settings.get(SYSTEME, "camp"),
    specialite: opts.specialite || null,
    substitution: opts.substitution || null,
    carac: calcul.carac,
    armeId: arme?.id ?? null,
    score: calcul.score,
    base: calcul.base,
    rang: calcul.rang,
    modificateur: calcul.modificateur,
    plafonne: calcul.plafonne,
    mode,
    des,
    d20,
    enjeu: !!opts.enjeu,
    priere: priere ? { faces: 6, resultat: dePriere, retire: R.deRetire(dePriere, sys.corruption.value) } : null,
    pacte: pacte ? { faces: sys.deSang, resultat: deSang } : null,
    applique: {}
  };
  resoudre(d);
  await appliquerSuites(actor, d);

  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await rendreCarte(d),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEME]: { jet: d } }
  };
  try { ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode")); } catch (e) { /* mode de jet par défaut */ }
  return ChatMessage.create(data);
}

/** Résultat à partir du d20 gardé et des dés soustraits. */
function resoudre(d) {
  const soustraction = (d.priere?.resultat ?? 0) + (d.pacte?.resultat ?? 0);
  Object.assign(d, R.resoudreJet({ d20: d.d20, score: d.score, soustraction }), { soustraction });
}

/* -------------------------------------------- */
/*  Suites sur la fiche                         */
/* -------------------------------------------- */

/**
 * Applique (ou défait) les suites d'un jet, une seule fois chacune grâce à d.applique :
 * Foi −1 cran si la prière n'a pas suffi, +1 Corruption par pacte, coche d'expérience, jet de Mort raté.
 * Le dé de prière retiré du Chapelet sera pris en compte avec la réserve commune (étape 4).
 */
export async function appliquerSuites(actor, d) {
  if (actor?.type !== "personnage") return;
  const sys = actor.system;
  const maj = {};
  const a = d.applique;

  if (d.priere && !d.reussite && !a.foi) {
    maj["system.usure.foi.value"] = Math.max(0, sys.usure.foi.value - 1);
    a.foi = true;
  }

  if (d.pacte && !a.pacte) {
    const avant = sys.corruption.value;
    const apres = Math.min(R.CORRUPTION_MAX, avant + 1);
    maj["system.corruption.value"] = apres;
    a.pacte = true;
    a.paliers = R.paliersFranchis(avant, apres);
  }

  if (d.type === "action" && d.specialite) {
    const merite = R.meriteCoche({ enjeu: d.enjeu, reussite: d.reussite, naturel: d.naturel, priere: !!d.priere, pacte: !!d.pacte });
    if (merite && !a.coche && !sys.specialites[d.specialite].coche) {
      maj[`system.specialites.${d.specialite}.coche`] = true;
      a.coche = true;
    } else if (!merite && a.coche) {
      maj[`system.specialites.${d.specialite}.coche`] = false;
      a.coche = false;
    }
  }

  if (d.type === "mort") {
    if (!d.reussite && !a.mort) {
      maj["system.mort.echecs"] = Math.min(3, sys.mort.echecs + 1);
      a.mort = true;
    } else if (d.reussite && a.mort) {
      maj["system.mort.echecs"] = Math.max(0, sys.mort.echecs - 1);
      a.mort = false;
    }
    a.mortTotal = (maj["system.mort.echecs"] ?? sys.mort.echecs) >= 3;
  }

  if (!foundry.utils.isEmpty(maj)) await actor.update(maj);
}

/* -------------------------------------------- */
/*  Carte de chat                               */
/* -------------------------------------------- */

/** Libellé du jet : « Tir », « Chirurgien de tranchée », « Nerf », « Menace », « Jet de Mort »… */
function titreDuJet(d, actor) {
  if (d.type === "mort") return loc("BREVIAIRE.Jet.mort");
  if (actor?.type === "ennemi") return loc("BREVIAIRE.Fiche.menace");
  if (d.substitution) return loc(`BREVIAIRE.Substitution.${d.substitution}`);
  if (d.specialite) return loc(`BREVIAIRE.Specialite.${d.specialite}`);
  return loc(`BREVIAIRE.Carac.${d.carac}`);
}

export async function rendreCarte(d) {
  const actor = fromUuidSync(d.acteur);
  const arme = d.armeId ? actor?.items.get(d.armeId) : null;
  const t = cle => terme(cle, d.camp);

  const effets = [];
  if (d.priere?.retire) effets.push({ icone: "fa-solid fa-dice-one", texte: game.i18n.format("BREVIAIRE.Jet.deRetire", { reserve: t("Chapelet") }) });
  if (d.applique.foi) effets.push({ icone: "fa-solid fa-arrow-down", texte: game.i18n.format("BREVIAIRE.Jet.foiBaisse", { foi: t("Foi") }) });
  if (d.applique.pacte) effets.push({ icone: "fa-solid fa-droplet", texte: game.i18n.format("BREVIAIRE.Jet.corruptionPlus", { corruption: t("Corruption") }) });
  for (const p of d.applique.paliers ?? []) {
    effets.push({ icone: "fa-solid fa-skull", texte: game.i18n.format("BREVIAIRE.Jet.palier", { palier: p, marque: t("Marque") }), fort: true });
  }
  if (d.applique.coche) effets.push({ icone: "fa-solid fa-check", texte: game.i18n.format("BREVIAIRE.Jet.coche", { specialite: loc(`BREVIAIRE.Specialite.${d.specialite}`) }) });
  if (d.type === "mort") {
    effets.push(d.applique.mortTotal
      ? { icone: "fa-solid fa-cross", texte: loc("BREVIAIRE.Jet.mortDefinitive"), fort: true }
      : d.reussite
        ? { icone: "fa-solid fa-heart-pulse", texte: loc("BREVIAIRE.Jet.tientBon") }
        : { icone: "fa-solid fa-skull", texte: loc("BREVIAIRE.Jet.mortCase") });
  }

  // Boutons « après coup » (variante du réglage modePriere) : seulement sur un échec qui n'est pas une Damnation
  const apres = game.settings.get(SYSTEME, "modePriere") === "apres";
  const rattrapable = apres && !d.reussite && d.naturel !== "damnation" && actor?.type === "personnage";

  const contexte = {
    d,
    camp: d.camp,
    titre: titreDuJet(d, actor),
    acteur: { nom: actor?.name ?? "?", img: actor?.img },
    arme: arme ? { nom: arme.name, degats: arme.system.degats } : null,
    carac: d.carac ? loc(`BREVIAIRE.Carac.${d.carac}`) : null,
    bonus: R.BONUS_RANG[d.rang] ?? 0,
    mode: d.mode !== "normal" ? loc(`BREVIAIRE.Jet.${d.mode}`) : null,
    des: d.des.map((v, i) => ({ v, garde: i === d.des.indexOf(d.d20), naturel: v === 1 ? "un" : v === 20 ? "vingt" : "" })),
    gardeUnique: d.des.length > 1,
    libellePriere: t("Priere"),
    libelleNaturel: d.naturel ? loc(`BREVIAIRE.Jet.${d.naturel}`) : null,
    tirageArcane: d.naturel && actor?.type === "personnage"
      ? game.i18n.format("BREVIAIRE.Jet.tirage", { effet: loc(d.naturel === "miracle" ? "BREVIAIRE.Objet.grace" : "BREVIAIRE.Objet.damnation"), paquet: t("Paquet") })
      : null,
    ecart: Math.abs(d.ecart),
    effets,
    boutons: {
      prier: rattrapable && !d.priere && !raisonSansPriere(actor),
      pactiser: rattrapable && !d.pacte,
      degats: !!arme && d.reussite
    },
    libelles: { prier: t("Prier"), pactiser: loc("BREVIAIRE.Jet.pactiser") }
  };
  return renderTemplate(CARTE, contexte);
}

/* -------------------------------------------- */
/*  Boutons de la carte                         */
/* -------------------------------------------- */

/** Branche les boutons d'une carte (appelé par le hook renderChatMessageHTML, donc aussi dans le chat de Vade). */
export function brancherCarte(message, html) {
  const d = message.getFlag(SYSTEME, "jet");
  if (!d) return;
  // Thème de la carte selon le réglage personnel de chaque joueur
  html.querySelector(".brev-carte-jet")?.classList.add(themeSombre(d.camp) ? "brev-sombre" : "brev-clair");
  const actor = fromUuidSync(d.acteur);
  for (const bouton of html.querySelectorAll("[data-brev-action]")) {
    if (!actor?.isOwner) { bouton.remove(); continue; }
    bouton.addEventListener("click", async event => {
      event.preventDefault();
      bouton.disabled = true;
      try { await actionCarte(message, bouton.dataset.brevAction); }
      finally { bouton.disabled = false; }
    });
  }
}

async function actionCarte(message, action) {
  const d = foundry.utils.deepClone(message.getFlag(SYSTEME, "jet"));
  const actor = await fromUuid(d.acteur);
  if (!actor) return;

  if (action === "degats") return lancerDegats(actor, d.armeId);

  // Prière ou pacte après coup (variante)
  const sys = actor.system;
  let roll;
  if (action === "prier" && !d.priere && !raisonSansPriere(actor)) {
    roll = await new Roll("1d6").evaluate();
    d.priere = { faces: 6, resultat: roll.total, retire: R.deRetire(roll.total, sys.corruption.value), apres: true };
  } else if (action === "pactiser" && !d.pacte) {
    roll = await new Roll(`1d${sys.deSang}`).evaluate();
    d.pacte = { faces: sys.deSang, resultat: roll.total, apres: true };
  } else return;

  await game.dice3d?.showForRoll(roll, game.user, true);
  resoudre(d);
  await appliquerSuites(actor, d);
  await message.update({ content: await rendreCarte(d), [`flags.${SYSTEME}.jet`]: d });
}

/** Dégâts bruts d'une arme (la Protection et les Blessures graves arrivent avec le combat, étape 7). */
export async function lancerDegats(actor, armeId) {
  const arme = actor.items.get(armeId);
  if (!arme) return;
  const roll = await new Roll(arme.system.degats).evaluate();
  const sacree = arme.system.particularites.has("sacree");
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<span class="brev-flavor">${game.i18n.format("BREVIAIRE.Jet.degatsDe", { arme: arme.name })}`
      + `${sacree ? ` · ${loc("BREVIAIRE.Particularite.sacree")}` : ""}<br><small>${loc("BREVIAIRE.Jet.avantProtection")}</small></span>`
  });
}

