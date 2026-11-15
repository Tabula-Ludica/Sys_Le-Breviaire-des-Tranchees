/**
 * Fiche d'ennemi : une seule page compacte, pensée pour que le MJ joue vite (ch. IV §10, ch. VII).
 */

import { TRAITS, ROLES_ENNEMI, CAMPS } from "../config.mjs";
import { FicheBreviaire, CHEMIN, loc, choixLocalises, enrichir } from "./commun.mjs";

export class FicheEnnemi extends FicheBreviaire(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ennemi"],
    position: { width: 520, height: 640 },
    actions: {
      jet: this.#jet,
      blessures: this.#blessures,
      trait: this.#trait
    }
  };

  static PARTS = {
    fiche: { template: `${CHEMIN}/acteur/ennemi.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.document.system;

    context.traits = TRAITS.map(cle => ({
      cle,
      label: loc(`BREVIAIRE.Trait.${cle}`),
      actif: sys.traits.has(cle)
    }));
    context.roles = choixLocalises(ROLES_ENNEMI, "BREVIAIRE.RoleEnnemi");
    context.camps = choixLocalises(CAMPS, "BREVIAIRE.Camp");
    context.attaques = this.document.items.filter(i => i.type === "arme").map(i => ({
      id: i.id, name: i.name, img: i.img,
      degats: i.system.degats,
      portee: i.system.distance && i.system.porteeCourte != null
        ? `${i.system.porteeCourte} / ${i.system.porteeLongue ?? "—"} m` : "",
      particularites: [...i.system.particularites].map(p => loc(`BREVIAIRE.Particularite.${p}`)).join(", ")
    }));
    context.autres = this.document.items.filter(i => i.type !== "arme").map(i => ({ id: i.id, name: i.name, img: i.img }));
    context.notesHTML = await enrichir(sys.notes, this.document);
    return context;
  }

  static #jet() {
    ui.notifications.info("BREVIAIRE.Fiche.jetBientot", { localize: true });
  }

  static #blessures(event, target) {
    const { value, max } = this.document.system.blessures;
    return this.document.update({ "system.blessures.value": Math.clamp(value + Number(target.dataset.delta), 0, max) });
  }

  static #trait(event, target) {
    const cle = target.dataset.trait;
    const traits = new Set(this.document.system.traits);
    traits.has(cle) ? traits.delete(cle) : traits.add(cle);
    return this.document.update({ "system.traits": [...traits] });
  }
}
