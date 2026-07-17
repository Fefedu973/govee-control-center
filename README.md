# Govee Control Hub

> The Raspberry Pi production path is now the lightweight, UI-free daemon in [`daemon/`](daemon/README.md). This Control Hub remains available as a diagnostic tool and rollback target.

Application locale pour contrôler des appareils Govee en LAN, tester les payloads **Razer/DreamView Direct Connect**, sauvegarder des **scènes locales**, piloter des actions globales, et utiliser un bouton **Govee H5122 Mini Button** en Bluetooth Low Energy pour déclencher des actions.

## Ce qui a changé dans cette version

- UI remise au propre avec des composants style **shadcn/ui récents** : React 19, Vite, Tailwind CSS v4, `data-slot`, `components.json`, imports compatibles CLI, et primitives Radix pour `Select`, `Tabs`, `Switch`, `Slider` et `Popover`.
- Suppression des faux dropdowns maison : les sélecteurs sont maintenant des composants shadcn/Radix.
- Ajout d’un **ColorPicker shadcn-like** avec popover, presets, sliders RGB, input HEX et support de l’`EyeDropper` API quand disponible.
- Fix H5122 : les événements BLE sont maintenant dédupliqués avec l’event id H512x `manufacturerData[2:6]`, exposé dans `event.id` et `sensor.raw.eventId`.
- Suppression du réglage manuel de debounce H5122 dans l’UI : un même appui répété en BLE ne déclenche plus plusieurs actions tant que son event id est déjà vu.
- Ajout des **actions globales** prévues dans l’ancien projet : tout allumer, tout éteindre, luminosité globale, couleur globale.
- Ajout des **scènes locales** : sauvegarde d’un snapshot des états LAN connus dans `data/config.json`, puis réapplication plus tard.
- Conservation du Direct/Razer/DreamView expérimental pour préparer les usages SignalRGB/DreamView.

## Architecture

```text
navigateur React
  -> HTTP/SSE local
    -> serveur Node.js
      -> UDP LAN API Govee pour les lampes
      -> scan BLE passif pour les boutons H5122
      -> stockage local data/config.json pour actions BLE et scènes
```

Le navigateur ne peut pas parler directement UDP ni scanner le BLE en arrière-plan de façon fiable. Le serveur Node.js fait donc le pont local.

## Prérequis LAN

1. L’appareil Govee doit être compatible LAN API.
2. Il doit être sur le même réseau local que la machine qui lance ce projet.
3. Dans **Govee Home**, active **LAN Control** pour chaque appareil.
4. Autorise le pare-feu :
   - UDP sortant vers `239.255.255.250:4001` pour le scan ;
   - UDP entrant local sur `4002` pour les réponses ;
   - UDP sortant vers les appareils sur `4003` pour les commandes.

Le port local UDP `4002` est fixe dans le protocole. Évite de lancer Home Assistant Govee LAN, govee2mqtt, openHAB Govee LAN, etc. en même temps sur la même machine/IP.

## Prérequis Bluetooth H5122

Le H5122 est un capteur BLE “sleepy” : il n’est pas forcément visible tout le temps. Le serveur écoute les annonces BLE et détecte surtout les événements quand tu appuies sur le bouton.

- Linux/Raspberry Pi : installe les paquets Bluetooth système si nécessaire, par exemple `bluez`, `bluetooth`, `libudev-dev`.
- Windows : le support dépend de la pile BLE, de Node et des bindings natifs de `@stoprocent/noble`.
- Docker : le BLE dans un conteneur est beaucoup moins fiable. Lance plutôt Node directement sur l’hôte pour utiliser le H5122.

## Installation dev

```bash
cd govee-control-hub
npm install
npm run dev
```

Puis ouvre l’UI Vite :

```text
http://localhost:5173
```

Le backend écoute sur :

```text
http://localhost:8787
```

## Production locale

```bash
npm install
npm run build
npm start
```

Puis ouvre :

```text
http://localhost:8787
```

## shadcn/ui

Le projet reste en JavaScript/Vite, mais il est configuré pour le CLI moderne :

```bash
npm run shadcn:info
npm run shadcn:add -- button
npm run shadcn:init
```

`components.json` pointe vers `src/index.css`, Tailwind v4 laisse `tailwind.config` vide, et `package.json#imports` fournit aussi des alias `#ui/*`, `#components/*`, `#lib/*` en plus de `@/*`.

## Variables d’environnement utiles

```bash
# Port HTTP du backend
PORT=8787

# IP directes à scanner en plus du multicast, pratique si ton Wi-Fi bloque le multicast
GOVEE_SCAN_IPS=192.168.1.42,192.168.1.43

# Activer le scan BLE au démarrage
GOVEE_BLE_ENABLED=1

# Durée pendant laquelle un event id H512x déjà traité reste ignoré
GOVEE_BLE_EVENT_ID_TTL_MS=600000

# Fallback seulement si un modèle BLE futur ne fournit pas d'event id
GOVEE_BLE_FALLBACK_EVENT_WINDOW_MS=9000

# Intervalle d'autoscan LAN
GOVEE_AUTOSCAN_INTERVAL_MS=10000

# Intervalle de polling des statuts LAN
GOVEE_STATUS_POLL_INTERVAL_MS=30000
```

