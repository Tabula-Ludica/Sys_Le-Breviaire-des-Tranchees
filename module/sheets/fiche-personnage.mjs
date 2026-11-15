/**
 * Fiche de personnage.
 * Onglets : Front (caractéristiques et Spécialités), Ressources (usure, Blessures, Corruption),
 * Paquetage, Rites, Histoire.
 */

import { CARACS, SPECIALITES, SUBSTITUTIONS, USURES, RANGS, BLESSURES_GRAVES } from "../config.mjs";
import { FACES, CRAN_MAX, CORRUPTION_MAX, TITRES, changerCran } from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { FicheBreviaire, CHEMIN, loc, libelleCran, choixLocalises, enrichir } from "./commun.mjs";
import { lancerJet } from "../jets/moteur.mjs";

const PIPS = ["○○", "●○", "●●"];

export class FichePersonnage extends FicheBreviaire(foundry.applications.sheets.ActorSheetV2) {
  static ONGLETS = [
    { id: "front", icone: "fa-solid fa-person-rifle" },
    { id: "ressources", icone: "fa-solid fa-hourglass-half" },
    { id: "paquetage", icone: "fa-solid fa-sack-xmark" },
    { id: "rites", icone: "fa-solid fa-book-bible" },
    { id: "histoire", icone: "fa-solid fa-scroll" }
  ];

  static MODE_EDITION = true;

  static DEFAULT_OPTIONS = {
    classes: ["personnage"],
    position: { width: 820, height: 880 },
    actions: {
      jet: this.#jet,
      rangSpecialite: this.#rangSpecialite,
      coche: this.#coche,
      substitution: this.#substitution,
      usure: this.#usure,
      blessures: this.#blessures,
      mort: this.#mort,
      corruption: this.#corruption,
      ajouterBlessureGrave: this.#ajouterBlessureGrave,
      basculerBlessureGrave: this.#basculerBlessureGrave,
      supprimerBlessureGrave: this.#supprimerBlessureGrave,
      celebrer: this.#celebrer,
      jetDeMort: this.#jetDeMort
    }
  };

