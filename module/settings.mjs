/**
 * Réglages du monde.
 */

import { SYSTEME, CAMPS } from "./config.mjs";

export function enregistrerReglages() {
  game.settings.register(SYSTEME, "camp", {
    name: "BREVIAIRE.Reglages.camp.nom",
    hint: "BREVIAIRE.Reglages.camp.aide",
    scope: "world",
    config: true,
    type: String,
    choices: Object.fromEntries(CAMPS.map(c => [c, `BREVIAIRE.Camp.${c}`])),
    default: "fideles",
    requiresReload: true
  });

  game.settings.register(SYSTEME, "modePriere", {
    name: "BREVIAIRE.Reglages.modePriere.nom",
    hint: "BREVIAIRE.Reglages.modePriere.aide",
    scope: "world",
    config: true,
    type: String,
    choices: {
      avant: "BREVIAIRE.Reglages.modePriere.avant",
      apres: "BREVIAIRE.Reglages.modePriere.apres"
    },
    default: "avant"
  });

  game.settings.register(SYSTEME, "theme", {
    name: "BREVIAIRE.Reglages.theme.nom",
    hint: "BREVIAIRE.Reglages.theme.aide",
    scope: "client",
    config: true,
    type: String,
    choices: {
      sombre: "BREVIAIRE.Reglages.theme.sombre",
      parchemin: "BREVIAIRE.Reglages.theme.parchemin",
      camp: "BREVIAIRE.Reglages.theme.camp"
    },
    default: "sombre",
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app.element?.classList.contains("breviaire")) app.render();
      }
      ui.chat?.render?.();
    }
  });

  // Réserve commune : seul le MJ l'écrit (les joueurs passent par une requête, étape 4).
  game.settings.register(SYSTEME, "reserve", {
    scope: "world",
    config: false,
    type: Object,
    default: { des: 0, perdus: 0 }
  });

  // Personnages de l'escouade : base du remplissage « 3d6 (ou 2d6) par joueur ».
  game.settings.register(SYSTEME, "escouade", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Identifiants des documents Cards du Paquet du Destin (étape 5).
  game.settings.register(SYSTEME, "paquets", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
}

/** Thème sombre pour ce camp, selon le réglage personnel « Thème des fiches ». */
export function themeSombre(camp) {
  const theme = game.settings.get(SYSTEME, "theme");
  return theme === "sombre" || (theme === "camp" && camp === "damnes");
}
