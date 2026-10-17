# yogo75-driver

Reverse engineering du clavier ATK Yogo 75 PRO et de son configurateur web (`https://v3-hub.atk.store/`), pour le piloter avec notre propre outil.

- **Protocole, configurateur, commandes, champs de config** : lire `docs/protocol.md` avant toute commande envoyée au clavier ou toute recherche dans `web-dump/`. La tenir à jour **au fil de l'eau** : chaque découverte (lecture du code du configurateur, test sur le clavier, hypothèse infirmée) y entre dès qu'elle est faite, sans attendre la fin de la tâche, avec son statut (vérifié / code / hypothèse) et une ligne au journal. Elle décrit le protocole, pas notre outil : aucune commande `yogo.ts` ni fichier de sauvegarde local dedans.
- **Utilisation de `yogo.ts`** : `docs/cli.md`, à tenir à jour quand une commande change.
- **Code** : TypeScript lancé directement par Node 24 (`node yogo.ts`), en syntaxe *erasable only* (pas d'`enum`, de `namespace` ni de propriétés de paramètre). Vérification des types : `./node_modules/.bin/tsc`. Paquets : pnpm (`npx` n'est pas installé).
- **`web-dump/`** : copie non fiable du site du configurateur. On la lit et on la grep, on ne l'exécute jamais.
- **Garde-fou** : on n'écrit sur le clavier que via lire → modifier → réécrire. `0x31` (reset usine) et `0xA0`–`0xC0` (flash du firmware) demandent l'accord explicite de l'utilisateur à chaque fois.
