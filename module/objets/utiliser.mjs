/**
 * Bouton « Utiliser » des objets d'équipement.
 *
 * - soin : action Soigner (ch. IV §7) — jet de Médecine ; en cas de réussite, la carte propose d'appliquer
 *   les soins au patient : +1d6 Blessures, ou s'il est hors de combat, stabilisé et +1d4 Blessures.
 * - morphine : le patient ignore les effets de ses Blessures graves jusqu'à la fin de la scène.
 * - usure : un dé d'usure remonte (caisse de munitions, rations supplémentaires, ch. VI §5).
 * - consommable : on en retire un, et le chat le signale (fusées éclairantes…).
 * Le patient est le token ciblé (touche T, ou appui long avec Vade), sinon le personnage lui-même.
 */

import { SYSTEME } from "../config.mjs";
import { CRAN_MAX, faces } from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { lancerJet } from "../jets/moteur.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);

/** Patient : le premier token ciblé, sinon l'utilisateur lui-même. */
export function patient(actor) {
  const cible = game.user.targets.first()?.actor;
  return cible ?? actor;
}

export async function utiliserObjet(actor, objet) {
  const u = objet.system.utilisation;
  if (!u || u.type === "aucune") return objet.sheet.render(true);
  if (objet.system.quantite <= 0) {
    return ui.notifications.warn(fmt("BREVIAIRE.Utiliser.plusAucun", { objet: objet.name }));
  }

  if (u.type === "soin") {
    const cible = patient(actor);
    return lancerJet(actor, { type: "action", specialite: "medecine", soin: { objetId: objet.id, cible: cible.uuid, nom: cible.name } });
  }

  let texte;
  if (u.type === "morphine") {
    const cible = patient(actor);
    if (!cible.isOwner) return ui.notifications.warn(fmt("BREVIAIRE.Utiliser.pasLeDroit", { nom: cible.name }));
    if (cible.type === "personnage") await cible.update({ "system.usages.scene.morphine": true });
    texte = fmt("BREVIAIRE.Utiliser.morphine", { nom: cible.name });
  } else if (u.type === "usure") {
    if (actor.type !== "personnage") return;
    const cle = `system.usure.${u.usure}.value`;
    const avant = actor.system.usure[u.usure].value;
    const apres = Math.min(CRAN_MAX, avant + u.crans);
    await actor.update({ [cle]: apres });
    const libelle = u.usure === "foi" ? terme("Foi", actor.system.camp) : loc(`BREVIAIRE.Usure.${u.usure}`);
    texte = fmt("BREVIAIRE.Utiliser.usure", { usure: libelle, de: `d${faces(apres)}` });
  } else {
    texte = fmt("BREVIAIRE.Utiliser.consommable", { objet: objet.name });
  }

  if (u.consomme) await objet.update({ "system.quantite": Math.max(0, objet.system.quantite - 1) });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="brev-carte-jet brev-carte-utilisation">
      <header class="brev-cj-entete">${objet.img ? `<img src="${objet.img}" alt="">` : ""}<div><h3>${objet.name}</h3>
      ${u.consomme ? `<small>${fmt("BREVIAIRE.Utiliser.reste", { n: Math.max(0, objet.system.quantite) })}</small>` : ""}</div></header>
      <p class="brev-cj-texte">${texte}</p></div>`,
    flags: { [SYSTEME]: { utilisation: true } }
  });
}

/**
 * Applique les soins d'un jet de Médecine réussi (bouton de la carte).
 * Renvoie le texte de l'effet, ou null si rien n'a été fait.
 */
export async function appliquerSoins(d) {
  const cible = await fromUuid(d.soin.cible);
  if (!cible) return null;
  if (!cible.isOwner) {
    ui.notifications.warn(fmt("BREVIAIRE.Utiliser.pasLeDroit", { nom: cible.name }));
    return null;
  }
  const sys = cible.system;
  const horsDeCombat = sys.blessures.value === 0;
  const roll = await new Roll(horsDeCombat ? "1d4" : "1d6").evaluate();
  await game.dice3d?.showForRoll(roll, game.user, true);
  const valeur = Math.min(sys.blessures.max, sys.blessures.value + roll.total);
  const maj = { "system.blessures.value": valeur };
  if (horsDeCombat && cible.type === "personnage") Object.assign(maj, { "system.mort.stabilise": true, "system.mort.echecs": 0 });
  await cible.update(maj);
  return fmt(horsDeCombat ? "BREVIAIRE.Utiliser.stabilise" : "BREVIAIRE.Utiliser.soigne", { nom: cible.name, n: roll.total });
}

/** Relique (ou os de saint profané) : +Nd6 à la réserve commune, une fois par mission (ch. I §4, ch. VI §5). */
export async function utiliserRelique(actor, relique) {
  const { demander } = await import("../reserve/reserve.mjs");
  const camp = actor.system.camp ?? game.settings.get(SYSTEME, "camp");
  if (relique.system.utilisee) return ui.notifications.warn(fmt("BREVIAIRE.Utiliser.reliqueUtilisee", { objet: relique.name }));
  const n = relique.system.apport || 1;
  const res = await demander("ajouter", { n });
  if (!res.ok) return;
  await relique.update({ "system.utilisee": true });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="brev-carte-jet brev-carte-utilisation"><header class="brev-cj-entete">${relique.img ? `<img src="${relique.img}" alt="">` : ""}<div><h3>${relique.name}</h3></div></header>
      <p class="brev-cj-texte">${fmt("BREVIAIRE.Utiliser.relique", { n, reserve: terme("Chapelet", camp) })}</p></div>`
  });
}
