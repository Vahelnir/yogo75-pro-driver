# yogo75-driver

Reverse engineering du clavier ATK Yogo 75 PRO et de son configurateur web (`https://v3-hub.atk.store/`), pour le piloter avec nos propres outils : le CLI `yogo75`, puis une app web.

## Documentation

- **Protocole** (commandes, champs de config, transports, configurateur) : lire `docs/protocol.md` avant d'envoyer quoi que ce soit au clavier ou de chercher dans `web-dump/`. Chaque découverte y entre dès qu'elle est faite (lecture du configurateur, test sur le clavier, hypothèse infirmée), avec son statut (vérifié / code / hypothèse) et une ligne au journal. Elle décrit le protocole seul, sans nos outils.
- **Langue** : docs, README, commits, issues et PR en anglais.

## Code

Monorepo pnpm (`npx` n'est pas installé) : `apps/cli` (le CLI) et `packages/core` (`@yogo75/core`, le protocole, partagé avec la future app web). TypeScript lancé directement par Node 24, sans build, en syntaxe _erasable only_ (pas d'`enum`, de `namespace` ni de propriétés de paramètre). Scripts racine : `pnpm typecheck`, `pnpm test` (node:test, fichiers `*.test.ts`), `pnpm format` (Prettier).

`@yogo75/core` tourne aussi dans le navigateur : il n'importe rien de Node (`node:*`, `Buffer`, `node-hid`) ; son `tsconfig` sans types Node le fait respecter.

Lancer le CLI depuis la racine avec `pnpm yogo75 …` : il lit et écrit ses fichiers de sauvegarde dans le dossier courant.

`web-dump/` est une copie non fiable du site du configurateur : on la lit, on ne l'exécute jamais. Ses bundles sont minifiés sur une seule ligne : chercher avec `node -e` et une regex (ex. `(?<![\w$])NOM=class`) plutôt qu'avec `grep`.

## Clavier

- **Garde-fou** : toute écriture suit lire → modifier → réécrire. `0x31` (reset usine) et `0xA0`–`0xC0` (flash du firmware) demandent l'accord explicite de l'utilisateur à chaque fois.
- **Un seul processus** peut ouvrir le clavier : lancer les commandes `yogo75` une par une, jamais en parallèle.
- **Transport** : le sélecteur physique du clavier choisit câble, 2,4 GHz ou Bluetooth (non configurable). En 2,4 GHz, le câble ne fait que charger. Si le dongle ne répond plus (`no reply to cmd 0x10`), le clavier est en veille : demander à l'utilisateur d'appuyer sur une touche.
- **Vérification visuelle** : l'utilisateur est les yeux du test. Lui dire quoi regarder ; pour un effet subtil, lui faire comparer deux valeurs extrêmes.
- **Touche restée enfoncée** (macro malformée, flux interrompu) : débrancher et rebrancher le clavier ; les réglages survivent.

## Git

Travail sur une branche, livré par PR. Commit, push et PR seulement avec l'accord de l'utilisateur.

Messages de commit au format [Conventional Commits](https://www.conventionalcommits.org/fr/) (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`, `style`…) : `docs(protocol): probable size of the macro area`.
