/**
 * Outils communs aux fiches : onglets, thème du camp, listes d'objets, texte enrichi.
 *
 * Contraintes Vade (fiches en panneau plein écran sur téléphone) : aucune largeur minimale,
 * mise en page fluide (container queries dans la CSS), cibles tactiles d'au moins 44 px,
 * rien qui ne fonctionne qu'au survol.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export const CHEMIN = "systems/breviaire/templates";

/** Libellé localisé d'une clé i18n. */
export const loc = cle => game.i18n.localize(cle);

/** { cle: libellé } pour un <select>, à partir d'une liste de clés et d'un préfixe i18n. */
export function choixLocalises(cles, prefixe) {
  return Object.fromEntries(cles.map(c => [c, loc(`${prefixe}.${c}`)]));
}

/** Notation d'un dé d'usure : « d8 », ou « Épuisé ». */
export function libelleCran(faces) {
  return faces ? `d${faces}` : loc("BREVIAIRE.Usure.epuise");
}

/** Texte enrichi pour un champ HTML. */
export function enrichir(html, document) {
  return TextEditor.enrichHTML(html ?? "", { relativeTo: document, secrets: document.isOwner });
}

/**
 * Mixin commun : onglets simples (action « tab » native d'ApplicationV2), thème du camp,
 * actions sur les objets possédés.
 */
export function FicheBreviaire(Base) {
  return class extends HandlebarsApplicationMixin(Base) {
    /** Onglets de la fiche : [{ id, icone }] — vide si la fiche n'a pas d'onglets. */
    static ONGLETS = [];

    static DEFAULT_OPTIONS = {
      classes: ["breviaire", "fiche"],
      window: { resizable: true },
      form: { submitOnChange: true },
      actions: {
        editerObjet: this.#editerObjet,
        supprimerObjet: this.#supprimerObjet,
        creerObjet: this.#creerObjet,
        basculerEquipe: this.#basculerEquipe,
        changerImage: this.#changerImage,
        onglet: this.#onglet,
        quantite: this.#quantite
      }
    };

    tabGroups = { primary: this.constructor.ONGLETS[0]?.id };

    /** Camp affiché par la fiche : celui du document s'il en a un, sinon celui du monde. */
    get camp() {
      return this.document.system?.camp || game.settings.get("breviaire", "camp");
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const doc = this.document;
      Object.assign(context, {
        system: doc.system,
        source: doc.system._source,
        systemFields: doc.system.schema.fields,
        camp: this.camp,
        config: CONFIG.BREVIAIRE,
        onglets: this.constructor.ONGLETS.map(o => ({
          ...o,
          label: o.label ?? `BREVIAIRE.Onglet.${o.id}`,
          actif: this.tabGroups.primary === o.id,
          cssClass: this.tabGroups.primary === o.id ? "active" : ""
        }))
      });
      return context;
    }

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      const onglet = context.onglets.find(o => o.id === partId);
      if (onglet) context.onglet = onglet;
      return context;
    }

    /** Le thème suit le camp (variante sombre pour les Damnés) ; l'onglet actif est réappliqué. */
    _onRender(context, options) {
      super._onRender?.(context, options);
      this.element.classList.toggle("camp-damnes", this.camp === "damnes");
      this.element.classList.toggle("camp-fideles", this.camp !== "damnes");
      this.#afficherOnglet();
    }

    /** Onglets maison : un clic change l'onglet sans redessiner la fiche. */
    static #onglet(event, target) {
      this.tabGroups.primary = target.dataset.onglet;
      this.#afficherOnglet();
    }

    #afficherOnglet() {
      const actif = this.tabGroups.primary;
      if (!actif) return;
      for (const el of this.element.querySelectorAll("[data-onglet]")) {
        const oui = el.dataset.onglet === actif;
        el.classList.toggle("active", oui);
        if (el.matches("button")) el.setAttribute("aria-selected", String(oui));
      }
    }

    /** Quantité d'un objet : +1 / −1 (jamais sous 0). */
    static async #quantite(event, target) {
      const objet = this._objetDe(target);
      if (!objet) return;
      const q = Math.max(0, (objet.system.quantite ?? 0) + Number(target.dataset.delta));
      await objet.update({ "system.quantite": q });
    }

    /** Objet possédé désigné par l'élément cliqué (ou un de ses parents). */
    _objetDe(target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.document.items?.get(id);
    }

    static #editerObjet(event, target) {
      this._objetDe(target)?.sheet.render(true);
    }

    static async #supprimerObjet(event, target) {
      const objet = this._objetDe(target);
      if (!objet) return;
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: loc("BREVIAIRE.Fiche.supprimer") },
        content: `<p>${game.i18n.format("BREVIAIRE.Fiche.supprimerConfirmer", { nom: objet.name })}</p>`
      });
      if (ok) await objet.delete();
    }

    static async #creerObjet(event, target) {
      const type = target.dataset.type;
      const [objet] = await this.document.createEmbeddedDocuments("Item", [{
        type, name: game.i18n.format("BREVIAIRE.Fiche.nouveau", { type: loc(`TYPES.Item.${type}`) })
      }]);
      objet?.sheet.render(true);
    }

    /** Toucher le portrait ouvre le sélecteur de fichiers (si on peut modifier le document). */
    static #changerImage() {
      if (!this.isEditable) return;
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({
        type: "image",
        current: this.document.img,
        callback: chemin => this.document.update({ img: chemin })
      }).browse();
    }

    static async #basculerEquipe(event, target) {
      const objet = this._objetDe(target);
      if (objet && "equipee" in objet.system) await objet.update({ "system.equipee": !objet.system.equipee });
    }
  };
}
