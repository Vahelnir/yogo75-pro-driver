# `yogo75` : utilisation

Outil en ligne de commande qui pilote le clavier selon le protocole décrit dans [`protocol.md`](protocol.md). TypeScript lancé directement par Node 24 ; dépendance : `node-hid` (`pnpm install`).

- **Transport** : `yogo75` passe par le câble USB s'il est détecté (PID `0x119B`), sinon par le dongle 2,4 GHz (PID `0x11FF`), avec la taille de paquet correspondante. Le mode actif dépend du sélecteur du clavier.
- **Une commande à la fois** : un seul processus peut ouvrir le clavier.
- **Écritures** : toujours lire → modifier → réécrire. Les commandes qui écrivent une ressource entière en font d'abord une sauvegarde locale (`*-backup.json`, non versionnée) au premier appel, avec la commande de restauration correspondante.
- **Débogage** : `DEBUG=1` affiche chaque paquet envoyé (`tx`) et reçu (`rx`).

## Infos, config et batterie

```sh
pnpm yogo75                          # infos (get_keyboard_info) et bloc de config, champ par champ
pnpm yogo75 set <champ> <0-255>      # n'importe quel champ du bloc, valeur brute (ex. set sleepL 60)
pnpm yogo75 power                    # niveau de batterie et état de charge
```

## Rétroéclairage

```sh
pnpm yogo75 color 00ff00 4           # couleur unique RRGGBB, et mode d'éclairage optionnel (ici fixe)
pnpm yogo75 color 00ff00 253         # mode couleurs par touche
pnpm yogo75 ledmap                   # table touche -> LED (brut, 384 octets)
pnpm yogo75 leds                     # couleur de chaque LED
pnpm yogo75 setled 0 ff0000          # touche d'index 0 (Échap) en rouge ; sauvegarde dans leds-backup.json au premier appel
pnpm yogo75 leds-restore             # réécrit leds-backup.json
```

## Écran à points

```sh
pnpm yogo75 dot 12                   # mode intégré (-1 à 12), ici YOGO
pnpm yogo75 dot 0 00ff00             # mode star, couleur verte
pnpm yogo75 dotimage <216 chiffres hex>   # image fixe : 36 pixels RRGGBB, rangée par rangée (écrase l'image stockée)
pnpm yogo75 dot 6                    # affiche l'image stockée
pnpm yogo75 dotlive <216 chiffres hex> 60 # visualiseur en direct : renvoie l'image pendant 60 s
pnpm yogo75 dotlive-end              # fin du flux (remet le mode de l'écran à 0)
```

## Keymap

```sh
pnpm yogo75 keymap 0                 # couche 0 actuelle, un emplacement de 3 octets par ligne
pnpm yogo75 keymap 1 factory         # couche Fn d'usine
pnpm yogo75 keymap-backup            # sauvegarde les 4 couches dans keymap-backup.json
pnpm yogo75 setkey 0 14 10001b       # couche 0, index 14 (Inser) -> X ; exige keymap-backup.json
pnpm yogo75 keymap-restore           # réécrit keymap-backup.json
```

## Macros

```sh
pnpm yogo75 macros [paquets]         # zone des macros, brute (4 paquets de 56 octets par défaut)
pnpm yogo75 setmacro 0b0c            # macro 0 = taper h puis i ; sauvegarde dans macros-backup.json au premier appel
pnpm yogo75 setmacro e10b0c,0b0c@500 # macro 0 = « HI » (Maj tenue), macro 1 = « hi » avec 500 ms par action
pnpm yogo75 setkey 0 14 600000       # Inser -> macro 0, une exécution
pnpm yogo75 macros-restore           # réécrit macros-backup.json
```

Une macro s'écrit comme une suite de codes HID tapés l'un après l'autre ; les modificateurs (`e0`–`e7`) sont tenus autour du reste. `@n` fixe le délai par action en ms (20 par défaut).

## Sauvegarde complète

```sh
pnpm yogo75 backup [fichier]         # config, 4 couches, couleurs par touche, macros -> full-backup.json par défaut
pnpm yogo75 restore [fichier]        # réécrit tout, puis relit et compare octet par octet
```

- `backup` refuse d'écraser un fichier existant. L'image fixe de l'écran à points n'est pas sauvegardée : le protocole n'a pas de commande pour la relire.
- `restore` vérifie la taille de chaque partie avant tout envoi. Après l'écriture, il attend 50 ms avant de relire (voir le piège de relecture dans [`protocol.md`](protocol.md#bloc-de-config-0x14--0x15)), et s'arrête en erreur en nommant les parties qui diffèrent.
- Vérifié en USB et à travers le dongle (restauration complète en 1,1 s par le dongle).

## Commandes à ne pas envoyer

`yogo75` n'envoie jamais `0x31` (reset usine) ni `0xA0`–`0xC0` (flash du firmware).
