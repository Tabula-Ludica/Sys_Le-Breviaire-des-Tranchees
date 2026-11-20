/**
 * L'arrière (ch. VI) et le jugement (ch. IX) : tout ce qui se fait au retour de mission.
 * Bilan (mission survécue, Épreuves d'expérience), soins, ravitaillement, temps libre,
 * confession / pénitence / Dîme, jet de Soupçon ou de Disgrâce, départ pour la mission suivante.
 * Chaque fonction agit sur un personnage et publie son résultat dans le chat.
 */

import { SYSTEME, SPECIALITES, USURES } from "../config.mjs";
import * as R from "../logique/regles.mjs";
import { terme } from "../lexique.mjs";
import { executerJet, lancerJet } from "../jets/moteur.mjs";

const loc = cle => game.i18n.localize(cle);
const fmt = (cle, d) => game.i18n.format(cle, d);
const A = "BREVIAIRE.Arriere";

/* -------------------------------------------- */
/*  Utilitaires                                 */
/* -------------------------------------------- */

function annoncer(actor, titre, lignes, { alerte = false, rolls = [] } = {}) {
  const corps = lignes.filter(Boolean).map(l => `<p>${l}</p>`).join("");
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `<div class="${alerte ? "brev-carte-alerte" : "brev-carte-jet brev-carte-utilisation"}"><h3>${titre}</h3>${corps}</div>`
  });
}

async function d(formule) {
  const roll = await new Roll(formule).evaluate();
  await game.dice3d?.showForRoll(roll, game.user, true);
  return roll;
}

/** Un cran de plus, sans dépasser le dé de base (sauf si on est déjà au-dessus). */
function cranVersBase(u) {
  return u.value >= u.base ? u.value : u.value + 1;
}

const t = (actor, cle) => terme(cle, actor.system.camp);

/* -------------------------------------------- */
/*  1. Bilan                                    */
/* -------------------------------------------- */

/** Mission survécue : +1 au compteur, et peut-être un nouveau Titre (ch. V §1). */
export async function missionSurvecue(actor) {
  const sys = actor.system;
  if (sys.usages.mission?.bilan) return ui.notifications.warn(loc(`${A}.dejaFait`));
  const avant = sys.titre;
  await actor.update({ "system.missions": sys.missions + 1, "system.usages.mission.bilan": true });
  const apres = actor.system.titre;
  return annoncer(actor, loc(`${A}.bilan`), [
    fmt(`${A}.missionSurvecue`, { nom: actor.name, n: actor.system.missions }),
    avant !== apres ? `<b>${fmt(`${A}.nouveauTitre`, { titre: loc(`BREVIAIRE.Titre.${apres}`) })}</b>` : null
  ]);
}

/**
 * Épreuves d'expérience (ch. V §2) : pour chaque Spécialité cochée, 1d20 strictement supérieur au score.
 * Non maîtrisée → Formée → Experte ; déjà Experte : Épreuve de caractéristique (+1, max 16). La coche s'efface.
 */
