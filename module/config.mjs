/**
 * Les listes fixes du jeu (ch. II, IV, VII). Pas d'appel à Foundry : ce fichier est aussi lu par les tests
 * et par les outils de génération des compendiums. Les libellés sont des clés de lang/fr.json.
 */

export const SYSTEME = "breviaire";
export const CAMPS = ["fideles", "damnes"];

export const CARACS = ["chair", "nerf", "esprit", "verbe", "ame"];

/** Les 27 Spécialités et leur caractéristique habituelle (ch. II §3). */
export const SPECIALITES = {
  melee: "chair", terrassement: "chair", endurance: "chair", portage: "chair", athletisme: "chair",
  tir: "nerf", lancer: "nerf", discretion: "nerf", esquive: "nerf", conduite: "nerf", coupDeMain: "nerf",
  medecine: "esprit", mecanique: "esprit", explosifs: "esprit", tactique: "esprit", vigilance: "esprit", erudition: "esprit",
  commandement: "verbe", persuasion: "verbe", tromperie: "verbe", intimidation: "verbe", debrouille: "verbe",
  ferveur: "ame", exorcisme: "ame", pressentiment: "ame", endurcissement: "ame", volonte: "ame"
};

/** Les substitutions (ch. II §4) : une Spécialité utilisée avec une autre caractéristique. */
export const SUBSTITUTIONS = {
  precheAuxArmes: { specialite: "commandement", carac: "ame" },
  brute: { specialite: "intimidation", carac: "chair" },
  calculBalistique: { specialite: "tir", carac: "esprit" },
  chirurgienDeTranchee: { specialite: "medecine", carac: "nerf" },
  instinctDeLaBete: { specialite: "vigilance", carac: "ame" }
};

export const RANGS_SPECIALITE = [0, 1, 2]; // non maîtrisée, Formé, Expert

/** Les quatre dés d'usure ; « foi » s'affiche « Haine » chez les Damnés. */
export const USURES = ["munitions", "foi", "vivres", "nerfs"];

/** Rangs hiérarchiques ; libellés selon le camp. */
export const RANGS = ["conscrit", "sousofficier", "officier", "prelat"];

/** Difficultés du MJ (ch. I). */
export const DIFFICULTES = { facile: 2, normale: 0, difficile: -2, desesperee: -5 };
/** Couvert et portée (ch. IV §4). */
export const COUVERTS = { aucun: 0, leger: -2, lourd: -5 };
export const PORTEES = { courte: 0, longue: -2 };

/** Traits des ennemis (ch. VII §1). */
export const TRAITS = [
  "effroi", "demon", "impie", "sacre", "fanatique", "insensible",
  "meute", "chef", "lunette", "lourd", "grand", "rapide"
];

/** Particularités des armes (ch. IV §6, ch. X des Damnés). */
export const PARTICULARITES = [
  "brutal", "allonge", "rafale", "lourde", "sacree", "impie",
  "discret", "deuxMains", "lunette", "enflamme", "baionnette", "contact", "zone", "neBlesseQueImpie"
];

export const CATEGORIES_ARME = ["melee", "distance", "lancer", "explosif"];
export const TYPES_PROTECTION = ["casque", "armure", "bouclier", "naturelle"];

/** Blessures graves (ch. IV §7), d6. */
export const BLESSURES_GRAVES = ["commotion", "bras", "jambe", "oeil", "hemorragie", "mutilation"];

/** États de la table (ch. IV §1). */
export const ETATS = ["panique", "horsDeCombat", "hemorragie", "immobilise", "viseur", "stabilise"];

/** Rôles des ennemis (ch. VII §4). */
export const ROLES_ENNEMI = ["chair", "aguerri", "elite", "monstre"];

export const NIVEAUX_RITE = ["mineur", "grand"];
export const OPPOSITIONS_RITE = ["aucune", "menace", "ame"];

/** Déplacements (ch. IV §3), en mètres. */
export const DEPLACEMENT = { normal: 9, lourd: 6, ramper: 3, porter: 4.5, rapide: 15 };

/** Utilisations d'un objet d'équipement (ch. IV §7, ch. VI §5). */
export const UTILISATIONS = ["aucune", "soin", "morphine", "usure", "consommable"];
