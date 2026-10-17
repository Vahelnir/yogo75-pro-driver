# Protocole du ATK Yogo 75 PRO et fonctionnement du configurateur

Référence issue du reverse engineering du configurateur web ATK (`https://v3-hub.atk.store/`).

## En bref

Le configurateur officiel est un site web. Il communique avec le clavier par l'API **WebHID** du navigateur, en échangeant de petits messages de 64 octets sur une interface USB réservée à la configuration. Il n'y a pas de pilote à installer : le « driver », c'est ce protocole. Comme le code du site est en JavaScript, on a pu le télécharger et le lire pour retrouver le format des messages.

Chaque échange suit le même schéma : on envoie une commande (« lis la config », « écris la keymap »…), le clavier répond avec les données demandées ou un accusé de réception. Toute la configuration d'éclairage et d'options tient dans un bloc de 64 octets, qu'on lit, qu'on modifie puis qu'on réécrit.

Ce document décrit le protocole lui-même, indépendamment de tout outil.

### Exemple : changer la couleur du rétroéclairage

Passer le rétroéclairage en vert fixe (mode 4, `00ff00`), paquet par paquet en USB (premiers octets seulement ; `tx` = envoyé, `rx` = reçu) :

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

- **HID** (Human Interface Device) : la norme USB des claviers et souris. Un même appareil expose plusieurs **interfaces** HID, chacune identifiée par une _usage page_ et un _usage_ (par exemple `0x01`/6 pour le clavier standard).
- **Rapport** (_report_) : un message HID. Ici, les rapports font 64 octets en USB et 32 à travers le dongle 2,4 GHz.
- **VID / PID** : identifiants USB du fabricant et du produit.
- **LE** (_little-endian_) : un nombre sur 2 octets est écrit octet faible d'abord. `38 00` = 0x0038 = 56.
- **Keymap / couche** : la correspondance touche physique → code envoyé. Le clavier en a 4 couches (normale, Fn…).
- **Bootloader / IAP** : le mode spécial qui sert à flasher le firmware.

## Statut des informations

Chaque fait porte un statut :

- **vérifié** : testé sur le clavier réel, avec le résultat observé ;
- **code** : lu dans le JS du configurateur, pas encore testé ;
- **hypothèse** : déduit, à confirmer.

Ce document se met à jour **au fur et à mesure des découvertes**, qu'elles viennent de la lecture du code du configurateur ou d'un test sur le clavier. On n'attend pas la fin d'une tâche : on ajoute le fait avec son statut, on corrige celui qui était faux, et on note la découverte dans le [journal](#journal).

## Matériel

| Champ                | Valeur                                                                                                                                                                                                                                                                                           | Statut                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Nom USB              | `ATK Yogo75 PRO`, fabricant `RDMCTMZT`                                                                                                                                                                                                                                                           | vérifié                       |
| VID / PID filaire    | `0x373B` / `0x119B` (4507)                                                                                                                                                                                                                                                                       | vérifié                       |
| PID 2.4 GHz (dongle) | `0x11FF` (4607), nom USB `ATK YOGO 75 PRO Dongle`. PID du modèle, pas de l'exemplaire : écrit en dur dans la table des appareils du configurateur (`YOGO 75 PRO 2.4G`)                                                                                                                           | vérifié                       |
| PID bootloader (IAP) | même PID, usage page `0xFF00`, usage 1                                                                                                                                                                                                                                                           | code                          |
| Firmware             | `01.26`, protocole v3                                                                                                                                                                                                                                                                            | vérifié (`get_keyboard_info`) |
| Mode de connexion    | sélecteur physique sur le clavier : Bluetooth, câble, 2,4 GHz. Le Bluetooth n'est pas configurable : le configurateur ne le propose pas (d'après l'utilisateur, non testé). Sur 2,4 GHz, le câble USB ne fait que charger : macOS ne voit aucun périphérique HID du clavier, seulement le dongle | vérifié                       |
| Variante sans PRO    | Yogo 75 : PID 4508 filaire, 4608 en 2.4 GHz                                                                                                                                                                                                                                                      | code                          |

Interfaces HID exposées en USB (vérifié avec `hidutil list` / `node-hid`) :

| Usage page / usage                 | Rôle                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `0x01` / 6, 2, 1, 128 ; `0x0C` / 1 | clavier, souris, contrôle système, multimédia (standard)                                  |
| **`0xFF60` / `0x61`**              | **canal de configuration** (même interface que VIA/QMK raw HID, mais protocole différent) |
| `0xFF00` / 1                       | canal vendeur, utilisé pour le bootloader / firmware                                      |

## Le configurateur web

C'est une app Vue empaquetée par rolldown, qui parle au clavier en **WebHID**. Il n'y a pas de binaire natif à désassembler.

- Copie téléchargée le 2026-10-17 dans `web-dump/static/`. Ce dossier **n'est pas versionné** (code propriétaire d'ATK) : chacun le retélécharge. Les noms de fichier contiennent un hash et changent à chaque déploiement du site. Pour obtenir la copie : récupérer `index.html`, puis suivre récursivement les `./xxx-HASH.js` référencés (`curl` dans une boucle suffit).
- `web-dump/evision_v2.js` s'obtient en découpant `demoMode.store-*.js` entre `var Ui=class` et `O(Ui,"solutionProvider"`, puis en ajoutant un retour à la ligne avant chaque `async nomDeMethode(`.
- Ce code est **non fiable** : on le lit et on le grep, on ne l'exécute jamais.
- Le JS est minifié. Les noms de variables (`Ui`, `an`, `oo`…) ne valent que pour ce build ; les chaînes littérales (`"fieldMap"`, `get_keyboard_function`, `productId:4507`) restent stables et servent de points d'entrée pour la recherche.

Fichiers clés du build du 2026-10-17 :

| Fichier                   | Contenu                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `demoMode.store-*.js`     | Registre des appareils (`productId:4507` → `solutionProvider: EVISION_V2`), contrôleur du clavier (classe `Ui`), transport (`fW`), classes de paquets (`an`), table des commandes (`oo`), commandes du bootloader (`Ec`) |
| `web-dump/evision_v2.js`  | Extrait du contrôleur `Ui`, une méthode par ligne. C'est le point d'entrée pour lire le comportement d'une fonction                                                                                                      |
| `keyboard-info.util-*.js` | Liste des modes d'éclairage (`Ns`), des modes de l'écran à points (`Os`)                                                                                                                                                 |
| `base-hid-device-*.js`    | Base WebHID : files de requêtes, mutex, 3 tentatives, timeout de 500 ms                                                                                                                                                  |

Le Yogo 75 PRO apparaît **deux fois** dans le registre : une fois en `EVISION_V2` simple, et une fois avec `isVia:true, skipViaDetection:true` (contrôleur `VC` qui enveloppe `Ui`). Les deux passent par le même contrôleur `Ui`.

Pour retrouver une méthode : `grep -o 'async NOM(.\{0,1500\}' web-dump/evision_v2.js`.

## Transport

Statut : vérifié.