export async function passerEpreuves(actor) {
  const sys = actor.system;
  const cochees = Object.keys(SPECIALITES).filter(s => sys.specialites[s].coche);
  if (!cochees.length) return ui.notifications.info(loc(`${A}.aucuneCoche`));
  const maj = {};
  const caracs = { ...sys.caracs };
  const lignes = [];
  const rolls = [];
  for (const spe of cochees) {
    const rang = sys.specialites[spe].rang;
    const nom = loc(`BREVIAIRE.Specialite.${spe}`);
    maj[`system.specialites.${spe}.coche`] = false;
    if (rang < 2) {
      const score = sys.scores[spe];
      const roll = await d("1d20"); rolls.push(roll);
      const ok = R.epreuveReussie(roll.total, score);
      if (ok) maj[`system.specialites.${spe}.rang`] = rang + 1;
      lignes.push(`${ok ? "✔" : "✘"} <b>${nom}</b> : ${roll.total} ${ok ? ">" : "≤"} ${score}`
        + (ok ? ` → ${loc(`BREVIAIRE.RangSpecialite.${rang + 1}`)}` : ""));
    } else {
      const carac = SPECIALITES[spe];
      const valeur = caracs[carac];
      const roll = await d("1d20"); rolls.push(roll);
      const ok = valeur < R.CARAC_MAX_PROGRESSION && R.epreuveReussie(roll.total, valeur);
      if (ok) { caracs[carac] = valeur + 1; maj[`system.caracs.${carac}`] = valeur + 1; }
      lignes.push(`${ok ? "✔" : "✘"} <b>${nom}</b> (${loc("BREVIAIRE.Arriere.epreuveCarac")} ${loc(`BREVIAIRE.Carac.${carac}`)}) : ${roll.total} ${roll.total > valeur ? ">" : "≤"} ${valeur}`
        + (ok ? ` → ${loc(`BREVIAIRE.Carac.${carac}`)} ${valeur + 1}` : valeur >= R.CARAC_MAX_PROGRESSION ? ` (${loc(`${A}.maximum`)})` : ""));
    }
  }
  await actor.update(maj);
  return annoncer(actor, loc(`${A}.epreuves`), lignes, { rolls });
}

/** Épreuve de caractéristique accordée par le MJ (frôlé la mort ou la folie), une par mission. */
export async function epreuveDeCarac(actor, carac) {
  const sys = actor.system;
  if (sys.usages.mission?.epreuveCarac) return ui.notifications.warn(loc(`${A}.dejaFait`));
  const valeur = sys.caracs[carac];
  const roll = await d("1d20");
  const ok = valeur < R.CARAC_MAX_PROGRESSION && R.epreuveReussie(roll.total, valeur);
  const maj = { "system.usages.mission.epreuveCarac": true };
  if (ok) maj[`system.caracs.${carac}`] = valeur + 1;
  await actor.update(maj);
  return annoncer(actor, loc(`${A}.epreuveCarac`), [
    `${ok ? "✔" : "✘"} <b>${loc(`BREVIAIRE.Carac.${carac}`)}</b> : ${roll.total} ${roll.total > valeur ? ">" : "≤"} ${valeur}${ok ? ` → ${valeur + 1}` : ""}`
  ], { rolls: [roll] });
}

/* -------------------------------------------- */
/*  2. Soins                                    */
/* -------------------------------------------- */

/** Toutes les Blessures reviennent ; la mort s'éloigne. Les Blessures graves demandent chacune un jet de Chair. */
export async function soigner(actor) {
  const sys = actor.system;
  await actor.update({ "system.blessures.value": sys.blessures.max, "system.mort.echecs": 0, "system.mort.stabilise": false });
  const graves = sys.blessuresGraves.filter(b => b.active).length;
  return annoncer(actor, loc(`${A}.soins`), [
    fmt(`${A}.soinsTexte`, { nom: actor.name, max: sys.blessures.max }),
    graves ? fmt(`${A}.convalescenceReste`, { n: graves }) : null
  ]);
}

/** Convalescence d'une Blessure grave : jet de Chair. Réussite : guérie (une Mutilation laisse sa séquelle). */
export async function convalescence(actor, index) {
  const b = actor.system.blessuresGraves[index];
  if (!b?.active) return;
  const nom = loc(`BREVIAIRE.BlessureGrave.${b.type}`);
  const message = await executerJet(actor, { type: "convalescence", carac: "chair", titre: fmt(`${A}.convalescence`, { blessure: nom }) });
  const jet = message?.getFlag(SYSTEME, "jet");
  if (!jet?.reussite) return ui.notifications.info(loc(`${A}.convalescenceEchec`));
  const graves = foundry.utils.deepClone(actor.system._source.blessuresGraves);
  graves[index].active = false;
  if (b.type === "mutilation" && !graves[index].sequelle) graves[index].sequelle = loc(`${A}.sequelle`);
  return actor.update({ "system.blessuresGraves": graves });
}

/* -------------------------------------------- */
/*  3. Ravitaillement                           */
/* -------------------------------------------- */

