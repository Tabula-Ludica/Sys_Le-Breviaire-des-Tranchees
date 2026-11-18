/**
 * États du combat (ch. IV §1) : ils remplacent les états de Foundry.
 * Paniqué, Hors de combat, Hémorragie, Immobilisé, Viseur, Stabilisé, plus « À couvert » (action Se mettre à couvert),
 * « A plongé » (réaction Plonger) et « Mort ».
 */

export const ETATS_COMBAT = [
  { id: "panique", img: "icons/svg/terror.svg" },
  { id: "horsDeCombat", img: "icons/svg/unconscious.svg" },
  { id: "hemorragie", img: "icons/svg/blood.svg" },
  { id: "immobilise", img: "icons/svg/net.svg" },
  { id: "viseur", img: "icons/svg/target.svg" },
  { id: "aCouvert", img: "icons/svg/shield.svg" },
  { id: "plonge", img: "icons/svg/falling.svg" },
  { id: "stabilise", img: "icons/svg/regen.svg" },
  { id: "enflamme", img: "icons/svg/fire.svg" },
  { id: "dead", img: "icons/svg/skull.svg" }
];

export function enregistrerEtats() {
  CONFIG.statusEffects = ETATS_COMBAT.map(e => ({ ...e, name: `BREVIAIRE.Etat.${e.id}` }));
  CONFIG.specialStatusEffects.DEFEATED = "dead";
}

/** Active ou retire un état, sans erreur si l'acteur n'a pas de jeton. */
export async function etat(actor, id, active = true) {
  if (!actor || actor.statuses?.has(id) === active) return;
  return actor.toggleStatusEffect(id, { active });
}
