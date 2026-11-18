/**
 * Classes de documents du système.
 */

import { campDuMonde, terme } from "./lexique.mjs";
import * as R from "./logique/regles.mjs";
import { SYSTEME } from "./config.mjs";

export class BreviaireActor extends Actor {
  /** Valeurs par défaut à la création : camp de la campagne, token lié pour les personnages. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const maj = {};
    if (this.type === "personnage") {
      if (!data.system?.camp) maj["system.camp"] = campDuMonde();
      Object.assign(maj, {
        "prototypeToken.actorLink": true,
        "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        "prototypeToken.sight.enabled": true
      });
    } else if (this.type === "ennemi") {
      maj["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.HOSTILE;
    }
    maj["prototypeToken.bar1.attribute"] = "blessures";
    maj["prototypeToken.displayBars"] = CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;
    this.updateSource(maj);
  }

  /**
   * Corruption ou Faveur (ch. IX) : on retient le plus haut palier atteint ; on n'en redescend jamais
   * (sauf correction du MJ) ; chaque nouveau palier fait tirer une Marque ou un Don.
   */
  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    if (this.type !== "personnage") return;
    const nouvelle = foundry.utils.getProperty(changed, "system.corruption.value");
    if (nouvelle === undefined) return;
    const avant = this.system.corruption.value;
    let palier = foundry.utils.getProperty(changed, "system.corruption.palier") ?? this.system.corruption.palier;
    let apres = Math.clamp(Number(nouvelle) || 0, 0, R.CORRUPTION_MAX);
    if (apres < avant) {
      if (user.isGM) palier = Math.min(palier, R.palierDe(apres));  // correction du MJ
      else apres = Math.max(apres, palier);
    }
    const nouveaux = R.PALIERS.filter(p => p > palier && apres >= p);
    palier = Math.max(palier, R.palierDe(apres));
    foundry.utils.setProperty(changed, "system.corruption.value", apres);
    foundry.utils.setProperty(changed, "system.corruption.palier", palier);
    options.breviaire = { ...options.breviaire, paliers: nouveaux, perdu: avant < R.CORRUPTION_MAX && apres >= R.CORRUPTION_MAX };
  }

  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    if (userId !== game.user.id || this.type !== "personnage") return;
    const b = options.breviaire ?? {};
    if (b.paliers?.length && !b.sansMarque) {
      const { tirerArcane } = await import("./arcanes/arcanes.mjs");
      for (const p of b.paliers) await tirerArcane({ actor: this, contexte: "marque" });
    }
    if (b.perdu) {
      const camp = this.system.camp;
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="brev-carte-alerte"><h3><i class="fa-solid fa-skull"></i> ${terme("Perdu", camp)}</h3>`
          + `<p>${game.i18n.format(`BREVIAIRE.Corruption.chute.${camp}`, { nom: this.name })}</p></div>`
      });
    }
  }

  /** Corruption 10 : jusqu'à la fin de la scène, tous ses jets réussissent (ch. IX §5). */
  get perdu() {
    return this.type === "personnage" && this.system.corruption.value >= R.CORRUPTION_MAX;
  }

  /** Cible impie : dégâts doublés des armes Sacrées (ch. IV §6). */
  get impie() {
    return !!this.system.impie;
  }
}

export class BreviaireItem extends Item {}