/**
 * Vivres au dé de base ; Nerfs et Foi +1 cran sans dépasser le dé de base (ch. VI §3).
 * Les Munitions ne bougent pas ici : la dotation de la prochaine mission les fixe (ch. VI §6).
 */
export async function ravitailler(actor) {
  const sys = actor.system;
  if (sys.usages.mission?.ravitaillement) return ui.notifications.warn(loc(`${A}.dejaFait`));
  const u = sys.usure;
  const maj = {
    "system.usure.vivres.value": Math.max(u.vivres.value, u.vivres.base),
    "system.usure.nerfs.value": cranVersBase(u.nerfs),
    "system.usure.foi.value": cranVersBase(u.foi),
    "system.usages.mission.ravitaillement": true
  };
  await actor.update(maj);
  const de = c => c ? `d${R.faces(c)}` : loc("BREVIAIRE.Usure.epuise");
  return annoncer(actor, loc(`${A}.ravitaillement`), USURES.filter(k => k !== "munitions").map(k => {
    const nom = k === "foi" ? t(actor, "Foi") : loc(`BREVIAIRE.Usure.${k}`);
    return `<b>${nom}</b> : ${de(u[k].value)} → ${de(maj[`system.usure.${k}.value`])}`;
  }));
}

/* -------------------------------------------- */
/*  5. Temps libre                              */
/* -------------------------------------------- */

export const ACTIVITES = ["reposer", "recueillir", "requisitionner", "entrainer", "renseigner", "expier", "ecrire"];

/** Une seule activité par retour (ch. VI §4). */
export async function tempsLibre(actor, activite) {
  const sys = actor.system;
  if (sys.usages.mission?.tempsLibre) return ui.notifications.warn(loc(`${A}.dejaFait`));
  if (activite === "ecrire" && sys.lettreEcrite) return ui.notifications.warn(loc(`${A}.lettreDejaEcrite`));
  const camp = sys.camp;
  const u = sys.usure;
  const maj = { "system.usages.mission.tempsLibre": activite };
  const lignes = [];
  switch (activite) {
    case "reposer":
      maj["system.usure.nerfs.value"] = cranVersBase(u.nerfs);
      break;
    case "recueillir":
      maj["system.usure.foi.value"] = cranVersBase(u.foi);
      break;
    case "ecrire":
      maj["system.usure.nerfs.value"] = cranVersBase(u.nerfs);
      maj["system.usure.foi.value"] = cranVersBase(u.foi);
      maj["system.lettreEcrite"] = true;
      lignes.push(loc(`${A}.lettreLue`));
      break;
  }
  await actor.update(maj);
  await annoncer(actor, loc(`${A}.tempsLibre`), [
    `<b>${loc(`${A}.activite.${activite}.${camp}`)}</b>`, loc(`${A}.activiteAide.${activite}`), ...lignes
  ]);
  // Activités qui demandent un jet
  if (activite === "requisitionner") {
    const officier = sys.rang !== "conscrit";
    return lancerJet(actor, { specialite: officier ? "commandement" : "debrouille" });
  }
  if (activite === "renseigner") return lancerJet(actor, { specialite: "debrouille" });
}

/* -------------------------------------------- */
/*  6. Le jugement                              */
/* -------------------------------------------- */

/** −1 Corruption (ou Faveur) : une fois par retour, jamais sous le dernier palier atteint (ch. IX §3). */
export async function baisserCorruption(actor, raison) {
  const sys = actor.system;
  const c = sys.corruption;
  if (sys.usages.mission?.baisse) {
    return annoncer(actor, raison, [fmt(`${A}.baisseDejaFaite`, { corruption: t(actor, "Corruption") })]);
  }
  const apres = R.baisseAutorisee(c.value, c.palier);
  if (apres === c.value) {
    return annoncer(actor, raison, [fmt(`${A}.baissePalier`, { corruption: t(actor, "Corruption"), palier: c.palier })]);
  }
  await actor.update({ "system.corruption.value": apres, "system.usages.mission.baisse": true });
  return annoncer(actor, raison, [fmt(`${A}.baisse`, { corruption: t(actor, "Corruption"), valeur: apres })]);
}

