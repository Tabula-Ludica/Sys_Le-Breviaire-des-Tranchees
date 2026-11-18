/**
 * Créateur de personnage (ch. VIII), en sept étapes comme createur.html :
 * 1. trois arcanes (Passé, Serment/Pacte, Péché/Remords) ; 2. Origine (+ lignée, procession ou ancienne Origine) ;
 * 3. Affectation (et Spécialités libres nées des doublons) ; 4. caractéristiques 14·12·11·10·8 ; 5. Rang ;
 * 6. dés d'usure (d8 + ajustements, entre d4 et d12) ; 7. nom et dernières questions.
 * « Créer » remplit la fiche et ajoute la dotation (objets des compendiums).
 */

import { SYSTEME, CARACS, SPECIALITES, USURES, RANGS } from "../config.mjs";
import * as R from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { themeSombre } from "../settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
const C = "BREVIAIRE.Createur";
const VALEURS = [14, 12, 11, 10, 8];
const POSITIONS = ["passe", "serment", "peche"];
const ETAPES = ["arcanes", "origine", "affectation", "caracs", "rang", "usure", "finitions"];
/** Dotation de tous (« Toujours ») : uniforme, casque, masque à gaz, gamelle, couverture, plaque d'identité. */
const DOTATION_COMMUNE = ["Casque", "Masque à gaz", "Gamelle et couverture", "Plaque d'identité"];

/** Spécialités de départ : Affectation (1 Expert, 2 Formées) puis Origine ; les doublons montent ou libèrent un choix. */
export function specialitesDe(origine, option, affectation, libres = []) {
  const rangs = {};
  if (affectation) {
    if (affectation.system.expert) rangs[affectation.system.expert] = 2;
    for (const s of affectation.system.formes) rangs[s] = Math.max(rangs[s] ?? 0, 1);
  }
  const opt = origine?.system.options.find(o => o.cle === option);
  const speOrigine = [...(origine?.system.specialites ?? []), ...(opt?.specialites ?? [])];
  let libresNecessaires = 0;
  for (const s of speOrigine) {
    if (!rangs[s]) rangs[s] = 1;
    else if (rangs[s] === 1) rangs[s] = 2;     // Formé + Formé → Expert
    else libresNecessaires++;                  // Expert + Formé → une Spécialité libre Formée
  }
  const choisies = libres.slice(0, libresNecessaires).filter(s => s && !rangs[s]);
  for (const s of choisies) rangs[s] = 1;
  const substitutions = [...new Set([...(origine?.system.substitutions ?? []), ...(affectation?.system.substitutions ?? [])])];
  return { rangs, libresNecessaires, substitutions };
}

