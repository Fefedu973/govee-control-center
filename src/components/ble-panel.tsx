import * as React from "react"
import { Battery, Bluetooth, Signal } from "lucide-react"

import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { formatTime } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import type { BleAction, BleButton, BleEvent, BleStatus, HubDevice } from "@/lib/types"

const MODE_OPTIONS = [
  { value: "smart-toggle", label: "Smart toggle : lire l'état puis inverser" },
  { value: "toggle-cached", label: "Toggle d'après l'état connu" },
  { value: "turn-on", label: "Toujours allumer" },
  { value: "turn-off", label: "Toujours éteindre" },
]

function ButtonActionEditor({ button, devices }: { button: BleButton; devices: HubDevice[] }) {
  const [action, setAction] = React.useState<BleAction>({
    targetDeviceId: button.action?.targetDeviceId || devices[0]?.id || "",
    mode: button.action?.mode || "smart-toggle",
    fallbackOnUnknown: button.action?.fallbackOnUnknown !== false,
  })

  React.useEffect(() => {
    if (button.action) setAction(button.action)
  }, [button.id, button.action])

  const deviceOptions = devices.map((device) => ({ value: device.id, label: device.name }))

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Appareil cible</Label>
          <SimpleSelect
            value={action.targetDeviceId}
            onChange={(value) => setAction((previous) => ({ ...previous, targetDeviceId: value }))}
            options={deviceOptions}
            placeholder="Choisir un appareil…"
          />
        </div>
        <div className="space-y-2">
          <Label>Action</Label>
          <SimpleSelect
            value={action.mode}
            onChange={(value) => setAction((previous) => ({ ...previous, mode: value as BleAction["mode"] }))}
            options={MODE_OPTIONS}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Si l'état est inconnu, allumer</Label>
          <p className="text-xs text-muted-foreground">Utile quand l'appareil n'a pas encore répondu.</p>
        </div>
        <Switch
          checked={action.fallbackOnUnknown}
          onCheckedChange={(checked) => setAction((previous) => ({ ...previous, fallbackOnUnknown: Boolean(checked) }))}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!action.targetDeviceId}
          onClick={() => run(() => api.bleSetAction(button.id, action), "Action enregistrée.")}
        >
          Enregistrer
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!button.action}
          onClick={() => run(() => api.bleTestAction(button.id), "Action testée.")}
        >
          Tester
        </Button>
      </div>
    </div>
  )
}

export function BlePanel({
  status,
  buttons,
  events,
  devices,
}: {
  status: BleStatus
  buttons: BleButton[]
  events: BleEvent[]
  devices: HubDevice[]
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bluetooth className="size-4" /> Boutons Bluetooth H512x
              </CardTitle>
              <CardDescription>
                Scan BLE passif côté serveur. Un appui déclenche l'action configurée via le hub unifié
                (LAN d'abord, cloud en secours). Les appuis répétés sont dédupliqués par event id.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={status.scanning ? "default" : "secondary"}>
                {status.scanning ? "scan actif" : status.enabled ? "en attente" : "désactivé"}
              </Badge>
              <Switch
                checked={status.enabled}
                disabled={!status.available}
                aria-label="Activer le scan BLE"
                onCheckedChange={(checked) => run(() => api.bleEnable(Boolean(checked)))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.available ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Bluetooth indisponible sur ce serveur{status.error ? ` : ${status.error}` : "."}
            </p>
          ) : status.error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {status.error}
            </p>
          ) : null}

          {buttons.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun bouton détecté. Active le scan puis appuie une fois sur le bouton : les capteurs H512x
              n'émettent qu'au moment d'un appui.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {buttons.map((button) => (
                <div key={button.id} className="space-y-4 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{button.name}</p>
                      <p className="text-xs text-muted-foreground">{button.address}</p>
                    </div>
                    <Badge variant="outline">{button.model}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Battery className="size-3.5" /> {button.battery ?? "—"}%</span>
                    <span className="flex items-center gap-1"><Signal className="size-3.5" /> RSSI {button.rssi ?? "—"}</span>
                    <span>Vu {formatTime(button.lastSeen)}</span>
                  </div>
                  <ButtonActionEditor button={button} devices={devices} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Derniers appuis</CardTitle>
          <CardDescription>Événements dédupliqués reçus par le serveur.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appui détecté pour le moment.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-auto text-sm">
              {events.map((event, index) => (
                <li
                  key={`${event.event?.id || event.at}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{event.button?.name || "Bouton"}</span>
                    <Badge variant="secondary">{event.event?.type || "event"}</Badge>
                    {event.test ? <Badge variant="outline">test</Badge> : null}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {event.event?.id ? <code className="font-mono">{event.event.id}</code> : null}
                    {formatTime(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
