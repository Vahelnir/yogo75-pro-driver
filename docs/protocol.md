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
| `0x1B`, `0x1D`, `0x1F`, `0x21` | set_current_key_matrix 1–4 | écrit la keymap, couches 0–3, voir [écriture](#écriture) | vérifié (`0x1B`, `0x1D`) / code (`0x1F`, `0x21`) |
| `0x22`…`0x2A` (pairs) | get_custom_led_matrix 1–5 | couleurs par touche (mode 253), voir [couleurs par touche](#couleurs-par-touche) ; le configurateur n'utilise que `0x22` | vérifié (`0x22`) |
| `0x23`…`0x2B` (impairs) | write_custom_led_matrix 1–5 | écrit les couleurs par touche ; le configurateur n'utilise que `0x23` | vérifié (`0x23`) |
| `0x2C` / `0x2D` | get_macro / write_macro | macros, voir [macros](#macros) | vérifié |
| `0x2E` / `0x2F` | open/close_sync_led = start/end_sync_music | synchro de l'éclairage avec la musique | code |
| `0x30` | power_info | `[0]` = niveau de batterie, `[1] == 2` = en charge | code |
| `0x31` | **reset_device** | **remet le clavier en config d'usine**. Ne pas envoyer sans accord explicite | code |
| `0x32` | get_led_matrix | correspondance touche → LED (384 octets) | vérifié |
| `0x3B` | set_dotscreen_matrix | image de l'écran à points (mode 6), voir [image](#écran-à-points--image) | vérifié |
| `0x3C` / `0x3D` | start/end_sync_dot | visualiseur musical en direct (RGB565) / arrêt, qui remet le mode de l'écran à 0 | vérifié |

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
| 29–37 | écran à points (« LedTFT ») : mêmes champs | voir [écran à points](#écran-à-points-modes-intégrés) | vérifié (mode, luminosité, vitesse) / code (le reste) |
| 38 | sixN | 1 = pas de limite de touches simultanées (NKRO), 0 = 6 touches max (6KRO) | vérifié |
| 39 | macWin | 1 = mode Mac : Alt et Win échangés, F1–F12 donnent les fonctions Mac (luminosité, son…) sans Fn ; 0 = Windows. L'interrupteur physique Win/Mac écrit ce même octet (0 ↔ 1, seul octet modifié) | vérifié |
| 40 | winLock | verrouillage de la touche Windows : 1 = verrouillée (Win + Espace n'ouvre plus Spotlight sous macOS) | vérifié |
| 41 | wasd | 1 = WASD et flèches échangés, dans les deux sens | vérifié |
| 42 | scanDelay | 0 = mode faible latence, 2 = normal (le configurateur n'écrit que ces deux valeurs) | code |
| 43 | layer | **couche de base** : celle qui redevient active au relâchement de Fn. Le firmware ne l'applique ni à l'écriture ni au démarrage, mais au **prochain relâchement de Fn** ; elle reste ensuite active (Fn + touche utilise toujours la couche Fn). Ex. : `layer` = 1 puis Fn relâché → tout le clavier passe sur la couche 1. Pour revenir : `layer` = 0 puis appui-relâchement de Fn | vérifié |
| 44 | fkeyChange | aucun effet observé à 1, en mode Windows comme en mode Mac (F1, F12 avec et sans Fn) ; rôle inconnu | vérifié (sans effet visible) |
| 45 | wheelMode | 0 = la rotation de la molette règle le volume ; 1 ou 2 = la rotation ne fait plus rien de visible (ni volume, ni défilement, ni éclairage, ni écran à points), l'appui reste lecture/pause. Mettre volume ± dans les emplacements 46–47 n'y change rien | vérifié (effet partiel) |
| 46–48 | sleepL/M/H | délai de mise en veille sur 24 bits, LE, en secondes (choix du configurateur : 60, 180, 300, 600, 1800, « jamais » = 65535 ; valeur relevée : 180). En USB, aucune mise en veille observée avec 60 : probablement réservé au sans-fil (hypothèse de l'utilisateur) | code |
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
| 253 | custom : couleur par touche, voir [couleurs par touche](#couleurs-par-touche) | vérifié |
| 254 | musicRhythm | code |

## Écran à points : modes intégrés

Réglés par le bloc de config, positions 29–37 (`setDotLight` / `getDotLight` du configurateur). Le configurateur force `LedTFTOnOff = 0` et `LedTFTColorful = 0`, et inverse la vitesse comme pour le rétroéclairage : `LedTFTSpeed = abs(6 - vitesse)` (code). Vérifié : `LedTFTBrightness` 5 / 30 / 90 change nettement la luminosité ; `LedTFTSpeed` brut 6 ralentit nettement l'animation par rapport à 2 (donc valeur brute basse = rapide). Couleur vérifiée : en mode 0 (« star »), `00ff00` rend les étoiles vertes au lieu du rouge d'origine (`ff0000`). Valeurs d'origine relevées : mode 8, luminosité 30, vitesse brute 2, couleur `ff0000`.

Écrire `LedTFTMode` change bien l'animation (vérifié : 8 → 12, l'écran a quitté les feux d'artifice ; que ce soit précisément « YOGO » n'a pas été confirmé visuellement). Liste `Os` dans `keyboard-info.util-*.js` (code, sauf 8 et 12) :

| Valeur | Nom |
|---|---|
| −1, écrit `0xFF` (`setUint8`) | tout éteint (vérifié) |
| 0 | star |
| 1 | ghost |
| 2 | scan |
| 3 | radiantRadiance |
| 4 | raindrops |
| 5 | terminal |
| 6 | custom : affiche l'image stockée par `0x3B` (vérifié) |
| 7 | typing |
| 8 | nightFireworks (pas de réglage de couleur) |
| 9 | heartbeatMusicNumber |
| 10 | todayMood |
| 11 | dataShuttle |
| 12 | YOGO |

```sh
node yogo.ts dot 12          # mode YOGO
node yogo.ts dot 8           # retour au mode d'origine
node yogo.ts dot 0 00ff00    # mode star, couleur verte
node yogo.ts dotimage <216 chiffres hex>   # 36 pixels RRGGBB, rangée par rangée
node yogo.ts dot 6           # affiche l'image
node yogo.ts set LedTFTBrightness 90   # n'importe quel champ du bloc, valeur brute
```

## Écran à points : image

Deux mécanismes distincts dans le configurateur (code) :

**Image fixe, `0x3B`** (`setDotScreenAnimation`, classe de paquet `aW` ; vérifié pour le format, l'ordre des pixels et l'affichage en mode 6). Une image = 6 × 6 pixels en **RGB888**, rangée par rangée, de gauche à droite (`frames[0][rangée][colonne] = [R, G, B]` : les images prédéfinies sont décrites ligne par ligne), soit 108 octets. Envoi en deux paquets : offset 0 puis offset 56, l'octet de longueur valant **toujours 56** (le second paquet ne porte que 52 octets utiles, le reste à zéro). Seule la première image d'une animation est envoyée. Le configurateur passe ensuite l'écran en **mode 6** (`custom`) : c'est donc l'image stockée qu'affiche ce mode. **Aucune commande de lecture** : on ne peut pas sauvegarder l'image en place avant de l'écraser.

L'appli Electron d'ATK (pas le site) anime l'écran en renvoyant `0x3B` en boucle, par paquets de 24 octets (offsets 0, 24, … ; fonction `r8e`) : la même commande sert donc aussi à l'affichage en direct (code).

**Visualiseur musical, `0x3C` / `0x3D`** (`startSyncDotScreen`, `endSyncDotScreen`, classes `X_` / `nW`). Une image de 6 × 6 en **RGB565, LE**, 72 octets, en deux paquets (`len 56` à l'offset 0, `len 16` à l'offset 56), envoyée à chaque trame audio. Il n'y a pas de commande de démarrage séparée : `0x3C` porte directement les pixels. Vérifié : une trame seule s'affiche une fraction de seconde (bon ordre des pixels, couleurs justes), puis l'écran reste noir ; `0x3C` ne modifie pas la config. Il faut donc envoyer des trames en continu : une même trame renvoyée toutes les ~50 ms pendant 60 s est restée affichée sans interruption (vérifié, `node yogo.ts dotlive <pixels> 60`). À l'arrêt du flux, l'écran reste noir et ne revient pas seul à l'animation du mode : il faut `0x3D` puis réécrire le mode (vérifié).

`0x3D` arrête le flux et **remet `LedTFTMode` à 0** (vérifié : 8 → 0, l'écran repart sur l'animation « star »). D'où le comportement du configurateur, qui réécrit le bloc de config juste après (`setDotLight`).

## Keymap

### Lecture

Statut : vérifié. Pour chaque couche, 6 paquets de 56 octets (`len = 56`, offset 0, 56, 112… 280), soit 336 octets = 112 emplacements de 3 octets. Seuls les 96 premiers servent (6 rangées × 16 colonnes) ; les 16 derniers sont à zéro.

```sh
node yogo.ts keymap 0            # couche 0 actuelle
node yogo.ts keymap 1 factory    # couche Fn d'usine
```

### Écriture

Statut : vérifié pour la couche 0 (`0x1B`) et la couche Fn (`0x1D`). Même découpage que la lecture : 6 paquets `len = 56`, offset 0 à 280, données à l'octet 8. Le configurateur réécrit **toujours la couche entière**, même pour changer une seule touche. On fait donc lire → modifier → réécrire. Le clavier répond `0x55` à chaque paquet et la relecture dans une nouvelle session montre la nouvelle valeur.

```sh
node yogo.ts keymap-backup           # sauvegarde les couches 0 et 1 dans keymap-backup.json (local, non versionné)
node yogo.ts setkey 0 14 10001b      # couche 0, index 14 (Inser) -> X ; exige une sauvegarde
node yogo.ts keymap-restore          # réécrit la sauvegarde
```

### Couches

| Couche | Rôle | Statut |
|---|---|---|
| 0 | couche de base par défaut (`layer` = 0 dans le bloc de config) | vérifié |
| 1 | couche Fn (le configurateur la lit avec `0x1C`) | vérifié |
| 2, 3 | identiques à la couche 0 d'usine, sur ce clavier comme en usine ; usage inconnu | vérifié (contenu) |

### Position d'une touche

`index = rangée × 16 + colonne` (vérifié : les remappages faits par l'utilisateur tombent aux index attendus). La disposition physique est **QWERTY ANSI** (vérifié, confirmé par l'utilisateur) : les emplacements ISO 60 (`#`) et 65 (`<`) ont un code dans la keymap mais aucune touche ni LED ; 84 LED, soit un 75 % ANSI. Disposition d'usine de la couche 0 (vérifié en lisant les codes ; les noms sont ceux d'un clavier QWERTY, voir le glossaire) :

| Rangée | Index | Touches |
|---|---|---|
| 0 | 0–15 | Esc, F1…F12, Impr. écran, Inser, Suppr |
| 1 | 16–31 | `²`, 1…0, `-`, `=`, Retour arrière, Début, Fin |
| 2 | 32–47 | Tab, Q…P, `[`, `]`, `\`, puis 46–47 : en usine `30 cb 01` et `30 cf 00` (le configurateur les masque) ; sur ce clavier `10 00 56` et `10 00 46`. Ce n'est pas la rotation de la molette (vérifié) |
| 3 | 48–63 | Verr. maj, A…L, `;`, `'`, (60 : `#` ISO, absente), Entrée, Page préc., Page suiv. |
| 4 | 64–79 | Maj gauche, (65 : `<` ISO, absente), Z…M, `,`, `.`, `/`, (vide), Maj droite, Flèche haut, (vide) |
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

## Macros

Lecture `0x2C`, écriture `0x2D` (`getMacro`, `setMacro`, classes `tW` / `vI`). `get_keyboard_info` annonce 4 macros.

**Le configurateur ne relit pas les macros du clavier** : il garde la liste de son côté (stockage local / compte) et se contente de l'écrire. Son `getMacro` ne lit qu'un paquet à l'offset 0 et n'en fait rien. Relevé du 2026-10-17 avec `node yogo.ts macros 8` (vérifié) : 16 octets `ff`, puis des zéros jusqu'à 448 octets, donc aucune macro.

### Format du bloc (vérifié)

Le configurateur écrit toute la liste d'un coup, par paquets de 56 octets (offset 0, 56…), l'octet de longueur valant toujours 56.

| Octets | Contenu |
|---|---|
| 0–1 | `aa 55` |
| 2–3 | longueur totale du bloc, LE |
| 4–5 | nombre de macros, LE |
| 6–7 | 0 |
| 8… | table : pour chaque macro, son offset depuis le début du bloc (LE 16 bits) |
| puis | chaque macro : nombre d'actions (LE 16 bits), `00 00`, puis 4 octets par action |

Une action : `délai (LE 16 bits)`, `code`, `type | appui << 7`. **Bit 7 = 1 pour un appui, 0 pour un relâchement** (vérifié à nos dépens : le configurateur calcule `keyStatus ? 0 : 1` avec `KeyDown = 0`, `KeyUp = 1`). Avec le bit inversé, la macro « hi » tapait `h` puis laissait `i` enfoncé, et la touche I physique ne répondait plus.

| Type | Action | Code |
|---|---|---|
| 1 | touche clavier | code HID |
| 2 | modificateur | masque, comme dans la keymap (`01` Ctrl G… `80` Win D) ; vérifié avec Maj G (`02`) |
| 3, 5, 7 | autres types de l'interface (4, 5, 6 ; probablement souris) | inconnu |

Le délai est en **millisecondes** et s'applique après chaque action (vérifié : à 500, chaque touche reste enfoncée assez longtemps pour déclencher la répétition automatique de macOS, « hi » donne `hhhiii`). La relecture par `0x2C` renvoie exactement le bloc écrit (vérifié).

```sh
node yogo.ts macros [paquets]       # bloc brut (4 paquets par défaut)
node yogo.ts setmacro 0b0c          # macro 0 = taper h puis i ; sauvegarde la zone dans macros-backup.json au premier appel
node yogo.ts setmacro e10b0c,0b0c@500   # macro 0 = « HI » (Maj tenue), macro 1 = « hi » avec 500 ms entre actions
node yogo.ts setkey 0 14 600000     # Inser -> macro 0, mode 0
node yogo.ts macros-restore         # réécrit la sauvegarde
```

### Lier une touche à une macro (vérifié)

Dans la keymap, avec le contrôleur de ce clavier (`Ui`) :

- `60 <n° de macro> <mode>` pour les modes 0 à 3 ;
- `61 <n° de macro> <nombre d'exécutions>` pour le mode 4.

| Mode | Comportement (libellés du configurateur) |
|---|---|
| 0 | une seule exécution |
| 1 | boucle jusqu'au relâchement, en finissant le tour |
| 2 | tenir pour répéter, appuyer de nouveau pour finir le tour et arrêter |
| 3 | tenir pour répéter, relâcher pour arrêter |
| 4 | exécuter N fois (N de 1 à 249 dans l'interface) |

## Couleurs par touche

Utilisées quand `ledMode = 253` (« custom »).

**Table touche → LED** (`0x32`, 384 octets, lecture par paquets de 56 ; vérifié). Les 96 premiers octets donnent, pour chaque index de touche, son numéro de LED ; `ff` = pas de LED. 84 LED, numérotées 0 à 83. Touches sans LED : 46–47 (codes masqués par le configurateur ; pas la rotation de la molette, vérifié), 60 et 65 (touches ISO absentes) et les emplacements vides. Le reste des 384 octets contient d'autres tables (une suite `54`…`77`, puis ce qui ressemble à des couleurs) : rôle inconnu.

**Matrice de couleurs** (`0x22` lecture / `0x23` écriture ; 6 paquets de 56 octets, offset 0 à 280). Un triplet RGB par numéro de LED : la couleur de la touche `i` est à l'octet `3 × led[i]`. Comme pour la keymap, le configurateur réécrit toujours la matrice entière.

Relevé du 2026-10-17 (vérifié) : les LED de W, A, S, D et des quatre flèches étaient en blanc, toutes les autres éteintes. Le croisement keymap ↔ table des LED retombe exactement sur ces touches.

```sh
node yogo.ts ledmap                # table touche -> LED (brut)
node yogo.ts leds                  # couleur de chaque LED
node yogo.ts setled 0 ff0000       # Échap en rouge ; sauvegarde la matrice dans leds-backup.json au premier appel
node yogo.ts color 00ff00 253      # passe le rétroéclairage en mode couleurs par touche
node yogo.ts leds-restore          # réécrit la sauvegarde
```

## Questions ouvertes


- Que signifie exactement `ledOnOff` ? Que vaut l'octet 7 de la réponse (`0x55`) ?
- Pourquoi la relecture dans la même session est-elle en retard ?
- Rôle des couches 2 et 3, des emplacements 46–47 (`30 cb 01`, `30 cf 00`) et des fonctions `0x50` inconnues.

## Journal

- 2026-10-17 : téléchargement du configurateur ; extraction du protocole. Vérifiés : handshake, `get_keyboard_info`, lecture et écriture du bloc de config, couleur, modes 0 et 4. Config d’origine sauvegardée dans `config-backup.txt` (local, non versionné).
- 2026-10-17 : lecture de la keymap (4 couches, usine et actuelle). Format `[type, x, y]` décodé ; disposition 6 × 16 identifiée ; table des fonctions `0x50` extraite du configurateur. La couche 0 de ce clavier diffère de l'usine sur 5 touches et la couche Fn est largement modifiée.
- 2026-10-17 : l'utilisateur confirme avoir fait ces modifications (Verr. maj → Ctrl, Suppr/Début échangés, médias sur Fn + B/N/M) : la correspondance index ↔ touches physiques est vérifiée.
- 2026-10-17 : écriture de la keymap testée : Inser (couche 0, index 14) remappé en X avec `0x1B` ; la relecture dans une nouvelle session montre `10 00 1b`.
- 2026-10-17 : test physique validé (Inser tape `x`), puis `keymap-restore` : couches 0 et 1 relues identiques à la sauvegarde. `0x1D` est donc accepté (réécriture à l'identique).
- 2026-10-17 : écriture de la couche Fn validée : Fn + Inser (couche 1, index 14) remappé en X avec `0x1D` tape `x`, Inser seul reste inchangé (couche 0 relue à `10 00 49` ; sous macOS, Inser ne produit rien, c'est normal). Keymap restaurée et relue identique à la sauvegarde.
- 2026-10-17 : couleurs par touche : lecture de la table touche → LED (`0x32`) et de la matrice (`0x22`) ; préréglage WASD + flèches en blanc retrouvé. Échap mis en rouge via `0x23` (relu correctement), passage en mode 253. Test visuel en attente. Disposition probablement ANSI (corrige l'hypothèse ISO).
- 2026-10-17 : test visuel validé (Échap rouge, WASD + flèches blancs, reste éteint). Disposition QWERTY ANSI confirmée par l'utilisateur. Couleurs par touche restaurées (`leds-restore`) et retour au mode 4 vert.
- 2026-10-17 : écran à points : `setDotLight` lu (vitesse inversée, mode −1 → `0xFF`), liste `Os` des 13 modes. `LedTFTMode` passé de 8 à 12 via `node yogo.ts dot 12`, relu à 12. Test visuel en attente.
- 2026-10-17 : test visuel : en mode 12, l'écran n'affiche plus les feux d'artifice (l'utilisateur ne peut pas confirmer que c'est « YOGO »). Retour au mode 8, relu à 8 (luminosité 30, vitesse 2, couleur ff0000 inchangées).
- 2026-10-17 : image de l'écran à points : `0x3B` = image fixe RGB888 108 octets affichée en mode 6, sans commande de lecture ; `0x3C` = trame du visualiseur musical en RGB565 (corrige la passation, qui attribuait le RGB565 à l'image) ; `0x3D` = arrêt du flux.
- 2026-10-17 : image test envoyée avec `0x3B` (coin haut-gauche blanc, rangée du haut rouge, colonne de gauche verte) puis mode 6 : affichage conforme, ni miroir ni rotation. Le clavier accuse les deux paquets `len 56` (`55`). Retour au mode 8, relu ; l'image test reste stockée pour le mode 6 (l'utilisateur n'en avait pas).
- 2026-10-17 : `0x3C` : une trame RGB565 (diagonale bleue, coin haut-droit rouge) s'affiche brièvement puis l'écran passe au noir ; config inchangée. `0x3D` remet `LedTFTMode` à 0 (relu après chaque commande). Mode 8 réécrit. Test du mode −1 : `LedTFTMode` relu à 255, test visuel en attente.
- 2026-10-17 : mode −1 (`0xFF`) : écran éteint (vérifié). Luminosité : comparaison 90 → 5 sur l'image du mode 6, nettement plus sombre. Vitesse brute 2 → 6 → 2 sur le mode 8 : plus lent puis plus rapide. Écran remis à l'état d'origine (mode 8, luminosité 30, vitesse 2) et relu. Nouvelle commande générique `node yogo.ts set <champ> <valeur>`.
- 2026-10-17 : couleur de l'écran à points vérifiée (mode 0, vert au lieu de rouge). Flux `0x3C` continu (~20 trames/s, 60 s) : image stable tout du long. Puis `0x3D` et réécriture du mode 8, couleur `ff0000` ; relu.
- 2026-10-17 : après la fin du flux `0x3C`, l'écran est resté noir jusqu'au `0x3D` (vérifié par l'utilisateur).
- 2026-10-17 : macros : format du bloc `0x2D`, codage des actions, liaison touche → macro (`60 n mode` / `61 n N`) et modes d'exécution lus dans le configurateur. Lecture `0x2C` : aucune macro sur le clavier.
- 2026-10-17 : premier test de macro (« hi » sur Inser via `60 00 00`) : `h` tapé puis `i` répété en continu, la touche I physique ne répond plus. Cause : bit 7 inversé (1 = appui). L'hypothèse « dernière action ignorée » est infirmée (un relâchement ajouté à la fin n'y changeait rien, puisque c'était en fait un appui). Inser et macros restaurés et relus (`10 00 49`, zone des macros à `ff`×16 puis zéros). La liaison touche → macro `60 n mode` et l'écriture `0x2D` sont vérifiées.
- 2026-10-17 : touche I bloquée jusqu'au débranchement / rebranchement USB (état du firmware en mémoire vive, keymap intacte). Après rebranchement, config, écran à points et keymap sont intacts : **les réglages survivent à un débranchement** (vérifié).
- 2026-10-17 : macro corrigée (appui = bit 7) : Inser tape exactement `hi`, plus de touche bloquée. Inser et macros restaurés et relus.
- 2026-10-17 : 3 macros écrites d'un coup (offsets `0e`, `2a`, `3e`). Vérifié : Maj G en type 2 (`HI`), mode 4 avec `61 01 03` (`hihihi`), délai en ms (500 → `hhhiii` par répétition automatique de macOS).
- 2026-10-17 : modes 1–3 vérifiés avec `60 01 m` : 1 répète tant que la touche est tenue et finit toujours le tour ; 2 répète jusqu'à un nouvel appui ; 3 répète tant que la touche est tenue et s'arrête net (peut finir sur `h`). Keymap et macros restaurées et relues.
- 2026-10-17 : options : `winLock` = 1 verrouille la touche Win, `wasd` = 1 échange WASD et flèches dans les deux sens (vérifiés). Remis à 0. Unité de la veille lue dans le configurateur (secondes).
- 2026-10-17 : `macWin` = 1 vérifié (Alt ↔ Win, F1–F12 multimédia sans Fn ; Fn + F11/F12 règle toujours le volume). Remis à 0. Test de la veille : `sleepL` 180 → 60.
- 2026-10-17 : veille à 60 s en USB : aucune extinction observée ; l'utilisateur pense qu'elle ne joue qu'en Bluetooth / 2.4 GHz. `sleepL` remis à 180. Le clavier a un interrupteur physique Win/Mac.
- 2026-10-17 : l'interrupteur physique Win/Mac fait passer `macWin` à 1 puis à 0 (relu, seul octet modifié du bloc).
- 2026-10-17 : `sixN` vérifié : à 0, 8 touches appuyées ensemble ne donnent que 6 lettres ; à 1 (valeur d'origine, rétablie), les 8.
- 2026-10-17 : `fkeyChange` = 1 : aucun changement observé (mode Windows : la couche Fn de la rangée F est personnalisée en F1–F12, donc F12 et Fn + F12 donnent F12 dans les deux cas ; mode Mac : F1 et Fn + F1 baissent la luminosité dans les deux cas). Remis à 0, `macWin` remis à 0. Test de `wheelMode` = 1.
- 2026-10-17 : `wheelMode` 1 et 2 : la rotation de la molette ne fait plus rien de visible, l'appui reste lecture/pause. Hypothèse « la molette envoie alors les emplacements 46–47 » infirmée (volume ± écrit en 46–47, sans effet). Keymap restaurée, `wheelMode` remis à 0.
- 2026-10-17 : `layer` = 2 : la couche 0 reste active (Verr. maj → Ctrl, Suppr à sa place personnalisée), même après rebranchement ; valeur relue à 2 après rebranchement. Remis à 0.
- 2026-10-17 : `layer` élucidé, test proposé par l'utilisateur : Ins de la couche 1 → `x`, `layer` = 1. Ins seule tape le code de la couche 0 jusqu'au premier Fn + Ins ; ensuite Ins seule tape `x` et B (lecture/pause sur la couche 1) agit sans Fn ; Fn seul ne ramène pas la couche 0. Après `layer` = 0, B reste sur lecture/pause jusqu'au prochain appui-relâchement de Fn, puis tape `b`. Donc `layer` = couche de base, appliquée au relâchement de Fn (cela explique le test précédent à 2, fait sans toucher à Fn). Keymap restaurée.
