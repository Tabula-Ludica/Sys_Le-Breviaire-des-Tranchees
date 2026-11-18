/**
 * Dialogue de jet : Spécialité, substitution, caractéristique, difficulté, couvert et portée,
 * malus libre, favorisé / défavorisé, jet à enjeu, prière et pacte (avant le jet, ch. I §2).
 * Le score visé se recalcule à chaque changement.
 */

import { SYSTEME, CARACS, SPECIALITES, SUBSTITUTIONS, DIFFICULTES, COUVERTS, PORTEES } from "../config.mjs";
import { MALUS_PLANCHER } from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { calculer, raisonSansPriere, specialiteDeLArme, tentationPossible } from "./moteur.mjs";
import { themeSombre } from "../settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = cle => game.i18n.localize(cle);
const choix = (cles, prefixe) => Object.fromEntries(cles.map(c => [c, loc(`${prefixe}.${c}`)]));

export class DialogueJet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["breviaire", "dialogue-jet"],
    window: { title: "BREVIAIRE.Jet.titre", icon: "fa-solid fa-dice-d20" },
    position: { width: 440, height: "auto" },
    form: { handler: DialogueJet.#soumettre, closeOnSubmit: true }
  };

  static PARTS = {
    formulaire: { template: "systems/breviaire/templates/jets/dialogue-jet.hbs" }
  };

  /** Ouvre le dialogue ; résout avec les options, ou null si on le ferme. */
  static demander(actor, demande) {
    return new Promise(resolve => new this(actor, demande, resolve).render(true));
  }

  #actor;
  #resolve;
  #etat;

  constructor(actor, demande, resolve) {
    super({ window: { title: game.i18n.format("BREVIAIRE.Jet.titreDe", { nom: actor.name }) } });
    this.#actor = actor;
    this.#resolve = resolve;

    const arme = demande.armeId ? actor.items.get(demande.armeId) : null;
    const specialite = demande.specialite ?? (arme ? specialiteDeLArme(arme) : null);
    const aDistance = arme?.system.distance || ["tir", "lancer"].includes(specialite);
    this.#etat = {
      type: demande.type ?? "action",
      armeId: demande.armeId ?? null,
      specialite: actor.type === "personnage" && demande.type !== "mort" ? specialite : null,
      substitution: demande.substitution ?? "",
      carac: demande.type === "mort" ? "chair" : (demande.carac ?? ""),
      difficulte: "normale",
      couvert: aDistance ? "aucun" : "",
      portee: aDistance ? "courte" : "",
      malus: 0,
      favorise: !!demande.favorise,
      defavorise: !!demande.defavorise,
      enjeu: actor.type === "personnage" && (demande.type ?? "action") === "action",
      priere: false,
      pacte: false,
      tentation: ""
    };
  }

  async _prepareContext(options) {
    const actor = this.#actor;
    const e = this.#etat;
    const personnage = actor.type === "personnage";
    const camp = personnage ? actor.system.camp : game.settings.get(SYSTEME, "camp");
    const t = cle => terme(cle, camp);
    const arme = e.armeId ? actor.items.get(e.armeId) : null;

    const substitutions = personnage && e.specialite
      ? Object.entries(SUBSTITUTIONS).filter(([k, s]) => s.specialite === e.specialite && actor.system.substitutions.has(k))
        .map(([k, s]) => ({ cle: k, label: `${loc(`BREVIAIRE.Substitution.${k}`)} (${loc(`BREVIAIRE.Carac.${s.carac}`)})` }))
      : [];
    const sansPriere = raisonSansPriere(actor);

    return {
      e,
      personnage,
      mort: e.type === "mort",
      arme: arme ? { nom: arme.name, degats: arme.system.degats, portee: arme.system.porteeCourte != null ? `${arme.system.porteeCourte} / ${arme.system.porteeLongue ?? "—"} m` : "" } : null,
      choix: {
        specialites: { "": loc("BREVIAIRE.Jet.caracSeule"), ...choix(Object.keys(SPECIALITES), "BREVIAIRE.Specialite") },
        caracs: { "": loc("BREVIAIRE.Jet.caracHabituelle"), ...choix(CARACS, "BREVIAIRE.Carac") },
        caracsSeules: choix(CARACS, "BREVIAIRE.Carac"),
        substitutions: { "": loc("BREVIAIRE.Jet.aucune"), ...Object.fromEntries(substitutions.map(s => [s.cle, s.label])) },
        difficultes: Object.fromEntries(Object.entries(DIFFICULTES).map(([k, v]) => [k, `${loc(`BREVIAIRE.Difficulte.${k}`)} (${v > 0 ? "+" : ""}${v})`])),
        couverts: Object.fromEntries(Object.entries(COUVERTS).map(([k, v]) => [k, `${loc(`BREVIAIRE.Couvert.${k}`)} (${v})`])),
        portees: Object.fromEntries(Object.entries(PORTEES).map(([k, v]) => [k, `${loc(`BREVIAIRE.Portee.${k}`)} (${v})`]))
      },
      aSubstitutions: substitutions.length > 0,
      combat: !!e.couvert,
      priere: {
        libelle: t("Prier"),
        possible: personnage && !sansPriere,
        raison: sansPriere && sansPriere !== "ennemi" ? loc(`BREVIAIRE.Jet.sansPriere.${sansPriere}`) : "",
        avant: game.settings.get(SYSTEME, "modePriere") === "avant"
      },
      tentation: tentationPossible(actor) && e.type === "action" ? {
        libelle: t("Tentation"),
        aide: game.i18n.format(`BREVIAIRE.Corruption.tentation.aide.${camp}`, { corruption: t("Corruption") }),
        choix: {
          "": loc("BREVIAIRE.Corruption.tentation.aucune"),
          acceptee: game.i18n.format(`BREVIAIRE.Corruption.tentation.accepter.${camp}`, { corruption: t("Corruption") }),
          refusee: loc(`BREVIAIRE.Corruption.tentation.refuser.${camp}`)
        }
      } : null,
      deSang: personnage ? `d${actor.system.deSang}` : null,
      corruption: t("Corruption"),
      plancher: MALUS_PLANCHER,
      apercu: this.#apercu()
    };
  }

  /** Score visé avec les options en cours. */
  #apercu() {
    const c = calculer(this.#actor, this.#etat);
    return {
      score: c.score,
      detail: `${c.base}${c.rang ? ` + ${[0, 2, 4][c.rang]}` : ""}${c.modificateur ? ` ${c.modificateur > 0 ? "+" : "−"} ${Math.abs(c.modificateur)}` : ""}`,
      plafonne: c.plafonne,
      impossible: c.score <= 0
    };
  }

  /** Lit le formulaire dans l'état. */
  #lire() {
    const fd = new foundry.applications.ux.FormDataExtended(this.element).object;
    const avant = this.#etat.specialite;
    Object.assign(this.#etat, {
      specialite: fd.specialite ?? this.#etat.specialite,
      substitution: fd.substitution ?? "",
      carac: fd.carac ?? this.#etat.carac,
      difficulte: fd.difficulte ?? "normale",
      couvert: fd.couvert ?? this.#etat.couvert,
      portee: fd.portee ?? this.#etat.portee,
      malus: Number(fd.malus) || 0,
      favorise: !!fd.favorise,
      defavorise: !!fd.defavorise,
      enjeu: !!fd.enjeu,
      priere: !!fd.priere,
      pacte: !!fd.pacte,
      tentation: fd.tentation ?? ""
    });
    if (this.#etat.specialite !== avant) this.#etat.substitution = "";
    return this.#etat.specialite !== avant;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const camp = this.#actor.type === "personnage" ? this.#actor.system.camp : game.settings.get(SYSTEME, "camp");
    this.element.classList.add(themeSombre(camp) ? "brev-sombre" : "brev-clair");
    this.element.addEventListener("change", () => {
      if (this.#lire()) return this.render();
      const a = this.#apercu();
      const bloc = this.element.querySelector(".brev-apercu");
      if (!bloc) return;
      bloc.querySelector("b").textContent = a.score;
      bloc.querySelector("small").textContent = a.detail;
      bloc.classList.toggle("brev-impossible", a.impossible);
      bloc.querySelector(".brev-apercu-plafond")?.toggleAttribute("hidden", !a.plafonne);
    });
  }

  static async #soumettre() {
    this.#lire();
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.({ ...this.#etat });
  }

  _onClose(options) {
    super._onClose(options);
    this.#resolve?.(null);
    this.#resolve = null;
  }
}
