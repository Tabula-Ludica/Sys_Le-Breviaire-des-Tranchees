/**
 * Fiche d'ennemi : une seule page compacte, pensée pour que le MJ joue vite (ch. IV §10, ch. VII).
 */

import { TRAITS, ROLES_ENNEMI, CAMPS } from "../config.mjs";
import { FicheBreviaire, CHEMIN, loc, choixLocalises, enrichir } from "./commun.mjs";
import { lancerJet } from "../jets/moteur.mjs";

export class FicheEnnemi extends FicheBreviaire(foundry.applications.sheets.ActorSheetV2) {
  static MODE_EDITION = true;

  static DEFAULT_OPTIONS = {
    classes: ["ennemi"],
    position: { width: 520, height: 640 },
    actions: {
      jet: this.#jet,
      blessures: this.#blessures,
      trait: this.#trait,
      nerfs: this.#nerfs,
      guerir: this.#guerir
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
      suppression: i.system.categorie === "distance",
      portee: i.system.distance && i.system.porteeCourte != null
        ? `${i.system.porteeCourte} / ${i.system.porteeLongue ?? "—"} m` : "",
      particularites: [...i.system.particularites].map(p => loc(`BREVIAIRE.Particularite.${p}`)).join(", ")
    }));
    context.autres = this.document.items.filter(i => i.type !== "arme").map(i => ({ id: i.id, name: i.name, img: i.img }));
    context.notesHTML = await enrichir(sys.notes, this.document);
    context.isGM = game.user.isGM;
    context.graves = sys.blessuresGraves.map((b, i) => ({
      i, nom: loc(`BREVIAIRE.BlessureGrave.${b.type}`), effet: loc(`BREVIAIRE.Combat.effetGrave.${b.type}`)
    }));
    return context;
  }

  /** Une Blessure grave soignée ou oubliée : retirée de la liste. */
  static #guerir(event, target) {
    const liste = this.document.system.toObject().blessuresGraves;
    liste.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.blessuresGraves": liste });
  }

  /** Jet sous la Menace, avec ou sans arme. */
  static #jet(event, target) {
    return lancerJet(this.document, { type: "action", armeId: target.dataset.arme });
  }

  static async #nerfs() {
    const { testNerfsEnnemi } = await import("../combat/degats.mjs");
    return testNerfsEnnemi(this.document);
  }

  static #blessures(event, target) {
    const { value, max } = this.document.system.blessures;
    return this.document.update({ "system.blessures.value": Math.clamp(value + Number(target.dataset.delta), 0, max) });
  }

  static #trait(event, target) {
    if (!this.edition) return;
    const cle = target.dataset.trait;
    const traits = new Set(this.document.system.traits);
    traits.has(cle) ? traits.delete(cle) : traits.add(cle);
    return this.document.update({ "system.traits": [...traits] });
  }
}
