import * as React from "react"
import { Cloud, Plus, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { formatTime } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import type { CloudStatus, LanSettings } from "@/lib/types"

function CloudCard({ cloud }: { cloud: CloudStatus }) {
  const [apiKey, setApiKey] = React.useState("")

  function save(nextKey: string) {
    void run(async () => {
      await api.setCloudApiKey(nextKey)
      setApiKey("")
    }, nextKey ? "Clé API enregistrée." : "Clé API oubliée.")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="size-4" /> Cloud Govee
            </CardTitle>
            <CardDescription>
              Transport secondaire : utilisé quand le LAN ne suffit pas (scènes officielles, music mode,
              segments, appareils hors LAN).
            </CardDescription>
          </div>
          <Badge variant={cloud.configured ? "default" : "secondary"}>
            {cloud.configured ? "configuré" : "absent"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {cloud.configured
            ? `Clé fournie via ${cloud.configuredSource === "env" ? "variable d'environnement" : "l'application"}${cloud.keyPreview ? ` (${cloud.keyPreview})` : ""}.`
            : "Ajoute une clé API Govee (app Govee Home → profil → À propos → Demander une clé API)."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Coller une clé API Govee"
            autoComplete="off"
            className="max-w-sm"
          />
          <Button onClick={() => save(apiKey.trim())} disabled={!apiKey.trim()}>
            Enregistrer
          </Button>
          <Button variant="outline" onClick={() => save("")} disabled={cloud.configuredSource !== "app"}>
            Oublier
          </Button>
        </div>
        {cloud.configured ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">
              {cloud.deviceCount} appareil(s) cloud · synchronisé {formatTime(cloud.fetchedAt)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={cloud.refreshing}
              onClick={() => run(() => api.refreshCloud(), "Appareils cloud synchronisés.")}
            >
              <RefreshCw data-icon="inline-start" /> Synchroniser
            </Button>
          </div>
        ) : null}
        {cloud.lastRefreshError || cloud.lastError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {cloud.lastRefreshError || cloud.lastError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LanCard({ settings }: { settings: LanSettings }) {
  const [ip, setIp] = React.useState("")
  const [sku, setSku] = React.useState("")
  const [deviceId, setDeviceId] = React.useState("")

  function addDevice() {
    void run(async () => {
      await api.addManualDevice({ ip: ip.trim(), sku: sku.trim() || undefined, device: deviceId.trim() || undefined })
      setIp("")
      setSku("")
      setDeviceId("")
    }, "Appareil ajouté, lecture du statut demandée.")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>LAN</CardTitle>
        <CardDescription>
          Découverte UDP multicast (active « LAN Control » dans Govee Home). Si le multicast est bloqué,
          ajoute l'IP à la main.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Retry LAN</Label>
            <p className="text-xs text-muted-foreground">
              Vérifie l'état après chaque commande et renvoie jusqu'à {settings.retryMaxAttempts} fois.
            </p>
          </div>
          <Switch
            checked={settings.retryMode}
            onCheckedChange={(checked) => run(() => api.setSettings({ retryMode: Boolean(checked) }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Ajouter un appareil par IP</Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_0.7fr_0.9fr_auto]">
            <Input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="IP, ex. 192.168.1.42" />
            <Input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="SKU, ex. H6008" />
            <Input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="Device id (optionnel)" />
            <Button onClick={addDevice} disabled={!ip.trim()}>
              <Plus data-icon="inline-start" /> Ajouter
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPanel({ cloud, settings }: { cloud: CloudStatus; settings: LanSettings }) {
  return (
    <div className="space-y-4">
      <CloudCard cloud={cloud} />
      <LanCard settings={settings} />
    </div>
  )
}
