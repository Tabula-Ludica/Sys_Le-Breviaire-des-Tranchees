/**
 * Tir de suppression (ch. IV §4) : pas de jet de Tir, test de Munitions défavorisé.
 * Fusil, carabine ou pistolet : une cible clouée ; arme à Rafale : jusqu'à 3 cibles (à 3 m ou moins
 * les unes des autres, au jugement du MJ). La cible reste clouée jusqu'au prochain tour du tireur.
 * Fanatique et Démon ignorent la suppression.
 */

import { SYSTEME } from "../config.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
const IMG = "icons/svg/downgrade.svg";

const insensible = a => a.type === "ennemi" && (a.system.traits.has("fanatique") || a.system.traits.has("demon"));

export async function tirDeSuppression(actor, arme) {
  if (arme?.system.categorie !== "distance") return;
  if (actor.type === "personnage" && actor.system.usure.munitions.value === 0) {
    return ui.notifications.warn(loc("BREVIAIRE.Combat.sansMunitions"));
  }
  const max = arme.system.particularites.has("rafale") ? 3 : 1;
  const visees = [...game.user.targets].map(t => t.actor).filter(a => a && a !== actor);
  if (!visees.length) return ui.notifications.warn(loc("BREVIAIRE.Combat.suppression.sansCible"));
  if (visees.length > max) ui.notifications.warn(fmt("BREVIAIRE.Combat.suppression.trop", { n: max }));
  const cibles = visees.slice(0, max);
  const clouees = cibles.filter(a => !insensible(a));

  const lignes = cibles.map(a => insensible(a)
    ? fmt("BREVIAIRE.Combat.suppression.ignore", { nom: foundry.utils.escapeHTML(a.name) })
    : fmt("BREVIAIRE.Combat.suppression.cloue", { nom: foundry.utils.escapeHTML(a.name) }));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="brev-carte-jet brev-carte-utilisation"><h3><i class="fa-solid fa-wind"></i> ${fmt("BREVIAIRE.Combat.suppression.titre", { arme: foundry.utils.escapeHTML(arme.name) })}</h3>`
      + lignes.map(l => `<p class="brev-cj-texte">${l}</p>`).join("") + "</div>"
  });

  // Les cibles appartiennent souvent au MJ : c'est lui qui pose le statut
  const donnees = { tireur: actor.uuid, cibles: clouees.map(a => a.uuid) };
  if (game.user.isGM) await clouer(donnees);
  else await game.users.activeGM?.query("breviaire.clouer", donnees, { timeout: 10000 });

  // Pas de jet de Tir, mais le test de Munitions est défavorisé (les ennemis n'en font pas)
  if (actor.type === "personnage") {
    const { testUsure } = await import("../jets/usure.mjs");
    await testUsure(actor, "munitions", { defavorise: true });
  }
}

/** Requête du MJ : pose le statut Cloué, avec le tireur en mémoire pour le retirer à son prochain tour. */
export async function clouer({ tireur, cibles }) {
  if (!game.user.isGM) return false;
  for (const uuid of cibles ?? []) {
    const cible = await fromUuid(uuid);
    if (!cible || insensible(cible)) continue;
    await cible.createEmbeddedDocuments("ActiveEffect", [{
      name: loc("BREVIAIRE.Etat.cloue"), img: IMG, statuses: ["cloue"],
      flags: { [SYSTEME]: { tireur } }
    }]);
  }
  return true;
}

/** Début du tour d'un tireur : les cibles qu'il clouait sont libérées. */
export async function liberer(combat, tireur) {
  for (const c of combat.combatants) {
    const effets = c.actor?.effects.filter(e => e.statuses.has("cloue") && e.getFlag(SYSTEME, "tireur") === tireur.uuid) ?? [];
    if (effets.length) await c.actor.deleteEmbeddedDocuments("ActiveEffect", effets.map(e => e.id));
  }
}
