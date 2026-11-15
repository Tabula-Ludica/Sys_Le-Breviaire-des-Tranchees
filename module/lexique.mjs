/**
 * Vocabulaire selon le camp de la campagne, comme le LEXIQUE du site.
 * Les mots sont dans lang/fr.json, sous BREVIAIRE.Lexique.fideles.* et BREVIAIRE.Lexique.damnes.* :
 * le code demande toujours un terme par sa clé, jamais un mot en dur.
 */

import { SYSTEME } from "./config.mjs";

/** Camp de la campagne (réglage du monde). */
export function campDuMonde() {
  return game.settings.get(SYSTEME, "camp");
}

/** Terme du lexique, pour le camp donné ou celui du monde. */
export function terme(cle, camp = campDuMonde()) {
  return game.i18n.localize(`BREVIAIRE.Lexique.${camp}.${cle}`);
}

/** Helper Handlebars : {{terme "Chapelet"}} ou {{terme "Foi" actor.system.camp}}. */
export function enregistrerHelpers() {
  Handlebars.registerHelper("terme", (cle, camp) => terme(cle, typeof camp === "string" ? camp : undefined));
}
