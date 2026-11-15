# Le Bréviaire des Tranchées — système Foundry VTT

Système **Foundry VTT v14** pour *Le Bréviaire des Tranchées*, jeu de rôle non officiel dans l'univers de Trench Crusade.

- Règles : https://tabula-ludica.github.io/Le-Breviaire-des-Tranchees/
- Dépôt des règles : [Tabula-Ludica/Le-Breviaire-des-Tranchees](https://github.com/Tabula-Ludica/Le-Breviaire-des-Tranchees)

> **État : en construction (0.4).** Données, fiches, jets, dés d’usure et réserve commune en place ; les arcanes, la Corruption et le combat arrivent étape par étape.

## Installation

Dans Foundry, **Systèmes de jeu → Installer un système**, puis colle ce lien de manifeste :

```
https://github.com/Tabula-Ludica/Sys_Le-Breviaire-des-Tranchees/releases/latest/download/system.json
```

## Développement

- Foundry v14 uniquement : `TypeDataModel`, `ApplicationV2`, modules ES.
- Tout le texte est dans `lang/fr.json`. Le vocabulaire qui change selon le camp est sous `BREVIAIRE.Lexique.fideles` et `BREVIAIRE.Lexique.damnes`, et se lit avec `terme("Chapelet")`.
- Les règles pures (calcul du score, dés d'usure, paliers, dégâts…) sont dans `module/logique/regles.mjs`, sans dépendance à Foundry. Elles se testent avec Node 20 ou plus :

```
node --test
```

> Projet fan-made, non affilié à Factory Fortress Inc. Trench Crusade et son univers appartiennent à leurs auteurs.
