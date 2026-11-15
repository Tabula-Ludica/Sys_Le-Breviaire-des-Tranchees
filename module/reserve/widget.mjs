/**
 * Widget de la réserve commune, toujours visible (sauf sur l'interface téléphone de Vade,
 * où la réserve s'affiche dans l'onglet Personnage). Déplaçable ; sa place est gardée par navigateur.
 * Le MJ y trouve ses boutons : −1 / +1, début de mission, Messe, escouade, fin de scène.
 */

import { SYSTEME } from "../config.mjs";
import { terme } from "../lexique.mjs";
import { themeSombre } from "../settings.mjs";
import { etat, escouade, parJoueur, demander, mjDisponible } from "./reserve.mjs";

const CLE_POSITION = "breviaire-reserve-position";
const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
let element = null;

export function rendreWidget() {
  if (!game.ready) return;
  const camp = game.settings.get(SYSTEME, "camp");
  const r = etat();
  const t = cle => terme(cle, camp);
  const gm = game.user.isGM;
  const max = parJoueur() * Math.max(1, escouade().length);

  if (!element) {
    element = document.createElement("section");
    element.id = "brev-reserve";
    element.className = "breviaire brev-reserve";
    document.body.append(element);
    element.addEventListener("click", onClick);
    brancherDeplacement(element);
    restaurerPosition(element);
  }
  element.classList.toggle("brev-sombre", themeSombre(camp));
  element.classList.toggle("brev-clair", !themeSombre(camp));
  element.classList.toggle("camp-damnes", camp === "damnes");
  element.classList.toggle("brev-vide", r.des === 0);

  const grains = Array.from({ length: Math.min(r.des, 24) }, () => `<span class="brev-r-de"></span>`).join("")
    + (r.des > 24 ? `<span class="brev-r-plus">+${r.des - 24}</span>` : "")
    + Array.from({ length: Math.min(r.perdus, 8) }, () => `<span class="brev-r-de perdu"></span>`).join("");

  element.innerHTML = `
    <div class="brev-r-poignee" data-tooltip="${loc("BREVIAIRE.Reserve.deplacer")}"><i class="fa-solid fa-grip-vertical"></i></div>
    <div class="brev-r-icone"><i class="fa-solid ${camp === "damnes" ? "fa-wine-glass" : "fa-cross"}"></i></div>
    <div class="brev-r-corps">
      <div class="brev-r-titre"><b>${t("Chapelet")}</b><span class="brev-r-nombre">${r.des}<small>d6</small></span></div>
      <div class="brev-r-des" data-tooltip="${fmt("BREVIAIRE.Reserve.aide", { des: r.des, perdus: r.perdus, max })}">${grains || `<em>${loc("BREVIAIRE.Reserve.videTexte")}</em>`}</div>
      ${!mjDisponible() ? `<div class="brev-r-alerte"><i class="fa-solid fa-triangle-exclamation"></i> ${loc("BREVIAIRE.Reserve.sansMJCourt")}</div>` : ""}
    </div>
    ${gm ? `<div class="brev-r-mj">
      <button type="button" data-r="moins" data-tooltip="−1d6"><i class="fa-solid fa-minus"></i></button>
      <button type="button" data-r="plus" data-tooltip="+1d6"><i class="fa-solid fa-plus"></i></button>
      <button type="button" data-r="remplir" data-tooltip="${fmt("BREVIAIRE.Reserve.remplir", { n: parJoueur() })}"><i class="fa-solid fa-flag"></i></button>
      <button type="button" data-r="messe" data-tooltip="${t("Messe")}"><i class="fa-solid fa-church"></i></button>
      <button type="button" data-r="escouade" data-tooltip="${loc("BREVIAIRE.Reserve.escouade")}"><i class="fa-solid fa-users"></i></button>
      <button type="button" data-r="scene" data-tooltip="${loc("BREVIAIRE.Reserve.finScene")}"><i class="fa-solid fa-clapperboard"></i></button>
    </div>` : ""}`;
}

