/**
 * Génère les sources JSON des compendiums à partir du dépôt des règles.
 *
 *   node tools/generer-sources.mjs <chemin du dépôt Le-Breviaire-des-Tranchees>
 *
 * Lit les chapitres Markdown (regles/), le lexique du site (index.html) et les données du créateur
 * (createur.html), puis écrit src/packs/<pack>/*.json au format de @foundryvtt/foundryvtt-cli.
 * Copie aussi les images d'arcanes existantes et dessine une carte provisoire pour celles qui manquent.
 * Les identifiants sont dérivés des noms : régénérer ne change pas les liens entre documents.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { SPECIALITES, SUBSTITUTIONS } from "../module/config.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGLES = path.resolve(process.argv[2] ?? "../Le-Breviaire-des-Tranchees");
const SORTIE = path.join(RACINE, "src", "packs");
const SYS = "systems/breviaire";

const lire = f => fs.readFileSync(path.join(REGLES, f), "utf8");
if (!fs.existsSync(path.join(REGLES, "regles"))) {
  console.error(`Dépôt des règles introuvable : ${REGLES}`);
  process.exit(1);
}

/* -------------------------------------------- */
/*  Outils                                      */
/* -------------------------------------------- */

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Identifiant Foundry (16 caractères) stable, dérivé d'une graine. */
function idDe(graine) {
  const h = crypto.createHash("sha256").update(`breviaire:${graine}`).digest();
  return Array.from(h.subarray(0, 16), o => ALPHABET[o % ALPHABET.length]).join("");
}
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sansAccent = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nettoyer = s => s.replace(/\*\*/g, "").replace(/\*/g, "").trim();

/** Clés des Spécialités et caractéristiques à partir de leur nom français. */
const NOMS_SPE = {
  "melee": "melee", "terrassement": "terrassement", "endurance": "endurance", "portage": "portage", "athletisme": "athletisme",
  "tir": "tir", "lancer": "lancer", "discretion": "discretion", "esquive": "esquive", "conduite": "conduite", "coup de main": "coupDeMain",
  "medecine": "medecine", "mecanique": "mecanique", "explosifs": "explosifs", "tactique": "tactique", "vigilance": "vigilance", "erudition": "erudition",
  "commandement": "commandement", "persuasion": "persuasion", "tromperie": "tromperie", "intimidation": "intimidation", "debrouille": "debrouille",
  "ferveur": "ferveur", "exorcisme": "exorcisme", "pressentiment": "pressentiment", "endurcissement": "endurcissement", "volonte": "volonte"
};
const cleSpe = nom => NOMS_SPE[sansAccent(nom).trim()];
const NOMS_SUB = Object.fromEntries(Object.keys(SUBSTITUTIONS).map(k => [k, k]));
const cleSub = nom => ({
  "preche aux armes": "precheAuxArmes", "brute": "brute", "calcul balistique": "calculBalistique",
  "chirurgien de tranchee": "chirurgienDeTranchee", "instinct de la bete": "instinctDeLaBete"
})[sansAccent(nom).trim()];

/** Lexique du site (index.html) : les balises {{…}} prennent le vocabulaire du camp. */
const LEXIQUE = (() => {
  const html = lire("index.html");
  const debut = html.indexOf("const LEXIQUE = {");
  const fin = html.indexOf("};", debut);
  return vm.runInNewContext(`(${html.slice(debut + "const LEXIQUE = ".length, fin + 1)})`, {});
})();

function adapter(md, camp) {
  // Blocs propres à un camp : <div data-camp="…"> … </div>
  md = md.replace(/<div data-camp="(fideles|damnes)">([\s\S]*?)<\/div>/g, (_, c, contenu) => (c === camp ? contenu : ""));
  return md.replace(/\{\{([^}]+)\}\}/g, (_, texte) => {
    const damne = LEXIQUE[texte.trim().toLowerCase()];
    if (camp !== "damnes" || !damne) return texte;
    return /^[A-ZÀ-ÖØ-Þ]/.test(texte) ? damne[0].toUpperCase() + damne.slice(1) : damne;
  });
}

