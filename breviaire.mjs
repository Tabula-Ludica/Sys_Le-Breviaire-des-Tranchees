/**
 * Le Bréviaire des Tranchées — système Foundry VTT v14.
 * Point d'entrée : enregistre la configuration, les modèles de données, les documents et les réglages.
 */

import * as CONFIG_BREVIAIRE from "./module/config.mjs";
import * as regles from "./module/logique/regles.mjs";
import { PersonnageData, EnnemiData } from "./module/data/acteurs.mjs";
import {
  ArmeData, ProtectionData, EquipementData, ReliqueData, ArcaneData, RiteData, OrigineData, AffectationData
} from "./module/data/objets.mjs";
import { BreviaireActor, BreviaireItem } from "./module/documents.mjs";
import { enregistrerReglages } from "./module/settings.mjs";
import { enregistrerHelpers, terme, campDuMonde } from "./module/lexique.mjs";

Hooks.once("init", () => {
  console.log("Bréviaire | Initialisation du système");

  CONFIG.BREVIAIRE = CONFIG_BREVIAIRE;

  CONFIG.Actor.documentClass = BreviaireActor;
  CONFIG.Item.documentClass = BreviaireItem;

  Object.assign(CONFIG.Actor.dataModels, {
    personnage: PersonnageData,
    ennemi: EnnemiData
  });
  Object.assign(CONFIG.Item.dataModels, {
    arme: ArmeData,
    protection: ProtectionData,
    equipement: EquipementData,
    relique: ReliqueData,
    arcane: ArcaneData,
    rite: RiteData,
    origine: OrigineData,
    affectation: AffectationData
  });

  CONFIG.Actor.trackableAttributes = {
    personnage: { bar: ["blessures"], value: ["corruption.value", "missions"] },
    ennemi: { bar: ["blessures"], value: ["menace", "protection"] }
  };

  enregistrerReglages();
  enregistrerHelpers();

  // API publique : game.system.api (macros, autres modules)
  game.system.api = { regles, terme, campDuMonde, config: CONFIG_BREVIAIRE };
});

Hooks.once("ready", () => {
  // Le thème des fiches suit le camp de la campagne (variante sombre pour les Damnés).
  document.body.dataset.breviaireCamp = campDuMonde();
});
