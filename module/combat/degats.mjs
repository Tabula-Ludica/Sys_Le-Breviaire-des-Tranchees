/**
 * Dégâts, Blessures graves, hors de combat (ch. IV §6–7), et ce qui arrive au début d'un tour
 * (jet de Mort, Hémorragie, panique).
 */

import { SYSTEME, BLESSURES_GRAVES } from "../config.mjs";
import * as R from "../logique/regles.mjs";
import { themeSombre } from "../settings.mjs";
import { etat } from "./etats.mjs";
import { perdreInitiative } from "./combat.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
const renderTemplate = (...a) => foundry.applications.handlebars.renderTemplate(...a);
const CARTE = "systems/breviaire/templates/chat/degats.hbs";

/** Protection d'une cible (personnage : meilleure pièce + naturelle ; le bouclier compte de face). */
function protectionDe(cible, deFace) {
  if (cible.type === "personnage") return cible.system.protection + (deFace ? cible.system.protectionBouclier : 0);
  return cible.system.protection;
}

/** L'attaque est-elle Sacrée ? Arme sacrée, ou ennemi au trait Sacré. */
function attaqueSacree(attaquant, arme) {
  return !!arme?.system.particularites?.has("sacree") || !!attaquant?.system.traits?.has?.("sacre");
}

/**
 * Lance les dégâts d'une arme et publie une carte avec, pour chaque cible, les Blessures retirées
 * et un bouton Appliquer. Sans cible, la carte donne les dégâts bruts.
 */
export async function lancerDegats(attaquant, armeId, { cibles = [] } = {}) {
  const arme = attaquant.items.get(armeId);
  if (!arme) return;
  const roll = await new Roll(arme.system.degats || "1d4").evaluate();
  const p = arme.system.particularites ?? new Set();
  const d = {
    attaquant: attaquant.uuid,
    arme: arme.name,
    formule: arme.system.degats,
    de: roll.total,
    brutal: p.has("brutal"),
    sacre: attaqueSacree(attaquant, arme),
    eauBenite: p.has("neBlesseQueImpie"),
    // Arme Impie (rite noir, fiole de sang maudit) : la cible blessée fait un test d'usure de Nerfs
    impie: p.has("impie"),
    zone: p.has("zone"),
    cibles: cibles.map(uuid => ({ uuid, deFace: true, moitie: false, applique: null }))
  };
  const data = {
    speaker: ChatMessage.getSpeaker({ actor: attaquant }),
    content: await rendreCarteDegats(d),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEME]: { degats: d } }
  };
  return ChatMessage.create(data);
}

/** Dégâts qu'une cible subit, avec ses options (bouclier de face, moitié sur Esquive réussie en zone). */
export function degatsPour(d, c) {
  const cible = fromUuidSync(c.uuid);
  if (!cible) return null;
  const impie = !!cible.system.impie;
  // Eau bénite : ne blesse que les impies, mais ignore leur Protection
  if (d.eauBenite && !impie) return { degats: 0, blessureGrave: false, cible, impie, protection: 0 };
  const protection = protectionDe(cible, c.deFace);
  const r = R.calculerDegats({ de: d.de, protection, brutal: d.brutal, sacre: d.sacre || d.eauBenite, impie, ignoreProtection: d.eauBenite });
  if (c.moitie) { r.degats = Math.floor(r.degats / 2); r.blessureGrave = r.degats >= 6; }
  return { ...r, cible, impie, protection: d.eauBenite ? 0 : protection };
}