export class CreateurPersonnage extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["breviaire", "createur"],
    window: { icon: "fa-solid fa-feather-pointed", resizable: true },
    position: { width: 720, height: 760 },
    form: { handler: CreateurPersonnage.#lireFormulaire, submitOnChange: true, closeOnSubmit: false },
    actions: {
      etape: CreateurPersonnage.#allerA,
      suivant: CreateurPersonnage.#suivant,
      precedent: CreateurPersonnage.#precedent,
      tirer: CreateurPersonnage.#tirer,
      tirerTout: CreateurPersonnage.#tirerTout,
      creer: CreateurPersonnage.#creer
    }
  };

  static PARTS = { corps: { template: "systems/breviaire/templates/createur/createur.hbs", scrollable: [".brev-cr-page"] } };

  static ouvrir(actor) {
    const id = `brev-createur-${actor.id}`;
    const existante = foundry.applications.instances.get(id);
    if (existante) return existante.render({ force: true });
    return new this({ id, actor }).render({ force: true });
  }

  constructor(options) {
    super(options);
    this.actor = options.actor;
    const sys = this.actor.system;
    this.etat = {
      etape: 0,
      camp: sys.camp,
      arcanes: { passe: null, serment: null, peche: null },
      reponses: { passe: "", serment: "", peche: "" },
      origine: "", option: "", affectation: "", libres: [],
      caracs: { chair: 14, nerf: 12, esprit: 11, verbe: 10, ame: 8 },
      rang: "conscrit",
      nom: this.actor.name, surnom: "", detail: "", lien: "",
      dotation: true,
      // Héritage (ch. V, la relève) : une Spécialité Formée et un objet d'un camarade tombé
      defunt: "", heritageSpe: "", heritageObjet: ""
    };
  }

  get title() {
    return fmt(`${C}.titre`, { nom: this.actor.name });
  }

  /** Origines et Affectations du compendium, filtrées par camp. */
  async #donnees() {
    if (this._donnees) return this._donnees;
    const pack = game.packs.get(`${SYSTEME}.origines-affectations`);
    const docs = pack ? await pack.getDocuments() : [];
    const camp = this.etat.camp;
    this._donnees = {
      origines: docs.filter(d => d.type === "origine" && d.system.camp === camp).sort((a, b) => a.name.localeCompare(b.name, "fr")),
      affectations: docs.filter(d => d.type === "affectation" && (!d.system.camp || d.system.camp === camp)).sort((a, b) => a.name.localeCompare(b.name, "fr"))
    };
    return this._donnees;
  }

  async _prepareContext() {
    const e = this.etat;
    const camp = e.camp;
    const t = cle => terme(cle, camp);
    const { origines, affectations } = await this.#donnees();
    const origine = origines.find(o => o.system.cle === e.origine) ?? null;
    const affectation = affectations.find(a => a.system.cle === e.affectation) ?? null;
    const spe = specialitesDe(origine, e.option, affectation, e.libres);
    const caracsOk = [...Object.values(e.caracs)].map(Number).sort((a, b) => b - a).join() === VALEURS.join();
    const usure = this.#usure(origine, affectation);
    const libelleSpe = s => loc(`BREVIAIRE.Specialite.${s}`);

    const etapes = ETAPES.map((cle, i) => ({ i, n: i + 1, cle, label: loc(`${C}.etape.${cle}`), active: i === e.etape }));
    const arcanes = POSITIONS.map(p => {
      const a = e.arcanes[p];
      return {
        position: p, label: t(p === "passe" ? "Passe" : p === "serment" ? "Serment" : "Peche"),
        question: loc(`${C}.question.${camp}.${p}`), reponse: e.reponses[p],
        carte: a ? { nom: a.nom, img: a.img, chiffre: a.chiffre, sens: a.sens } : null
      };
    });

    const manques = [];
    if (POSITIONS.some(p => !e.arcanes[p])) manques.push(loc(`${C}.manque.arcanes`));
    if (!origine) manques.push(loc(`${C}.manque.origine`));
    if (origine?.system.options.length && !e.option && origine.system.cle !== "pelerins") manques.push(origine.system.titreOption);
    if (!affectation) manques.push(loc(`${C}.manque.affectation`));
    if (spe.libresNecessaires > e.libres.filter(Boolean).length) manques.push(loc(`${C}.manque.libres`));
    if (!caracsOk) manques.push(loc(`${C}.manque.caracs`));
    if (!e.nom?.trim()) manques.push(loc(`${C}.manque.nom`));

    return {
      e, camp, etapes,
      etape: ETAPES[e.etape],
      premiere: e.etape === 0, derniere: e.etape === ETAPES.length - 1,
      sombre: themeSombre(camp),
      arcanes,
      paquet: t("Paquet"),
      origines: Object.fromEntries([["", "—"], ...origines.map(o => [o.system.cle, o.name])]),
      origine: origine ? {
        nom: origine.name,
        specialites: origine.system.specialites.map(libelleSpe).join(", "),
        particularite: origine.system.particularite,
        titreOption: origine.system.titreOption,
        options: origine.system.options.length ? Object.fromEntries([["", "—"], ...origine.system.options.map(o => [o.cle, o.nom])]) : null,
        usure: this.#texteAjustements(origine.system.usure, camp),
        description: origine.system.description
      } : null,
      affectations: Object.fromEntries([["", "—"], ...affectations.map(a => [a.system.cle, a.name])]),
      affectation: affectation ? {
        nom: affectation.name,
        expert: affectation.system.expert ? libelleSpe(affectation.system.expert) : "",
        formes: affectation.system.formes.map(libelleSpe).join(", "),
        dotation: affectation.system.dotation,
        note: affectation.system.note,
        usure: this.#texteAjustements(affectation.system.usure, camp)
      } : null,
      specialites: Object.entries(spe.rangs).sort(([a], [b]) => libelleSpe(a).localeCompare(libelleSpe(b), "fr"))
        .map(([s, r]) => ({ label: libelleSpe(s), rang: loc(`BREVIAIRE.RangSpecialite.${r}`), expert: r === 2 })),
      substitutions: spe.substitutions.map(s => loc(`BREVIAIRE.Substitution.${s}`)),
      libres: Array.from({ length: spe.libresNecessaires }, (_, i) => ({
        i, n: i + 1, valeur: e.libres[i] ?? "",
        choix: Object.fromEntries([["", "—"], ...Object.keys(SPECIALITES).filter(s => !spe.rangs[s] || e.libres[i] === s).map(s => [s, libelleSpe(s)])])
      })),
      caracs: CARACS.map(c => ({ cle: c, label: loc(`BREVIAIRE.Carac.${c}`), valeur: e.caracs[c], aide: loc(`${C}.caracAide.${c}`) })),
      valeurs: Object.fromEntries(VALEURS.map(v => [v, String(v)])),
      caracsOk,
      rangs: Object.fromEntries(RANGS.map(r => [r, t(`Rang.${r}`)])),
      rangAide: loc(`${C}.rangAide.${e.rang}.${camp}`),
      usure: USURES.map(u => ({ label: u === "foi" ? t("Foi") : loc(`BREVIAIRE.Usure.${u}`), de: `d${R.faces(usure[u])}` })),
      bonus: [
        origine?.system.protectionNaturelle ? fmt(`${C}.bonusProtection`, { n: origine.system.protectionNaturelle }) : null,
        origine?.system.corruptionDepart ? fmt(`${C}.bonusCorruption`, { corruption: t("Corruption"), n: origine.system.corruptionDepart }) : null
      ].filter(Boolean),
      manques,
      pret: !manques.length,
      heritage: this.#contexteHeritage(spe.rangs)
    };
  }

  #contexteHeritage(rangs) {
    const e = this.etat;
    const defunts = game.actors.filter(a => a.type === "personnage" && a !== this.actor && a.system.camp === e.camp);
    if (!defunts.length) return null;
    const defunt = game.actors.get(e.defunt);
    return {
      defunts: Object.fromEntries([["", "—"], ...defunts.map(a => [a.id, a.name])]),
      specialites: defunt ? Object.fromEntries([["", "—"], ...Object.entries(defunt.system.specialites)
        .filter(([s, v]) => v.rang > 0 && !rangs[s]).map(([s]) => [s, loc(`BREVIAIRE.Specialite.${s}`)])]) : null,
      objets: defunt ? Object.fromEntries([["", "—"], ...defunt.items.filter(i => !["arcane", "origine", "affectation"].includes(i.type)).map(i => [i.id, i.name])]) : null
    };
  }

  #usure(origine, affectation) {
    return Object.fromEntries(USURES.map(u => [u, R.cranDeCreation(origine?.system.usure[u], affectation?.system.usure[u])]));
  }

  #texteAjustements(u, camp) {
    return USURES.filter(k => u[k]).map(k => `${k === "foi" ? terme("Foi", camp) : loc(`BREVIAIRE.Usure.${k}`)} ${u[k] > 0 ? "+" : "−"}${Math.abs(u[k])}`).join(", ");
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.classList.toggle("brev-sombre", themeSombre(this.etat.camp));
    this.element.classList.toggle("brev-clair", !themeSombre(this.etat.camp));
  }

  /* ---------- Formulaire ---------- */

  static async #lireFormulaire(event, form, formData) {
    const f = foundry.utils.expandObject(formData.object);
    const e = this.etat;
    if ("origine" in f && f.origine !== e.origine) { e.option = ""; e.libres = []; }
    if ("affectation" in f && f.affectation !== e.affectation) e.libres = [];
    if ("defunt" in f && f.defunt !== e.defunt) { e.heritageSpe = ""; e.heritageObjet = ""; }
    for (const k of ["origine", "option", "affectation", "rang", "nom", "surnom", "detail", "lien", "defunt", "heritageSpe", "heritageObjet"]) if (k in f) e[k] = f[k];
    if (f.reponses) Object.assign(e.reponses, f.reponses);
    if (f.libres) e.libres = Object.keys(f.libres).sort().map(k => f.libres[k]);
    if (f.dotation !== undefined) e.dotation = !!f.dotation;
    if (f.caracs) {
      // Échange : la valeur choisie quitte sa caractéristique précédente
      for (const [c, v] of Object.entries(f.caracs)) {
        const n = Number(v);
        if (n === e.caracs[c]) continue;
        const autre = Object.keys(e.caracs).find(k => k !== c && e.caracs[k] === n);
        if (autre) e.caracs[autre] = e.caracs[c];
        e.caracs[c] = n;
      }
    }
    // Les champs texte ne redessinent pas (pour ne pas perdre le curseur)
    if (event?.target?.matches?.("input[type=text], textarea")) return;
    this.render();
  }

  static #allerA(event, target) { this.etat.etape = Number(target.dataset.i); this.render(); }
  static #suivant() { this.etat.etape = Math.min(ETAPES.length - 1, this.etat.etape + 1); this.render(); }
  static #precedent() { this.etat.etape = Math.max(0, this.etat.etape - 1); this.render(); }

  /* ---------- Arcanes ---------- */

  async #tirerPosition(position) {
    const { tirer } = await import("../arcanes/arcanes.mjs");
    const exclure = POSITIONS.filter(p => p !== position).map(p => this.etat.arcanes[p]?.numero).filter(n => n != null);
    const r = await tirer(this.etat.camp, exclure);
    if (!r) return ui.notifications.warn(loc(`${C}.paquetVide`));
    const s = r.arcane.system;
    this.etat.arcanes[position] = { uuid: r.arcane.uuid, numero: s.numero, nom: r.arcane.name, img: r.img, chiffre: s.chiffre, sens: s.sens };
  }

  static async #tirer(event, target) {
    await this.#tirerPosition(target.dataset.position);
    this.render();
  }

  static async #tirerTout() {
    for (const p of POSITIONS) this.etat.arcanes[p] = null;
    for (const p of POSITIONS) await this.#tirerPosition(p);
    this.render();
  }

  /* ---------- Création ---------- */

  static async #creer() {
    const e = this.etat;
    const { origines, affectations } = await this.#donnees();
    const origine = origines.find(o => o.system.cle === e.origine);
    const affectation = affectations.find(a => a.system.cle === e.affectation);
    if (!origine || !affectation) return;
    const spe = specialitesDe(origine, e.option, affectation, e.libres);
    const usure = this.#usure(origine, affectation);
    const opt = origine.system.options.find(o => o.cle === e.option);

    const maj = {
      name: e.nom.trim() || this.actor.name,
      "system.camp": e.camp,
      "system.origine": { cle: origine.system.cle, option: e.option, nom: opt ? `${origine.name} (${opt.nom})` : origine.name },
      "system.affectation": { cle: affectation.system.cle, nom: affectation.name },
      "system.rang": e.rang,
      "system.caracs": { ...e.caracs },
      "system.substitutions": spe.substitutions,
      "system.protectionNaturelle": origine.system.protectionNaturelle,
      "system.corruption": { value: origine.system.corruptionDepart, palier: 0 },
      "system.blessures.value": e.caracs.chair,
      "system.histoire.surnom": e.surnom, "system.histoire.detail": e.detail, "system.histoire.lien": e.lien
    };
    if (e.heritageSpe && !spe.rangs[e.heritageSpe]) spe.rangs[e.heritageSpe] = 1;
    for (const s of Object.keys(SPECIALITES)) maj[`system.specialites.${s}`] = { rang: spe.rangs[s] ?? 0, coche: false };
    for (const u of USURES) maj[`system.usure.${u}`] = { value: usure[u], base: usure[u] };
    for (const p of POSITIONS) maj[`system.arcanesCreation.${p}`] = { uuid: e.arcanes[p]?.uuid ?? "", reponse: e.reponses[p] ?? "" };
    await this.actor.update(maj, { breviaire: { sansMarque: true } });

    if (e.dotation) await this.#doter(affectation);
    const objet = game.actors.get(e.defunt)?.items.get(e.heritageObjet);
    if (objet) {
      const data = objet.toObject();
      delete data._id;
      await this.actor.createEmbeddedDocuments("Item", [data]);
    }
    ui.notifications.info(fmt(`${C}.cree`, { nom: this.actor.name }));
    this.close();
    this.actor.sheet?.render(true);
  }

  /** Dotation : objets de l'Affectation + dotation commune ; les doublons s'additionnent en quantité. */
  async #doter(affectation) {
    const sources = new Map();
    const ajouter = (doc) => {
      if (!doc) return;
      const cle = doc.uuid;
      if (sources.has(cle)) {
        const d = sources.get(cle);
        if (d.system.quantite != null) d.system.quantite += doc.system.quantite ?? 1;
      } else {
        const data = doc.toObject();
        delete data._id;
        data._stats = { compendiumSource: doc.uuid };
        sources.set(cle, data);
      }
    };
    for (const uuid of affectation.system.dotationUuids) ajouter(await fromUuid(uuid));
    for (const pack of ["equipement", "protections"]) {
      const p = game.packs.get(`${SYSTEME}.${pack}`);
      if (!p) continue;
      const index = await p.getIndex();
      for (const nom of DOTATION_COMMUNE) {
        const entree = index.find(i => i.name === nom);
        if (entree) ajouter(await p.getDocument(entree._id));
      }
    }
    const items = [...sources.values()];
    for (const i of items) if (i.type === "protection") i.system.equipee = true;
    // Les objets déjà possédés (même nom) ne sont pas recréés
    const deja = new Set(this.actor.items.map(i => i.name));
    const nouveaux = items.filter(i => !deja.has(i.name));
    if (nouveaux.length) await this.actor.createEmbeddedDocuments("Item", nouveaux);
  }
}
