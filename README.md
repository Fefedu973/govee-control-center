# Govee Control Hub

Hub local pour piloter des appareils Govee, avec **tous les moyens de contrôle unifiés derrière une seule API** :

- **LAN** — UDP local (scan multicast, `turn`, `brightness`, `colorwc`, statut) : rapide, sans cloud ;
- **Cloud** — API officielle Govee : secours quand le LAN ne suffit pas, et fonctions exclusives (LightScenes/DIY, music mode, segments) ;
- **Bluetooth** — boutons Govee H512x (H5122/H5125/H5126) en scan BLE passif, qui déclenchent des actions sur n'importe quel appareil du hub.

Chaque appareil est fusionné en une seule fiche (par adresse MAC) quel que soit le transport. Une commande passe par le **meilleur transport disponible** : LAN d'abord, cloud en secours — ou un transport forcé à la demande.

> Pour la production Raspberry Pi « un bouton → une lampe », utilise le daemon allégé dans [`daemon/`](daemon/README.md). Ce hub est l'application complète avec interface.

## Stack

- Backend : Node.js (modules natifs uniquement), découpé dans [`server/`](server/) — UDP LAN, cloud API, BLE via `@stoprocent/noble`, SSE.
- Frontend : React 19 + Vite + Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (style `base-nova`, primitives Base UI), en TypeScript.
- Persistance : un seul fichier `data/config.json` (actions BLE, scènes locales, clé cloud, réglages).

```text
navigateur (React, SSE)
  -> serveur Node local (server/)
       ├─ lan.js    UDP 4001/4002/4003 (découverte + commandes)
       ├─ cloud.js  API cloud Govee (clé API)
       ├─ ble.js    scan BLE passif des boutons H512x
       └─ hub.js    registre unifié + routage des commandes
```

## Démarrage

```bash
bun install        # ou npm install
bun run dev        # serveur (8787) + Vite (5173) en parallèle
```

UI de dev : `http://localhost:5173` (proxy `/api` vers le serveur).

Production locale :

```bash
bun run build
bun run start      # tout sur http://localhost:8787
```

`bun run check` vérifie la syntaxe serveur, les types et le build.

## Transports

### LAN

1. Appareil compatible LAN API, sur le même réseau.
2. Active **LAN Control** par appareil dans Govee Home.
3. Pare-feu : UDP sortant vers `239.255.255.250:4001`, entrant local sur `4002`, sortant vers les appareils sur `4003`.

Le port local `4002` est fixe dans le protocole : ne lance pas un autre intégrateur LAN Govee (Home Assistant, govee2mqtt…) en même temps sur la même machine. Si le multicast est bloqué, ajoute l'IP à la main (Réglages → LAN) ou via `GOVEE_SCAN_IPS`.

### Cloud