async function rendreCarteDegats(d) {
  const attaquant = fromUuidSync(d.attaquant);
  const lignes = d.cibles.map((c, i) => {
    const r = degatsPour(d, c);
    if (!r) return null;
    return {
      i, nom: r.cible.name, img: r.cible.img, degats: r.degats, protection: r.protection, impie: r.impie,
      grave: r.blessureGrave, deFace: c.deFace, moitie: c.moitie, fait: c.applique != null,
      bouclier: r.cible.type === "personnage" && r.cible.system.protectionBouclier > 0
    };
  }).filter(Boolean);
  const tags = [];
  if (d.brutal) tags.push(loc("BREVIAIRE.Particularite.brutal"));
  if (d.sacre) tags.push(loc("BREVIAIRE.Particularite.sacree"));
  if (d.eauBenite) tags.push(loc("BREVIAIRE.Particularite.neBlesseQueImpie"));
  return renderTemplate(CARTE, {
    d, lignes, tags, zone: d.zone,
    acteur: { nom: attaquant?.name, img: attaquant?.img },
    titre: fmt("BREVIAIRE.Jet.degatsDe", { arme: d.arme })
  });
}

export function brancherCarteDegats(message, html) {
  const d = message.getFlag(SYSTEME, "degats");
  if (!d) return;
  html.querySelector(".brev-carte-jet")?.classList.add(themeSombre(game.settings.get(SYSTEME, "camp")) ? "brev-sombre" : "brev-clair");
  for (const el of html.querySelectorAll("[data-brev-degats]")) {
    const i = Number(el.closest("[data-cible]")?.dataset.cible);
    const cible = fromUuidSync(d.cibles[i]?.uuid);
    if (!cible?.isOwner) { el.remove(); continue; }
    el.addEventListener("click", async ev => {
      ev.preventDefault();
      el.disabled = true;
      await actionDegats(message, i, el.dataset.brevDegats);
    });
  }
}

async function actionDegats(message, i, action) {
  const d = foundry.utils.deepClone(message.getFlag(SYSTEME, "degats"));
  const c = d.cibles[i];
  if (!c || c.applique != null) return;
  if (action === "face") c.deFace = !c.deFace;
  else if (action === "moitie") c.moitie = !c.moitie;
  else if (action === "appliquer") {
    const r = degatsPour(d, c);
    c.applique = r.degats;
    await appliquerDegats(r.cible, r.degats, { blessureGrave: r.blessureGrave, nerfs: d.impie });
  }
  // La carte appartient à l'attaquant : le MJ la met à jour pour les joueurs (requête), sinon son auteur
  if (message.isOwner) return message.update({ content: await rendreCarteDegats(d), [`flags.${SYSTEME}.degats`]: d });
  return game.users.activeGM?.query("breviaire.carte", { messageId: message.id, type: "degats", d }, { timeout: 10000 });
}

/** Requête du MJ : réécrire une carte (dégâts ou opposition) au nom d'un joueur. */
export async function majCarte({ messageId, type, d }) {
  const message = game.messages.get(messageId);
  // Seules les cartes du système sont réécrites, et toujours depuis leurs données (jamais du HTML reçu)
  if (!game.user.isGM || !["degats", "jet"].includes(type) || !message?.getFlag(SYSTEME, type)) return false;
  if (type === "degats") await message.update({ content: await rendreCarteDegats(d), [`flags.${SYSTEME}.degats`]: d });
  if (type === "jet") {
    const { rendreCarte } = await import("../jets/moteur.mjs");
    await message.update({ content: await rendreCarte(d), [`flags.${SYSTEME}.jet`]: d });
  }
  return true;
}

/* -------------------------------------------- */
/*  Appliquer des dégâts                        */
/* -------------------------------------------- */

/**
 * Retire les Blessures. Blessure grave sur 6+ en un coup ou en tombant à 0 (sauf Insensible) :
 * 1d6 sur la table, test d'usure de Nerfs, phase lente. À 0 : hors de combat (personnage) ou vaincu (ennemi).
 */