const html = md => marked.parse(md.trim(), { async: false });
const htmlEnLigne = md => marked.parseInline(md.trim(), { async: false });

/** Lignes d'un tableau Markdown qui suit un titre donné. */
function tableau(md, apres) {
  const i = apres ? md.indexOf(apres) : 0;
  if (i < 0) throw new Error(`Section introuvable : ${apres}`);
  const lignes = md.slice(i).split("\n");
  const debut = lignes.findIndex(l => l.trim().startsWith("|"));
  const rangees = [];
  for (const l of lignes.slice(debut)) {
    if (!l.trim().startsWith("|")) break;
    rangees.push(l.trim().slice(1, -1).split("|").map(c => c.trim()));
  }
  const [entete, , ...corps] = rangees;
  return corps.map(r => Object.fromEntries(entete.map((h, k) => [nettoyer(h), r[k] ?? ""])));
}

/** Document de compendium au format de foundryvtt-cli. */
function doc(collection, graine, donnees) {
  const _id = idDe(graine);
  return {
    _id, _key: `!${collection}!${_id}`,
    folder: null, sort: 0, flags: {}, ownership: { default: 0 },
    effects: collection === "items" || collection === "actors" ? [] : undefined,
    ...donnees
  };
}
function embarquer(parent, collection, graine, donnees) {
  const _id = idDe(`${parent._id}:${graine}`);
  return { _id, _key: `!${collection}!${parent._id}.${_id}`, flags: {}, sort: 0, ...donnees };
}

const packs = {};
const ajouter = (pack, d) => (packs[pack] ??= []).push(d);

/* -------------------------------------------- */
/*  Arcanes                                     */
/* -------------------------------------------- */

const CHIFFRES = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"];
const arcanesParCamp = {};

function imageArcane(camp, n, nom) {
  const nn = String(n).padStart(2, "0");
  const dossier = path.join(RACINE, "assets", "arcanes", camp);
  fs.mkdirSync(dossier, { recursive: true });
  const source = path.join(REGLES, "assets", "arcanes", camp, `${nn}.webp`);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(dossier, `${nn}.webp`));
    return `${SYS}/assets/arcanes/${camp}/${nn}.webp`;
  }
  // Carte provisoire : numéro et nom, aux couleurs du camp
  const [fond, encre, filet] = camp === "damnes" ? ["#1a0d0a", "#e0574b", "#b48a4a"] : ["#efe3c4", "#7d1710", "#a8843f"];
  const nomSvg = nom.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  fs.writeFileSync(path.join(dossier, `${nn}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 700">
  <rect width="400" height="700" rx="18" fill="${fond}"/>
  <rect x="16" y="16" width="368" height="668" rx="12" fill="none" stroke="${filet}" stroke-width="4"/>
  <rect x="28" y="28" width="344" height="644" rx="8" fill="none" stroke="${filet}" stroke-width="1.5"/>
  <text x="200" y="120" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="${encre}">${CHIFFRES[n]}</text>
  <text x="200" y="380" text-anchor="middle" font-family="Georgia, serif" font-size="150" fill="${filet}" opacity=".35">${camp === "damnes" ? "⛧" : "✠"}</text>
  <text x="200" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="${encre}">${nomSvg}</text>
</svg>\n`);
  return `${SYS}/assets/arcanes/${camp}/${nn}.svg`;
}

