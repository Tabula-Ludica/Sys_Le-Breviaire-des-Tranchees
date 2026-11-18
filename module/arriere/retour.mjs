/**
 * Fenêtre « Retour à l'arrière » d'un personnage : les sept étapes du ch. VI dans l'ordre,
 * chacune avec ses boutons. Ouverte depuis la fiche (propriétaire) ou depuis le widget du MJ (toute l'escouade).
 */

import { SYSTEME, CARACS } from "../config.mjs";
import { terme } from "../lexique.mjs";
import { themeSombre } from "../settings.mjs";
import * as R from "../logique/regles.mjs";
import * as Arr from "./arriere.mjs";
import { demander } from "../reserve/reserve.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = cle => game.i18n.localize(cle);
const A = "BREVIAIRE.Arriere";

export class RetourArriere extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["breviaire", "retour-arriere"],
    window: { icon: "fa-solid fa-campground", resizable: true },
    position: { width: 520, height: 720 },
    actions: {
      bilan: RetourArriere.#act(a => Arr.missionSurvecue(a)),
      epreuves: RetourArriere.#act(a => Arr.passerEpreuves(a)),
      epreuveCarac: RetourArriere.#act((a, el) => Arr.epreuveDeCarac(a, el.closest(".brev-ra-ligne").querySelector("select").value)),
      soigner: RetourArriere.#act(a => Arr.soigner(a)),
      convalescence: RetourArriere.#act((a, el) => Arr.convalescence(a, Number(el.dataset.index))),
      ravitailler: RetourArriere.#act(a => Arr.ravitailler(a)),
      messe: RetourArriere.#act(() => demander("messe")),
      activite: RetourArriere.#act((a, el) => Arr.tempsLibre(a, el.dataset.activite)),
      confession: RetourArriere.#act(a => Arr.confession(a)),
      penitenceTenue: RetourArriere.#act(a => Arr.penitence(a, true)),
      penitenceRompue: RetourArriere.#act(a => Arr.penitence(a, false)),
      dime: RetourArriere.#act(a => Arr.dime(a)),
      soupcon: RetourArriere.#act(a => Arr.jetDeSoupcon(a)),
      disgrace: RetourArriere.#act(a => Arr.jetDeDisgrace(a)),
      bascule: RetourArriere.#basculer,
      depart: RetourArriere.#act(async (a, el, app) => { await Arr.depart(a); app.close(); })
    }
  };

  static PARTS = { corps: { template: "systems/breviaire/templates/arriere/retour.hbs", scrollable: [""] } };

  /** Une fenêtre par personnage. */
  static ouvrir(actor) {
    const id = `brev-retour-${actor.id}`;
    const existante = foundry.applications.instances.get(id);
    if (existante) return existante.render({ force: true });
    return new this({ id, actor }).render({ force: true });
  }

  constructor(options) {
    super(options);
    this.actor = options.actor;
    this.#hook = Hooks.on("updateActor", a => { if (a === this.actor) this.render(); });
  }

  #hook;

  get title() {
    return game.i18n.format(`${A}.titre`, { nom: this.actor.name });
  }

  static #act(fn) {
    return async function (event, target) {
      target.disabled = true;
      try { await fn(this.actor, target, this); } finally { if (this.rendered) this.render(); }
    };
  }

  static async #basculer(event, target) {
    const chemin = target.dataset.chemin;
    return this.actor.update({ [chemin]: !foundry.utils.getProperty(this.actor, chemin) });
  }

  async _prepareContext() {
    const a = this.actor;
    const sys = a.system;
    const camp = sys.camp;
    const t = cle => terme(cle, camp);
    const u = sys.usages.mission ?? {};
    const fideles = camp === "fideles";
    const prochain = R.TITRES.find(x => x.missions > sys.missions);
    return {
      fideles,
      gm: game.user.isGM,
      t: {
        messe: t("Messe"), chapelet: t("Chapelet"), corruption: t("Corruption"), foi: t("Foi"),
        jugement: loc(`${A}.etape.jugement.${camp}`), marques: t("Marques")
      },
      bilan: {
        fait: !!u.bilan, missions: sys.missions, titre: loc(`BREVIAIRE.Titre.${sys.titre}`),
        prochain: prochain ? game.i18n.format(`${A}.prochainTitre`, { titre: loc(`BREVIAIRE.Titre.${prochain.cle}`), n: prochain.missions - sys.missions }) : null,
        cochees: Object.entries(sys.specialites).filter(([, s]) => s.coche).map(([k]) => loc(`BREVIAIRE.Specialite.${k}`)),
        caracs: Object.fromEntries(CARACS.map(c => [c, `${loc(`BREVIAIRE.Carac.${c}`)} (${sys.caracs[c]})`])),
        epreuveCaracFaite: !!u.epreuveCarac
      },
      soins: {
        blessures: `${sys.blessures.value} / ${sys.blessures.max}`,
        graves: sys.blessuresGraves.map((b, i) => ({ index: i, nom: loc(`BREVIAIRE.BlessureGrave.${b.type}`), active: b.active, sequelle: b.sequelle }))
          .filter(b => b.active)
      },
      ravitaillement: { fait: !!u.ravitaillement, aide: game.i18n.format(`${A}.ravitaillementAide`, { foi: t("Foi") }) },
      tempsLibre: {
        choisie: u.tempsLibre ? loc(`${A}.activite.${u.tempsLibre}.${camp}`) : null,
        activites: Arr.ACTIVITES.map(k => ({
          cle: k, label: loc(`${A}.activite.${k}.${camp}`), aide: loc(`${A}.activiteAide.${k}`),
          desactive: !!u.tempsLibre || (k === "ecrire" && sys.lettreEcrite)
        }))
      },
      jugement: {
        corruption: sys.corruption.value, palier: sys.corruption.palier, baisse: !!u.baisse,
        confession: sys.soupcon.confession, marqueVue: sys.soupcon.marqueVue,
        missionEchouee: sys.disgrace.missionEchouee, ordresRefuses: sys.disgrace.ordresRefuses,
        nbMarques: sys.marques.length, soupconRequis: sys.corruption.value >= R.PALIERS[0]
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.classList.toggle("brev-sombre", themeSombre(this.actor.system.camp));
    this.element.classList.toggle("brev-clair", !themeSombre(this.actor.system.camp));
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off("updateActor", this.#hook);
  }
}
