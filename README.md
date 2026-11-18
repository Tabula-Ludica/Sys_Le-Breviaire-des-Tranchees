# Le Bréviaire des Tranchées — système Foundry VTT

Système **Foundry VTT v14** pour *Le Bréviaire des Tranchées*, jeu de rôle non officiel dans l'univers de Trench Crusade.

- Règles : https://tabula-ludica.github.io/Le-Breviaire-des-Tranchees/
- Dépôt des règles : [Tabula-Ludica/Le-Breviaire-des-Tranchees](https://github.com/Tabula-Ludica/Le-Breviaire-des-Tranchees)

> **État : 0.9 (complet, en test).** Toutes les règles du Bréviaire sont branchées ; les règles encore marquées « prototype » sur le site peuvent bouger.

## Ce que fait le système

- **Deux camps** (réglage du monde) : tout le vocabulaire suit, Fidèles ou Damnés (Chapelet/Calice, Foi/Haine, Corruption/Faveur, Marques/Dons…).
- **Fiches** de personnage et d’ennemi, utilisables sur téléphone et tablette avec le module [Vade](https://github.com/quill-and-seal/Vade) ; thème sombre par défaut (réglage personnel).
- **Jets** : dialogue (Spécialité, substitution, difficulté, couvert, portée, malus plafonné à −6, favorisé/défavorisé), prière et pacte avant ou après le jet, Tentation/Ordre, carte de chat avec l’écart.
- **Réserve commune** partagée (widget), remplissages de début de mission, Messe, Bénédiction papale, reliques, ennemi notable.
- **Paquet du Destin** en documents Cards : Miracle, Damnation, Marques aux paliers, création ; effets chiffrés applicables d’un clic.
- **Corruption / Faveur** : paliers scellés, chute à 10, contrôle du démon à 9, confession, pénitence, Dîme, Soupçon et Disgrâce.
- **Combat** : initiative par phases (Nerf ; Assaut éclair, embuscade, reprendre/perdre), visée (distance, portée, couvert, Viseur, Plonger), Munitions après le tir, mêlée en opposition, dégâts (Protection, Brutal, Sacré, eau bénite), Blessures graves, hors de combat, jets de Mort, panique.
- **Retour à l’arrière** : bilan, Épreuves d’expérience, soins, ravitaillement, temps libre, jugement, départ.
- **Créateur de personnage** en sept étapes, avec la dotation et l’héritage.
- **Compendiums** générés depuis les règles : règles, Spécialités, Origines et Affectations, armes, protections, équipement, rites, arcanes, paquets, bestiaires.

## Pour le MJ

- Widget de la réserve : −1 / +1, début de mission, Messe, escouade, fin de scène, nouvelle session (Tentation), embuscade, retour à l’arrière de toute l’escouade.
- Réglez la scène sur une grille carrée de 1,5 m (c’est la valeur par défaut du système).

## Installation

Dans Foundry, **Systèmes de jeu → Installer un système**, puis colle ce lien de manifeste :

```
https://github.com/Tabula-Ludica/Sys_Le-Breviaire-des-Tranchees/releases/latest/download/system.json
```

## Développement

- Foundry v14 uniquement : `TypeDataModel`, `ApplicationV2`, modules ES.
- Tout le texte est dans `lang/fr.json`. Le vocabulaire qui change selon le camp est sous `BREVIAIRE.Lexique.fideles` et `BREVIAIRE.Lexique.damnes`, et se lit avec `terme("Chapelet")`.
- Les compendiums sont générés depuis le dépôt des règles puis compilés :

```
node tools/generer-sources.mjs ../Le-Breviaire-des-Tranchees   # src/packs (versionné)
node tools/packs.mjs                                          # packs/ (construit par la release)
```

- Les règles pures (calcul du score, dés d'usure, paliers, dégâts…) sont dans `module/logique/regles.mjs`, sans dépendance à Foundry. Elles se testent avec Node 20 ou plus :

```
node --test
```

> Projet fan-made, non affilié à Factory Fortress Inc. Trench Crusade et son univers appartiennent à leurs auteurs.
