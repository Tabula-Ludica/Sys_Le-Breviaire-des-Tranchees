/**
 * Fiche d'objet : un entête commun et une partie propre au type.
 */

import {
  CAMPS, SPECIALITES, SUBSTITUTIONS, USURES, PARTICULARITES, CATEGORIES_ARME, TYPES_PROTECTION,
  NIVEAUX_RITE, OPPOSITIONS_RITE, UTILISATIONS
} from "../config.mjs";
import { terme } from "../lexique.mjs";
import { FicheBreviaire, CHEMIN, loc, choixLocalises, enrichir } from "./commun.mjs";

export class FicheObjet extends FicheBreviaire(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["objet"],
    position: { width: 620, height: 640 }
  };

  static PARTS = {
    entete: { template: `${CHEMIN}/objet/entete.hbs` },
    corps: { template: `${CHEMIN}/objet/corps.hbs`, scrollable: [""] }
  };

  /** Un arcane ou un rite appartient à un camp : il prend le thème de ce camp. */
  get camp() {
    return this.document.system.camp || game.settings.get("breviaire", "camp");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.document.system;
    const type = this.document.type;

    context.type = type;
    context.partieType = `${CHEMIN}/objet/${type}.hbs`;
    context.libelleType = loc(`TYPES.Item.${type}`);
    context.choix = {
      camps: choixLocalises(CAMPS, "BREVIAIRE.Camp"),
      campsOuCommun: { "": loc("BREVIAIRE.Fiche.commun"), ...choixLocalises(CAMPS, "BREVIAIRE.Camp") },
      categories: choixLocalises(CATEGORIES_ARME, "BREVIAIRE.CategorieArme"),
      particularites: choixLocalises(PARTICULARITES, "BREVIAIRE.Particularite"),
      typesProtection: choixLocalises(TYPES_PROTECTION, "BREVIAIRE.TypeProtection"),
      niveaux: choixLocalises(NIVEAUX_RITE, "BREVIAIRE.NiveauRite"),
      oppositions: choixLocalises(OPPOSITIONS_RITE, "BREVIAIRE.OppositionRite"),
      specialites: choixLocalises(Object.keys(SPECIALITES), "BREVIAIRE.Specialite"),
      specialitesOuAucune: { "": "—", ...choixLocalises(Object.keys(SPECIALITES), "BREVIAIRE.Specialite") },
      substitutions: choixLocalises(Object.keys(SUBSTITUTIONS), "BREVIAIRE.Substitution"),
      utilisations: choixLocalises(UTILISATIONS, "BREVIAIRE.Utilisation"),
      usures: Object.fromEntries(USURES.map(u => [u, u === "foi" ? terme("Foi", this.camp) : loc(`BREVIAIRE.Usure.${u}`)]))
    };
    // Valeurs des champs Set, en tableaux pour <multi-select>
    for (const champ of ["particularites", "specialites", "formes", "substitutions"]) {
      if (sys[champ] instanceof Set) context[`${champ}Liste`] = [...sys[champ]];
    }
    if (sys.usure) {
      context.usures = USURES.map(u => ({
        cle: u,
        nom: `system.usure.${u}`,
        label: u === "foi" ? terme("Foi", this.camp) : loc(`BREVIAIRE.Usure.${u}`),
        valeur: sys.usure[u]
      }));
    }
    if (type === "arcane") {
      context.libelles = { marque: terme("Marque", this.camp) };
    }
    for (const champ of ["description", "effet"]) {
      if (champ in sys) context[`${champ}HTML`] = await enrichir(sys[champ], this.document);
    }
    return context;
  }
}
