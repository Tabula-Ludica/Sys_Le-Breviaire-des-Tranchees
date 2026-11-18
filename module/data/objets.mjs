/**
 * Modèles de données des objets : arme, protection, équipement, relique, arcane, rite, origine, affectation.
 */

import {
  CAMPS, SPECIALITES, SUBSTITUTIONS, USURES, PARTICULARITES, CATEGORIES_ARME, TYPES_PROTECTION,
  NIVEAUX_RITE, OPPOSITIONS_RITE, UTILISATIONS
} from "../config.mjs";

const f = foundry.data.fields;

const entier = (initial, min, max) => new f.NumberField({ required: true, nullable: false, integer: true, initial, min, max });
const metres = (initial = null) => new f.NumberField({ required: true, nullable: true, min: 0, initial });
const texte = (initial = "") => new f.StringField({ required: true, blank: true, initial });
const choix = (choices, initial) => new f.StringField({ required: true, blank: false, choices, initial });
const html = () => new f.HTMLField({ required: true, blank: true });
/** Camp facultatif : vide = commun aux deux camps. */
const campOuCommun = () => new f.StringField({ required: true, blank: true, choices: ["", ...CAMPS], initial: "" });
const specialites = () => new f.SetField(new f.StringField({ choices: Object.keys(SPECIALITES) }));
const substitutions = () => new f.SetField(new f.StringField({ choices: Object.keys(SUBSTITUTIONS) }));
/** Ajustements de dés d'usure, en crans (ch. VIII). */
const ajustementsUsure = () => new f.SchemaField(Object.fromEntries(USURES.map(u => [u, entier(0, -4, 4)])));

export class ArmeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      categorie: choix(CATEGORIES_ARME, "melee"),
      degats: new f.StringField({ required: true, blank: false, initial: "1d6" }),
      porteeCourte: metres(),
      porteeLongue: metres(),
      allonge: metres(1.5),
      zone: metres(),
      particularites: new f.SetField(new f.StringField({ choices: PARTICULARITES })),
      // null : l'arme passe par le dé de Munitions ; un nombre : comptée à l'unité (grenades, charges)
      quantite: new f.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
      equipee: new f.BooleanField({ initial: true }),
      description: html()
    };
  }

  get sacree() { return this.particularites.has("sacree"); }
  get distance() { return ["distance", "lancer"].includes(this.categorie); }
}

export class ProtectionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: choix(TYPES_PROTECTION, "casque"),
      valeur: entier(1, 0, 10),
      lourde: new f.BooleanField(),
      equipee: new f.BooleanField({ initial: true }),
      description: html()
    };
  }
}

export class EquipementData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      quantite: entier(1, 0, 999),
      camp: campOuCommun(),
      // Ce que fait le bouton « Utiliser » : soigner (jet de Médecine), morphine, remonter un dé d'usure…
      utilisation: new f.SchemaField({
        type: choix(UTILISATIONS, "aucune"),
        usure: choix(USURES, "munitions"),
        crans: entier(1, 1, 4),
        consomme: new f.BooleanField({ initial: false })
      }),
      description: html()
    };
  }
}

/** Relique (Fidèles) ou objet profané (Damnés) : nourrit la réserve commune, une fois par mission. */
export class ReliqueData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      camp: campOuCommun(),
      apport: entier(1, 0, 6),
      utilisee: new f.BooleanField(),
      description: html()
    };
  }
}

/**
 * Arcane du Paquet du Destin. Dans un compendium ou un paquet, c'est la carte de référence ;
 * porté par un personnage, c'est une Marque (Fidèles) ou un Don (Damnés).
 */
export class ArcaneData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const effet = () => new f.SchemaField({ titre: texte(), texte: texte() });
    return {
      numero: entier(1, 1, 22),
      camp: choix(CAMPS, "fideles"),
      sens: texte(),
      grace: effet(),
      damnation: effet(),
      marque: effet(),
      // Bonus permanents de la Marque ou du Don (« +2 en Commandement et en Intimidation »), ajoutés aux scores
      bonus: new f.ArrayField(new f.SchemaField({
        specialite: new f.StringField({ required: true, choices: Object.keys(SPECIALITES) }),
        valeur: entier(2, -6, 6)
      }))
    };
  }

  get chiffre() {
    return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
      "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"][this.numero];
  }
}

export class RiteData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      camp: choix(CAMPS, "fideles"),
      niveau: choix(NIVEAUX_RITE, "mineur"),
      portee: metres(),
      duree: texte(),
      opposition: choix(OPPOSITIONS_RITE, "aucune"),
      // Spécialité du jet : Ferveur en général, Exorcisme pour l'Exorcisme (ch. X)
      specialite: choix(Object.keys(SPECIALITES), "ferveur"),
      horsCombat: new f.BooleanField(),
      effet: html()
    };
  }
}

export class OrigineData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      camp: choix(CAMPS, "fideles"),
      cle: texte(),
      specialites: specialites(),
      // Lignée (Sultanat), procession (Pèlerins) ou ancienne Origine (Transfuge)
      titreOption: texte(),
      options: new f.ArrayField(new f.SchemaField({ cle: texte(), nom: texte(), specialites: specialites() })),
      particularite: new f.SchemaField({ nom: texte(), texte: texte() }),
      substitutions: substitutions(),
      usure: ajustementsUsure(),
      protectionNaturelle: entier(0, 0, 5),
      corruptionDepart: entier(0, 0, 9),
      description: html()
    };
  }
}

export class AffectationData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      camp: campOuCommun(),
      cle: texte(),
      expert: new f.StringField({ required: true, blank: true, choices: ["", ...Object.keys(SPECIALITES)], initial: "" }),
      formes: specialites(),
      substitutions: substitutions(),
      dotation: texte(),
      dotationUuids: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      usure: ajustementsUsure(),
      note: texte(),
      description: html()
    };
  }
}