/** Confession (Fidèles) : jet d'Âme ; réussite −1 Corruption ; dans tous les cas +2 au prochain Soupçon. */
export async function confession(actor) {
  const titre = loc(`${A}.confession`);
  const message = await executerJet(actor, { type: "jugement", carac: "ame", titre });
  await actor.update({ "system.soupcon.confession": true });
  if (message?.getFlag(SYSTEME, "jet")?.reussite) return baisserCorruption(actor, titre);
}

/** Pénitence (Fidèles) : vœu tenu −1, vœu rompu +1. */
export async function penitence(actor, tenu) {
  const titre = loc(`${A}.penitence`);
  if (tenu) return baisserCorruption(actor, titre);
  await actor.update({ "system.corruption.value": Math.min(R.CORRUPTION_MAX, actor.system.corruption.value + 1) });
  return annoncer(actor, titre, [fmt(`${A}.voeuRompu`, { corruption: t(actor, "Corruption") })]);
}

/** Dîme (Damnés) : offrir une âme, −1 Faveur ; le MJ juge l'offrande. */
export const dime = actor => baisserCorruption(actor, loc(`${A}.dime`));

const TABLE_SOUPCON = [null, "surveillance", "surveillance", "surveillance", "interrogatoire", "interrogatoire", "punitive", "punitive", "excommunication", "bucher"];
const TABLE_DISGRACE = [null, "rappel", "rappel", "chatiment", "sacrificielle", "decheance", "chiens"];

/**
 * Jet de Soupçon (Fidèles, Corruption 3+) : 1d20 + 2 par Marque + 2 confession + 3 Marque vue.
 * 20 ou plus : 1d6 + Marques sur la table de l'Inquisition.
 */
export async function jetDeSoupcon(actor) {
  const sys = actor.system;
  if (sys.corruption.value < R.PALIERS[0]) return annoncer(actor, loc(`${A}.soupcon`), [loc(`${A}.soupconInutile`)]);
  const marques = sys.marques.length;
  const bonus = 2 * marques + (sys.soupcon.confession ? 2 : 0) + (sys.soupcon.marqueVue ? 3 : 0);
  const roll = await d(`1d20 + ${bonus}`);
  const lignes = [fmt(`${A}.detailSoupcon`, { d20: roll.dice[0].total, marques: 2 * marques, confession: sys.soupcon.confession ? 2 : 0, vue: sys.soupcon.marqueVue ? 3 : 0 }),
    `<span class="brev-alerte-total">${loc(`${A}.total`)} <b>${roll.total}</b></span>`];
  const rolls = [roll];
  const maj = { "system.soupcon.confession": false, "system.soupcon.marqueVue": false };
  if (roll.total >= 20) {
    const r2 = await d(`1d6 + ${marques}`); rolls.push(r2);
    const cle = TABLE_SOUPCON[Math.min(9, r2.total)];
    lignes.push(`<b>${loc(`${A}.inquisition`)}</b> (${r2.total}) : <b>${loc(`${A}.tableSoupcon.${cle}.titre`)}</b> — ${loc(`${A}.tableSoupcon.${cle}.texte`)}`);
    if (cle === "excommunication") maj["system.excommunie"] = true;
  } else lignes.push(loc(`${A}.passe`));
  await actor.update(maj);
  return annoncer(actor, loc(`${A}.soupcon`), lignes, { alerte: roll.total >= 20, rolls });
}

/**
 * Jet de Disgrâce (Damnés, à chaque Messe noire) : 1d20 + 3 mission échouée + 3 par Ordre refusé
 * + 2 Transfuge − 2 par Don. 20 ou plus : 1d6 sur la table des maîtres.
 */