Colle une clé API Govee (app Govee Home → profil → À propos de nous → Demander une clé API) dans **Réglages → Cloud**, ou fournis `GOVEE_API_KEY`. Les appareils cloud sont synchronisés au démarrage puis à la demande (l'API est limitée en quota : pas de polling automatique).

### Bluetooth (boutons H512x)

Scan passif côté serveur : le bouton n'est pas appairé, le serveur écoute ses annonces. Un appui = un event id H512x unique (`manufacturerData[2:6]`), donc les annonces répétées d'un même appui sont dédupliquées nativement. Chaque bouton peut déclencher : smart toggle (lire l'état puis inverser), toggle sur état connu, toujours allumer, toujours éteindre — sur n'importe quel appareil du hub.

- Linux/Raspberry Pi : `bluez`, `bluetooth`, `libudev-dev`.
- Windows : dépend de la pile BLE et des bindings `@stoprocent/noble`.
- Docker : BLE déconseillé en conteneur, lance Node sur l'hôte.

## API HTTP

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/state` | État complet (appareils unifiés, scènes, BLE, cloud, réglages) |
| GET | `/api/events` | SSE : `state` initial puis `devices`, `scenes`, `ble-*`, `cloud-status`, `scan`, `retry`, `error` |
| POST | `/api/scan` | Relance une découverte LAN (`{ "ips": ["192.168.1.42"] }` optionnel) |
| POST | `/api/devices/manual` | Ajoute un appareil LAN par IP (`{ ip, sku?, device? }`) |
| POST | `/api/devices/:id/command` | Commande unifiée (voir ci-dessous) |
| GET | `/api/devices/:id/cloud-scenes` | Liste les LightScenes/DIY cloud de l'appareil |
| POST | `/api/actions/all` | Action globale (`{ type: "power", on: true }`, `brightness`, `color`) |
| GET | `/api/scenes` | Scènes locales |
| POST | `/api/scenes/snapshot` | Snapshot des états connus (`{ name? }`) |
| POST | `/api/scenes/:id/apply` | Applique une scène |
| DELETE | `/api/scenes/:id` | Supprime une scène |
| POST | `/api/ble/enable` | Active/désactive le scan BLE (`{ enabled }`) |
| POST | `/api/ble/buttons/:id/action` | Configure l'action d'un bouton (`{ targetDeviceId, mode, fallbackOnUnknown }`) |
| POST | `/api/ble/buttons/:id/test` | Exécute l'action configurée |
| POST | `/api/cloud/api-key` | Enregistre/oublie la clé API (`{ apiKey }`) |
| POST | `/api/cloud/refresh` | Resynchronise les appareils cloud |
| POST | `/api/settings` | Réglages LAN (`{ retryMode }`) |

### Commande unifiée

`POST /api/devices/:id/command` — `:id` est l'identifiant unifié (MAC, URL-encodée). Le champ `via` (`"auto"` par défaut, `"lan"`, `"cloud"`) force un transport.

```bash
# Toggle intelligent (lecture d'état fraîche puis inversion), transport auto
curl -X POST "http://localhost:8787/api/devices/AA%3ABB%3ACC%3A11%3A22%3A33%3A44%3A55/command" \
  -H "content-type: application/json" \
  -d '{ "type": "toggle" }'
```

| `type` | Paramètres | Transports |
| --- | --- | --- |
| `power` | `on: boolean` | LAN / cloud |
| `toggle` | `fallbackOnUnknown?`, `fresh?` | LAN / cloud |
| `brightness` | `value: 1-100` | LAN / cloud |
| `color` | `r, g, b: 0-255` | LAN / cloud |
| `color-temperature` | `kelvin` | LAN / cloud |
| `refresh` | — | LAN / cloud |
| `cloud-scene` | `value`, `instance: lightScene\|diyScene` | cloud |
| `segment-color` | `segment`, `color: {r,g,b}` | cloud |
| `segment-brightness` | `segment`, `brightness` | cloud |
| `music-mode` | `mode`, `sensitivity`, `autoColor`, `color?` | cloud |

## Variables d'environnement

```bash
PORT=8787                            # port HTTP
GOVEE_SCAN_IPS=192.168.1.42          # IPs unicast en plus du multicast
GOVEE_API_KEY=...                    # clé cloud (sinon via l'UI)
GOVEE_BLE_ENABLED=1                  # scan BLE au démarrage
GOVEE_AUTOSCAN_INTERVAL_MS=10000     # intervalle d'autoscan LAN
GOVEE_STATUS_POLL_INTERVAL_MS=30000  # polling des statuts LAN
GOVEE_RETRY_MAX_ATTEMPTS=2           # renvois max en mode retry
GOVEE_BLE_EVENT_ID_TTL_MS=600000     # durée d'ignorance d'un event id déjà vu
```

## Docker

Le LAN fonctionne mieux en `network_mode: host` (Linux) :

```bash
docker compose up -d --build
# ou
docker build -t govee-control-hub . && docker run --network host -v ./data:/app/data govee-control-hub
```

## Licence

MIT — voir [LICENSE](LICENSE).