export async function appliquerDegats(cible, degats, { blessureGrave = false, nerfs = false } = {}) {
  if (!cible) return;
  const avant = cible.system.blessures.value;
  const apres = Math.max(0, avant - degats);
  await cible.update({ "system.blessures.value": apres });
  // Viser : perdu si le tireur est touché avant de tirer (ch. IV §3)
  if (degats > 0) await etat(cible, "viseur", false);
  const tombe = avant > 0 && apres === 0;
  const insensible = cible.type === "ennemi" && cible.system.traits.has("insensible");
  const lignes = [fmt("BREVIAIRE.Combat.blessuresRetirees", { nom: cible.name, n: degats, reste: apres })];
  const rolls = [];
  let calice = false;

  if ((blessureGrave || tombe) && degats > 0 && !insensible) {
    const roll = await new Roll("1d6").evaluate();
    await game.dice3d?.showForRoll(roll, game.user, true);
    rolls.push(roll);
    const type = BLESSURES_GRAVES[roll.total - 1];
    lignes.push(`<b>${loc("BREVIAIRE.Combat.blessureGrave")} (${roll.total}) : ${loc(`BREVIAIRE.BlessureGrave.${type}`)}</b> — ${loc(`BREVIAIRE.Combat.effetGrave.${type}`)}`);
    if (cible.type === "personnage") {
      const graves = [...cible.system._source.blessuresGraves, { type, active: true, sequelle: "" }];
      const maj = { "system.blessuresGraves": graves };
      if (type === "mutilation") maj["system.usure.nerfs.value"] = Math.max(0, cible.system.usure.nerfs.value - 1);
      await cible.update(maj);
      if (type === "hemorragie") await etat(cible, "hemorragie", true);
      lignes.push(loc("BREVIAIRE.Combat.suitesGrave"));
      await perdreInitiative(cible);
    } else {
      await cible.update({ "system.blessuresGraves": [...cible.system.toObject().blessuresGraves, { type }] });
      if (type === "hemorragie") await etat(cible, "hemorragie", true);
    }
  }

  if (tombe) {
    if (cible.type === "personnage") {
      await etat(cible, "horsDeCombat", true);
      lignes.push(`<b>${loc("BREVIAIRE.Combat.horsDeCombat")}</b> ${loc("BREVIAIRE.Combat.horsDeCombatAide")}`);
    } else {
      await etat(cible, "dead", true);
      const c = game.combat?.combattantDe?.(cible);
      if (c && game.user.isGM) await c.update({ defeated: true });
      lignes.push(`<b>${loc("BREVIAIRE.Combat.vaincu")}</b>`);
      // Calice (Damnés) : une cible désignée notable par le MJ propose +1d6 (bouton du MJ, une fois par scène)
      if (cible.system.notable && game.settings.get(SYSTEME, "camp") === "damnes") calice = true;
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: cible }),
    rolls,
    content: `<div class="brev-carte-jet brev-carte-utilisation">${lignes.map(l => `<p class="brev-cj-texte">${l}</p>`).join("")}`
      + (calice ? `<div class="brev-cj-boutons"><button type="button" data-brev-calice><i class="fa-solid fa-wine-glass"></i> ${loc("BREVIAIRE.Combat.notable")}</button></div>` : "")
      + "</div>",
    flags: calice ? { [SYSTEME]: { calice: true } } : {}
  });

  // Test d'usure de Nerfs après la carte (personnage, Blessure grave)
  if ((rolls.length || (nerfs && degats > 0)) && cible.type === "personnage") {
    const { testUsure } = await import("../jets/usure.mjs");
    await testUsure(cible, "nerfs");
  }
}

/* -------------------------------------------- */
/*  Début de tour                               */
/* -------------------------------------------- */

const TABLE_PANIQUE = [null, "fuite", "fuite", "terre", "terre", "furie", "furie"];

/**
 * Au début du tour d'un combattant (MJ actif uniquement) : Hémorragie (−1 Blessure),
 * jet de Mort à faire (hors de combat), réaction de panique (1d6).
 */
