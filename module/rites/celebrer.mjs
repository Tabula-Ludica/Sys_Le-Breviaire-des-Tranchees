/**
 * Célébrer un rite (ch. X des deux camps).
 * 1. Accès : Ferveur Formé → rites mineurs ; Ferveur Expert, Aumônier / Prédicateur noir ou Prélat / Élu → tous.
 *    Sans Ferveur, un rite mineur se tente guidé par un célébrant, défavorisé.
 * 2. Coût : un dé de la réserve, dépensé (pas lancé). Réserve vide : aucun rite.
 * 3. Jet de Ferveur (prière et pacte possibles) ; échec : Foi (Haine) −1 cran (appliqué par le moteur).
 */

import { lancerJet } from "../jets/moteur.mjs";
import { etat, demander } from "../reserve/reserve.mjs";
import { terme } from "../lexique.mjs";

const fmt = (cle, d) => game.i18n.format(cle, d);
const CELEBRANTS = ["aumonier", "predicateur"];

/** Le personnage peut-il célébrer ce rite ? { ok, defavorise, raison } */
export function acces(actor, rite) {
  const sys = actor.system;
  if (rite.system.camp !== sys.camp) return { ok: false, raison: "autreCamp" };
  const rang = sys.specialites.ferveur.rang;
  const tous = rang >= 2 || CELEBRANTS.includes(sys.affectation.cle) || sys.rang === "prelat";
  if (rite.system.niveau === "grand") return tous ? { ok: true } : { ok: false, raison: "grandRite" };
  if (tous || rang >= 1) return { ok: true };
  return { ok: true, defavorise: true, raison: "guide" };
}

export async function celebrer(actor, rite) {
  const a = acces(actor, rite);
  const camp = actor.system.camp;
  if (!a.ok) return ui.notifications.warn(game.i18n.localize(`BREVIAIRE.Rite.raison.${a.raison}`));
  if (etat().des < 1) return ui.notifications.warn(fmt("BREVIAIRE.Rite.reserveVide", { reserve: terme("Chapelet", camp) }));

  // Le dé est dépensé avant le jet : si le joueur annule le dialogue, on le rend.
  const paye = await demander("depenser", { n: 1 });
  if (!paye.ok) return;
  const message = await lancerJet(actor, {
    type: "action",
    specialite: "ferveur",
    defavorise: !!a.defavorise,
    rite: { id: rite.id, nom: rite.name, niveau: rite.system.niveau, guide: !!a.defavorise }
  });
  if (!message) await demander("ajouter", { n: 1 });
  return message;
}
