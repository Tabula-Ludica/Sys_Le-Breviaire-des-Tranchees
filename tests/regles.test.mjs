import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../module/logique/regles.mjs";

test("score : malus plafonnés à −6, score plafonné à 19", () => {
  // ch. IV : couvert lourd (−5) + portée longue (−2) → −6
  assert.equal(R.calculerScore({ carac: 10, situation: [-5, -2] }).score, 4);
  assert.equal(R.calculerScore({ carac: 14, rang: 2, situation: [2] }).score, 19);
  assert.equal(R.calculerScore({ carac: 14, rang: 2, situation: [] }).score, 18);
  assert.equal(R.calculerScore({ carac: 11, rang: 0, situation: [-2] }).score, 9);
});

test("favorisé / défavorisé s'annulent", () => {
  assert.equal(R.modeDuJet(true, true), "normal");
  assert.equal(R.deGarde([4, 17], "favorise"), 4);
  assert.equal(R.deGarde([4, 17], "defavorise"), 17);
});

test("jet : exemple du chapitre I (13 − 3 = 10 contre 9, raté)", () => {
  const r = R.resoudreJet({ d20: 13, score: 9, soustraction: 3 });
  assert.equal(r.total, 10);
  assert.equal(r.reussite, false);
  assert.equal(r.ecart, -1);
});

test("jet : 1 naturel réussit même à score 0, 20 naturel échoue même avec prière", () => {
  assert.equal(R.resoudreJet({ d20: 1, score: -2 }).reussite, true);
  const d = R.resoudreJet({ d20: 20, score: 19, soustraction: 6 });
  assert.equal(d.reussite, false);
  assert.equal(d.naturel, "damnation");
});

test("opposition", () => {
  assert.equal(R.resoudreOpposition({ reussite: true, total: 12 }, { reussite: true, total: 8 }), "a");
  assert.equal(R.resoudreOpposition({ reussite: false, total: 2 }, { reussite: true, total: 8 }), "b");
  assert.equal(R.resoudreOpposition({ reussite: false }, { reussite: false }), "blocage");
});

test("usure : 1–2 fait descendre, défavorisé garde le plus bas", () => {
  assert.deepEqual(R.resoudreUsure(3, [2]), { resultat: 2, descend: true, cran: 2 });
  assert.equal(R.resoudreUsure(3, [5, 1]).cran, 2);
  assert.equal(R.resoudreUsure(1, [1]).cran, 0);
  assert.equal(R.faces(0), 0);
  assert.equal(R.faces(5), 12);
});

test("usure à la création : exemple Marcel (Antioche) et bornes d4–d12", () => {
  assert.equal(R.faces(R.cranDeCreation(1)), 10);
  assert.equal(R.faces(R.cranDeCreation(2, 1)), 12);
  assert.equal(R.faces(R.cranDeCreation(3, 1)), 12);
  assert.equal(R.faces(R.cranDeCreation(-2, -1)), 4);
});

test("corruption : paliers, dé de Sang, baisse limitée", () => {
  assert.equal(R.deSang(2), 6);
  assert.equal(R.deSang(4), 8);
  assert.equal(R.deSang(6), 10);
  assert.equal(R.deSang(9), 12);
  assert.deepEqual(R.paliersFranchis(5, 6), [6]);
  assert.deepEqual(R.paliersFranchis(2, 9), [3, 6, 9]);
  // exemple Lucien : à 6 (palier), la confession ne fait pas baisser
  assert.equal(R.baisseAutorisee(6, 6), 6);
  assert.equal(R.baisseAutorisee(5, 3), 4);
  assert.equal(R.etatCorruption(10), "perdu");
});

test("progression : titres et Épreuve", () => {
  assert.equal(R.titreDe(2), "bleu");
  assert.equal(R.titreDe(3), "briscard");
  assert.equal(R.titreDe(12), "revenant");
  assert.equal(R.epreuveReussie(15, 14), true);
  assert.equal(R.epreuveReussie(14, 14), false);
});

test("dégâts : exemple Lucien, Brutal, Sacré, Blessure grave après Protection", () => {
  assert.deepEqual(R.calculerDegats({ de: 5, protection: 1 }), { degats: 4, blessureGrave: false });
  assert.equal(R.calculerDegats({ de: 8, protection: 3, brutal: true }).degats, 6);
  assert.deepEqual(R.calculerDegats({ de: 5, protection: 2, sacre: true, impie: true }), { degats: 6, blessureGrave: true });
  assert.equal(R.calculerDegats({ de: 5, protection: 2, sacre: true, impie: false }).degats, 3);
  assert.equal(R.calculerDegats({ de: 4, protection: 4, ignoreProtection: true }).degats, 4);
});

test("prière : qui peut prier, dé retiré, coche", () => {
  assert.equal(R.raisonSansPriere({ foi: 0, corruption: 0 }), "foiEpuisee");
  assert.equal(R.raisonSansPriere({ foi: 3, corruption: 9 }), "sursis");
  assert.equal(R.raisonSansPriere({ foi: 3, corruption: 4 }), null);
  assert.equal(R.deRetire(1, 0), true);
  assert.equal(R.deRetire(2, 5), false);
  assert.equal(R.deRetire(2, 6), true);
  assert.equal(R.meriteCoche({ enjeu: true, reussite: false }), true);
  assert.equal(R.meriteCoche({ enjeu: true, reussite: false, priere: true }), false);
  assert.equal(R.meriteCoche({ enjeu: true, reussite: true, naturel: "miracle" }), true);
  assert.equal(R.meriteCoche({ enjeu: false, reussite: false }), false);
});
