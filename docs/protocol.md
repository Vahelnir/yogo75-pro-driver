# Protocole du ATK Yogo 75 PRO et fonctionnement du configurateur

Référence issue du reverse engineering du configurateur web ATK (`https://v3-hub.atk.store/`).

## En bref

Le configurateur officiel est un site web. Il communique avec le clavier par l'API **WebHID** du navigateur, en échangeant de petits messages de 64 octets sur une interface USB réservée à la configuration. Il n'y a pas de pilote à installer : le « driver », c'est ce protocole. Comme le code du site est en JavaScript, on a pu le télécharger et le lire pour retrouver le format des messages.

Chaque échange suit le même schéma : on envoie une commande (« lis la config », « écris la keymap »…), le clavier répond avec les données demandées ou un accusé de réception. Toute la configuration d'éclairage et d'options tient dans un bloc de 64 octets, qu'on lit, qu'on modifie puis qu'on réécrit.

Pour essayer (clavier branché en USB) :

```sh
node yogo.ts                    # affiche les infos et la config actuelle
node yogo.ts color 00ff00 4     # rétroéclairage vert fixe
DEBUG=1 node yogo.ts            # montre chaque paquet envoyé (tx) et reçu (rx)
```

### Exemple : changer la couleur du rétroéclairage

Ce que fait `node yogo.ts color 00ff00 4`, paquet par paquet (premiers octets seulement, extraits de `DEBUG=1`) :

```
tx aa 10 00 00 00 01 00 …                      ouvrir la session (cmd 0x10), requête n°1
rx aa 10 00 00 00 01 00 55 …                   OK
tx aa 14 00 00 38 02 00 …                      lire la config : 56 (0x38) octets à l'offset 0
rx aa 14 00 00 38 02 00 55  00 00 00 5a 03 …   les données commencent à l'octet 8
tx aa 14 38 00 08 03 00 …                      lire les 8 octets restants (offset 56)
rx …
tx aa 15 00 00 38 04 00 00  00 00 04 5a 03 00 00 00 ff 00 …   réécrire le bloc : mode 4, R=00 G=ff B=00
rx aa 15 … 55 …                                OK
tx aa 15 38 00 08 05 00 …                      réécrire les 8 octets restants
rx aa 15 … 55 …                                OK
```

### Glossaire

- **HID** (Human Interface Device) : la norme USB des claviers et souris. Un même appareil expose plusieurs **interfaces** HID, chacune identifiée par une *usage page* et un *usage* (par exemple `0x01`/6 pour le clavier standard).
- **Rapport** (*report*) : un message HID. Ici, les rapports font toujours 64 octets.
- **VID / PID** : identifiants USB du fabricant et du produit.
- **LE** (*little-endian*) : un nombre sur 2 octets est écrit octet faible d'abord. `38 00` = 0x0038 = 56.
- **Keymap / couche** : la correspondance touche physique → code envoyé. Le clavier en a 4 couches (normale, Fn…).
- **Bootloader / IAP** : le mode spécial qui sert à flasher le firmware.

## Statut des informations

Chaque fait porte un statut :

- **vérifié** : testé sur le clavier réel, avec le résultat observé ;
- **code** : lu dans le JS du configurateur, pas encore testé ;
- **hypothèse** : déduit, à confirmer.

