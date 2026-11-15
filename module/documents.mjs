/**
 * Classes de documents du système.
 */

import { campDuMonde } from "./lexique.mjs";

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

  /** Cible impie : dégâts doublés des armes Sacrées (ch. IV §6). */
  get impie() {
    return !!this.system.impie;
  }
}

export class BreviaireItem extends Item {}