async function onClick(event) {
  const bouton = event.target.closest("button[data-r]");
  if (!bouton || !game.user.isGM) return;
  const camp = game.settings.get(SYSTEME, "camp");
  switch (bouton.dataset.r) {
    case "moins": return demander("ajouter", { n: -1 });
    case "plus": return demander("ajouter", { n: 1 });
    case "remplir": {
      const res = await demander("remplir");
      if (res.ok) annoncer(fmt("BREVIAIRE.Reserve.annonceMission", {
        reserve: terme("Chapelet", camp), n: res.etat.des,
        benediction: res.benedictions ? fmt("BREVIAIRE.Reserve.annonceBenediction", { n: res.benedictions }) : ""
      }));
      return;
    }
    case "messe": {
      const res = await demander("messe");
      if (res.ok) annoncer(fmt("BREVIAIRE.Reserve.annonceMesse", { messe: terme("Messe", camp), reserve: terme("Chapelet", camp), n: res.etat.des }));
      return;
    }
    case "escouade": return choisirEscouade();
    case "scene": return finDeScene();
  }
}

function annoncer(texte) {
  return ChatMessage.create({ content: `<div class="brev-carte-jet brev-carte-utilisation"><p class="brev-cj-texte">${texte}</p></div>` });
}

/** Dialogue du MJ : quels personnages forment l'escouade ? */
async function choisirEscouade() {
  const ids = new Set(escouade().map(a => a.id));
  const persos = game.actors.filter(a => a.type === "personnage");
  const content = `<p>${loc("BREVIAIRE.Reserve.escouadeAide")}</p><div class="brev-escouade">${persos.map(a => `
    <label><input type="checkbox" name="${a.id}" ${ids.has(a.id) ? "checked" : ""}><img src="${a.img}" alt=""> ${a.name}</label>`).join("")}</div>`;
  const choix = await foundry.applications.api.DialogV2.prompt({
    window: { title: loc("BREVIAIRE.Reserve.escouade") },
    content,
    ok: { label: loc("BREVIAIRE.Reserve.valider"), callback: (event, button) => [...button.form.querySelectorAll("input:checked")].map(i => i.name) }
  });
  if (choix) await game.settings.set(SYSTEME, "escouade", choix);
}

/** Fin de scène : efface ce qui ne dure qu'une scène (morphine, usages « une fois par scène »). */
export async function finDeScene() {
  for (const a of game.actors.filter(a => a.type === "personnage")) {
    // Chaque usage de scène est remis à null (un ObjectField fusionne les mises à jour : {} ne viderait rien)
    const usages = Object.keys(a.system.usages.scene ?? {}).filter(k => a.system.usages.scene[k] != null);
    if (usages.length) await a.update(Object.fromEntries(usages.map(k => [`system.usages.scene.${k}`, null])));
  }
  annoncer(loc("BREVIAIRE.Reserve.annonceScene"));
}

/* -------------------------------------------- */
/*  Déplacement                                 */
/* -------------------------------------------- */

function brancherDeplacement(el) {
  let depart = null;
  el.addEventListener("pointerdown", event => {
    if (!event.target.closest(".brev-r-poignee")) return;
    const rect = el.getBoundingClientRect();
    depart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    el.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  el.addEventListener("pointermove", event => {
    if (!depart) return;
    placer(el, event.clientX - depart.x, event.clientY - depart.y);
  });
  el.addEventListener("pointerup", event => {
    if (!depart) return;
    depart = null;
    el.releasePointerCapture(event.pointerId);
    try { localStorage.setItem(CLE_POSITION, JSON.stringify({ left: el.offsetLeft, top: el.offsetTop })); } catch (e) {}
  });
}

function placer(el, left, top) {
  const maxX = window.innerWidth - el.offsetWidth;
  const maxY = window.innerHeight - el.offsetHeight;
  el.style.left = `${Math.clamp(left, 0, Math.max(0, maxX))}px`;
  el.style.top = `${Math.clamp(top, 0, Math.max(0, maxY))}px`;
  el.style.bottom = "auto";
  el.style.transform = "none";
}

function restaurerPosition(el) {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_POSITION));
    if (p) requestAnimationFrame(() => placer(el, p.left, p.top));
  } catch (e) {}
}