Ce document se met à jour **au fur et à mesure des découvertes**, qu'elles viennent de la lecture du code du configurateur ou d'un test sur le clavier. On n'attend pas la fin d'une tâche : on ajoute le fait avec son statut, on corrige celui qui était faux, et on note la découverte dans le [journal](#journal).

## Matériel

| Champ | Valeur | Statut |
|---|---|---|
| Nom USB | `ATK Yogo75 PRO`, fabricant `RDMCTMZT` | vérifié |
| VID / PID filaire | `0x373B` / `0x119B` (4507) | vérifié |
| PID 2.4 GHz (dongle) | 4607 | code |
| PID bootloader (IAP) | même PID, usage page `0xFF00`, usage 1 | code |
| Firmware | `01.26`, protocole v3 | vérifié (`get_keyboard_info`) |
| Variante sans PRO | Yogo 75 : PID 4508 filaire, 4608 en 2.4 GHz | code |

Interfaces HID exposées en USB (vérifié avec `hidutil list` / `node-hid`) :

| Usage page / usage | Rôle |
|---|---|
| `0x01` / 6, 2, 1, 128 ; `0x0C` / 1 | clavier, souris, contrôle système, multimédia (standard) |
| **`0xFF60` / `0x61`** | **canal de configuration** (même interface que VIA/QMK raw HID, mais protocole différent) |
| `0xFF00` / 1 | canal vendeur, utilisé pour le bootloader / firmware |

## Le configurateur web

C'est une app Vue empaquetée par rolldown, qui parle au clavier en **WebHID**. Il n'y a pas de binaire natif à désassembler.

- Copie téléchargée le 2026-10-17 dans `web-dump/static/`. Ce dossier **n'est pas versionné** (code propriétaire d'ATK) : chacun le retélécharge. Les noms de fichier contiennent un hash et changent à chaque déploiement du site. Pour obtenir la copie : récupérer `index.html`, puis suivre récursivement les `./xxx-HASH.js` référencés (`curl` dans une boucle suffit).
- `web-dump/evision_v2.js` s'obtient en découpant `demoMode.store-*.js` entre `var Ui=class` et `O(Ui,"solutionProvider"`, puis en ajoutant un retour à la ligne avant chaque `async nomDeMethode(`.
- Ce code est **non fiable** : on le lit et on le grep, on ne l'exécute jamais.
- Le JS est minifié. Les noms de variables (`Ui`, `an`, `oo`…) ne valent que pour ce build ; les chaînes littérales (`"fieldMap"`, `get_keyboard_function`, `productId:4507`) restent stables et servent de points d'entrée pour la recherche.

Fichiers clés du build du 2026-10-17 :

| Fichier | Contenu |
|---|---|
| `demoMode.store-*.js` | Registre des appareils (`productId:4507` → `solutionProvider: EVISION_V2`), contrôleur du clavier (classe `Ui`), transport (`fW`), classes de paquets (`an`), table des commandes (`oo`), commandes du bootloader (`Ec`) |
| `web-dump/evision_v2.js` | Extrait du contrôleur `Ui`, une méthode par ligne. C'est le point d'entrée pour lire le comportement d'une fonction |
| `keyboard-info.util-*.js` | Liste des modes d'éclairage (`Ns`), des modes de l'écran à points (`Os`) |
| `base-hid-device-*.js` | Base WebHID : files de requêtes, mutex, 3 tentatives, timeout de 500 ms |

Le Yogo 75 PRO apparaît **deux fois** dans le registre : une fois en `EVISION_V2` simple, et une fois avec `isVia:true, skipViaDetection:true` (contrôleur `VC` qui enveloppe `Ui`). Les deux passent par le même contrôleur `Ui`.

Pour retrouver une méthode : `grep -o 'async NOM(.\{0,1500\}' web-dump/evision_v2.js`.

## Transport

Statut : vérifié.

- Rapports de sortie de 64 octets, report ID 0, sur l'interface `0xFF60`. Avec `node-hid`, on écrit `[0x00, ...64 octets]`.
- Chaque requête porte un **code de requête** sur 16 bits que le clavier renvoie dans sa réponse. C'est ce code qui associe une réponse à sa requête. D'autres rapports d'entrée peuvent arriver entre-temps : on les ignore.
- En 2.4 GHz, les paquets sont découpés autrement (`getKeyFunctionWireless`, `writeKeyFunctionWireless`) et le timeout passe à 3 s. Non implémenté (code).

## Format des paquets

```
octet  0     1     2..3          4      5..6               7       8..63
      0xAA  cmd   offset (LE)   len    code requête (LE)  -       données (56 max)
```