function dosArcane(camp) {
  const dossier = path.join(RACINE, "assets", "arcanes", camp);
  fs.mkdirSync(dossier, { recursive: true });
  const [fond, filet] = camp === "damnes" ? ["#120807", "#b48a4a"] : ["#2b1d14", "#c9a35f"];
  fs.writeFileSync(path.join(dossier, "dos.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 700">
  <rect width="400" height="700" rx="18" fill="${fond}"/>
  <rect x="16" y="16" width="368" height="668" rx="12" fill="none" stroke="${filet}" stroke-width="4"/>
  <path d="M200 140 L200 560 M110 260 L290 260" stroke="${filet}" stroke-width="18" stroke-linecap="round"/>
  <circle cx="200" cy="350" r="120" fill="none" stroke="${filet}" stroke-width="3" opacity=".5"/>
</svg>\n`);
  return `${SYS}/assets/arcanes/${camp}/dos.svg`;
}

/** Bonus « +2 en **Commandement** et en **Intimidation** » d'une Marque. */
function bonusDeMarque(texte) {
  const m = texte.match(/\+(\d+)\s+en\s+((?:\*\*[^*]+\*\*(?:,\s*|\s+et\s+en\s+|\s+et\s+)?)+)/);
  if (!m) return [];
  return [...m[2].matchAll(/\*\*([^*]+)\*\*/g)].map(x => cleSpe(x[1])).filter(Boolean)
    .map(specialite => ({ specialite, valeur: Number(m[1]) }));
}

function arcanes() {
  for (const camp of ["fideles", "damnes"]) {
    const md = adapter(lire("regles/commun/03-arcanes.md"), camp);
    const titre = camp === "damnes" ? "Le Tarot noir" : "Le Tarot saint";
    const sensTable = tableau(md, "### Le sens des cartes");
    const section = md.slice(md.indexOf(`## 2. ${titre}`));
    const blocs = section.split(/\n### /).slice(1);
    const liste = [];
    for (const bloc of blocs) {
      const [entete, ...lignes] = bloc.split("\n");
      const m = entete.match(/^([IVXL]+)\s*·\s*(.+)$/);
      if (!m) continue;
      const n = CHIFFRES.indexOf(m[1]);
      const nom = m[2].trim();
      const effets = {};
      for (const l of lignes) {
        const e = l.match(/^- \*\*(Grâce|Damnation|Marque|Don)\s*:\s*(.+?)\.?\*\*\s*(.*)$/);
        if (e) effets[e[1] === "Don" ? "Marque" : e[1]] = { titre: e[2].trim(), texte: htmlEnLigne(e[3]), brut: e[3] };
      }
      const sens = sensTable.find(r => nettoyer(r["N°"]) === m[1])?.Sens ?? "";
      const img = imageArcane(camp, n, nom);
      const item = doc("items", `arcane:${camp}:${n}`, {
        name: nom, type: "arcane", img,
        system: {
          numero: n, camp, sens,
          grace: { titre: effets.Grâce?.titre ?? "", texte: effets.Grâce?.texte ?? "" },
          damnation: { titre: effets.Damnation?.titre ?? "", texte: effets.Damnation?.texte ?? "" },
          marque: { titre: effets.Marque?.titre ?? "", texte: effets.Marque?.texte ?? "" },
          bonus: bonusDeMarque(effets.Marque?.brut ?? "")
        }
      });
      ajouter(`arcanes-${camp}`, item);
      liste.push(item);
    }
    if (liste.length !== 22) throw new Error(`${camp} : ${liste.length} arcanes au lieu de 22`);
    arcanesParCamp[camp] = liste;
  }
}

/** Les deux paquets du Destin, en documents Cards ; chaque carte renvoie à son arcane. */
function paquets() {
  for (const camp of ["fideles", "damnes"]) {
    const nom = camp === "damnes" ? "Le Tarot noir" : "Le Tarot saint";
    const dos = dosArcane(camp);
    const deck = doc("cards", `paquet:${camp}`, {
      name: nom, type: "deck", img: dos,
      description: camp === "damnes" ? "Le Paquet du Destin des Damnés : 22 arcanes, de I à XXII." : "Le Paquet du Destin des Fidèles : 22 arcanes, de I à XXII.",
      system: {}, width: 2, height: 3, rotation: 0, displayCount: true,
      flags: { breviaire: { camp } }
    });
    deck.cards = arcanesParCamp[camp].map(a => embarquer(deck, "cards.cards", `carte:${a.system.numero}`, {
      name: `${CHIFFRES[a.system.numero]} · ${a.name}`,
      description: `<p><em>${a.system.sens}</em></p>`,
      type: "base", system: {}, suit: camp, value: a.system.numero,
      back: { name: nom, text: "", img: dos },
      faces: [{ name: a.name, text: `<p><em>${a.system.sens}</em></p>`, img: a.img }],
      face: 0, drawn: false, origin: deck._id, width: 2, height: 3, rotation: 0, sort: a.system.numero * 100000,
      flags: { breviaire: { arcane: `Compendium.breviaire.arcanes-${camp}.Item.${a._id}`, numero: a.system.numero } }
    }));
    ajouter("paquets", deck);
  }
}

/* -------------------------------------------- */
/*  Armes, protections, équipement, reliques    */
/* -------------------------------------------- */

const PARTICULARITES = {
  "discret": "discret", "brutal": "brutal", "sacre": "sacree", "sacree": "sacree", "allonge": "allonge", "deux mains": "deuxMains",
  "lunette": "lunette", "rafale": "rafale", "lourde": "lourde", "enflamme": "enflamme", "impie": "impie",
  "accepte une baionnette": "baionnette", "utilisable au contact": "contact"
};
function particularites(texte) {
  const t = sansAccent(nettoyer(texte));
  return Object.entries(PARTICULARITES).filter(([k]) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(t)).map(([, v]) => v)
    .filter((v, i, a) => a.indexOf(v) === i);
}
const formule = d => (d.trim().startsWith("d") ? `1${d.trim()}` : d.trim());
const IMG = {
  melee: "icons/svg/sword.svg", distance: "icons/svg/target.svg", lancer: "icons/svg/explosion.svg", explosif: "icons/svg/explosion.svg",
  protection: "icons/svg/shield.svg", equipement: "icons/svg/item-bag.svg", relique: "icons/svg/holy-shield.svg",
  rite: "icons/svg/book.svg", soin: "icons/svg/heal.svg", origine: "icons/svg/village.svg", affectation: "icons/svg/statue.svg"
};

function armes() {
  const md = lire("regles/commun/04-combat.md");
  for (const r of tableau(md, "### Armes de corps à corps")) {
    const nom = nettoyer(r.Arme);
    const parts = particularites(r["Particularités"]);
    ajouter("armes", doc("items", `arme:${nom}`, {
      name: nom, type: "arme", img: IMG.melee,
      system: {
        categorie: "melee", degats: formule(r["Dégâts"]), porteeCourte: null, porteeLongue: null,
        allonge: parts.includes("allonge") ? 3 : 1.5, zone: null, particularites: parts, quantite: null, equipee: true,
        description: r["Particularités"] === "—" ? "" : `<p>${htmlEnLigne(r["Particularités"])}</p>`
      }
    }));
  }
  for (const r of tableau(md, "### Armes à distance")) {
    const nom = nettoyer(r.Arme);
    const [c, l] = (r["Portée courte / longue"].match(/\d+/g) ?? []).map(Number);
    ajouter("armes", doc("items", `arme:${nom}`, {
      name: nom, type: "arme", img: IMG.distance,
      system: {
        categorie: "distance", degats: formule(r["Dégâts"]), porteeCourte: c ?? null, porteeLongue: l ?? null,
        allonge: 1.5, zone: null, particularites: particularites(r["Particularités"]), quantite: null, equipee: true,
        description: r["Particularités"] === "—" ? "" : `<p>${htmlEnLigne(r["Particularités"])}</p>`
      }
    }));
  }
  for (const r of tableau(md, "### Armes lancées et explosifs")) {
    const nom = nettoyer(r.Arme);
    const posee = /pos/i.test(r["Portée"]);
    const zone = (r.Zone.match(/(\d+)\s*m/) ?? [])[1];
    const parts = particularites(r["Particularités"]);
    if (/impies/.test(r["Particularités"])) parts.push("neBlesseQueImpie", "sacree");
    if (zone) parts.push("zone");
    ajouter("armes", doc("items", `arme:${nom}`, {
      name: nom, type: "arme", img: posee ? IMG.explosif : IMG.lancer,
      system: {
        categorie: posee ? "explosif" : "lancer", degats: formule(r["Dégâts"]),
        porteeCourte: posee ? null : Number((r["Portée"].match(/\d+/) ?? [])[0]), porteeLongue: null,
        allonge: 1.5, zone: zone ? Number(zone) : null, particularites: parts, quantite: nom.startsWith("Eau") ? 2 : 1, equipee: true,
        description: `<p>${htmlEnLigne(r["Particularités"])}</p>`
      }
    }));
  }
  // Fiole de sang maudit (réquisition des Damnés)
  ajouter("armes", doc("items", "arme:Fiole de sang maudit", {
    name: "Fiole de sang maudit", type: "arme", img: IMG.lancer,
    system: {
      categorie: "lancer", degats: "1d6", porteeCourte: 10, porteeLongue: null, allonge: 1.5, zone: null,
      particularites: [], quantite: 2, equipee: true,
      description: "<p>Lancée à 10 m : d6 dégâts, et la cible fait un test d'usure de Nerfs.</p>"
    }
  }));

  for (const r of tableau(md, "### Protections")) {
    const nom = nettoyer(r.Protection);
    const valeur = Number((r.Valeur.match(/\d+/) ?? [0])[0]);
    const type = /casque/i.test(nom) ? "casque" : /bouclier/i.test(nom) ? "bouclier" : "armure";
    ajouter("protections", doc("items", `protection:${nom}`, {
      name: nom.replace(/\s*\(.*\)/, ""), type: "protection", img: IMG.protection,
      system: { type, valeur, lourde: /Lourde/.test(r["Particularités"]), equipee: true,
        description: r["Particularités"] === "—" ? "" : `<p>${htmlEnLigne(r["Particularités"])}</p>` }
    }));
  }
}

/** Équipement de dotation et de réquisition (ch. VI §5, ch. VIII). Les objets utilisables sont réglés. */
const EQUIPEMENT = [
  ["Trousse de chirurgie", "", { type: "soin" }, 1, "Action Soigner : jet de Médecine, +1d6 Blessures au patient (ch. IV §7)."],
  ["Morphine", "", { type: "morphine", consomme: true }, 2, "Ignore les effets d'une Blessure grave jusqu'à la fin de la scène."],
  ["Sérum infernal", "damnes", { type: "morphine", consomme: true }, 2, "Comme la morphine."],
  ["Caisse de munitions", "", { type: "usure", usure: "munitions", crans: 1, consomme: true }, 1, "Munitions +1 cran au-delà du dé de base, pour une mission."],
  ["Rations supplémentaires", "", { type: "usure", usure: "vivres", crans: 1, consomme: true }, 1, "Vivres +1 cran au-delà du dé de base, pour une mission."],
  ["Fusées éclairantes", "", { type: "consommable", consomme: true }, 3, "Annulent la Nuit dans un rayon de 30 m pendant 3 tours."],
  ["Masque à gaz", "", null, 1, "Dotation de tous."],
  ["Gamelle et couverture", "", null, 1, "Dotation de tous."],
  ["Plaque d'identité", "", null, 1, "Dotation de tous."],
  ["Pelle de tranchée", "", null, 1, "Sert aussi d'arme (d4)."],
  ["Cisailles à barbelés", "", null, 1, ""],
  ["Jumelles", "", null, 1, ""],
  ["Carte d'état-major", "", null, 1, ""],
  ["Brancard pliant", "", null, 1, ""],
  ["Brassard à croix", "fideles", null, 1, ""],
  ["Trépied", "", null, 1, "Une action pour poser une arme Lourde."],
  ["Détonateur", "", null, 1, ""],
  ["Lampe", "", null, 1, ""],
  ["Cape de camouflage", "", null, 1, ""],
  ["Symbole sacré", "fideles", null, 1, ""],
  ["Livre de prières", "fideles", null, 1, ""],
  ["Encensoir", "fideles", null, 1, ""],
  ["Chaînes", "", null, 1, ""],
  ["Robe de bure", "fideles", null, 1, ""],
  ["Livre profane", "damnes", null, 1, ""],
  ["Encensoir de soufre", "damnes", null, 1, ""],
  ["Scies et crochets", "damnes", { type: "soin" }, 1, "Instruments du Chirurgien de chair : action Soigner."],
  ["Fil noir", "damnes", null, 1, ""]
];
function equipement() {
  for (const [nom, camp, u, quantite, texte] of EQUIPEMENT) {
    ajouter("equipement", doc("items", `equipement:${nom}`, {
      name: nom, type: "equipement", img: u?.type === "soin" || u?.type === "morphine" ? IMG.soin : IMG.equipement,
      system: {
        quantite, camp,
        utilisation: { type: u?.type ?? "aucune", usure: u?.usure ?? "munitions", crans: u?.crans ?? 1, consomme: !!u?.consomme },
        description: texte ? `<p>${texte}</p>` : ""
      }
    }));
  }
  ajouter("equipement", doc("items", "relique:mineure", {
    name: "Relique mineure", type: "relique", img: IMG.relique,
    system: { camp: "fideles", apport: 1, utilisee: false, description: "<p>+1d6 au Chapelet, une fois par mission.</p>" }
  }));
  ajouter("equipement", doc("items", "relique:os", {
    name: "Os d'un saint profané", type: "relique", img: IMG.relique,
    system: { camp: "damnes", apport: 1, utilisee: false, description: "<p>+1d6 au Calice, une fois par mission.</p>" }
  }));
}

/* -------------------------------------------- */
/*  Bestiaires                                  */
/* -------------------------------------------- */

const TRAITS = { "effroi": "effroi", "demon": "demon", "impie": "impie", "sacre": "sacre", "fanatique": "fanatique", "insensible": "insensible",
  "meute": "meute", "chef": "chef", "lunette": "lunette", "lourd": "lourd", "grand": "grand", "rapide": "rapide" };

/** « Fusil d8 (50/200 m) ou baïonnette d6 » → attaques. */
function attaques(texte) {
  // Découpe aux virgules et aux « ou », mais pas à l'intérieur des parenthèses
  const morceaux = [];
  let profondeur = 0, courant = "";
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === "(") profondeur++;
    if (c === ")") profondeur--;
    if (profondeur === 0 && (c === "," || texte.startsWith(" ou ", i))) {
      morceaux.push(courant);
      courant = "";
      if (c !== ",") i += 3;
      continue;
    }
    courant += c;
  }
  morceaux.push(courant);
  return morceaux.map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.+?)\s+(\d*d\d+)(?:\s*\(([^)]*)\))?\s*$/) ?? s.match(/^(.+?)\s*\((\d*d\d+)(?:,\s*([^)]*))?\)\s*$/);
    if (!m) {
      const nom = s.replace(/\s*\(.*\)/, "").trim();
      return { nom: nom[0].toUpperCase() + nom.slice(1), degats: "0", note: (s.match(/\((.*)\)/) ?? [, s])[1], courte: null, longue: null, allonge: 1.5, parts: [] };
    }
    const nom = m[1].trim();
    const note = m[3] ?? "";
    const portee = note.match(/(\d+)\s*\/\s*(\d+)\s*m/);
    const allonge = note.match(/allonge\s+(\d+)/i);
    return {
      nom: nom[0].toUpperCase() + nom.slice(1), degats: formule(m[2]), note,
      courte: portee ? Number(portee[1]) : null, longue: portee ? Number(portee[2]) : null,
      allonge: allonge ? Number(allonge[1]) : 1.5, parts: particularites(note)
    };
  });
}

