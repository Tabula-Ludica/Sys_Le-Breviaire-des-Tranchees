/**
 * Test d'usure (ch. I §3) : on lance le dé de la ressource ; sur 1 ou 2, il descend d'un cran.
 * Défavorisé : deux dés, on garde le plus bas. Nerfs épuisés : le personnage panique (ch. IV §8).
 */

import { SYSTEME } from "../config.mjs";
import * as R from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);

export async function testUsure(actor, cle, { defavorise = false } = {}) {
  if (actor?.type !== "personnage") return;
  const u = actor.system.usure[cle];
  const libelle = cle === "foi" ? terme("Foi", actor.system.camp) : loc(`BREVIAIRE.Usure.${cle}`);
  if (u.value === 0) return ui.notifications.warn(fmt("BREVIAIRE.Usure.dejaEpuise", { usure: libelle }));

  const faces = R.faces(u.value);
  const roll = await new Roll(defavorise ? `2d${faces}kl` : `1d${faces}`).evaluate();
  const des = roll.dice[0].results.map(r => r.result);
  const res = R.resoudreUsure(u.value, des);
  if (res.descend) await actor.update({ [`system.usure.${cle}.value`]: res.cran });

  const apres = res.cran === 0 ? loc("BREVIAIRE.Usure.epuise") : `d${R.faces(res.cran)}`;
  let verdict = res.descend ? fmt("BREVIAIRE.Usure.descend", { usure: libelle, de: apres }) : fmt("BREVIAIRE.Usure.tient", { usure: libelle });
  if (res.cran === 0) verdict += ` ${loc(cle === "nerfs" ? "BREVIAIRE.Usure.panique" : "BREVIAIRE.Usure.plusRien")}`;

  const contenu = `<div class="brev-carte-jet brev-carte-usure ${res.descend ? "echec" : "reussite"}">
    <header class="brev-cj-entete">${actor.img ? `<img src="${actor.img}" alt="">` : ""}
      <div><h3>${fmt("BREVIAIRE.Usure.test", { usure: libelle })}</h3><small>d${faces}${defavorise ? ` · ${loc("BREVIAIRE.Jet.defavorise")}` : ""}</small></div></header>
    <div class="brev-cj-des">${des.map(v => `<span class="brev-cj-d6 ${v === res.resultat ? "" : "ecarte"} ${v <= 2 ? "retire" : ""}">${v}</span>`).join("")}</div>
    <div class="brev-cj-verdict"><b>${res.descend ? loc("BREVIAIRE.Usure.uneCran") : loc("BREVIAIRE.Usure.tientCourt")}</b></div>
    <p class="brev-cj-texte">${verdict}</p></div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: contenu,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEME]: { usure: { cle, cran: res.cran } } }
  });
}