| Octet | Requête | Réponse | Statut |
|---|---|---|---|
| 0 | `0xAA` (constante `rA`) | `0xAA` | vérifié |
| 1 | commande | commande renvoyée | vérifié |
| 2..3 | offset dans la ressource, little-endian | renvoyé ; **`[2] == 0xFF` = erreur** | vérifié (renvoi) / code (erreur) |
| 4 | longueur des données (≤ 56) | renvoyée | vérifié |
| 5..6 | code de requête | renvoyé | vérifié |
| 7 | 0 | `0x55`, probablement un accusé de réception | hypothèse |
| 8..63 | données à écrire | données lues | vérifié |

Les ressources qui dépassent 56 octets se lisent ou s'écrivent en plusieurs paquets, en avançant l'offset de 56 à chaque fois.

## Commandes

Table `oo` du configurateur.

| Cmd | Nom | Usage | Statut |
|---|---|---|---|
| `0x10` | start | ouvre la session ; le configurateur le renvoie si plus de 5 s se sont écoulées | vérifié |
| `0x11` | end | ferme la session (le configurateur ne l'appelle presque jamais) | code |
| `0x12` | get_keyboard_info | capacités de l'appareil, voir [infos](#get_keyboard_info-0x12) | vérifié |
| `0x14` | get_keyboard_function | lit le bloc de config | vérifié |
| `0x15` | write_keyboard_function | écrit le bloc de config | vérifié |
| `0x16`–`0x19` | get_default_key_matrix 1–4 | keymap d'usine, couches 0–3, voir [keymap](#keymap) | vérifié (lecture) |
| `0x1A`, `0x1C`, `0x1E`, `0x20` | get_current_key_matrix 1–4 | keymap actuelle, couches 0–3 | vérifié (lecture) |
| `0x1B`, `0x1D`, `0x1F`, `0x21` | set_current_key_matrix 1–4 | écrit la keymap, couches 0–3, voir [écriture](#écriture) | vérifié (`0x1B`) / partiel (`0x1D`) / code (`0x1F`, `0x21`) |
| `0x22`…`0x2A` (pairs) | get_custom_led_matrix 1–5 | couleurs par touche (mode 253) | code |
| `0x23`…`0x2B` (impairs) | write_custom_led_matrix 1–5 | écrit les couleurs par touche | code |
| `0x2C` / `0x2D` | get_macro / write_macro | macros (4 emplacements selon les infos) | code |
| `0x2E` / `0x2F` | open/close_sync_led = start/end_sync_music | synchro de l'éclairage avec la musique | code |
| `0x30` | power_info | `[0]` = niveau de batterie, `[1] == 2` = en charge | code |
| `0x31` | **reset_device** | **remet le clavier en config d'usine**. Ne pas envoyer sans accord explicite | code |
| `0x32` | get_led_matrix | correspondance touches → LED | code |
| `0x3B` | set_dotscreen_matrix | écran à points 6×6 | code |
| `0x3C` / `0x3D` | start/end_sync_dot | flux en direct vers l'écran à points | code |

Bootloader (table `Ec`) : `0xA0` START, `0xA1` FLASH_WRITE, `0xA2` FLASH_READ, `0xA3` REBOOT, `0xA4` SWITCH_APP, `0xB0` ACK, `0xC0` SWITCH_BOOT. Les codes d'erreur sont dans `Y_` (`0xE0`–`0xF6`). **Ces commandes flashent le firmware et peuvent rendre le clavier inutilisable : on ne les envoie jamais sans accord explicite de l'utilisateur.**

## get_keyboard_info (0x12)

Lecture : `len = 56`, `offset = 0`. Index dans la zone de données (octet 8 et suivants). Valeurs relevées le 2026-10-17.

| Index | Champ | Valeur relevée |
|---|---|---|
| 0–1 | validL/validH | `aa bb` |
| 2–3 | vid (LE) | `0x373B` |
| 4–5 | pid (LE) | `0x119B` |
| 6–7 | version (LE, en hex) | `01.26` |
| 8 | protocolVersion | 3 |
| 9 | profile | 1 |
| 10 | keyboardId | 0 |
| 11 | keyboardType | 2 |
| 12 | matrixSize | 128 |
| 13 | macroSize | 4 |
| 14 | hasKeyLight | 1 |
| 15 | keyLightModeCount | 21 |
| 16 | keyLightMaxBrightness | 90 |
| 17 | keyLightMaxSpeed | 4 |
| 18 | customLightCount | 1 |
| 19–24 | logo : has, modeCount, count, maxBrightness, maxSpeed, supportMusic | 0, 4, 33, 90, 4, 0 |
| 25–30 | bande latérale : has, modeCount, count, maxBrightness, maxSpeed, supportMusic | 0, 4, 12, 90, 4, 0 |
| 31–36 | écran à points : has, modeCount, rows, cols, maxBrightness, maxSpeed | 1, 12, 6, 6, 90, 4 |
| 37 | hasEncoder | 1 |
| 38 | hasLcd | 0 |

## Bloc de config (0x14 / 0x15)

Un bloc de 64 octets, échangé en **deux paquets** (vérifié) :

1. `len = 56, offset = 0` : octets 0–55 ;
2. `len = 8, offset = 56` : octets 56–63.

**Écriture** : on écrit le bloc entier, sans commande de validation (vérifié). Toujours faire lire → modifier → réécrire pour ne pas écraser les autres réglages. Le configurateur écrit des zéros dans le second paquet ; `yogo.ts` y réécrit ce qu'il vient de lire.

**Piège** (vérifié) : une relecture dans la **même session**, juste après une écriture, renvoie encore l'ancienne valeur. Il faut relire dans une nouvelle session (`node yogo.ts`). Cause inconnue.

Table `fieldMap` : position dans le bloc.

| Pos | Champ | Notes | Statut |
|---|---|---|---|
| 0 | profile | profil embarqué | code |
| 1 | ledOnOff | le configurateur écrit toujours 0 ; valait 0 même LEDs éteintes | hypothèse : 0 = activé |
| 2 | ledMode | voir [modes](#modes-déclairage-ledmode) | vérifié (0, 4) |
| 3 | ledBrightness | 0–90 (max d'après `get_keyboard_info`) | code |
| 4 | ledSpeed | **inversé** : le configurateur écrit `abs(vitesse - 6)` | code |
| 5 | colorful | 1 = multicolore, 0 = couleur unique | vérifié (0) |
| 6 | colorIndex | | code |
| 7–9 | colorR, colorG, colorB | couleur du rétroéclairage | vérifié |
| 10 | customColorIndex | « direction » de l'effet dans le configurateur | code |
| 11–19 | logo : onOff, mode, brightness, speed, colorful, colorIndex, R, G, B | ce clavier n'a pas de logo (`hasLogoLight = 0`) | code |
| 20–28 | bande latérale : mêmes champs | `hasSideLight = 0` | code |
| 29–37 | écran à points (« LedTFT ») : mêmes champs | | code |
| 38 | sixN | `sixKeyNoPunch = sixN > 0 ? 0 : 1` (6KRO / NKRO) | code |
| 39 | macWin | mode Mac/Windows | code |
| 40 | winLock | verrouillage de la touche Windows | code |
| 41 | wasd | échange WASD et flèches | code |
| 42 | scanDelay | `lowLatencyMode = scanDelay == 0` | code |
| 43 | layer | couche active | code |
| 44 | fkeyChange | | code |
| 45 | wheelMode | molette / encodeur | code |
| 46–48 | sleepL/M/H | délai de mise en veille sur 24 bits, LE (valeur relevée : 180) | code |
| 49–51 | dsSleepL/M/H | veille de l'écran à points | code |
| 52–57 | lcdPower, lcdMode, lcdGif, lcdGifCount, lcdLanguage, lcdUsb | ce clavier n'a pas d'écran LCD | code |

## Modes d'éclairage (`ledMode`)

Liste `Ns` dans `keyboard-info.util-*.js`. Les noms viennent des clés de traduction du configurateur.

| Valeur | Nom | Statut |
|---|---|---|
| 0 | allClose : tout éteint | vérifié |
| 1 | rainbowFlowingLight1 | code |
| 2 | colorBreathing | code |
| 3 | breath | code |
| 4 | rainbow (icône « normal ») : **fixe, une couleur** quand `colorful = 0` | vérifié |
| 5 | singleLightUp | code |
| 6 | colorfulVortex1 | code |
| 7–11 | rainbowFlowingLight2/4, spectralFluctuation1–3 | code |
| 12 | neon | code |
| 13–19 | cloudBurst, colorfulVortex2, colorfulRibbonFluttering1, spectralDiffusion1, rainbowIntersection, spectralDiffusion2, rainbowFlowingLight3 | code |
| 20 | dynamicRainbow | code |
| 253 | custom : couleur par touche (custom_led_matrix) | code |
| 254 | musicRhythm | code |

## Keymap

### Lecture

Statut : vérifié. Pour chaque couche, 6 paquets de 56 octets (`len = 56`, offset 0, 56, 112… 280), soit 336 octets = 112 emplacements de 3 octets. Seuls les 96 premiers servent (6 rangées × 16 colonnes) ; les 16 derniers sont à zéro.

```sh
node yogo.ts keymap 0            # couche 0 actuelle
node yogo.ts keymap 1 factory    # couche Fn d'usine
```

### Écriture

Statut : vérifié pour la couche 0 (`0x1B`). Pour la couche Fn (`0x1D`), seule une réécriture à l'identique a été faite (via `keymap-restore`) : la commande est acceptée et ne corrompt rien, mais un vrai changement de touche reste à tester. Même découpage que la lecture : 6 paquets `len = 56`, offset 0 à 280, données à l'octet 8. Le configurateur réécrit **toujours la couche entière**, même pour changer une seule touche. On fait donc lire → modifier → réécrire. Le clavier répond `0x55` à chaque paquet et la relecture dans une nouvelle session montre la nouvelle valeur.

```sh
node yogo.ts keymap-backup           # sauvegarde les couches 0 et 1 dans keymap-backup.json (local, non versionné)
node yogo.ts setkey 0 14 10001b      # couche 0, index 14 (Inser) -> X ; exige une sauvegarde
node yogo.ts keymap-restore          # réécrit la sauvegarde
```

### Couches

| Couche | Rôle | Statut |
|---|---|---|
| 0 | couche de base | vérifié |
| 1 | couche Fn (le configurateur la lit avec `0x1C`) | vérifié |
| 2, 3 | identiques à la couche 0 d'usine, sur ce clavier comme en usine ; usage inconnu | vérifié (contenu) |

### Position d'une touche

`index = rangée × 16 + colonne` (vérifié : les remappages faits par l'utilisateur tombent aux index attendus). La disposition est ISO (touches `0x32` et `0x64` présentes). Disposition d'usine de la couche 0 (vérifié en lisant les codes ; les noms sont ceux d'un clavier QWERTY, voir le glossaire) :

| Rangée | Index | Touches |
|---|---|---|
| 0 | 0–15 | Esc, F1…F12, Impr. écran, Inser, Suppr |
| 1 | 16–31 | `²`, 1…0, `-`, `=`, Retour arrière, Début, Fin |
| 2 | 32–47 | Tab, Q…P, `[`, `]`, `\`, puis 46–47 : codes spéciaux `30 cb 01` et `30 cf 00` (le configurateur les masque ; peut-être la molette) |
| 3 | 48–63 | Verr. maj, A…L, `;`, `'`, `#` (ISO), Entrée, Page préc., Page suiv. |
| 4 | 64–79 | Maj gauche, `<` (ISO), Z…M, `,`, `.`, `/`, (vide), Maj droite, Flèche haut, (vide) |
| 5 | 80–95 | Ctrl gauche, Win, Alt, (vide ×2), Espace, (vide ×3), Alt droit, Fn, (vide), Ctrl droit, ←, ↓, → |

### Codage d'une touche (3 octets)

| Type (octet 0) | Octets 1–2 | Exemple | Statut |
|---|---|---|---|
| `0x10` : touche clavier | octet 1 = modificateurs, octet 2 = code HID | `10 00 04` = A ; `10 01 00` = Ctrl gauche ; `10 08 2b` = Win+Tab | vérifié |
| `0x30` : touche multimédia (HID *consumer*) | code consumer sur 16 bits, LE | `30 cd 00` = lecture/pause ; `30 e9 00` = volume + | vérifié (codes standards reconnus) |
| `0x50` : fonction du clavier | octet 1 = numéro de fonction | `50 02 00` = touche Fn | code |
| `00 00 00` | aucune action | | code |

Modificateurs (octet 1 du type `0x10`) : `01` Ctrl G, `02` Maj G, `04` Alt G, `08` Win G, `10` Ctrl D, `20` Maj D, `40` Alt D, `80` Win D.

Fonctions `0x50` connues (libellés de `keyboard-info.util-*.js` et `keymap-*.js`) :

| Code | Fonction | Code | Fonction |
|---|---|---|---|
| `02` | Fn | `2b` | écran à points : effet suivant |
| `09` | éclairage marche/arrêt | `2d` | écran à points : couleur suivante |
| `0a` / `0b` | mode d'éclairage + / − | `2f` / `30` | écran à points : luminosité + / − |
| `0c` / `0d` | teinte + / − | `39` | afficher le niveau de batterie |
| `0e` / `0f` | luminosité + / − | `47` / `48` | rotation gauche / droite (molette) |
| `10` / `11` | vitesse de l'effet + / − | | |
| `19`, `1b`, `1d`, `1e` | bande latérale : effet, couleur, luminosité + / − | | |

Inconnus, présents dans la couche Fn d'usine : `31`, `32`, `33` (Fn + `=`, `-`, Retour arrière), `34`–`37` (Fn + 1…4, probablement les canaux Bluetooth / 2.4 GHz : hypothèse), `3c` (Fn + Win, probablement le verrouillage Win : hypothèse), `3e` (Fn + H), `41` (Fn + Esc).

### Couche Fn d'usine

Relevée avec `node yogo.ts keymap 1 factory` (vérifié pour les codes ; les fonctions viennent des tables ci-dessus) :

- F1 / F2 : luminosité de l'écran − / + (`30 70 00`, `30 6f 00`) ; F3 : Win+Tab ; F4 : recherche (`30 21 02`) ; F5 : Win+H ; F7 / F8 / F9 : précédent / lecture-pause / suivant ; F10 : muet ; F11 / F12 : volume − / +.
- Inser : éclairage marche/arrêt. Q / A : mode − / + ; W / S : teinte − / + ; E / D : vitesse + / − ; R / F : luminosité + / −.
- Maj droite : batterie. ← / → : couleur / effet de l'écran à points ; ↑ / ↓ : luminosité de l'écran à points.

## Questions ouvertes

- Changer réellement une touche de la couche Fn (`0x1D`).

- Que signifie exactement `ledOnOff` ? Que vaut l'octet 7 de la réponse (`0x55`) ?
- Pourquoi la relecture dans la même session est-elle en retard ?
- Les réglages survivent-ils à un débranchement ?
- Rôle des couches 2 et 3, des emplacements 46–47 (`30 cb 01`, `30 cf 00`) et des fonctions `0x50` inconnues.

## Journal

- 2026-10-17 : téléchargement du configurateur ; extraction du protocole. Vérifiés : handshake, `get_keyboard_info`, lecture et écriture du bloc de config, couleur, modes 0 et 4. Config d’origine sauvegardée dans `config-backup.txt` (local, non versionné).
- 2026-10-17 : lecture de la keymap (4 couches, usine et actuelle). Format `[type, x, y]` décodé ; disposition 6 × 16 identifiée ; table des fonctions `0x50` extraite du configurateur. La couche 0 de ce clavier diffère de l'usine sur 5 touches et la couche Fn est largement modifiée.
- 2026-10-17 : l'utilisateur confirme avoir fait ces modifications (Verr. maj → Ctrl, Suppr/Début échangés, médias sur Fn + B/N/M) : la correspondance index ↔ touches physiques est vérifiée.
- 2026-10-17 : écriture de la keymap testée : Inser (couche 0, index 14) remappé en X avec `0x1B` ; la relecture dans une nouvelle session montre `10 00 1b`.
- 2026-10-17 : test physique validé (Inser tape `x`), puis `keymap-restore` : couches 0 et 1 relues identiques à la sauvegarde. `0x1D` est donc accepté (réécriture à l'identique).