- Rapports de sortie de 64 octets, report ID 0, sur l'interface `0xFF60`. Avec `node-hid`, on écrit `[0x00, ...64 octets]`.
- Chaque requête porte un **code de requête** sur 16 bits que le clavier renvoie dans sa réponse. C'est ce code qui associe une réponse à sa requête. D'autres rapports d'entrée peuvent arriver entre-temps : on les ignore.
- **Sans-fil 2,4 GHz** :
  - **vérifié** : dongle `ATK YOGO 75 PRO Dongle`, PID `0x11FF` (4607). Il expose les mêmes interfaces que le clavier en USB. Descripteur de `0xFF60`/`0x61` : pas de report ID, rapports d'entrée et de sortie de 32 octets. Les réponses commencent directement par `AA` (pas d'octet parasite). `0x10`, `get_keyboard_info` (39 octets en 24 + 15) et le bloc de config (24 + 24 + 16 octets) renvoient les mêmes valeurs qu'en filaire. `get_keyboard_info` donne le PID filaire `0x119B`, pas celui du dongle. L'écriture du bloc en 3 paquets `0x15` (24, 24, 16 octets, sans le bug du configurateur) est acceptée et relue à l'identique, et le rétroéclairage passe bien au bleu ;
  - **vérifié** : le reste marche aussi par le dongle, en paquets de 24 octets.
    - **Lectures** : les 4 couches de la keymap, les couleurs par touche et les macros sont identiques aux valeurs lues en filaire (336 octets en 14 paquets, macros en 224 octets), et la batterie se lit.
    - **Écritures** : remappage d'une touche (Inser → X), couleur par touche (Échap en rouge, mode 253), macro « HI » sur Inser (2 paquets ; Maj ne reste pas tenue), mode de l'écran à points (12), image fixe (`0x3B`, 108 octets en 5 paquets `len 24`) et visualiseur en direct (`0x3C`, 72 octets en 3 paquets `len 24`, damier stable pendant 90 s, puis `0x3D`).
    - Chaque écriture a été vérifiée à l'œil sur le clavier, puis restaurée et relue.
  - détails lus dans le code :
  - dongle `VID 0x373B` / **PID 4607**, même interface `0xFF60` / usage `0x61`, `connectType: 0` (2 en filaire) ;
  - le contrôleur passe à `BUFFER_LEN = 32` (rapports de 32 octets), `DATA_LEN = 24` (24 octets de données par paquet), `matrixMaxSize = 16` (16 × 24 = 384 octets pour la keymap et les couleurs), puis appelle `applyWirelessTransport()`. Point d'entrée : `isWireless&&(an.DATA_LEN=24` dans `demoMode.store-*.js` ;
  - `applyWirelessTransport()` ne fait que passer le timeout à 3 s (500 ms en filaire). Le cadrage est le même qu'en USB : `AA cmd offset len requête`, données à l'octet 8, sur 32 octets. Le report ID et la taille viennent du descripteur HID de l'interface `0xFF60`/`0x61` (rapport de sortie, sinon d'entrée) ; en cas de timeout, le configurateur réessaie jusqu'à 3 fois en alternant 32 et 64 octets. Dans les réponses, si l'octet 0 n'est pas `0xAA` mais l'octet 1 l'est, il retire le premier octet ;
  - bloc de config : lecture en 3 paquets `0x14` (`len 24` @0, `len 24` @24, `len 27` @48) ; écriture en 3 paquets `0x15` (champs 0–23 @0, 24–47 @24, `len 16` @48). **Bug du configurateur** : sa troisième boucle remplit le deuxième tampon, il réécrit donc des zéros en positions 48–63. Ne pas le reproduire ;
  - `get_keyboard_info` : 39 octets en 2 paquets (`len 24` puis `len 15`).

## Format des paquets

```
octet  0     1     2..3          4      5..6               7       8..63
      0xAA  cmd   offset (LE)   len    code requête (LE)  -       données (56 max)
```

| Octet | Requête                                 | Réponse                                     | Statut                           |
| ----- | --------------------------------------- | ------------------------------------------- | -------------------------------- |
| 0     | `0xAA` (constante `rA`)                 | `0xAA`                                      | vérifié                          |
| 1     | commande                                | commande renvoyée                           | vérifié                          |
| 2..3  | offset dans la ressource, little-endian | renvoyé ; **`[2] == 0xFF` = erreur**        | vérifié (renvoi) / code (erreur) |
| 4     | longueur des données (≤ 56)             | renvoyée                                    | vérifié                          |
| 5..6  | code de requête                         | renvoyé                                     | vérifié                          |
| 7     | 0                                       | `0x55`, probablement un accusé de réception | hypothèse                        |
| 8..63 | données à écrire                        | données lues                                | vérifié                          |

Les ressources qui dépassent 56 octets se lisent ou s'écrivent en plusieurs paquets, en avançant l'offset de 56 à chaque fois.

## Commandes

Table `oo` du configurateur.