Windows PowerShell :

```powershell
$env:GOVEE_SCAN_IPS="192.168.1.42"; $env:GOVEE_BLE_ENABLED="1"; npm start
```

## API HTTP importante

### LAN

```text
GET  /api/devices
POST /api/scan
POST /api/manual-device
POST /api/devices/:id/power
POST /api/devices/:id/smart-toggle
POST /api/devices/:id/brightness
POST /api/devices/:id/color
POST /api/devices/:id/color-temperature
POST /api/devices/:id/status
```

`smart-toggle` n’est pas une commande LAN native Govee : le backend relit le statut avec `devStatus`/`status`, puis envoie `turn` avec la valeur opposée. Si l’état est inconnu, `fallbackOnUnknown` décide quoi faire.

### Actions globales

```text
POST /api/actions/all-power
POST /api/actions/all-brightness
POST /api/actions/all-color
```

Exemple :

```bash
curl -X POST "http://localhost:8787/api/actions/all-color" \
  -H "Content-Type: application/json" \
  -d '{"r":255,"g":80,"b":0}'
```

### Scènes locales

```text
GET  /api/scenes
POST /api/scenes/snapshot
POST /api/scenes/:id/apply
POST /api/scenes/:id/delete
```

Les scènes sont des snapshots locaux des états déjà connus. Il faut donc scanner/lire le statut au moins une fois avant de sauvegarder une scène.

### Direct / Razer / DreamView

```text
POST /api/devices/:id/direct-mode
POST /api/devices/:id/direct-color
POST /api/devices/:id/direct-pixels
```

Exemple pour une ampoule logique à un pixel :

```bash
curl -X POST "http://localhost:8787/api/devices/TON_ID/direct-color" \
  -H "Content-Type: application/json" \
  -d '{"protocol":"razer","ledCount":1,"r":255,"g":0,"b":0}'
```

Protocoles testables :

- `razer`
- `dreamview`
- `dreamview-v2`
- `razer-legacy`

Tous les modèles n’acceptent pas ce mode. Si l’appareil ignore `cmd: "razer"`, repasse sur les commandes LAN classiques.

### Bluetooth H5122

```text
GET  /api/ble/status
POST /api/ble/enable
POST /api/ble/sensors/:id/action
```

Configurer une pression H5122 pour faire un smart toggle :

```bash
curl -X POST "http://localhost:8787/api/ble/sensors/AA%3ABB%3ACC%3ADD%3AEE%3AFF/action" \
  -H "Content-Type: application/json" \
  -d '{
    "targetDeviceId":"manual:192.168.1.42",
    "mode":"smart-toggle",
    "fallbackOnUnknown":true
  }'
```

## Détails H5122 BLE

Le parser implémenté reprend la logique open-source utilisée par Home Assistant / `govee-ble` :

- annonce manufacturer data H512x de 24 octets ;
- CRC sur les 16 octets chiffrés ;
- clé AES-128-ECB dérivée des 4 octets `time_ms` + 12 zéros, puis inversée ;
- payload déchiffré contenant le model id, la batterie et le numéro de bouton ;
- H5122 = model id `8`, bouton `button_0`.

La nouveauté importante : `time_ms = manufacturerData[2:6]` est conservé comme **event id**. Les paquets répétés du même appui gardent le même event id, donc ils sont ignorés. Plusieurs vrais appuis successifs ont des event ids différents et restent acceptés.

Le scan est passif : le serveur ne se connecte pas au bouton, il écoute les annonces BLE.

## Fonctionnalités reprises/préparées depuis `Fefedu973/govee-control-center`

Implémenté ici :

- LAN API local ;
- Direct/Razer/DreamView expérimental ;
- BLE H5122 ;
- all toggle / all same color ;
- color temperature ;
- scène locale simple ;
- base pour logique événementielle via “H5122 press -> action”.

Pas encore implémenté complètement :

- cloud API Govee complète avec LightScenes/DIY officiels ;
- music mode cloud ;
- intégrations Google Assistant/Alexa/Home Assistant/Stream Deck ;
- éditeur visuel type Scratch pour scénarios complexes.

## Docker

Le LAN API fonctionne mieux en `network_mode: host` sous Linux :

```bash
docker build -t govee-control-hub .
docker run --network host -e PORT=8787 govee-control-hub
```

Pour le BLE/H5122, Docker est déconseillé. Il faut exposer le contrôleur Bluetooth de l’hôte au conteneur, ce qui dépend fortement de Linux/BlueZ/D-Bus.
