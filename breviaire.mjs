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
import { FichePersonnage } from "./module/sheets/fiche-personnage.mjs";
import { FicheEnnemi } from "./module/sheets/fiche-ennemi.mjs";
import { FicheObjet } from "./module/sheets/fiche-objet.mjs";
import { brancherVade } from "./module/integrations/vade.mjs";
import * as moteur from "./module/jets/moteur.mjs";

const TYPES_OBJET = ["arme", "protection", "equipement", "relique", "arcane", "rite", "origine", "affectation"];

/** Gabarits partagés : préchargés et enregistrés comme partiels. */
const PARTIELS = [
  "jets/dialogue-jet.hbs",
  "chat/jet.hbs",
  "objet/usure-ajustements.hbs",
  ...TYPES_OBJET.map(t => `objet/${t}.hbs`)
].map(p => `systems/breviaire/templates/${p}`);

function enregistrerFiches() {
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, "breviaire", FichePersonnage, {
    types: ["personnage"], makeDefault: true, label: "BREVIAIRE.Fiche.personnage"
  });
  DocumentSheetConfig.registerSheet(Actor, "breviaire", FicheEnnemi, {
    types: ["ennemi"], makeDefault: true, label: "BREVIAIRE.Fiche.ennemi"
  });
  DocumentSheetConfig.registerSheet(Item, "breviaire", FicheObjet, {
    types: TYPES_OBJET, makeDefault: true, label: "BREVIAIRE.Fiche.objet"
  });
}

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
  enregistrerFiches();
  foundry.applications.handlebars.loadTemplates(PARTIELS);
  brancherVade();

  // API publique : game.system.api (macros, autres modules)
  game.system.api = { regles, terme, campDuMonde, config: CONFIG_BREVIAIRE, lancerJet: moteur.lancerJet, executerJet: moteur.executerJet };
});

// Boutons des cartes de jet : branchés message par message (fonctionne aussi dans le chat de Vade)
Hooks.on("renderChatMessageHTML", (message, html) => moteur.brancherCarte(message, html));

Hooks.once("ready", () => {
  // Le thème des fiches suit le camp de la campagne (variante sombre pour les Damnés).
  document.body.dataset.breviaireCamp = campDuMonde();
});