export async function jetDeDisgrace(actor) {
  const sys = actor.system;
  const dons = sys.marques.length;
  const transfuge = sys.origine.cle === "transfuge";
  const g = sys.disgrace;
  const bonus = (g.missionEchouee ? 3 : 0) + 3 * g.ordresRefuses + (transfuge ? 2 : 0) - 2 * dons;
  const roll = await d(`1d20 ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`);
  const lignes = [fmt(`${A}.detailDisgrace`, { d20: roll.dice[0].total, echec: g.missionEchouee ? 3 : 0, ordres: 3 * g.ordresRefuses, transfuge: transfuge ? 2 : 0, dons: 2 * dons }),
    `<span class="brev-alerte-total">${loc(`${A}.total`)} <b>${roll.total}</b></span>`];
  const rolls = [roll];
  if (roll.total >= 20) {
    const r2 = await d("1d6"); rolls.push(r2);
    const cle = TABLE_DISGRACE[r2.total];
    lignes.push(`<b>${loc(`${A}.maitres`)}</b> (${r2.total}) : <b>${loc(`${A}.tableDisgrace.${cle}.titre`)}</b> — ${loc(`${A}.tableDisgrace.${cle}.texte`)}`);
  } else lignes.push(loc(`${A}.passe`));
  await actor.update({ "system.disgrace.ordresRefuses": 0, "system.disgrace.missionEchouee": false });
  return annoncer(actor, loc(`${A}.disgrace`), lignes, { alerte: roll.total >= 20, rolls });
}

/* -------------------------------------------- */
/*  7. Départ                                   */
/* -------------------------------------------- */

/** Nouvelle mission : efface les usages « une fois par mission » et « par scène », rend les reliques. */
export async function depart(actor) {
  const sys = actor.system;
  const vider = cle => Object.keys(sys.usages[cle] ?? {}).filter(k => sys.usages[cle][k] != null)
    .map(k => [`system.usages.${cle}.${k}`, null]);
  await actor.update(Object.fromEntries([...vider("mission"), ...vider("scene")]));
  const reliques = actor.items.filter(i => i.type === "relique" && i.system.utilisee).map(i => ({ _id: i.id, "system.utilisee": false }));
  if (reliques.length) await actor.updateEmbeddedDocuments("Item", reliques);
  return annoncer(actor, loc(`${A}.depart`), [fmt(`${A}.departTexte`, { nom: actor.name })]);
}

/** Dotation de mission (ch. VI §6) : décalage du dé de base des Munitions. */
export const DOTATIONS = { raid: -1, ordinaire: 0, assaut: 1, siege: 2 };

/**
 * Fixe les Munitions de chaque personnage pour la mission : dé de base + dotation, +1 cran avec une caisse
 * de munitions réquisitionnée, jamais au-delà de d12.
 * shortcut: jamais sous d4 (un raid ne laisse pas un soldat à sec avant le départ), à revoir si la règle tranche.
 */
export async function appliquerDotation(actors, dotation, caisses = new Set()) {
  const lignes = [];
  for (const a of actors) {
    const base = a.system.usure.munitions.base;
    const cran = Math.clamp(base + DOTATIONS[dotation] + (caisses.has(a.id) ? 1 : 0), 1, R.CRAN_MAX);
    await a.update({ "system.usure.munitions.value": cran });
    lignes.push(`<b>${a.name}</b> : d${R.faces(cran)}${caisses.has(a.id) ? ` (${loc(`${A}.caisse`)})` : ""}`);
  }
  return ChatMessage.create({
    content: `<div class="brev-carte-jet brev-carte-utilisation"><h3>${fmt(`${A}.dotationTitre`, { dotation: loc(`${A}.dotation.${dotation}`) })}</h3>`
      + lignes.map(l => `<p>${l}</p>`).join("") + "</div>"
  });
}

/** Nouvelle session : la Tentation (l'Ordre) redevient possible. */
export async function nouvelleSession(actors) {
  for (const a of actors) {
    const cles = Object.keys(a.system.usages.session ?? {}).filter(k => a.system.usages.session[k] != null);
    if (cles.length) await a.update(Object.fromEntries(cles.map(k => [`system.usages.session.${k}`, null])));
  }
}