function bestiaires() {
  const md = lire("regles/commun/07-bestiaire.md");
  for (const [camp, titre] of [["damnes", "## 2. Les Damnés"], ["fideles", "## 3. Les Fidèles"]]) {
    for (const r of tableau(md, titre)) {
      const nom = nettoyer(r.Ennemi);
      const traits = r.Traits === "—" ? [] : r.Traits.split(",").map(t => TRAITS[sansAccent(t.trim())]).filter(Boolean);
      const blessures = Number(r.Blessures);
      const menace = Number(r.Menace);
      const role = blessures >= 25 ? "monstre" : menace >= 13 ? "elite" : menace >= 11 ? "aguerri" : "chair";
      const acteur = doc("actors", `ennemi:${nom}`, {
        name: nom, type: "ennemi", img: "icons/svg/mystery-man.svg",
        system: {
          camp, role, menace, blessures: { value: blessures, max: blessures }, protection: Number(r.Protection),
          deplacement: Number((r["Déplacement"].match(/\d+/) ?? [9])[0]), traits, traitsLibres: "", notes: ""
        },
        prototypeToken: {
          name: nom, actorLink: false, disposition: -1, displayBars: 20,
          bar1: { attribute: "blessures" }, width: traits.includes("grand") ? 3 : 1, height: traits.includes("grand") ? 3 : 1
        }
      });
      acteur.items = attaques(r["Dégâts"]).map(a => embarquer(acteur, "actors.items", `attaque:${a.nom}`, {
        name: a.nom, type: "arme", img: a.courte ? IMG.distance : IMG.melee, effects: [],
        system: {
          categorie: a.courte ? "distance" : "melee", degats: a.degats, porteeCourte: a.courte, porteeLongue: a.longue,
          allonge: a.allonge, zone: null, particularites: a.parts, quantite: null, equipee: true,
          description: a.note && !a.courte ? `<p>${a.note}</p>` : ""
        }
      }));
      ajouter(`bestiaire-${camp}`, acteur);
    }
  }
}

