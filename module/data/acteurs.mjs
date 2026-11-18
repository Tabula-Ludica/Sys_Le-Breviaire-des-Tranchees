/**
 * Modèles de données des acteurs : personnage et ennemi.
 */

import {
  CAMPS, CARACS, SPECIALITES, SUBSTITUTIONS, USURES, RANGS, BLESSURES_GRAVES, TRAITS, ROLES_ENNEMI, DEPLACEMENT
} from "../config.mjs";
import * as R from "../logique/regles.mjs";

const f = foundry.data.fields;

const entier = (initial, min, max) => new f.NumberField({ required: true, nullable: false, integer: true, initial, min, max });
const texte = (initial = "") => new f.StringField({ required: true, blank: true, initial });
const choix = (choices, initial) => new f.StringField({ required: true, blank: false, choices, initial });
const jauge = (initial, max) => new f.SchemaField({ value: entier(initial, 0, max), max: entier(initial, 0, max) });

/* -------------------------------------------- */
/*  Personnage                                  */
/* -------------------------------------------- */

export class PersonnageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const arcaneCreation = () => new f.SchemaField({ uuid: texte(), reponse: texte() });

    return {
      camp: choix(CAMPS, "fideles"),
      origine: new f.SchemaField({ cle: texte(), option: texte(), nom: texte() }),
      affectation: new f.SchemaField({ cle: texte(), nom: texte() }),
      rang: choix(RANGS, "conscrit"),

      caracs: new f.SchemaField(Object.fromEntries(CARACS.map(c => [c, entier(10, 1, 20)]))),

      specialites: new f.SchemaField(Object.fromEntries(Object.keys(SPECIALITES).map(s => [s,
        new f.SchemaField({ rang: entier(0, 0, 2), coche: new f.BooleanField() })]))),
      substitutions: new f.SetField(new f.StringField({ choices: Object.keys(SUBSTITUTIONS) })),

      // cran : 0 épuisé, 1 d4 … 5 d12 ; base : le dé de la création, cible du ravitaillement (ch. VI)
      usure: new f.SchemaField(Object.fromEntries(USURES.map(u => [u,
        new f.SchemaField({ value: entier(R.CRAN_DEPART, 0, R.CRAN_MAX), base: entier(R.CRAN_DEPART, 1, R.CRAN_MAX) })]))),

      // max recalculé à chaque préparation (= Chair), mais présent dans le schéma pour la barre du token
      blessures: jauge(10, 99),
      blessuresGraves: new f.ArrayField(new f.SchemaField({
        type: choix(BLESSURES_GRAVES, "commotion"),
        active: new f.BooleanField({ initial: true }),
        sequelle: texte()
      })),
      mort: new f.SchemaField({ echecs: entier(0, 0, 3), stabilise: new f.BooleanField() }),

      // Corruption (Fidèles) ou Faveur (Damnés). palier : le plus haut jamais atteint (3, 6 ou 9).
      corruption: new f.SchemaField({ value: entier(0, 0, R.CORRUPTION_MAX), palier: entier(0, 0, 9) }),
      soupcon: new f.SchemaField({ confession: new f.BooleanField(), marqueVue: new f.BooleanField() }),
      disgrace: new f.SchemaField({ ordresRefuses: entier(0, 0, 99), missionEchouee: new f.BooleanField() }),
      excommunie: new f.BooleanField(),

      protectionNaturelle: entier(0, 0, 10),

      arcanesCreation: new f.SchemaField({ passe: arcaneCreation(), serment: arcaneCreation(), peche: arcaneCreation() }),

      missions: entier(0, 0, 999),

      // Usages limités : { mission: { discipline: true, … }, session: { tentation: true, … } }
      usages: new f.SchemaField({ mission: new f.ObjectField(), session: new f.ObjectField(), scene: new f.ObjectField() }),

      histoire: new f.SchemaField({
        surnom: texte(), detail: texte(), lien: texte(),
        biographie: new f.HTMLField({ required: true, blank: true })
      })
    };
  }

  prepareDerivedData() {
    const items = this.parent.items;

    this.blessures.max = this.caracs.chair;
    this.blessures.value = Math.min(this.blessures.value, this.blessures.max);

    // Bonus permanents des Marques et des Dons (« +2 en Tromperie »)
    this.bonusSpecialites = {};
    for (const m of items.filter(i => i.type === "arcane")) {
      for (const b of m.system.bonus ?? []) this.bonusSpecialites[b.specialite] = (this.bonusSpecialites[b.specialite] ?? 0) + b.valeur;
    }

    // Scores calculés de chaque Spécialité et de chaque substitution possédée (sans situation)
    const score = (carac, spe) => Math.min(R.SCORE_MAX,
      R.calculerScore({ carac: this.caracs[carac], rang: this.specialites[spe].rang }).score + (this.bonusSpecialites[spe] ?? 0));
    this.scores = {};
    for (const [spe, carac] of Object.entries(SPECIALITES)) this.scores[spe] = score(carac, spe);
    this.scoresSubstitution = {};
    for (const sub of this.substitutions) {
      const { specialite, carac } = SUBSTITUTIONS[sub];
      this.scoresSubstitution[sub] = score(carac, specialite);
    }

    for (const u of USURES) this.usure[u].faces = R.faces(this.usure[u].value);

    this.deSang = R.deSang(this.corruption.value);
    this.etat = R.etatCorruption(this.corruption.value);
    this.titre = R.titreDe(this.missions);

    // Protection : la meilleure protection portée (la cuirasse remplace le casque), + bouclier, + naturelle
    const portees = items.filter(i => i.type === "protection" && i.system.equipee);
    const corps = portees.filter(i => ["casque", "armure"].includes(i.system.type));
    this.protection = Math.max(0, ...corps.map(i => i.system.valeur)) + this.protectionNaturelle
      + portees.filter(i => i.system.type === "naturelle").reduce((s, i) => s + i.system.valeur, 0);
    this.protectionBouclier = portees.filter(i => i.system.type === "bouclier").reduce((s, i) => s + i.system.valeur, 0);
    this.armureLourde = corps.some(i => i.system.lourde);
    this.deplacement = this.armureLourde ? DEPLACEMENT.lourd : DEPLACEMENT.normal;

    // Impie (ch. IV §6) : au moins une Marque ou un Don, ou Possédé
    this.marques = items.filter(i => i.type === "arcane");
    this.impie = this.marques.length > 0 || this.affectation.cle === "possede";
  }

  getRollData() {
    return { ...this.caracs, scores: this.scores, deSang: this.deSang, corruption: this.corruption.value };
  }
}

/* -------------------------------------------- */
/*  Ennemi                                      */
/* -------------------------------------------- */

export class EnnemiData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      camp: choix(CAMPS, "damnes"),
      role: choix(ROLES_ENNEMI, "chair"),
      menace: entier(10, 1, 19),
      blessures: jauge(8, 999),
      protection: entier(0, 0, 20),
      deplacement: new f.NumberField({ required: true, nullable: false, min: 0, initial: DEPLACEMENT.normal }),
      traits: new f.SetField(new f.StringField({ choices: TRAITS })),
      traitsLibres: texte(),
      notes: new f.HTMLField({ required: true, blank: true })
    };
  }

  prepareDerivedData() {
    this.blessures.value = Math.min(this.blessures.value, this.blessures.max);
    this.impie = this.traits.has("demon") || this.traits.has("impie");
    this.insensiblePeur = this.traits.has("demon") || this.traits.has("fanatique");
  }

  getRollData() {
    return { menace: this.menace, protection: this.protection };
  }
}
