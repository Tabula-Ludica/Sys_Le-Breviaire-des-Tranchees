/**
 * L'initiative par phases (ch. IV §2).
 * Chaque personnage fait un jet de Nerf (sans dialogue) : réussite → phase rapide (3), échec → phase lente (1).
 * Tous les ennemis jouent en phase 2. La phase « de fond » est gardée dans flags.breviaire.phase ;
 * l'initiative affichée en découle, avec les exceptions du premier tour :
 *  - Assaut éclair (origine Prusse) : 4 au premier tour, une fois par mission ;
 *  - Embuscade : le camp surpris passe en phase lente au premier tour (ennemis : 0,5, après les personnages lents).
 * Reprendre l'initiative : un personnage en phase lente relance son Nerf ; réussite → rapide au tour suivant.
 * Perdre l'initiative : Blessure grave ou panique → phase lente tout de suite.
 */

import { SYSTEME } from "../config.mjs";
import * as R from "../logique/regles.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);

export class BreviaireCombat extends Combat {
  /** Jet d'initiative : Nerf pour les personnages, phase 2 pour les ennemis. */
  async rollInitiative(ids, options = {}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const { executerJet } = await import("../jets/moteur.mjs");
    const majs = [];
    for (const id of ids) {
      const c = this.combatants.get(id);
      if (!c?.isOwner) continue;
      const actor = c.actor;
      let phase = R.PHASES.ennemis;
      if (actor?.type === "personnage") {
        const message = await executerJet(actor, { type: "initiative", carac: "nerf", titre: loc("BREVIAIRE.Combat.initiative") });
        phase = message?.getFlag(SYSTEME, "jet")?.reussite ? R.PHASES.rapide : R.PHASES.lente;
        if (actor.statuses.has("panique")) phase = R.PHASES.lente;
      }
      majs.push({ _id: id, [`flags.${SYSTEME}.phase`]: phase });
    }
    if (majs.length) await this.updateEmbeddedDocuments("Combatant", majs);
    await this.appliquerPhases();
    return this;
  }

  /** Initiative affichée de chaque combattant selon sa phase et le tour en cours. */
  initiativeDe(c, round = this.round) {
    const f = c.flags?.[SYSTEME] ?? {};
    if (f.phase == null) return null;
    if (round <= 1) {
      if (f.eclair) return R.PHASES.eclair;
      const surpris = this.getFlag(SYSTEME, "embuscade");
      const pj = c.actor?.type === "personnage";
      if (surpris === "pj" && pj) return R.PHASES.lente;
      if (surpris === "ennemis" && !pj) return 0.5;
    }
    return f.phase;
  }

  async appliquerPhases(round = this.round) {
    // Un joueur ne peut modifier que ses propres combattants
    const majs = this.combatants.filter(c => c.isOwner).map(c => ({ _id: c.id, initiative: this.initiativeDe(c, round) }))
      .filter(m => m.initiative !== null && m.initiative !== this.combatants.get(m._id).initiative);
    if (majs.length) await this.updateEmbeddedDocuments("Combatant", majs);
  }

  async nextRound() {
    // Assaut éclair et embuscade ne durent qu'un tour ; une initiative reprise compte au tour suivant.
    // Les phases changent avant le changement de tour, pour que le tour suivant commence par le bon combattant.
    // Un joueur ne peut pas modifier les autres combattants : il demande au MJ actif de passer le tour.
    if (!game.user.isGM && game.users.activeGM) {
      await game.users.activeGM.query("breviaire.tourSuivant", { combatId: this.id }, { timeout: 10000 });
      return this;
    }
    await this.appliquerPhases(this.round + 1);
    return super.nextRound();
  }

  /** Embuscade : « pj » ou « ennemis » sont surpris au premier tour (ou null). */
  async embuscade(camp) {
    await this.setFlag(SYSTEME, "embuscade", camp);
    await this.appliquerPhases();
    ChatMessage.create({ content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte">${camp ? loc(`BREVIAIRE.Combat.embuscade.${camp}`) : loc("BREVIAIRE.Combat.embuscade.aucune")}</p></div>` });
  }

  combattantDe(actor) {
    return this.combatants.find(c => c.actor === actor || c.actorId === actor.id);
  }
}

/** Requête du MJ : passer au tour suivant pour un joueur, seulement quand plus personne ne doit jouer ce tour-ci. */
export async function tourSuivant({ combatId }) {
  const combat = game.combats.get(combatId);
  if (!game.user.isGM || !combat?.started) return false;
  if (combat.turns.slice((combat.turn ?? 0) + 1).some(c => !c.defeated)) return false;
  await combat.nextRound();
  return true;
}

/* -------------------------------------------- */
/*  Actions de combat d'un personnage           */
/* -------------------------------------------- */

function combatEtCombattant(actor) {
  const combat = game.combat;
  const c = combat?.combattantDe?.(actor);
  return { combat, c };
}

/** Le personnage peut-il lancer un Assaut éclair ? (origine Prusse, premier tour, une fois par mission) */
export function assautEclairPossible(actor) {
  const { combat, c } = combatEtCombattant(actor);
  return !!c && actor.system.origine?.cle === "prusse" && combat.round <= 1 && !actor.system.usages.mission?.assautEclair
    && !c.getFlag(SYSTEME, "eclair");
}

export async function assautEclair(actor) {
  if (!assautEclairPossible(actor)) return;
  const { c } = combatEtCombattant(actor);
  await actor.update({ "system.usages.mission.assautEclair": true });
  await c.update({ [`flags.${SYSTEME}.eclair`]: true, [`flags.${SYSTEME}.phase`]: c.getFlag(SYSTEME, "phase") ?? R.PHASES.lente });
  await c.update({ initiative: R.PHASES.eclair });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte"><i class="fa-solid fa-bolt"></i> ${fmt("BREVIAIRE.Combat.assautEclairTexte", { nom: actor.name })}</p></div>` });
}

/** Reprendre l'initiative (phase lente seulement) : nouveau jet de Nerf, réussite → phase rapide au tour suivant. */
export async function reprendreInitiative(actor) {
  const { c } = combatEtCombattant(actor);
  if (!c || c.getFlag(SYSTEME, "phase") !== R.PHASES.lente) return ui.notifications.warn(loc("BREVIAIRE.Combat.pasLente"));
  const { executerJet } = await import("../jets/moteur.mjs");
  const message = await executerJet(actor, { type: "initiative", carac: "nerf", titre: loc("BREVIAIRE.Combat.reprendre") });
  if (message?.getFlag(SYSTEME, "jet")?.reussite) await c.setFlag(SYSTEME, "phase", R.PHASES.rapide);
}

/** Perdre l'initiative : Blessure grave ou panique → phase lente, tout de suite. */
export async function perdreInitiative(actor) {
  const { c } = combatEtCombattant(actor);
  if (!c || !c.isOwner) return;
  if (c.getFlag(SYSTEME, "phase") == null) return;
  await c.update({ [`flags.${SYSTEME}.phase`]: R.PHASES.lente, [`flags.${SYSTEME}.eclair`]: false, initiative: R.PHASES.lente });
}

export function phaseDe(actor) {
  const { c } = combatEtCombattant(actor);
  return c ? c.initiative : null;
}