/* -------------------------------------------- */
/*  Rites                                       */
/* -------------------------------------------- */

function rites() {
  for (const [camp, fichier] of [["fideles", "regles/fideles/10-rites.md"], ["damnes", "regles/damnes/10-rites-noirs.md"]]) {
    const md = adapter(lire(fichier), camp);
    for (const [niveau, titre] of [["mineur", "## 3. Les rites mineurs"], ["grand", "## 4. Les grands rites"]]) {
      const debut = md.indexOf(titre);
      const fin = md.indexOf("\n## ", debut + titre.length);
      const blocs = md.slice(debut, fin < 0 ? undefined : fin).split(/\n### /).slice(1);
      for (const bloc of blocs) {
        const [entete, ...lignes] = bloc.split("\n");
        const nom = entete.trim();
        const texte = lignes.join("\n").replace(/\n---\s*$/, "").trim();
        const n = sansAccent(nom);
        const portee = texte.match(/(\d+(?:,\d+)?)\s*m\b/);
        ajouter("rites", doc("items", `rite:${camp}:${nom}`, {
          name: nom, type: "rite", img: IMG.rite,
          system: {
            camp, niveau,
            portee: /au contact/i.test(texte) ? 1.5 : portee ? Number(portee[1].replace(",", ".")) : null,
            duree: /fin de la mission/i.test(texte) ? "mission" : /fin de la scène/i.test(texte) ? "scène" : "",
            opposition: /exorcisme/.test(n) ? "menace" : /briser la foi/.test(n) ? "ame" : "aucune",
            specialite: /exorcisme/.test(n) ? "exorcisme" : "ferveur",
            horsCombat: /hors combat/i.test(texte),
            effet: html(texte)
          }
        }));
      }
    }
  }
}

/* -------------------------------------------- */
/*  Origines et Affectations (données du créateur) */
/* -------------------------------------------- */

const DONNEES_CREATEUR = (() => {
  const h = lire("createur.html");
  const debut = h.indexOf("const CAMPS = {");
  const fin = h.indexOf("const rangsDu");
  return vm.runInNewContext(`${h.slice(debut, fin)}\n({ ORIGINES, AFFECTATIONS })`, {});
})();
const CLES_USURE = { mun: "munitions", foi: "foi", vivres: "vivres", nerfs: "nerfs" };
const usure = u => Object.fromEntries(["munitions", "foi", "vivres", "nerfs"].map(k => [k,
  Object.entries(u ?? {}).filter(([c]) => CLES_USURE[c] === k).reduce((s, [, v]) => s + v, 0)]));

function originesAffectations() {
  for (const [cle, o] of Object.entries(DONNEES_CREATEUR.ORIGINES)) {
    const [nomPart, ...reste] = o.part.split(":");
    ajouter("origines-affectations", doc("items", `origine:${cle}`, {
      name: o.nom, type: "origine", img: IMG.origine,
      system: {
        camp: o.camp, cle,
        specialites: o.spe.map(cleSpe).filter(Boolean),
        titreOption: o.option?.titre ?? "",
        options: o.option ? Object.entries(o.option.choix).filter(([k]) => k !== "aucune").map(([k, c]) => ({
          cle: k, nom: c.nom, specialites: [].concat(c.spe ?? []).map(cleSpe).filter(Boolean)
        })) : [],
        particularite: { nom: reste.length ? nomPart.trim() : "", texte: (reste.length ? reste.join(":") : o.part).trim() },
        substitutions: (o.subs ?? []).map(cleSub).filter(Boolean),
        usure: usure(o.usure), protectionNaturelle: o.protection ?? 0, corruptionDepart: o.faveur ?? 0,
        description: `<p>${o.part}</p>`
      }
    }));
  }
  for (const [cle, a] of Object.entries(DONNEES_CREATEUR.AFFECTATIONS)) {
    ajouter("origines-affectations", doc("items", `affectation:${cle}`, {
      name: a.nom, type: "affectation", img: IMG.affectation,
      system: {
        camp: a.camp ?? "", cle, expert: cleSpe(a.expert) ?? "",
        formes: a.forme.map(cleSpe).filter(Boolean), substitutions: (a.subs ?? []).map(cleSub).filter(Boolean),
        dotation: a.dot, dotationUuids: [], usure: usure(a.usure), note: a.note ?? "",
        description: a.note ? `<p>${a.note}</p>` : ""
      }
    }));
  }
}

/* -------------------------------------------- */
/*  Règles en journal (une entrée par camp)     */
/* -------------------------------------------- */

function regles() {
  const COMMUN = ["01-noyau", "02-caracteristiques", "03-arcanes", "04-combat", "05-progression", "06-arriere", "07-bestiaire"];
  for (const camp of ["fideles", "damnes"]) {
    const propres = camp === "fideles" ? ["08-creation", "09-corruption", "10-rites"] : ["08-creation", "09-faveur", "10-rites-noirs"];
    const fichiers = [...COMMUN.map(f => `regles/commun/${f}.md`), ...propres.map(f => `regles/${camp}/${f}.md`)];
    const journal = doc("journal", `regles:${camp}`, {
      name: camp === "damnes" ? "Le Bréviaire — règles des Damnés" : "Le Bréviaire — règles des Fidèles",
      categories: []
    });
    journal.pages = fichiers.map((f, i) => {
      const md = adapter(lire(f), camp);
      const titre = (md.match(/^#\s+(.+)$/m) ?? [, path.basename(f)])[1].trim();
      return embarquer(journal, "journal.pages", f, {
        name: titre, type: "text", sort: (i + 1) * 100000,
        title: { show: false, level: 1 }, text: { format: 1, content: html(md) }, system: {}, image: {}, video: {}, src: null,
        ownership: { default: -1 }
      });
    });
    ajouter("regles", journal);
  }
}

/* -------------------------------------------- */
/*  Écriture                                    */
/* -------------------------------------------- */

arcanes();
paquets();
armes();
equipement();
bestiaires();
rites();
originesAffectations();
regles();

fs.rmSync(SORTIE, { recursive: true, force: true });
for (const [pack, docs] of Object.entries(packs)) {
  const dossier = path.join(SORTIE, pack);
  fs.mkdirSync(dossier, { recursive: true });
  for (const d of docs) {
    for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
    fs.writeFileSync(path.join(dossier, `${slug(d.name)}_${d._id}.json`), `${JSON.stringify(d, null, 2)}\n`);
  }
  console.log(`${pack.padEnd(24)} ${docs.length}`);
}
