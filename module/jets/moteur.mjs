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
import { etat as etatReserve, demander, mjDisponible } from "../reserve/reserve.mjs";

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
  const marque = opts.specialite ? (sys.bonusSpecialites?.[opts.specialite] ?? 0) : 0;
  const c = R.calculerScore({ carac: base, rang, situation: [...situation, marque] });
  // Le bonus d'une Marque n'est pas un modificateur de situation : il échappe au plancher de −6
  if (marque) {
    const sansMarque = R.calculerScore({ carac: base, rang, situation });
    c.score = Math.min(R.SCORE_MAX, sansMarque.score + marque);
    c.modificateur = sansMarque.modificateur;
    c.plafonne = sansMarque.plafonne;
  }
  return { carac, base, rang, marque, ...c };
}

/** Spécialité utilisée par une arme (ch. IV §3). */
export function specialiteDeLArme(arme) {
  return { melee: "melee", distance: "tir", lancer: "lancer", explosif: "lancer" }[arme?.system.categorie] ?? "melee";
}

/** Le MJ peut proposer une Tentation (un Ordre) : Corruption 3+, une fois par session (ch. IX). */
export function tentationPossible(actor) {
  return actor?.type === "personnage" && actor.system.corruption.value >= R.PALIERS[0]
    && actor.system.corruption.value < R.CORRUPTION_MAX && !actor.system.usages?.session?.tentation;
}

/** Peut-on prier ? (null si oui, sinon la clé de la raison) */
/**
 * Corruption qui pèse sur la prière : chez les Fidèles seulement (Souillé : dés retirés sur 1–2 ; 9 : plus de prière).
 * La Faveur des Damnés n'a pas ces effets (ch. IX des Damnés) : l'invocation suit la règle de base.
 */
function corruptionPriere(actor) {
  return actor.system.camp === "fideles" ? actor.system.corruption.value : 0;
}

export function raisonSansPriere(actor) {
  if (actor.type !== "personnage") return "ennemi";
  const sys = actor.system;
  const raison = R.raisonSansPriere({ foi: sys.usure.foi.value, corruption: corruptionPriere(actor), excommunie: sys.excommunie });
  if (raison) return raison;
  if (etatReserve().des <= 0) return "reserveVide";
  if (!mjDisponible()) return "sansMJ";
  return null;
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
  const arme = demande.armeId ? actor.items.get(demande.armeId) : null;
  if (arme && actor.type === "personnage" && arme.system.categorie === "distance" && actor.system.usure.munitions.value === 0) {
    return ui.notifications.warn(loc("BREVIAIRE.Combat.sansMunitions"));
  }
  if (arme?.system.quantite === 0) return ui.notifications.warn(game.i18n.format("BREVIAIRE.Utiliser.plusAucun", { objet: arme.name }));
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
  const tentation = personnage && tentationPossible(actor) ? (opts.tentation || "") : "";

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
    soin: opts.soin ? { ...opts.soin, applique: null } : null,
    rite: opts.rite ?? null,
    priere: priere ? { faces: 6, resultat: dePriere, retire: R.deRetire(dePriere, corruptionPriere(actor)) } : null,
    pacte: pacte ? { faces: sys.deSang, resultat: deSang } : null,
    titre: opts.titre ?? null,
    cibles: opts.cibles ?? [],
    rafale: !!opts.rafale,
    // Mêlée contre une cible : jet en opposition (ch. IV §5) ; la cible se défend depuis la carte
    opposition: arme && arme.system.categorie === "melee" && opts.cibles?.length ? { etat: "attente" } : null,
    tentation: tentation || null,
    automatique: tentation === "acceptee" ? "tentation" : (actor.perdu ? "perdu" : null),
    applique: {}
  };
  resoudre(d);
  if (d.priere) await demander("priere", { retire: d.priere.retire });
  await appliquerSuites(actor, d);

  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await rendreCarte(d),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEME]: { jet: d } }
  };
  try { ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode")); } catch (e) { /* mode de jet par défaut */ }
  const message = await ChatMessage.create(data);

  // Miracle ou Damnation : un arcane est tiré aussitôt (ch. I §5) — pour les personnages seulement
  if (d.naturel && personnage) {
    const { tirerArcane } = await import("../arcanes/arcanes.mjs");
    await tirerArcane({ actor, contexte: d.naturel === "miracle" ? "grace" : "damnation" });
  }
  await tirerMarquesDesPaliers(actor, d);
  // Grenades, charges, fioles : comptées à l'unité (ch. IV §6)
  if (arme && arme.system.quantite != null && ["lancer", "explosif"].includes(arme.system.categorie)) {
    await arme.update({ "system.quantite": Math.max(0, arme.system.quantite - 1) });
  }
  // Après un tir : test d'usure de Munitions, défavorisé en rafale (ch. IV §4) ; le Viseur est consommé
  if (arme && arme.system.categorie === "distance") {
    if (personnage) {
      const { testUsure } = await import("./usure.mjs");
      await testUsure(actor, "munitions", { defavorise: d.rafale });
    }
    if (actor.statuses?.has("viseur")) await actor.toggleStatusEffect("viseur", { active: false });
  }
  // Tentation refusée (Fidèles) : test d'usure de Nerfs (ch. IX §1)
  if (d.tentation === "refusee" && d.camp === "fideles") {
    const { testUsure } = await import("./usure.mjs");
    await testUsure(actor, "nerfs");
  }
  // Faveur 9, « Au bord » : après chaque pacte, jet d'Âme ou le démon prend le contrôle un tour (ch. IX Damnés)
  if (d.pacte && d.camp === "damnes" && actor.system.corruption.value === 9) await jetDeControle(actor);
  return message;
}