export async function debutDeTour(combat) {
  if (game.user !== game.users.activeGM) return;
  const c = combat.combatant;
  const actor = c?.actor;
  if (!actor || c.defeated) return;
  // Embuscade : des ennemis surpris peuvent sauter le premier tour (choix du MJ)
  if (combat.round <= 1 && actor.type === "ennemi" && combat.getFlag(SYSTEME, "embuscade") === "ennemis-saute") {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte">${fmt("BREVIAIRE.Combat.surprisPasse", { nom: actor.name })}</p></div>` });
    return combat.nextTurn();
  }
  // Tir de suppression : les cibles de ce tireur sont libérées à son tour ; s'il est lui-même cloué, il doit réussir un jet
  const { liberer } = await import("./suppression.mjs");
  await liberer(combat, actor);
  if (actor.statuses.has("cloue")) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="brev-carte-jet brev-carte-utilisation brev-carte-tour"><p class="brev-cj-texte">${fmt("BREVIAIRE.Combat.suppression.tour", { nom: foundry.utils.escapeHTML(actor.name), jet: actor.type === "personnage" ? loc("BREVIAIRE.Carac.nerf") : loc("BREVIAIRE.Fiche.menace") })}</p>`
        + `<div class="brev-cj-boutons"><button type="button" data-brev-tour="cloue"><i class="fa-solid fa-person-rifle"></i> ${loc("BREVIAIRE.Combat.suppression.bouton")}</button></div></div>`,
      flags: { [SYSTEME]: { tour: { acteur: actor.uuid } } }
    });
  }
  // « À couvert » dure jusqu'à son prochain tour ; « A plongé » ne vaut que pour le tir reçu
  for (const id of ["aCouvert", "plonge"]) if (actor.statuses.has(id)) await actor.toggleStatusEffect(id, { active: false });
  const parties = [];
  const boutons = [];

  if (actor.statuses.has("hemorragie") && actor.system.blessures.value > 0) {
    await appliquerDegatsSimples(actor, 1);
    parties.push(fmt("BREVIAIRE.Combat.hemorragieTour", { nom: actor.name }));
  }

  if (actor.type === "personnage" && actor.system.blessures.value === 0 && !actor.system.mort.stabilise
      && !actor.statuses.has("stabilise") && actor.system.mort.echecs < 3) {
    parties.push(fmt("BREVIAIRE.Combat.jetDeMortTour", { nom: actor.name }));
    boutons.push({ action: "mort", icone: "fa-solid fa-skull", label: loc("BREVIAIRE.Jet.mort") });
  } else if (actor.statuses.has("panique")) {
    const immunise = actor.type === "ennemi" && (actor.system.traits.has("fanatique") || actor.system.traits.has("demon"));
    if (actor.type === "personnage") {
      // Le joueur choisit : la réaction de panique (1d6) ou, à la place, un jet d'Âme pour se reprendre (ch. IV §8)
      parties.push(fmt("BREVIAIRE.Combat.paniqueChoix", { nom: actor.name }));
      boutons.push({ action: "reaction", icone: "fa-solid fa-dice-six", label: loc("BREVIAIRE.Combat.reaction") });
      boutons.push({ action: "reprendre", icone: "fa-solid fa-hand-fist", label: loc("BREVIAIRE.Combat.seReprendre") });
    } else if (!immunise) parties.push(await reactionPanique());
  }
  if (!parties.length) return;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="brev-carte-jet brev-carte-utilisation brev-carte-tour"><p class="brev-cj-texte">${parties.join("</p><p class=\"brev-cj-texte\">")}</p>`
      + (boutons.length ? `<div class="brev-cj-boutons">${boutons.map(b => `<button type="button" data-brev-tour="${b.action}"><i class="${b.icone}"></i> ${b.label}</button>`).join("")}</div>` : "")
      + "</div>",
    flags: { [SYSTEME]: { tour: { acteur: actor.uuid } } }
  });
}

/** Réaction de panique : 1d6 sur la table (fuite, terré, furie). */
async function reactionPanique() {
  const roll = await new Roll("1d6").evaluate();
  await game.dice3d?.showForRoll(roll, game.user, true);
  const cle = TABLE_PANIQUE[roll.total];
  return `<b>${loc("BREVIAIRE.Etat.panique")} (${roll.total}) : ${loc(`BREVIAIRE.Combat.panique.${cle}.titre`)}</b> — ${loc(`BREVIAIRE.Combat.panique.${cle}.texte`)}`;
}

