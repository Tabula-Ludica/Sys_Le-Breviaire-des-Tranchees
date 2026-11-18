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
import { testUsure } from "./module/jets/usure.mjs";
import * as reserve from "./module/reserve/reserve.mjs";
import { rendreWidget, finDeScene } from "./module/reserve/widget.mjs";
import * as arcanes from "./module/arcanes/arcanes.mjs";
import * as arriere from "./module/arriere/arriere.mjs";
import { RetourArriere } from "./module/arriere/retour.mjs";
import { BreviaireCombat, assautEclair, reprendreInitiative } from "./module/combat/combat.mjs";
import { enregistrerEtats } from "./module/combat/etats.mjs";
import * as degats from "./module/combat/degats.mjs";

const TYPES_OBJET = ["arme", "protection", "equipement", "relique", "arcane", "rite", "origine", "affectation"];

/** Gabarits partagés : préchargés et enregistrés comme partiels. */
const PARTIELS = [
  "jets/dialogue-jet.hbs",
  "chat/jet.hbs",
  "chat/arcane.hbs",
  "chat/degats.hbs",
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
  CONFIG.Combat.documentClass = BreviaireCombat;
  // Initiative par phases : la valeur est posée par BreviaireCombat (3 rapide, 2 ennemis, 1 lente)
  CONFIG.Combat.initiative = { formula: "1", decimals: 1 };
  enregistrerEtats();

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
  reserve.enregistrerRequetes();
  // Un joueur fait réécrire par le MJ une carte qui ne lui appartient pas (défense en mêlée, dégâts appliqués)
  CONFIG.queries["breviaire.carte"] = degats.majCarte;
  // La réserve et l'escouade sont diffusées à tous les clients : chacun redessine son widget
  for (const cle of ["reserve", "escouade"]) {
    const reglage = game.settings.settings.get(`breviaire.${cle}`);
    if (reglage) reglage.onChange = () => rendreWidget();
  }
  enregistrerHelpers();
  enregistrerFiches();
  foundry.applications.handlebars.loadTemplates(PARTIELS);
  brancherVade();

  // API publique : game.system.api (macros, autres modules)
  game.system.api = {
    regles, terme, campDuMonde, config: CONFIG_BREVIAIRE,
    lancerJet: moteur.lancerJet, executerJet: moteur.executerJet, testUsure,
    reserve: { etat: reserve.etat, demander: reserve.demander, escouade: reserve.escouade }, finDeScene,
    tirerArcane: arcanes.tirerArcane,
    arriere: { ...arriere, ouvrir: actor => RetourArriere.ouvrir(actor) },
    combat: { assautEclair, reprendreInitiative, appliquerDegats: degats.appliquerDegats, testNerfsEnnemi: degats.testNerfsEnnemi, seReprendre: degats.seReprendre }
  };
});

// Boutons des cartes de jet : branchés message par message (fonctionne aussi dans le chat de Vade)
Hooks.on("renderChatMessageHTML", (message, html) => {
  moteur.brancherCarte(message, html);
  arcanes.brancherCarteArcane(message, html);
  degats.brancherCarteDegats(message, html);
  degats.brancherCarteTour(message, html);
});

// Le bandeau de combat des fiches suit le suivi de combat
function rafraichirFichesDuCombat(combat) {
  for (const c of combat?.combatants ?? []) if (c.actor?.sheet?.rendered) c.actor.sheet.render();
}
for (const h of ["updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
  Hooks.on(h, doc => rafraichirFichesDuCombat(doc instanceof Combat ? doc : doc.parent));
}

// Début du tour d'un combattant : Hémorragie, jet de Mort, panique (traité par le MJ actif)
Hooks.on("combatTurnChange", combat => degats.debutDeTour(combat));

Hooks.once("ready", () => {
  document.body.dataset.breviaireCamp = campDuMonde();
  rendreWidget();
  arcanes.preparerPaquets();
});

// Le widget signale l'absence de MJ (la prière passe par lui)
Hooks.on("userConnected", () => rendreWidget());