/** Palier franchi par ce jet (pacte, Tentation) : une Marque ou un Don par palier, après la carte du jet. */
export async function tirerMarquesDesPaliers(actor, d) {
  const paliers = d.applique?.paliers ?? [];
  if (!paliers.length || actor?.type !== "personnage" || d.applique.marquesTirees) return;
  d.applique.marquesTirees = true;
  const { tirerArcane } = await import("../arcanes/arcanes.mjs");
  for (const p of paliers) await tirerArcane({ actor, contexte: "marque" });
}

/** Jet d'Âme de contrôle (Faveur 9). */
export async function jetDeControle(actor) {
  return executerJet(actor, { type: "controle", carac: "ame", titre: loc("BREVIAIRE.Corruption.controle") });
}

/** Résultat à partir du d20 gardé et des dés soustraits. */
function resoudre(d) {
  const soustraction = (d.priere?.resultat ?? 0) + (d.pacte?.resultat ?? 0);
  Object.assign(d, R.resoudreJet({ d20: d.d20, score: d.score, soustraction }), { soustraction });
  // Réussite automatique : Tentation (ou Ordre) acceptée, personnage perdu ou dévoré (ch. IX)
  if (d.automatique) {
    d.reussite = true;
    if (d.naturel === "damnation") d.naturel = null;
  }
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

  // Prière ratée ou rite raté : la Foi (ou la Haine) descend d'un cran, un seul même si les deux ratent (décision d'Argan)
  if (!d.reussite && (d.priere || d.rite) && !a.foi && !a.rite) {
    maj["system.usure.foi.value"] = Math.max(0, sys.usure.foi.value - 1);
    if (d.rite) a.rite = true; else a.foi = true;
  }

  if (d.pacte && !a.pacte) {
    const avant = sys.corruption.value;
    const apres = Math.min(R.CORRUPTION_MAX, avant + 1);
    maj["system.corruption.value"] = apres;
    a.pacte = true;
    a.paliers = R.PALIERS.filter(p => p > sys.corruption.palier && apres >= p);
  }

  // Tentation (ou Ordre) : une fois par session ; acceptée +1, refusée chez les Damnés +3 au prochain jet de Disgrâce
  if (d.tentation && !a.tentation) {
    a.tentation = true;
    maj["system.usages.session.tentation"] = true;
    if (d.tentation === "acceptee") {
      const avant = maj["system.corruption.value"] ?? sys.corruption.value;
      maj["system.corruption.value"] = Math.min(R.CORRUPTION_MAX, avant + 1);
      a.paliers = R.PALIERS.filter(p => p > sys.corruption.palier && avant + 1 >= p);
    } else if (d.camp === "damnes") {
      maj["system.disgrace.ordresRefuses"] = sys.disgrace.ordresRefuses + 1;
    }
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

  if (!foundry.utils.isEmpty(maj)) await actor.update(maj, { breviaire: { sansMarque: true } });
}

/* -------------------------------------------- */
/*  Carte de chat                               */
/* -------------------------------------------- */

/** Libellé du jet : « Tir », « Chirurgien de tranchée », « Nerf », « Menace », « Jet de Mort »… */
function titreDuJet(d, actor) {
  if (d.titre) return d.titre;
  if (d.type === "mort") return loc("BREVIAIRE.Jet.mort");
  if (d.rite) return d.rite.nom;
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
  if (d.rite) {
    effets.push({ icone: "fa-solid fa-book-bible", texte: game.i18n.format("BREVIAIRE.Rite.paye", { reserve: t("Chapelet") }) });
    if (d.rite.guide) effets.push({ icone: "fa-solid fa-hands", texte: loc("BREVIAIRE.Rite.raison.guide") });
    if (d.applique.rite) effets.push({ icone: "fa-solid fa-arrow-down", texte: game.i18n.format("BREVIAIRE.Rite.echec", { foi: t("Foi") }), fort: true });
  }
  if (d.soin) {
    effets.push(d.soin.applique
      ? { icone: "fa-solid fa-kit-medical", texte: d.soin.applique, fort: true }
      : { icone: "fa-solid fa-user-injured", texte: game.i18n.format("BREVIAIRE.Utiliser.patient", { nom: d.soin.nom }) });
  }
  if (d.tentation) {
    const cle = d.tentation === "acceptee" ? "accepte" : `refuse.${d.camp}`;
    effets.push({ icone: "fa-solid fa-hand", texte: game.i18n.format(`BREVIAIRE.Corruption.tentation.${cle}`, { tentation: t("Tentation"), corruption: t("Corruption") }), fort: true });
  }
  if (d.automatique === "perdu") effets.push({ icone: "fa-solid fa-fire", texte: game.i18n.format("BREVIAIRE.Corruption.automatique", { etat: t("Perdu") }), fort: true });
  if (d.type === "controle" && !d.reussite) effets.push({ icone: "fa-solid fa-mask", texte: loc("BREVIAIRE.Corruption.controlePerdu"), fort: true });
  if (d.applique.coche) effets.push({ icone: "fa-solid fa-check", texte: game.i18n.format("BREVIAIRE.Jet.coche", { specialite: loc(`BREVIAIRE.Specialite.${d.specialite}`) }) });
  if (d.type === "mort") {
    effets.push(d.applique.mortTotal
      ? { icone: "fa-solid fa-cross", texte: loc("BREVIAIRE.Jet.mortDefinitive"), fort: true }
      : d.reussite
        ? { icone: "fa-solid fa-heart-pulse", texte: loc("BREVIAIRE.Jet.tientBon") }
        : { icone: "fa-solid fa-skull", texte: loc("BREVIAIRE.Jet.mortCase") });
  }

  if (d.rafale) effets.push({ icone: "fa-solid fa-burst", texte: loc("BREVIAIRE.Combat.rafaleTexte") });

  // Boutons « après coup » (variante du réglage modePriere) : seulement sur un échec qui n'est pas une Damnation
  const apres = game.settings.get(SYSTEME, "modePriere") === "apres";
  const rattrapable = apres && !d.reussite && d.naturel !== "damnation" && actor?.type === "personnage";

  const rite = d.rite ? actor?.items.get(d.rite.id) : null;
  const contexte = {
    d,
    riteEffet: rite && d.reussite ? rite.system.effet : null,
    sousTitreRite: d.rite ? `${loc(`BREVIAIRE.NiveauRite.${d.rite.niveau}`)} · ${loc(`BREVIAIRE.Specialite.${d.specialite ?? "ferveur"}`)}` : null,
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
      degats: !!arme && d.reussite && (!d.opposition || d.opposition.gagnant === "a"),
      defense: d.opposition?.etat === "attente" && d.reussite,
      soigner: !!d.soin && d.reussite && !d.soin.applique
    },
    libelles: { prier: t("Prier"), pactiser: loc("BREVIAIRE.Jet.pactiser") },
    opposition: texteOpposition(d)
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
    const defense = bouton.dataset.brevAction.startsWith("defense");
    const cible = defense ? fromUuidSync(d.cibles?.[0]) : null;
    if (defense ? !cible?.isOwner : !actor?.isOwner) { bouton.remove(); continue; }
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

  if (action === "degats") {
    const { lancerDegats } = await import("../combat/degats.mjs");
    const cibles = d.opposition ? d.cibles.slice(0, 1) : d.rafale ? d.cibles.slice(0, 3) : d.cibles.slice(0, 1);
    return lancerDegats(actor, d.armeId, { cibles });
  }
  if (action.startsWith("defense")) return defendre(message, d, action === "defense-esquive" ? "esquive" : "melee");

  if (action === "soigner") {
    if (!d.soin || d.soin.applique) return;
    const { appliquerSoins } = await import("../objets/utiliser.mjs");
    const texte = await appliquerSoins(d);
    if (!texte) return;
    d.soin.applique = texte;
    return majCarteJet(message, d);
  }

  // Prière ou pacte après coup (variante)
  const sys = actor.system;
  let roll;
  if (action === "prier" && !d.priere && !raisonSansPriere(actor)) {
    roll = await new Roll("1d6").evaluate();
    d.priere = { faces: 6, resultat: roll.total, retire: R.deRetire(roll.total, corruptionPriere(actor)), apres: true };
    await demander("priere", { retire: d.priere.retire });
  } else if (action === "pactiser" && !d.pacte) {
    roll = await new Roll(`1d${sys.deSang}`).evaluate();
    d.pacte = { faces: sys.deSang, resultat: roll.total, apres: true };
  } else return;

  await game.dice3d?.showForRoll(roll, game.user, true);
  resoudre(d);
  await appliquerSuites(actor, d);
  await tirerMarquesDesPaliers(actor, d);
  await majCarteJet(message, d);
}

/** Réécrit une carte de jet ; si elle appartient à un autre (le MJ a lancé pour un joueur), le MJ s'en charge. */
function majCarteJet(message, d) {
  if (message.isOwner) return rendreCarte(d).then(content => message.update({ content, [`flags.${SYSTEME}.jet`]: d }));
  return game.users.activeGM?.query("breviaire.carte", { messageId: message.id, type: "jet", d }, { timeout: 10000 });
}

/** Dégâts d'une arme (voir combat/degats.mjs). */
export async function lancerDegats(actor, armeId, options) {
  const m = await import("../combat/degats.mjs");
  return m.lancerDegats(actor, armeId, options);
}

/* -------------------------------------------- */
/*  Opposition (mêlée)                          */
/* -------------------------------------------- */

function texteOpposition(d) {
  const o = d.opposition;
  if (!o) return null;
  const cible = fromUuidSync(d.cibles?.[0]);
  if (o.etat === "attente") {
    return d.reussite ? game.i18n.format("BREVIAIRE.Combat.opposition.attente", { nom: cible?.name ?? "?" }) : null;
  }
  const def = o.defense;
  const detail = game.i18n.format("BREVIAIRE.Combat.opposition.detail", {
    nom: cible?.name ?? "?", jet: loc(`BREVIAIRE.Specialite.${def.specialite}`), total: def.total,
    verdict: loc(def.reussite ? "BREVIAIRE.Jet.reussite" : "BREVIAIRE.Jet.echec")
  });
  const cle = { a: "touche", b: def.specialite === "melee" ? "pare" : "esquive", blocage: "blocage", egalite: "egalite" }[o.gagnant];
  return `${detail} ${loc(`BREVIAIRE.Combat.opposition.${cle}`)}`;
}

/** La cible d'une attaque de mêlée se défend : Mêlée (parer) ou Esquive (se dégager). */
async function defendre(message, d, specialite) {
  if (d.opposition?.etat !== "attente") return;
  const cible = await fromUuid(d.cibles?.[0]);
  if (!cible) return;
  const titre = game.i18n.format("BREVIAIRE.Combat.opposition.defense", { jet: loc(`BREVIAIRE.Specialite.${specialite}`) });
  const m = cible.type === "personnage"
    ? await lancerJet(cible, { specialite, titre, type: "defense" })
    : await executerJet(cible, { type: "defense", titre });
  const j = m?.getFlag(SYSTEME, "jet");
  if (!j) return;
  d.opposition = {
    etat: "resolue",
    defense: { specialite, total: j.total, reussite: j.reussite },
    gagnant: R.resoudreOpposition({ reussite: d.reussite, total: d.total }, { reussite: j.reussite, total: j.total })
  };
  return majCarteJet(message, d);
}

