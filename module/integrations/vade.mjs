/**
 * Adaptateur pour le module Vade (quill-and-seal/Vade) : remplit les onglets Personnage et Actions
 * de l'interface téléphone. Interface décrite dans Vade, scripts/adapters/generic.js.
 * Les jets passeront par le moteur de l'étape 3 ; d'ici là, ils signalent qu'ils arrivent.
 */

import { CARACS, SPECIALITES, USURES } from "../config.mjs";
import { terme } from "../lexique.mjs";
import { libelleCran, loc } from "../sheets/commun.mjs";
import { lancerJet } from "../jets/moteur.mjs";
import { testUsure } from "../jets/usure.mjs";
import { etat as etatReserve } from "../reserve/reserve.mjs";

const adaptateur = {
  character(actor) {
    const sys = actor.system;
    if (actor.type === "ennemi") {
      return {
        subtitle: `${loc("BREVIAIRE.Fiche.menace")} ${sys.menace}`,
        resources: [{ id: "blessures", label: loc("BREVIAIRE.Fiche.blessures"), value: sys.blessures.value, max: sys.blessures.max }],
        stats: [
          { label: loc("BREVIAIRE.Fiche.protection"), value: sys.protection },
          { label: loc("BREVIAIRE.Fiche.deplacement"), value: `${sys.deplacement} m` }
        ],
        rollGroups: [{ id: "menace", label: loc("BREVIAIRE.Fiche.menace"), rolls: [{ id: "menace", label: loc("BREVIAIRE.Fiche.menace"), mod: String(sys.menace) }] }],
        rests: []
      };
    }

    const camp = sys.camp;
    const subtitle = [terme(`Rang.${sys.rang}`, camp), sys.affectation.nom, sys.origine.nom].filter(Boolean).join(" · ");

    const stats = [
      ...USURES.map(u => ({
        label: u === "foi" ? terme("Foi", camp) : loc(`BREVIAIRE.Usure.${u}`),
        value: libelleCran(sys.usure[u].faces)
      })),
      { label: terme("Corruption", camp), value: sys.corruption.value },
      { label: terme("Chapelet", camp), value: `${etatReserve().des} d6` },
      { label: loc("BREVIAIRE.Fiche.protection"), value: sys.protection }
    ];

    const rollGroups = [
      {
        id: "caracs", label: loc("BREVIAIRE.Fiche.caracteristiques"), columns: 3,
        rolls: CARACS.map(c => ({ id: `carac:${c}`, label: loc(`BREVIAIRE.Carac.${c}`), mod: String(sys.caracs[c]) }))
      },
      // Spécialités maîtrisées d'abord : ce sont celles qu'on lance le plus
      {
        id: "specialites", label: loc("BREVIAIRE.Fiche.specialites"), columns: 2,
        rolls: Object.keys(SPECIALITES)
          .sort((a, b) => sys.specialites[b].rang - sys.specialites[a].rang)
          .map(s => ({ id: `spe:${s}`, label: loc(`BREVIAIRE.Specialite.${s}`), mod: String(sys.scores[s]) }))
      },
      {
        id: "usure", label: loc("BREVIAIRE.Fiche.usure"), columns: 2,
        rolls: USURES.map(u => ({
          id: `usure:${u}`,
          label: u === "foi" ? terme("Foi", camp) : loc(`BREVIAIRE.Usure.${u}`),
          mod: libelleCran(sys.usure[u].faces)
        }))
      },
      { id: "autres", label: loc("BREVIAIRE.Fiche.autres"), columns: 2, rolls: [{ id: "mort", label: loc("BREVIAIRE.Jet.mort") }] }
    ];

    return {
      subtitle,
      resources: [{ id: "blessures", label: loc("BREVIAIRE.Fiche.blessures"), value: sys.blessures.value, max: sys.blessures.max }],
      stats, rollGroups, rests: []
    };
  },

  async roll(actor, id) {
    const [genre, cle] = id.split(":");
    if (genre === "carac") return lancerJet(actor, { carac: cle });
    if (genre === "spe") return lancerJet(actor, { specialite: cle });
    if (genre === "mort") return lancerJet(actor, { type: "mort" });
    if (genre === "usure") return testUsure(actor, cle);
    return lancerJet(actor, {});
  },

  async adjustResource(actor, id, delta) {
    if (id !== "blessures") return;
    const { value, max } = actor.system.blessures;
    return actor.update({ "system.blessures.value": Math.clamp(value + delta, 0, max) });
  },

  async setResource(actor, id, value) {
    if (id !== "blessures") return;
    return actor.update({ "system.blessures.value": Math.clamp(value, 0, actor.system.blessures.max) });
  },

  actions(actor) {
    const groupe = (id, type, note) => {
      const items = actor.items.filter(i => i.type === type).map(i => ({
        id: i.id, name: i.name, img: i.img, note: note?.(i) ?? null, dim: i.system.equipee === false
      }));
      return items.length ? { id, label: loc(`TYPES.Item.${type}`), items } : null;
    };
    return [
      groupe("armes", "arme", i => i.system.degats),
      groupe("rites", "rite", i => loc(`BREVIAIRE.NiveauRite.${i.system.niveau}`)),
      groupe("reliques", "relique", i => `+${i.system.apport}d6`),
      groupe("protections", "protection", i => String(i.system.valeur)),
      groupe("equipement", "equipement")
    ].filter(Boolean);
  },

  async useAction(actor, itemId) {
    const item = actor.items.get(itemId);
    if (item?.type === "arme") return lancerJet(actor, { armeId: itemId });
    if (item?.type === "rite") {
      const { celebrer } = await import("../rites/celebrer.mjs");
      return celebrer(actor, item);
    }
    if (item?.type === "relique") {
      const { utiliserRelique } = await import("../objets/utiliser.mjs");
      return utiliserRelique(actor, item);
    }
    if (item?.type === "equipement" && item.system.utilisation.type !== "aucune") {
      const { utiliserObjet } = await import("../objets/utiliser.mjs");
      return utiliserObjet(actor, item);
    }
    item?.sheet.render(true);
  },

  rollData(actor) {
    return actor?.getRollData?.() ?? null;
  }
};

export function brancherVade() {
  Hooks.once("vadeReady", vade => vade.registerAdapter?.("breviaire", adaptateur));
  // Si Vade était prêt avant nous, on passe par son API.
  Hooks.once("ready", () => game.modules.get("vade")?.api?.registerAdapter?.("breviaire", adaptateur));
}