| Cmd                            | Nom                                        | Usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Statut                                           |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `0x10`                         | start                                      | ouvre la session ; le configurateur le renvoie si plus de 5 s se sont écoulées                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | vérifié                                          |
| `0x11`                         | end                                        | ferme la session (le configurateur ne l'appelle presque jamais). Accepté ; ensuite, la lecture du bloc de config renvoie des zéros jusqu'au prochain `0x10`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | vérifié                                          |
| `0x12`                         | get_keyboard_info                          | capacités de l'appareil, voir [infos](#get_keyboard_info-0x12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | vérifié                                          |
| `0x14`                         | get_keyboard_function                      | lit le bloc de config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | vérifié                                          |
| `0x15`                         | write_keyboard_function                    | écrit le bloc de config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | vérifié                                          |
| `0x16`–`0x19`                  | get_default_key_matrix 1–4                 | keymap d'usine, couches 0–3, voir [keymap](#keymap)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | vérifié (lecture)                                |
| `0x1A`, `0x1C`, `0x1E`, `0x20` | get_current_key_matrix 1–4                 | keymap actuelle, couches 0–3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | vérifié (lecture)                                |
| `0x1B`, `0x1D`, `0x1F`, `0x21` | set_current_key_matrix 1–4                 | écrit la keymap, couches 0–3, voir [écriture](#écriture)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | vérifié (`0x1B`, `0x1D`) / code (`0x1F`, `0x21`) |
| `0x22`…`0x2A` (pairs)          | get_custom_led_matrix 1–5                  | couleurs par touche (mode 253), voir [couleurs par touche](#couleurs-par-touche) ; le configurateur n'utilise que `0x22`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | vérifié (`0x22`)                                 |
| `0x23`…`0x2B` (impairs)        | write_custom_led_matrix 1–5                | écrit les couleurs par touche ; le configurateur n'utilise que `0x23`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | vérifié (`0x23`)                                 |
| `0x2C` / `0x2D`                | get_macro / write_macro                    | macros, voir [macros](#macros)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | vérifié                                          |
| `0x2E` / `0x2F`                | open/close_sync_led = start/end_sync_music | synchro de l'éclairage avec la musique (mode 254), envoyée par l'application de bureau ATK ; fonctionnement supposé proche de `0x3C` / `0x3D`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | non déterminé                                    |
| `0x30`                         | power_info                                 | paquet sans longueur ; `[0]` = niveau de batterie en %, `[1]` = état de charge : `0` sans câble, `1` câble branché (relevé en USB : `5b 01` = 91 % ; par le dongle : `52 00` sans câble, puis `52 01` avec le câble de charge). L'état reste à `1` une fois la batterie pleine, câble toujours branché (`64 01` relevé deux fois, à environ une heure d'écart) : `1` signifie « câble branché », pas « en charge ». Le configurateur ne compte « en charge » que la valeur `2` (et borne le niveau à 100) : il n'affiche donc jamais la charge sur ce clavier. `2` n'a jamais été observé ; l'hypothèse « 2 = batterie pleine » est infirmée | vérifié                                          |
| `0x31`                         | **reset_device**                           | **remet le clavier en config d'usine**. Ne pas envoyer sans accord explicite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | code                                             |
| `0x32`                         | get_led_matrix                             | correspondance touche → LED (384 octets)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | vérifié                                          |
| `0x3B`                         | set_dotscreen_matrix                       | image de l'écran à points (mode 6), voir [image](#écran-à-points--image)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | vérifié                                          |
| `0x3C` / `0x3D`                | start/end_sync_dot                         | visualiseur musical en direct (RGB565) / arrêt, qui remet le mode de l'écran à 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | vérifié                                          |

Bootloader (table `Ec`) : `0xA0` START, `0xA1` FLASH_WRITE, `0xA2` FLASH_READ, `0xA3` REBOOT, `0xA4` SWITCH_APP, `0xB0` ACK, `0xC0` SWITCH_BOOT. Les codes d'erreur sont dans `Y_` (`0xE0`–`0xF6`). **Ces commandes flashent le firmware et peuvent rendre le clavier inutilisable : on ne les envoie jamais sans accord explicite de l'utilisateur.**

## get_keyboard_info (0x12)

Lecture : `len = 56`, `offset = 0`. Index dans la zone de données (octet 8 et suivants). Valeurs relevées le 2026-10-17.

| Index | Champ                                                                         | Valeur relevée     |
| ----- | ----------------------------------------------------------------------------- | ------------------ |
| 0–1   | validL/validH                                                                 | `aa bb`            |
| 2–3   | vid (LE)                                                                      | `0x373B`           |
| 4–5   | pid (LE)                                                                      | `0x119B`           |
| 6–7   | version (LE, en hex)                                                          | `01.26`            |
| 8     | protocolVersion                                                               | 3                  |
| 9     | profile                                                                       | 1                  |
| 10    | keyboardId                                                                    | 0                  |
| 11    | keyboardType                                                                  | 2                  |
| 12    | matrixSize                                                                    | 128                |
| 13    | macroSize                                                                     | 4                  |
| 14    | hasKeyLight                                                                   | 1                  |
| 15    | keyLightModeCount                                                             | 21                 |
| 16    | keyLightMaxBrightness                                                         | 90                 |
| 17    | keyLightMaxSpeed                                                              | 4                  |
| 18    | customLightCount                                                              | 1                  |
| 19–24 | logo : has, modeCount, count, maxBrightness, maxSpeed, supportMusic           | 0, 4, 33, 90, 4, 0 |
| 25–30 | bande latérale : has, modeCount, count, maxBrightness, maxSpeed, supportMusic | 0, 4, 12, 90, 4, 0 |
| 31–36 | écran à points : has, modeCount, rows, cols, maxBrightness, maxSpeed          | 1, 12, 6, 6, 90, 4 |
| 37    | hasEncoder                                                                    | 1                  |
| 38    | hasLcd                                                                        | 0                  |

## Bloc de config (0x14 / 0x15)

Un bloc de 64 octets, échangé en **deux paquets** (vérifié) :

1. `len = 56, offset = 0` : octets 0–55 ;
2. `len = 8, offset = 56` : octets 56–63.

**Écriture** : on écrit le bloc entier, sans commande de validation (vérifié). Toujours faire lire → modifier → réécrire pour ne pas écraser les autres réglages. Le configurateur écrit des zéros dans le second paquet ; il faut y réécrire ce qu'on vient de lire.

**Piège** (vérifié) : le clavier accuse l'écriture avant de l'appliquer. Une relecture lancée moins de ~5 ms après le dernier paquet renvoie encore l'ancienne valeur ; à partir de 10 ms, elle renvoie la nouvelle (`sleepL` 179 ↔ 180 en USB : périmée 4/4 à 0 ms, 3/4 à 5 ms, juste 12/12 entre 10 et 30 ms). La session n'y est pour rien : `0x10`, `0x11` + `0x10` ou une réouverture de l'appareil HID ne marchent que par le temps qu'ils prennent (une réouverture suivie de `0x10` a encore donné l'ancienne valeur en USB). À travers le dongle, plus lent, une seule relecture a été périmée sur 24 essais (tous délais confondus). Après `0x11`, la lecture du bloc renvoie des zéros jusqu'au prochain `0x10`.

Table `fieldMap` : position dans le bloc.

| Pos   | Champ                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Statut                                                |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0     | profile                                                              | profil embarqué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | code                                                  |
| 1     | ledOnOff                                                             | 0 = rétroéclairage actif, 1 = rétroéclairage éteint (l'écran à points reste allumé). Le configurateur écrit toujours 0 et éteint plutôt par le mode 0                                                                                                                                                                                                                                                                                                                                                                                          | vérifié                                               |
| 2     | ledMode                                                              | voir [modes](#modes-déclairage-ledmode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | vérifié (0, 4)                                        |
| 3     | ledBrightness                                                        | 0–90 (max d'après `get_keyboard_info`) ; 10 nettement plus sombre que 90                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | vérifié                                               |
| 4     | ledSpeed                                                             | **inversé** : le configurateur écrit `abs(vitesse - 6)`. En respiration (mode 3) : brut 0 ≈ 1 s par cycle, brut 6 ≈ 8 s                                                                                                                                                                                                                                                                                                                                                                                                                        | vérifié                                               |
| 5     | colorful                                                             | 1 = multicolore (en mode 4 : arc-en-ciel figé), 0 = couleur unique                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | vérifié                                               |
| 6     | colorIndex                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | code                                                  |
| 7–9   | colorR, colorG, colorB                                               | couleur du rétroéclairage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | vérifié                                               |
| 10    | customColorIndex                                                     | « direction » de l'effet dans le configurateur (choix « de gauche à droite » / « de droite à gauche ») ; 0 et 1 ne changent rien sur les effets 1, 7 et 8                                                                                                                                                                                                                                                                                                                                                                                      | vérifié (sans effet visible)                          |
| 11–19 | logo : onOff, mode, brightness, speed, colorful, colorIndex, R, G, B | ce clavier n'a pas de logo (`hasLogoLight = 0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | code                                                  |
| 20–28 | bande latérale : mêmes champs                                        | `hasSideLight = 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | code                                                  |
| 29–37 | écran à points (« LedTFT ») : mêmes champs                           | voir [écran à points](#écran-à-points-modes-intégrés)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | vérifié (mode, luminosité, vitesse) / code (le reste) |
| 38    | sixN                                                                 | 1 = pas de limite de touches simultanées (NKRO), 0 = 6 touches max (6KRO)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | vérifié                                               |
| 39    | macWin                                                               | 1 = mode Mac : Alt et Win échangés, F1–F12 donnent les fonctions Mac (luminosité, son…) sans Fn ; 0 = Windows. L'interrupteur physique Win/Mac écrit ce même octet (0 ↔ 1, seul octet modifié)                                                                                                                                                                                                                                                                                                                                                 | vérifié                                               |
| 40    | winLock                                                              | verrouillage de la touche Windows : 1 = verrouillée (Win + Espace n'ouvre plus Spotlight sous macOS)                                                                                                                                                                                                                                                                                                                                                                                                                                           | vérifié                                               |
| 41    | wasd                                                                 | 1 = WASD et flèches échangés, dans les deux sens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | vérifié                                               |
| 42    | scanDelay                                                            | 0 = mode faible latence, 2 = normal (le configurateur n'écrit que ces deux valeurs)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | code                                                  |
| 43    | layer                                                                | **couche de base** : celle qui redevient active au relâchement de Fn. Le firmware ne l'applique ni à l'écriture ni au démarrage, mais au **prochain relâchement de Fn** ; elle reste ensuite active (Fn + touche utilise toujours la couche Fn). Ex. : `layer` = 1 puis Fn relâché → tout le clavier passe sur la couche 1. Pour revenir : `layer` = 0 puis appui-relâchement de Fn                                                                                                                                                            | vérifié                                               |
| 44    | fkeyChange                                                           | aucun effet observé à 1, en mode Windows comme en mode Mac (F1, F12 avec et sans Fn) ; rôle inconnu                                                                                                                                                                                                                                                                                                                                                                                                                                            | vérifié (sans effet visible)                          |
| 45    | wheelMode                                                            | 0 = la rotation de la molette règle le volume ; 1 ou 2 = la rotation ne fait plus rien de visible (ni volume, ni défilement, ni éclairage, ni écran à points), l'appui reste lecture/pause. Mettre volume ± dans les emplacements 46–47 n'y change rien                                                                                                                                                                                                                                                                                        | vérifié (effet partiel)                               |
| 46–48 | sleepL/M/H                                                           | délai de mise en veille sur 24 bits, LE, en secondes (choix du configurateur : 60, 180, 300, 600, 1800, « jamais » = 65535 ; valeur relevée : 180). En USB, aucune mise en veille observée avec 60. En 2,4 GHz avec 60, le clavier s'éteint au bout de 60 s sans activité (chronométré). Une touche le réveille presque instantanément. Pendant la veille, le dongle ne répond plus aux commandes (`0x10` sans réponse en 3 s), et une commande ne réveille pas le clavier                                                                     | vérifié (sans-fil)                                    |
| 49–51 | dsSleepL/M/H                                                         | veille de l'écran à points d'après le nom (24 bits, LE, comme `sleepL/M/H`, supposé). Le configurateur ne les lit ni ne les écrit jamais : ils n'apparaissent que dans `fieldMap` et les valeurs par défaut. Aucun libellé de veille de l'écran à points dans ses traductions (seulement luminosité, couleur, effet, éditeur). Valeur relevée : 0. En 2,4 GHz, avec `dsSleepL` = 20 puis 1 (`sleepL` = 180), l'écran à points reste allumé après 60 s puis 2 min sans activité : aucun effet observé, que l'unité soit la seconde ou la minute | vérifié (sans effet visible)                          |
| 52–57 | lcdPower, lcdMode, lcdGif, lcdGifCount, lcdLanguage, lcdUsb          | ce clavier n'a pas d'écran LCD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | code                                                  |

## Modes d'éclairage (`ledMode`)

Liste `Ns` dans `keyboard-info.util-*.js`. Noms : libellés anglais du configurateur. Réglages : ce que l'interface propose pour l'effet (L = luminosité, V = vitesse, C = couleur, M = multicolore `colorful`) ; le firmware accepte peut-être plus. Tous les modes 0–20 ont été vérifiés au clavier : on note s'il réagit à la frappe et les réglages qui ont un effet visible (« effectifs », testés avec Fn + W / S pour C et M, Fn + E / D pour V). Le mode 2 ignore Fn + W / S (la config ne change pas).

| Valeur | Nom                                                                                                                                                                                                                                                       | Réglages                                                                                    | Statut        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| 0      | tout éteint                                                                                                                                                                                                                                               |                                                                                             | vérifié       |
| 1      | Rainbow Flow 1 : vague qui défile de gauche à droite, en arc-en-ciel avec `colorful = 1`, dans la couleur choisie (aspect de respiration qui se déplace) avec `colorful = 0`                                                                              | L, V, C (M non proposé, mais nécessaire à l'arc-en-ciel)                                    | vérifié       |
| 2      | Color Breathing ; réagit à la frappe : non                                                                                                                                                                                                                | L ; effectifs : V                                                                           | vérifié       |
| 3      | Monochrome Breath : respiration de la couleur choisie                                                                                                                                                                                                     | L, V, C, M                                                                                  | vérifié       |
| 4      | Rainbow (icône « normal ») : **fixe**, une couleur avec `colorful = 0`, arc-en-ciel figé avec `colorful = 1`                                                                                                                                              | L, C, M                                                                                     | vérifié       |
| 5      | Single Light Up ; réagit à la frappe : oui                                                                                                                                                                                                                | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 6      | Colorful Vortex 1 ; réagit à la frappe : oui                                                                                                                                                                                                              | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 7      | Rainbow Flow 2 : arc-en-ciel qui tourne autour du centre du clavier, sens antihoraire                                                                                                                                                                     | L, V, C, M                                                                                  | vérifié       |
| 8      | Rainbow Flow 4 ; réagit à la frappe : non                                                                                                                                                                                                                 | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 9–11   | Spectral Fluctuation 1–3 ; réagit à la frappe : non                                                                                                                                                                                                       | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 12     | Neon ; réagit à la frappe : non                                                                                                                                                                                                                           | L, V ; effectifs : V (toujours multicolore ; C et M modifient la config sans effet visible) | vérifié       |
| 13     | Cloud Burst ; réagit à la frappe : non                                                                                                                                                                                                                    | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 14     | Colorful Vortex 2 ; réagit à la frappe : oui                                                                                                                                                                                                              | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 15     | Colorful Ribbon Fluttering 1 ; réagit à la frappe : oui                                                                                                                                                                                                   | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 16     | Spectral Diffusion 1 ; réagit à la frappe : oui                                                                                                                                                                                                           | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 17     | Rainbow Intersection ; réagit à la frappe : non                                                                                                                                                                                                           | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 18     | Spectral Diffusion 2 ; réagit à la frappe : oui                                                                                                                                                                                                           | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 19     | Rainbow Flow 3 ; réagit à la frappe : non                                                                                                                                                                                                                 | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 20     | Dynamic Rainbow ; réagit à la frappe : oui                                                                                                                                                                                                                | L, V, C, M ; effectifs : V, C, M                                                            | vérifié       |
| 253    | custom : couleur par touche, voir [couleurs par touche](#couleurs-par-touche)                                                                                                                                                                             | L, C                                                                                        | vérifié       |
| 254    | Music Rhythm : éclairage synchronisé sur la musique, couleurs de premier plan et de fond. Flux `0x2E` / `0x2F` envoyé par l'application de bureau ATK, pas par le site ; on suppose qu'il fonctionne comme le flux de l'écran à points. **Non déterminé** | C                                                                                           | non déterminé |

## Écran à points : modes intégrés

Réglés par le bloc de config, positions 29–37 (`setDotLight` / `getDotLight` du configurateur). Le configurateur force `LedTFTOnOff = 0` et `LedTFTColorful = 0`, et inverse la vitesse comme pour le rétroéclairage : `LedTFTSpeed = abs(6 - vitesse)` (code). Vérifié : `LedTFTBrightness` 5 / 30 / 90 change nettement la luminosité ; `LedTFTSpeed` brut 6 ralentit nettement l'animation par rapport à 2 (donc valeur brute basse = rapide). Couleur vérifiée : en mode 0 (« star »), `00ff00` rend les étoiles vertes au lieu du rouge d'origine (`ff0000`). Valeurs d'origine relevées : mode 8, luminosité 30, vitesse brute 2, couleur `ff0000`.

Écrire `LedTFTMode` change bien l'animation (vérifié : 8 → 12, l'écran a quitté les feux d'artifice ; que ce soit précisément « YOGO » n'a pas été confirmé visuellement). Liste `Os` dans `keyboard-info.util-*.js` (code, sauf 8 et 12) :

| Valeur                        | Nom                                                   |
| ----------------------------- | ----------------------------------------------------- |
| −1, écrit `0xFF` (`setUint8`) | tout éteint (vérifié)                                 |
| 0                             | star                                                  |
| 1                             | ghost                                                 |
| 2                             | scan                                                  |
| 3                             | radiantRadiance                                       |
| 4                             | raindrops                                             |
| 5                             | terminal                                              |
| 6                             | custom : affiche l'image stockée par `0x3B` (vérifié) |
| 7                             | typing                                                |
| 8                             | nightFireworks (pas de réglage de couleur)            |
| 9                             | heartbeatMusicNumber                                  |
| 10                            | todayMood                                             |
| 11                            | dataShuttle                                           |
| 12                            | YOGO                                                  |

## Écran à points : image

Deux mécanismes distincts dans le configurateur (code) :

**Image fixe, `0x3B`** (`setDotScreenAnimation`, classe de paquet `aW` ; vérifié pour le format, l'ordre des pixels et l'affichage en mode 6). Une image = 6 × 6 pixels en **RGB888**, rangée par rangée, de gauche à droite (`frames[0][rangée][colonne] = [R, G, B]` : les images prédéfinies sont décrites ligne par ligne), soit 108 octets. Envoi en deux paquets : offset 0 puis offset 56, l'octet de longueur valant **toujours 56** (le second paquet ne porte que 52 octets utiles, le reste à zéro). Seule la première image d'une animation est envoyée. Le configurateur passe ensuite l'écran en **mode 6** (`custom`) : c'est donc l'image stockée qu'affiche ce mode. **Aucune commande de lecture** : on ne peut pas sauvegarder l'image en place avant de l'écraser.

L'appli Electron d'ATK (pas le site) anime l'écran en renvoyant `0x3B` en boucle, par paquets de 24 octets (offsets 0, 24, … ; fonction `r8e`) : la même commande sert donc aussi à l'affichage en direct (code).

**Visualiseur musical, `0x3C` / `0x3D`** (`startSyncDotScreen`, `endSyncDotScreen`, classes `X_` / `nW`). Une image de 6 × 6 en **RGB565, LE**, 72 octets, en deux paquets (`len 56` à l'offset 0, `len 16` à l'offset 56), envoyée à chaque trame audio. Il n'y a pas de commande de démarrage séparée : `0x3C` porte directement les pixels. Vérifié : une trame seule s'affiche une fraction de seconde (bon ordre des pixels, couleurs justes), puis l'écran reste noir ; `0x3C` ne modifie pas la config. Il faut donc envoyer des trames en continu : une même trame renvoyée toutes les ~50 ms pendant 60 s est restée affichée sans interruption (vérifié). À l'arrêt du flux, l'écran reste noir et ne revient pas seul à l'animation du mode : il faut `0x3D` puis réécrire le mode (vérifié).

`0x3D` arrête le flux et **remet `LedTFTMode` à 0** (vérifié : 8 → 0, l'écran repart sur l'animation « star »). D'où le comportement du configurateur, qui réécrit le bloc de config juste après (`setDotLight`).

## Keymap

### Lecture

Statut : vérifié. Pour chaque couche, 6 paquets de 56 octets (`len = 56`, offset 0, 56, 112… 280), soit 336 octets = 112 emplacements de 3 octets. Seuls les 96 premiers servent (6 rangées × 16 colonnes) ; les 16 derniers sont à zéro.

### Écriture

Statut : vérifié pour la couche 0 (`0x1B`) et la couche Fn (`0x1D`). Même découpage que la lecture : 6 paquets `len = 56`, offset 0 à 280, données à l'octet 8. Le configurateur réécrit **toujours la couche entière**, même pour changer une seule touche. On fait donc lire → modifier → réécrire. Le clavier répond `0x55` à chaque paquet et la relecture dans une nouvelle session montre la nouvelle valeur.

### Couches

| Couche | Rôle                                                                                                                                                                                                                   | Statut  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0      | couche de base par défaut (`layer` = 0 dans le bloc de config)                                                                                                                                                         | vérifié |
| 1      | couche Fn (le configurateur la lit avec `0x1C`)                                                                                                                                                                        | vérifié |
| 2, 3   | identiques à la couche 0 d'usine ; le configurateur ne s'en sert pas. Accessibles avec une touche `50 03 00` / `50 04 00` (tant qu'elle est tenue) ou comme couche de base via `layer`. Le mode Mac ne les utilise pas | vérifié |

### Position d'une touche

`index = rangée × 16 + colonne` (vérifié : les remappages faits par l'utilisateur tombent aux index attendus). La disposition physique est **QWERTY ANSI** (vérifié, confirmé par l'utilisateur) : les emplacements ISO 60 (`#`) et 65 (`<`) ont un code dans la keymap mais aucune touche ni LED ; 84 LED, soit un 75 % ANSI. Disposition d'usine de la couche 0 (vérifié en lisant les codes ; les noms sont ceux d'un clavier QWERTY, voir le glossaire) :

| Rangée | Index | Touches                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0      | 0–15  | Esc, F1…F12, Impr. écran, Inser, Suppr                                                                                                                                                                                                                                                                                                                                                           |
| 1      | 16–31 | `²`, 1…0, `-`, `=`, Retour arrière, Début, Fin                                                                                                                                                                                                                                                                                                                                                   |
| 2      | 32–47 | Tab, Q…P, `[`, `]`, `\`, puis 46–47 : les deux boutons à droite du clavier, sous la molette : « afficher le bureau » et « verrouiller la session » (guide papier : boutons 3 et 4, personnalisables), en usine `30 cb 01` et `30 cf 00` ; sur ce clavier `10 00 56` (bouton du haut) et `10 00 46` (bouton du bas), confirmé par l'utilisateur. Ce n'est pas la rotation de la molette (vérifié) |
| 3      | 48–63 | Verr. maj, A…L, `;`, `'`, (60 : `#` ISO, absente), Entrée, Page préc., Page suiv.                                                                                                                                                                                                                                                                                                                |
| 4      | 64–79 | Maj gauche, (65 : `<` ISO, absente), Z…M, `,`, `.`, `/`, (vide), Maj droite, Flèche haut, (vide)                                                                                                                                                                                                                                                                                                 |
| 5      | 80–95 | Ctrl gauche, Win, Alt, (vide ×2), Espace, (vide ×3), Alt droit, Fn, (vide), Ctrl droit, ←, ↓, →                                                                                                                                                                                                                                                                                                  |

### Codage d'une touche (3 octets)

| Type (octet 0)                              | Octets 1–2                                                                                                                                             | Exemple                                                          | Statut                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| `0x10` : touche clavier                     | octet 1 = modificateurs, octet 2 = code HID                                                                                                            | `10 00 04` = A ; `10 01 00` = Ctrl gauche ; `10 08 2b` = Win+Tab | vérifié                                           |
| `0x30` : touche multimédia (HID _consumer_) | code consumer sur 16 bits, LE                                                                                                                          | `30 cd 00` = lecture/pause ; `30 e9 00` = volume +               | vérifié (codes standards reconnus)                |
| `0x50` : fonction du clavier                | octet 1 = numéro de fonction                                                                                                                           | `50 02 00` = touche Fn                                           | code                                              |
| `0x40` : système et souris                  | `40 01 00` arrêt, `40 02 00` veille, `40 04 00` réveil ; `40 00 xx` = clic souris : `01` gauche, `02` droit, `04` milieu, `08` précédent, `10` suivant | `40 00 01` / `40 00 02` = clic gauche / droit                    | vérifié (clics gauche et droit) / code (le reste) |
| `00 00 00`                                  | aucune action                                                                                                                                          |                                                                  | code                                              |

Modificateurs (octet 1 du type `0x10`) : `01` Ctrl G, `02` Maj G, `04` Alt G, `08` Win G, `10` Ctrl D, `20` Maj D, `40` Alt D, `80` Win D.

Fonctions `0x50` connues (libellés de `keyboard-info.util-*.js` et `keymap-*.js`) :

| Code                   | Fonction                                                                                                                                                              | Code        | Fonction                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `02`                   | Fn (couche 1, tant que la touche est tenue) ; plusieurs touches peuvent porter ce code (vérifié : Verr. maj → `50 02 00` agit comme Fn, la touche Fn d'origine aussi) | `2b`        | écran à points : effet suivant                                            |
| `03`                   | couche 2 tant que la touche est tenue (vérifié ; absent du configurateur)                                                                                             | `04`        | couche 3 tant que la touche est tenue (vérifié ; absent du configurateur) |
| `09`                   | éclairage marche/arrêt                                                                                                                                                | `2d`        | écran à points : couleur suivante                                         |
| `0a` / `0b`            | mode d'éclairage + / − (vérifié pour `0b` : 0 → 20, il boucle)                                                                                                        | `2f` / `30` | écran à points : luminosité + / −                                         |
| `0c` / `0d`            | couleur suivante / précédente dans la palette (vérifié)                                                                                                               | `39`        | afficher le niveau de batterie                                            |
| `0e` / `0f`            | luminosité + / − (vérifié : 15 par appui, 90 ↔ 75)                                                                                                                    | `47` / `48` | rotation gauche / droite (molette)                                        |
| `10` / `11`            | vitesse de l'effet + / − (vérifié : `ledSpeed` brut −1 / +1 par appui, 0 = le plus rapide)                                                                            |             |                                                                           |
| `19`, `1b`, `1d`, `1e` | bande latérale : effet, couleur, luminosité + / −                                                                                                                     |             |                                                                           |

Touches spéciales du configurateur (onglet « Touche supplémentaire », tableaux `Xi`, `Io`, `Et`, `Go`/`Vo`, `ji`, `Hi` de `keyboard-info.util-*.js` ; code, icônes confirmées par capture d'écran) :

| Catégorie   | Codes                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Média       | volume − `30 ea 00`, + `30 e9 00`, muet `30 e2 00`, lecture/pause `30 cd 00`, stop `30 b7 00` (masqué), précédent `30 b6 00`, suivant `30 b5 00`                                                                                                                                                                                                          |
| Windows     | mail `30 8a 01`, calculatrice `30 92 01`, lecteur média `30 83 01`, poste de travail `30 94 01`, recherche `30 21 02`, navigateur : accueil `30 23 02`, précédent `30 24 02`, suivant `30 25 02`, actualiser `30 27 02`, favoris `30 2a 02`, stop `30 26 02` (masqué) ; zoom + / − = Ctrl+`=` / Ctrl+`-` ; luminosité écran − / + `30 70 00` / `30 6f 00` |
| macOS       | Mission Control = Ctrl+Espace, Launchpad = Ctrl+↓, Siri = Ctrl+Verr. num., Spotlight = Win+Espace                                                                                                                                                                                                                                                         |
| Bureautique | raccourcis Ctrl : Z annuler, S enregistrer, A tout sélectionner, C copier, X couper, V coller, O ouvrir, N nouveau, F rechercher ; Ctrl+Maj+C capture et traduction                                                                                                                                                                                       |
| Extension   | bureau = Win+D (`10 08 07`, alias `30 cb 01`) ; bureau Mac = F4 (`10 00 3d`) ; verrouillage = Win+L (`10 08 0f`, alias `30 cf 00`)                                                                                                                                                                                                                        |
| Souris      | voir le type `0x40`                                                                                                                                                                                                                                                                                                                                       |

Le configurateur dessine donc F4 de la couche 0 avec l'icône « bureau » : c'est bien F4 qui est envoyé (vérifié en lecture). Il affiche « NO » pour toute fonction `0x50` qu'il ne connaît pas (Fn + Esc, 1…4, `-`, `=`, Retour arrière, H, Win), et ne montre que la touche, sans le modificateur (Win+Tab s'affiche « TAB », Win+H « H »).

`34`, `35`, `36` (Fn + 1, 2, 3 de la couche Fn d'usine) : appareils Bluetooth 1, 2, 3 (vérifié en mode Bluetooth). Un appui bref passe à l'appareil déjà appairé sur ce canal ; un appui de quelques secondes lance l'appairage. `37` (Fn + 4) : aucun effet observé, absent du guide papier. En filaire, ce n'est pas la bascule Win/Mac (vérifié : `macWin` inchangé et F1 sans Fn ne règle pas la luminosité). En 2,4 GHz, un appui bref ne fait rien de visible et ne met pas le clavier en veille (il répond encore par le dongle). Reste à tester un appui long : peut-être l'appairage du dongle (hypothèse).

`33` et `41` (Fn + Retour arrière, Fn + Esc) : probablement les deux moitiés du reset usine. Le guide papier indique « Fn + Esc + Retour arrière, maintenir 5 s : retour aux réglages d'usine » (hypothèse ; **ne pas tester** sans l'accord de l'utilisateur, cela effacerait la config).

Testés au clavier en remettant les codes d'usine dans la couche Fn (vérifié) :

- `3c` (Fn + Win) : verrouillage de la touche Win, bascule. La LED de Win s'allume en rouge et l'octet `winLock` du bloc de config passe à 1, puis revient à 0.
- `31` (Fn + `=`) / `32` (Fn + `-`) : vitesse de l'écran à points + / −. `LedTFTSpeed` (valeur brute, 0 = le plus rapide) descend jusqu'à 0 avec `31` et monte d'un cran par appui avec `32` (0 → 3 relu). Verr. maj et Win clignotent à chaque appui, peut-être pour signaler la butée (hypothèse).
- `3e` (Fn + H) : aucun effet visible et aucun octet du bloc de config modifié, en mode Windows comme en mode Mac. En 2,4 GHz, rien de visible et pas de mise en veille (le clavier répond encore par le dongle). Ne change pas non plus l'écran à points, même brièvement, en appui bref ou maintenu 3 s (vérifié). Rôle inconnu.

### Couche Fn d'usine

Lue avec `0x17` (vérifié pour les codes ; les fonctions viennent des tables ci-dessus) :

- F1 / F2 : luminosité de l'écran − / + (`30 70 00`, `30 6f 00`) ; F3 : Win+Tab ; F4 : recherche (`30 21 02`) ; F5 : Win+H ; F7 / F8 / F9 : précédent / lecture-pause / suivant ; F10 : muet ; F11 / F12 : volume − / +.
- Inser : éclairage marche/arrêt. Q / A : mode − / + ; W / S : teinte − / + ; E / D : vitesse + / − ; R / F : luminosité + / −. Le guide papier annonce l'inverse (Q / W / E = **+**, A / S / D = **−**) ; le clavier donne raison au configurateur pour Q : depuis le mode 0, Fn + Q passe au mode 20 (vérifié). W / S, E / D, R / F vérifiés dans le sens du configurateur (lecture du bloc de config après chaque appui). Palette de W / S (vérifié) : 0 = couleur personnalisée, 1 = rouge `ff 00 00`, 2 = jaune, 3 = bleu, 4 = rose `ff 25 9b`, 5 = arc-en-ciel (`colorful` = 1 ; `colorR/G/B` relus à `00 81 ff`, non affichés), et la palette boucle : W depuis 0 donne l'arc-en-ciel. Les touches réécrivent `colorIndex`, `colorful` et `colorR/G/B`. Le guide ne mentionne pas R / F.
- Guide papier, autres points cohérents avec la keymap : F3 « fenêtre multitâche » (Win+Tab), F5 « dictée » (Win+H), F6 = F6 sous Windows et « mode Concentration » sous Mac. Molette : rotation = volume, clic = muet.
- Maj droite : batterie. ← / → : couleur / effet de l'écran à points ; ↑ / ↓ : luminosité de l'écran à points.

## Macros

Lecture `0x2C`, écriture `0x2D` (`getMacro`, `setMacro`, classes `tW` / `vI`). `get_keyboard_info` annonce 4 macros.

**Limites du configurateur** (code) : pour le Yogo 75 PRO, aucune. Son composable de macros (`nw`) fixe `maxMacroCount` et `maxActionsCount` à l'infini pour cette famille d'API (`Mi` / `Ui`), et `setMacro` n'impose aucune taille au bloc : il le découpe simplement en paquets. Seul `macroSize` = 4 de `get_keyboard_info` donne un nombre. La vraie capacité de la zone (en octets et en macros) reste à vérifier dans le firmware.

**Taille probable de la zone : 1024 octets** (hypothèse, d'après une lecture). En lisant 4480 octets avec `0x2C` (80 paquets, sans erreur), on trouve 16 octets `ff`, puis des zéros jusqu'à l'offset 1023, puis à partir de 1024 des données sans rapport avec des macros (motifs `ff ff ff` réguliers, puis ce qui ressemble à de la RAM : adresses `0x2000xxxx`). Le firmware ne borne donc pas la lecture. À confirmer dans le firmware avant d'écrire au-delà.

**Le configurateur ne relit pas les macros du clavier** : il garde la liste de son côté (stockage local / compte) et se contente de l'écrire. Son `getMacro` ne lit qu'un paquet à l'offset 0 et n'en fait rien. Relevé du 2026-10-17 en lisant 8 paquets avec `0x2C` (vérifié) : 16 octets `ff`, puis des zéros jusqu'à 448 octets, donc aucune macro.

### Format du bloc (vérifié)

Le configurateur écrit toute la liste d'un coup, par paquets de 56 octets (offset 0, 56…), l'octet de longueur valant toujours 56.

| Octets | Contenu                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| 0–1    | `aa 55`                                                                         |
| 2–3    | longueur totale du bloc, LE                                                     |
| 4–5    | nombre de macros, LE                                                            |
| 6–7    | 0                                                                               |
| 8…     | table : pour chaque macro, son offset depuis le début du bloc (LE 16 bits)      |
| puis   | chaque macro : nombre d'actions (LE 16 bits), `00 00`, puis 4 octets par action |

Une action : `délai (LE 16 bits)`, `code`, `type | appui << 7`. **Bit 7 = 1 pour un appui, 0 pour un relâchement** (vérifié à nos dépens : le configurateur calcule `keyStatus ? 0 : 1` avec `KeyDown = 0`, `KeyUp = 1`). Avec le bit inversé, la macro « hi » tapait `h` puis laissait `i` enfoncé, et la touche I physique ne répondait plus.

| Type    | Action                                                      | Code                                                                               |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1       | touche clavier                                              | code HID                                                                           |
| 2       | modificateur                                                | masque, comme dans la keymap (`01` Ctrl G… `80` Win D) ; vérifié avec Maj G (`02`) |
| 3, 5, 7 | autres types de l'interface (4, 5, 6 ; probablement souris) | inconnu                                                                            |

Le délai est en **millisecondes** et s'applique après chaque action (vérifié : à 500, chaque touche reste enfoncée assez longtemps pour déclencher la répétition automatique de macOS, « hi » donne `hhhiii`). La relecture par `0x2C` renvoie exactement le bloc écrit (vérifié).

### Lier une touche à une macro (vérifié)

Dans la keymap, avec le contrôleur de ce clavier (`Ui`) :

- `60 <n° de macro> <mode>` pour les modes 0 à 3 ;
- `61 <n° de macro> <nombre d'exécutions>` pour le mode 4.

| Mode | Comportement (libellés du configurateur)                             |
| ---- | -------------------------------------------------------------------- |
| 0    | une seule exécution                                                  |
| 1    | boucle jusqu'au relâchement, en finissant le tour                    |
| 2    | tenir pour répéter, appuyer de nouveau pour finir le tour et arrêter |
| 3    | tenir pour répéter, relâcher pour arrêter                            |
| 4    | exécuter N fois (N de 1 à 249 dans l'interface)                      |

## Couleurs par touche

Utilisées quand `ledMode = 253` (« custom »).

**Table touche → LED** (`0x32`, 384 octets, lecture par paquets de 56 ; vérifié). Les 96 premiers octets donnent, pour chaque index de touche, son numéro de LED ; `ff` = pas de LED. 84 LED, numérotées 0 à 83. Touches sans LED : 46–47 (codes masqués par le configurateur ; pas la rotation de la molette, vérifié), 60 et 65 (touches ISO absentes) et les emplacements vides. Le reste des 384 octets contient d'autres tables (une suite `54`…`77`, puis ce qui ressemble à des couleurs) : rôle inconnu.

**Matrice de couleurs** (`0x22` lecture / `0x23` écriture ; 6 paquets de 56 octets, offset 0 à 280). Un triplet RGB par numéro de LED : la couleur de la touche `i` est à l'octet `3 × led[i]`. Comme pour la keymap, le configurateur réécrit toujours la matrice entière.

Relevé du 2026-10-17 (vérifié) : les LED de W, A, S, D et des quatre flèches étaient en blanc, toutes les autres éteintes. Le croisement keymap ↔ table des LED retombe exactement sur ces touches.

## Sauvegarde complète

Tout ce que le protocole permet de relire tient en quatre ressources (vérifié en USB et à travers le dongle) :

| Ressource           | Lecture / écriture                                              | Taille                                     |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| bloc de config      | `0x14` / `0x15`                                                 | 64 octets                                  |
| keymap, couches 0–3 | `0x1A`, `0x1C`, `0x1E`, `0x20` / `0x1B`, `0x1D`, `0x1F`, `0x21` | 336 octets par couche                      |
| couleurs par touche | `0x22` / `0x23`                                                 | 336 octets                                 |
| zone des macros     | `0x2C` / `0x2D`                                                 | 224 octets suffisent pour 4 macros courtes |

Réécrire ces quatre ressources telles quelles, puis les relire dans une nouvelle session, redonne exactement l'état sauvegardé : changer `sleepL`, puis tout réécrire, ramène la valeur d'origine. L'image fixe de l'écran à points (`0x3B`) n'a pas de commande de lecture : elle ne peut pas être sauvegardée.

## Questions ouvertes

- Que vaut l'octet 7 de la réponse (`0x55`) ?
- Rôle des emplacements 46–47 (`30 cb 01`, `30 cf 00`) et des fonctions `0x50` inconnues.

## Journal

- 2026-10-17 : téléchargement du configurateur ; extraction du protocole. Vérifiés : handshake, `get_keyboard_info`, lecture et écriture du bloc de config, couleur, modes 0 et 4. Config d’origine sauvegardée.
- 2026-10-17 : lecture de la keymap (4 couches, usine et actuelle). Format `[type, x, y]` décodé ; disposition 6 × 16 identifiée ; table des fonctions `0x50` extraite du configurateur. La couche 0 de ce clavier diffère de l'usine sur 5 touches et la couche Fn est largement modifiée.
- 2026-10-17 : l'utilisateur confirme avoir fait ces modifications (Verr. maj → Ctrl, Suppr/Début échangés, médias sur Fn + B/N/M) : la correspondance index ↔ touches physiques est vérifiée.
- 2026-10-17 : écriture de la keymap testée : Inser (couche 0, index 14) remappé en X avec `0x1B` ; la relecture dans une nouvelle session montre `10 00 1b`.
- 2026-10-17 : test physique validé (Inser tape `x`), puis réécriture de la sauvegarde : couches 0 et 1 relues identiques à la sauvegarde. `0x1D` est donc accepté (réécriture à l'identique).
- 2026-10-17 : écriture de la couche Fn validée : Fn + Inser (couche 1, index 14) remappé en X avec `0x1D` tape `x`, Inser seul reste inchangé (couche 0 relue à `10 00 49` ; sous macOS, Inser ne produit rien, c'est normal). Keymap restaurée et relue identique à la sauvegarde.
- 2026-10-17 : couleurs par touche : lecture de la table touche → LED (`0x32`) et de la matrice (`0x22`) ; préréglage WASD + flèches en blanc retrouvé. Échap mis en rouge via `0x23` (relu correctement), passage en mode 253. Test visuel en attente. Disposition probablement ANSI (corrige l'hypothèse ISO).
- 2026-10-17 : test visuel validé (Échap rouge, WASD + flèches blancs, reste éteint). Disposition QWERTY ANSI confirmée par l'utilisateur. Couleurs par touche restaurées et retour au mode 4 vert.
- 2026-10-17 : écran à points : `setDotLight` lu (vitesse inversée, mode −1 → `0xFF`), liste `Os` des 13 modes. `LedTFTMode` passé de 8 à 12, relu à 12. Test visuel en attente.
- 2026-10-17 : test visuel : en mode 12, l'écran n'affiche plus les feux d'artifice (l'utilisateur ne peut pas confirmer que c'est « YOGO »). Retour au mode 8, relu à 8 (luminosité 30, vitesse 2, couleur ff0000 inchangées).
- 2026-10-17 : image de l'écran à points : `0x3B` = image fixe RGB888 108 octets affichée en mode 6, sans commande de lecture ; `0x3C` = trame du visualiseur musical en RGB565 (corrige la passation, qui attribuait le RGB565 à l'image) ; `0x3D` = arrêt du flux.
- 2026-10-17 : image test envoyée avec `0x3B` (coin haut-gauche blanc, rangée du haut rouge, colonne de gauche verte) puis mode 6 : affichage conforme, ni miroir ni rotation. Le clavier accuse les deux paquets `len 56` (`55`). Retour au mode 8, relu ; l'image test reste stockée pour le mode 6 (l'utilisateur n'en avait pas).
- 2026-10-17 : `0x3C` : une trame RGB565 (diagonale bleue, coin haut-droit rouge) s'affiche brièvement puis l'écran passe au noir ; config inchangée. `0x3D` remet `LedTFTMode` à 0 (relu après chaque commande). Mode 8 réécrit. Test du mode −1 : `LedTFTMode` relu à 255, test visuel en attente.
- 2026-10-17 : mode −1 (`0xFF`) : écran éteint (vérifié). Luminosité : comparaison 90 → 5 sur l'image du mode 6, nettement plus sombre. Vitesse brute 2 → 6 → 2 sur le mode 8 : plus lent puis plus rapide. Écran remis à l'état d'origine (mode 8, luminosité 30, vitesse 2) et relu.
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
- 2026-10-17 : Verr. maj → `50 02 00` : deuxième touche Fn fonctionnelle. Verr. maj → `50 03 00` avec Inser → `x` en couche 2 : Verr. maj + Inser tape `x`, Verr. maj + B tape `b` (la couche 1 n'est pas utilisée), rien ne reste bloqué. `50 03` = couche 2 tant que la touche est tenue.
- 2026-10-17 : hypothèse « le mode Mac utilise les couches 2 et 3 » infirmée : en mode Mac, Inser (`x` en couche 2 seulement) ne tape pas `x`, et Fn + B reste lecture/pause (couche 1). `macWin` remis à 0.
- 2026-10-17 : `50 04 00` = couche 3 tant que la touche est tenue (vérifié : Inser → `x` en couche 3 seulement, Verr. maj + Inser tape `x`). Keymap des 4 couches restaurée et relue identique à la sauvegarde.
- 2026-10-17 : `power_info` (`0x30`) lu : `5b 01`, soit 91 % et état 1 (pas « en charge » = 2 selon le configurateur), clavier branché en USB.
- 2026-10-17 : rétroéclairage : luminosité (90 → 10), `colorful` = 1 (arc-en-ciel figé en mode 4) et vitesse (mode 3, brut 0 ≈ 1 s, brut 6 ≈ 8 s) vérifiés ; tout remis (mode 4, luminosité 90, vitesse 3, couleur unique). Test de `ledOnOff` = 1.
- 2026-10-17 : `ledOnOff` = 1 éteint le rétroéclairage, l'écran à points reste allumé (vérifié). Remis à 0.
- 2026-10-17 : effets 1 (défilement vers la droite, avec `colorful` = 1) et 7 (rotation antihoraire) observés ; `customColorIndex` 0 ou 1 ne change pas leur sens. Rétroéclairage remis : mode 4, vert, luminosité 90, vitesse 3, couleur unique.
- 2026-10-17 : table des effets d'éclairage complétée avec les libellés et réglages du configurateur. Synchro musicale (`0x2E` / `0x2F`, mode 254) laissée non déterminée : propre à l'application de bureau, supposée fonctionner comme le flux de l'écran à points.
- 2026-10-17 : revérification de l'effet 1 avec `colorful` = 0, par une seule écriture depuis le mode 4 : vague verte qui défile de gauche à droite, appliquée immédiatement (une écriture du bloc, en 2 paquets, suffit). Retour au mode 4.
- 2026-10-17 : lecture du code sans-fil du configurateur (paquets de 32 octets, 24 de données, découpage du bloc de config, bug d'écriture des positions 48–63). Rien de testé : dongle pas encore branché.
- 2026-10-17 : lecture de `applyWirelessTransport()` et de l'envoi sans-fil (même en-tête, 32 octets, report ID pris dans le descripteur, timeout 3 s).
- 2026-10-17 : dongle branché. Lecture des infos et de la config, puis écriture de la couleur du rétroéclairage, vérifiées à travers le dongle.
- 2026-10-17 : veille vérifiée en 2,4 GHz (`sleepL = 60` → extinction à 60 s, réveil par une touche, clavier injoignable par le dongle pendant la veille).
- 2026-10-17 : keymap, LED par touche, macros, batterie, écran à points (mode, image, visualiseur en direct) vérifiés à travers le dongle ; tout restauré, config identique à la sauvegarde d'origine. L'image fixe d'origine de l'écran à points est écrasée (drapeau arc-en-ciel), avec l'accord de l'utilisateur.
- 2026-10-17 : batterie par le dongle : `52 00` (82 %) sans câble, `52 01` câble de charge branché. L'état 1 signifie donc « en charge ».
- 2026-10-17 : le mode de connexion se choisit avec un sélecteur physique (Bluetooth / câble / 2,4 GHz) ; sur 2,4 GHz, le câble ne sert qu'à charger.
- 2026-10-17 : retour en filaire. Lectures identiques aux sauvegardes ; config, keymap, couleurs et macros réécrites telles quelles en paquets de 56 octets, puis relues à l'identique.
- 2026-10-17 : sauvegarde complète (config, 4 couches, couleurs, macros) vérifiée en USB et à travers le dongle : contenus identiques d'un transport à l'autre ; après `sleepL` = 179, tout réécrire ramène 180. Une nouvelle connexion HID dans le même processus suffit pour relire les nouvelles valeurs.
- 2026-10-17 : la doc du protocole devient indépendante de `yogo.ts` ; l'utilisation de l'outil passe dans `cli.md`.
- 2026-10-17 : comparaison des couches d'usine avec les captures du configurateur : 46–47 sont les boutons d'extension bureau / verrouillage ; table des touches spéciales (types `0x30`, `0x40`, raccourcis) relevée. Les fonctions `0x50` inconnues restent inconnues : l'interface les affiche « NO ».
- 2026-10-17 : l'utilisateur confirme que Fn + 1…4 (`50 34`–`50 37`) sont les boutons Bluetooth.
- 2026-10-17 : guide papier du clavier : confirme les boutons 46–47 (bureau, verrouillage), Fn + 1…3 pour le Bluetooth, et le reset par Fn + Esc + Retour arrière tenus 5 s (d'où l'hypothèse sur `33` et `41`). Il contredit le sens Q/A, W/S du configurateur.
- 2026-10-17 : la page manuals.plus du clavier est une retranscription automatique du guide papier, pleine d'erreurs (Fn + F1 = éclairage, touches Arrêt défil. et Pause qui n'existent pas, Fn + 1/2/3 = câble/BT/2,4 GHz alors qu'un sélecteur physique choisit le mode). Ne pas s'en servir comme source.
- 2026-10-17 : codes d'usine remis dans la couche Fn pour les tester : `3c` = verrouillage Win (`winLock`), `31` / `32` = vitesse de l'écran à points + / −, `0b` = mode − (0 → 20), `3e` sans effet visible. Preset de l'utilisateur restauré depuis la sauvegarde complète.
- 2026-10-17 : réglages d'éclairage de la couche Fn vérifiés au clavier : W / S = couleur précédente / suivante (palette qui boucle sur l'arc-en-ciel), E / D = vitesse + / −, R / F = luminosité + / − (15 par appui). Clics souris `40 00 01` / `40 00 02` vérifiés. Preset restauré.
- 2026-10-17 : Fn + H (`3e`) sans effet aussi en mode Mac. En Bluetooth, Fn + 1, 2, 3 (`34`–`36`) choisissent l'appareil 1, 2, 3 (appui long : appairage) ; Fn + 4 (`37`) sans effet observé.
- 2026-10-17 : deux affirmations trouvées en ligne infirmées : Fn + 4 (`37`) ne bascule pas Win/Mac et Fn + H (`3e`) ne change pas l'écran à points.
- 2026-10-17 : en 2,4 GHz, Fn + H et Fn + 4 (appui bref) : rien de visible, pas de mise en veille. Pistes « batterie » et « veille » écartées.
- 2026-10-17 : modes d'éclairage 2, 5, 6, 8–20 vérifiés au clavier (réaction à la frappe, réglages effectifs). Palette de Fn + W / S corrigée (5 = arc-en-ciel, pas bleu). `customColorIndex` sans effet aussi sur le mode 8.
- 2026-10-17 : relecture périmée élucidée (script jetable, `sleepL` 179 ↔ 180) : c'est un délai d'application, pas une question de session. Périmée jusqu'à ~5 ms après l'écriture, juste à partir de 10 ms. `0x10`, `0x11` + `0x10` et une réouverture ne sont pas fiables en USB. `0x11` seul : bloc relu à zéro.
- 2026-10-17 : `dsSleepL` = 20 puis 1 en 2,4 GHz : l'écran à points reste allumé après 60 s puis 2 min. Remis à 0. `power` : état toujours 1 à 100 %, câble branché.
- 2026-10-17 : configurateur relu pour `dsSleepL/M/H` : jamais lus ni écrits (seul `sleepL/M/H` l'est, via `sleepTime`) et aucun libellé de veille de l'écran à points dans les traductions.
- 2026-10-17 : batterie à 100 %, câble branché : `power_info` reste à `64 01` sur environ une heure. L'état `2` n'apparaît pas quand la batterie est pleine ; `1` = câble branché.
- 2026-10-17 : configurateur relu pour les limites des macros : aucune pour le Yogo 75 PRO (nombre de macros et d'actions illimités, pas de taille maximale du bloc). Seul `macroSize` = 4 (`get_keyboard_info`).
- 2026-10-17 : lecture de 4480 octets avec `0x2C`, sans erreur : zone vide (`ff`×16 puis zéros) jusqu'à 1023, données étrangères aux macros à partir de 1024. Hypothèse : zone des macros de 1024 octets ; la lecture n'est pas bornée par le firmware.