async function appliquerDegatsSimples(actor, n) {
  const apres = Math.max(0, actor.system.blessures.value - n);
  await actor.update({ "system.blessures.value": apres });
  if (apres === 0) await etat(actor, actor.type === "personnage" ? "horsDeCombat" : "dead", true);
}

/** Bouton du MJ : un ennemi notable est tombé, +1d6 au Calice (une fois par scène, retenue sur le combat). */
export function brancherCarteCalice(message, html) {
  if (!message.getFlag(SYSTEME, "calice")) return;
  html.querySelector(".brev-carte-jet")?.classList.add(themeSombre("damnes") ? "brev-sombre" : "brev-clair");
  const bouton = html.querySelector("[data-brev-calice]");
  if (!bouton) return;
  if (!game.user.isGM || message.getFlag(SYSTEME, "caliceDonne")) { bouton.remove(); return; }
  bouton.addEventListener("click", async ev => {
    ev.preventDefault();
    if (game.combat?.getFlag(SYSTEME, "notable")) return ui.notifications.warn(loc("BREVIAIRE.Combat.notableDeja"));
    bouton.disabled = true;
    const { demander } = await import("../reserve/reserve.mjs");
    const res = await demander("ajouter", { n: 1 });
    if (!res?.ok) return;
    await game.combat?.setFlag(SYSTEME, "notable", true);
    await message.setFlag(SYSTEME, "caliceDonne", true);
  });
}

export function brancherCarteTour(message, html) {
  const f = message.getFlag(SYSTEME, "tour");
  if (!f) return;
  html.querySelector(".brev-carte-jet")?.classList.add(themeSombre(game.settings.get(SYSTEME, "camp")) ? "brev-sombre" : "brev-clair");
  const actor = fromUuidSync(f.acteur);
  for (const b of html.querySelectorAll("[data-brev-tour]")) {
    if (!actor?.isOwner) { b.remove(); continue; }
    b.addEventListener("click", async ev => {
      ev.preventDefault();
      const { lancerJet } = await import("../jets/moteur.mjs");
      if (b.dataset.brevTour === "mort") return lancerJet(actor, { type: "mort" });
      if (b.dataset.brevTour === "cloue") {
        b.disabled = true;
        const { executerJet } = await import("../jets/moteur.mjs");
        return executerJet(actor, { type: "cloue", carac: actor.type === "personnage" ? "nerf" : null, titre: loc("BREVIAIRE.Combat.suppression.bouton") });
      }
      // Un seul des deux choix par tour : les boutons sont désactivés après le clic
      for (const autre of html.querySelectorAll("[data-brev-tour]")) autre.disabled = true;
      if (b.dataset.brevTour === "reprendre") return seReprendre(actor);
      if (b.dataset.brevTour === "reaction") {
        return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte">${await reactionPanique()}</p></div>` });
      }
    });
  }
}

/** Se reprendre (panique) : jet d'Âme (Endurcissement ou Volonté). Réussite : plus paniqué, Nerfs toujours épuisés. */
export async function seReprendre(actor) {
  const { lancerJet } = await import("../jets/moteur.mjs");
  const sys = actor.system;
  const specialite = sys.specialites.volonte.rang >= sys.specialites.endurcissement.rang ? "volonte" : "endurcissement";
  const message = await lancerJet(actor, { specialite, titre: loc("BREVIAIRE.Combat.seReprendre") });
  if (message?.getFlag(SYSTEME, "jet")?.reussite) await etat(actor, "panique", false);
}

/** Test de Nerfs d'un ennemi : jet de Menace ; échec → paniqué. Fanatique et Démon l'ignorent. */
export async function testNerfsEnnemi(actor) {
  const t = actor.system.traits;
  if (t.has("fanatique") || t.has("demon")) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte">${fmt("BREVIAIRE.Combat.immunisePeur", { nom: actor.name })}</p></div>` });
  }
  const { executerJet } = await import("../jets/moteur.mjs");
  const message = await executerJet(actor, { type: "nerfs", titre: loc("BREVIAIRE.Combat.testNerfs") });
  if (message && !message.getFlag(SYSTEME, "jet")?.reussite) await etat(actor, "panique", true);
}