  static PARTS = {
    bandeau: { template: `${CHEMIN}/acteur/personnage-bandeau.hbs` },
    colonne: { template: `${CHEMIN}/acteur/personnage-colonne.hbs`, scrollable: [""] },
    front: { template: `${CHEMIN}/acteur/personnage-front.hbs`, scrollable: [""] },
    ressources: { template: `${CHEMIN}/acteur/personnage-ressources.hbs`, scrollable: [""] },
    paquetage: { template: `${CHEMIN}/acteur/personnage-paquetage.hbs`, scrollable: [""] },
    rites: { template: `${CHEMIN}/acteur/personnage-rites.hbs`, scrollable: [""] },
    histoire: { template: `${CHEMIN}/acteur/personnage-histoire.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const camp = this.camp;
    const t = cle => terme(cle, camp);

    // Front : une colonne par caractéristique, avec ses Spécialités et les substitutions qui s'y rattachent
    context.caracs = CARACS.map(carac => ({
      cle: carac,
      label: loc(`BREVIAIRE.Carac.${carac}`),
      valeur: sys.caracs[carac],
      specialites: Object.entries(SPECIALITES).filter(([, c]) => c === carac).map(([cle]) => {
        const s = sys.specialites[cle];
        return {
          cle,
          label: loc(`BREVIAIRE.Specialite.${cle}`),
          rang: s.rang,
          rangLabel: loc(`BREVIAIRE.RangSpecialite.${s.rang}`),
          pips: PIPS[s.rang],
          coche: s.coche,
          score: sys.scores[cle],
          substitutions: Object.entries(SUBSTITUTIONS)
            .filter(([sub, d]) => d.specialite === cle && sys.substitutions.has(sub))
            .map(([sub, d]) => ({
              cle: sub,
              label: loc(`BREVIAIRE.Substitution.${sub}`),
              carac: loc(`BREVIAIRE.Carac.${d.carac}`),
              caracAbrev: loc(`BREVIAIRE.CaracAbrev.${d.carac}`),
              score: sys.scoresSubstitution[sub]
            }))
        };
      })
    }));

    context.aSubstitution = sys.substitutions.size > 0;

    // Liste des Spécialités façon « compétences » de dnd5e : ordre alphabétique, abréviation de la caractéristique
    const lang = game.i18n.lang;
    context.specialitesListe = context.caracs
      .flatMap(c => c.specialites.map(s => ({ ...s, carac: c.cle, abrev: loc(`BREVIAIRE.CaracAbrev.${c.cle}`) })))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
    context.nbMaitrisees = context.specialitesListe.filter(s => s.rang > 0).length;

    context.substitutions = Object.entries(SUBSTITUTIONS).map(([cle, d]) => ({
      cle,
      label: loc(`BREVIAIRE.Substitution.${cle}`),
      detail: `${loc(`BREVIAIRE.Specialite.${d.specialite}`)} · ${loc(`BREVIAIRE.Carac.${d.carac}`)}`,
      possede: sys.substitutions.has(cle)
    }));

    // Ressources
    const crans = Object.fromEntries(FACES.map((f, i) => [i, libelleCran(f)]).filter(([i]) => i > 0));
    context.usures = USURES.map(u => ({
      cle: u,
      label: u === "foi" ? t("Foi") : loc(`BREVIAIRE.Usure.${u}`),
      cran: sys.usure[u].value,
      de: libelleCran(sys.usure[u].faces),
      faces: sys.usure[u].faces,
      epuise: sys.usure[u].value === 0,
      base: sys.usure[u].base,
      nomBase: `system.usure.${u}.base`,
      choixBase: crans
    }));

    context.blessuresGraves = sys.blessuresGraves.map((b, index) => ({
      ...b, index, label: loc(`BREVIAIRE.BlessureGrave.${b.type}`)
    }));
    context.choixBlessuresGraves = choixLocalises(BLESSURES_GRAVES, "BREVIAIRE.BlessureGrave");
    context.mort = [0, 1, 2].map(i => ({ index: i, coche: i < sys.mort.echecs }));
    context.horsDeCombat = sys.blessures.value === 0;
    context.morphine = !!sys.usages.scene?.morphine;
    context.blessuresPart = sys.blessures.max ? Math.round(100 * sys.blessures.value / sys.blessures.max) : 0;

    context.corruption = {
      label: t("Corruption"),
      valeur: sys.corruption.value,
      etat: t(`Etat.${sys.etat}`),
      deSang: `d${sys.deSang}`,
      cases: Array.from({ length: CORRUPTION_MAX }, (_, i) => ({
        n: i + 1,
        pleine: i < sys.corruption.value,
        palier: [3, 6, 9].includes(i + 1)
      }))
    };
    context.marques = sys.marques.map(m => ({
      id: m.id, name: m.name, img: m.img, chiffre: m.system.chiffre,
      titre: m.system.marque.titre, texte: m.system.marque.texte
    }));

    // Entête
    context.rangs = Object.fromEntries(RANGS.map(r => [r, t(`Rang.${r}`)]));
    context.rangLabel = context.rangs[sys.rang];
    context.titre = loc(`BREVIAIRE.Titre.${sys.titre}`);
    // Progression vers le titre suivant (comme la barre d'expérience de dnd5e)
    const iTitre = TITRES.findIndex(x => x.cle === sys.titre);
    const prochain = TITRES[iTitre + 1];
    context.progression = prochain ? {
      prochain: loc(`BREVIAIRE.Titre.${prochain.cle}`),
      seuil: prochain.missions,
      part: Math.round(100 * (sys.missions - TITRES[iTitre].missions) / (prochain.missions - TITRES[iTitre].missions))
    } : null;

    // Les trois arcanes de création
    const POSITIONS = [["passe", "Passe"], ["serment", "Serment"], ["peche", "Peche"]];
    context.arcanesCreation = POSITIONS.map(([cle, lex]) => {
      const a = sys.arcanesCreation[cle];
      const carte = a.uuid ? fromUuidSync(a.uuid) : null;
      return { cle, position: t(lex), nom: carte?.name ?? null, chiffre: carte?.system?.chiffre ?? "?", reponse: a.reponse, img: carte?.img };
    });
    context.libelles = {
      foi: t("Foi"), corruption: t("Corruption"), marques: t("Marques"), rites: t("Rites"),
      chapelet: t("Chapelet"), passe: t("Passe"), serment: t("Serment"), peche: t("Peche")
    };

    // Paquetage
    const parType = type => actor.items.filter(i => i.type === type).sort((a, b) => a.sort - b.sort);
    const puces = set => [...set].map(p => loc(`BREVIAIRE.Particularite.${p}`));
    context.armes = parType("arme").map(i => ({
      id: i.id, name: i.name, img: i.img, equipee: i.system.equipee,
      categorie: loc(`BREVIAIRE.CategorieArme.${i.system.categorie}`),
      degats: i.system.degats,
      portee: i.system.distance && i.system.porteeCourte != null
        ? `${i.system.porteeCourte} / ${i.system.porteeLongue ?? "—"} m`
        : (i.system.categorie === "melee" ? `${i.system.allonge ?? 1.5} m` : ""),
      zone: i.system.zone ? `${i.system.zone} m` : "",
      compte: i.system.quantite != null,
      quantite: i.system.quantite,
      sacree: i.system.particularites.has("sacree"),
      particularites: puces(i.system.particularites)
    }));
    context.protections = parType("protection").map(i => ({
      id: i.id, name: i.name, img: i.img, equipee: i.system.equipee, valeur: i.system.valeur,
      bouclier: i.system.type === "bouclier", lourde: i.system.lourde,
      type: loc(`BREVIAIRE.TypeProtection.${i.system.type}`)
    }));
    context.reliques = parType("relique").map(i => ({ id: i.id, name: i.name, img: i.img, apport: i.system.apport, utilisee: i.system.utilisee }));
    context.equipement = parType("equipement").map(i => {
      const u = i.system.utilisation;
      return {
        id: i.id, name: i.name, img: i.img, quantite: i.system.quantite,
        utilisable: u.type !== "aucune",
        utilisation: u.type !== "aucune" ? loc(`BREVIAIRE.Utilisation.${u.type}`) : ""
      };
    });
    context.rites = parType("rite").map(i => ({
      id: i.id, name: i.name, img: i.img, grand: i.system.niveau === "grand",
      niveau: loc(`BREVIAIRE.NiveauRite.${i.system.niveau}`),
      portee: i.system.portee != null ? `${i.system.portee} m` : "", duree: i.system.duree
    }));
    context.resume = {
      protection: sys.protection,
      bouclier: sys.protectionBouclier,
      deplacement: sys.deplacement,
      munitions: libelleCran(sys.usure.munitions.faces),
      vivres: libelleCran(sys.usure.vivres.faces),
      objets: actor.items.filter(i => ["arme", "protection", "relique", "equipement"].includes(i.type)).length
    };

    context.biographie = await enrichir(sys.histoire.biographie, actor);
    return context;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Jet d'action : caractéristique, Spécialité (avec ou sans substitution) ou arme. */
  static #jet(event, target) {
    const { carac, specialite, substitution, arme } = target.dataset;
    return lancerJet(this.document, { type: "action", carac, specialite, substitution, armeId: arme });
  }

  static #jetDeMort() {
    return lancerJet(this.document, { type: "mort" });
  }

  static #celebrer() {
    ui.notifications.info("BREVIAIRE.Fiche.riteBientot", { localize: true });
  }

  /** Rang d'une Spécialité : non maîtrisée → Formé → Expert → non maîtrisée. */
  static #rangSpecialite(event, target) {
    if (!this.edition) return;
    const cle = target.closest("[data-specialite]").dataset.specialite;
    const rang = (this.document.system.specialites[cle].rang + 1) % 3;
    return this.document.update({ [`system.specialites.${cle}.rang`]: rang });
  }

  static #coche(event, target) {
    const cle = target.closest("[data-specialite]").dataset.specialite;
    return this.document.update({ [`system.specialites.${cle}.coche`]: !this.document.system.specialites[cle].coche });
  }

  static #substitution(event, target) {
    if (!this.edition) return;
    const cle = target.dataset.substitution;
    const subs = new Set(this.document.system.substitutions);
    subs.has(cle) ? subs.delete(cle) : subs.add(cle);
    return this.document.update({ "system.substitutions": [...subs] });
  }

  /** Un cran de plus ou de moins sur un dé d'usure. */
  static #usure(event, target) {
    const { usure, delta } = target.dataset;
    const cran = changerCran(this.document.system.usure[usure].value, Number(delta), CRAN_MAX);
    return this.document.update({ [`system.usure.${usure}.value`]: cran });
  }

  static #blessures(event, target) {
    const { value, max } = this.document.system.blessures;
    const nouveau = Math.clamp(value + Number(target.dataset.delta), 0, max);
    return this.document.update({ "system.blessures.value": nouveau });
  }

  /** Case de jet de Mort : cocher la case i règle le nombre d'échecs. */
  static #mort(event, target) {
    const i = Number(target.dataset.index);
    const echecs = this.document.system.mort.echecs === i + 1 ? i : i + 1;
    return this.document.update({ "system.mort.echecs": echecs });
  }

  /** Corruption : réglage direct en touchant une case (la logique des paliers arrive à l'étape 6). */
  static #corruption(event, target) {
    const n = Number(target.dataset.n);
    const valeur = this.document.system.corruption.value === n ? n - 1 : n;
    return this.document.update({ "system.corruption.value": valeur });
  }

  static #ajouterBlessureGrave() {
    if (!this.edition) return;
    const liste = this.document.system.toObject().blessuresGraves;
    liste.push({ type: "commotion", active: true, sequelle: "" });
    return this.document.update({ "system.blessuresGraves": liste });
  }

  static #basculerBlessureGrave(event, target) {
    const liste = this.document.system.toObject().blessuresGraves;
    const b = liste[Number(target.dataset.index)];
    if (b) b.active = !b.active;
    return this.document.update({ "system.blessuresGraves": liste });
  }

  static #supprimerBlessureGrave(event, target) {
    if (!this.edition) return;
    const liste = this.document.system.toObject().blessuresGraves;
    liste.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.blessuresGraves": liste });
  }

  /** Les champs d'un tableau (type et séquelle d'une Blessure grave) arrivent par le formulaire. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const graves = foundry.utils.getProperty(data, "graves");
    if (graves) {
      const liste = this.document.system.toObject().blessuresGraves;
      for (const [i, champs] of Object.entries(graves)) Object.assign(liste[i] ?? {}, champs);
      foundry.utils.setProperty(data, "system.blessuresGraves", liste);
      delete data.graves;
    }
    return data;
  }
}
