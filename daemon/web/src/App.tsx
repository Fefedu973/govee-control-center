import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'

type RgbColor = {
  r: number
  g: number
  b: number
}

type DaemonConfig = {
  sensor: {
    address: string
    button: number
  }
  target: {
    ip: string
    controlPort: number
    listenPort: number
  }
  behavior: Record<string, unknown>
  action: {
    mode: 'power-toggle' | 'power-color-toggle'
    on: {
      color: RgbColor | null
      brightness: number | null
    }
  }
  health: Record<string, unknown>
}

type BluetoothDevice = {
  address: string
  name: string
  model: string
  battery: number | null
  buttonCount: number
}

type LanDevice = {
  ip: string
  name: string
  sku?: string
}

type Discovery = {
  bluetooth: BluetoothDevice[]
  lan: LanDevice[]
}

type DaemonStatus = {
  ready: boolean
  uptimeSeconds: number
  ble: {
    scanning: boolean
    state: string
  }
  target: {
    reachable: boolean
    lastPower: number | null
    lastActionAt: string | null
  }
}

type Message = {
  text: string
  tone: 'neutral' | 'success' | 'error'
}

const emptyDiscovery: Discovery = { bluetooth: [], lan: [] }

const actionModes = [
  { label: 'Bascule marche / arrêt', value: 'power-toggle' },
  { label: 'Bascule avec couleur', value: 'power-color-toggle' },
]

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || `Requête impossible (${response.status})`)
  }
  return payload as T
}

function rgbToHex(color: RgbColor | null) {
  if (!color) return '#ffffff'
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function hexToRgb(value: string): RgbColor {
  const normalized = value.replace('#', '')
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function formatUptime(seconds = 0) {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`
}

function App() {
  const [config, setConfig] = useState<DaemonConfig | null>(null)
  const [draft, setDraft] = useState<DaemonConfig | null>(null)
  const [discovery, setDiscovery] = useState<Discovery>(emptyDiscovery)
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [color, setColor] = useState('#ffffff')
  const [colorText, setColorText] = useState('#ffffff')
  const [brightnessEnabled, setBrightnessEnabled] = useState(false)
  const [brightness, setBrightness] = useState(80)
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatus(await request<DaemonStatus>('/api/status'))
  }, [])

  const refreshDiscovery = useCallback(async () => {
    setDiscovery(await request<Discovery>('/api/discovery'))
  }, [])

  useEffect(() => {
    let active = true

    Promise.all([
      request<DaemonConfig>('/api/config'),
      request<Discovery>('/api/discovery'),
      request<DaemonStatus>('/api/status'),
    ])
      .then(([currentConfig, currentDiscovery, currentStatus]) => {
        if (!active) return
        setConfig(currentConfig)
        setDraft(currentConfig)
        setDiscovery(currentDiscovery)
        setStatus(currentStatus)
        const currentColor = rgbToHex(currentConfig.action.on.color)
        setColor(currentColor)
        setColorText(currentColor)
        setBrightnessEnabled(currentConfig.action.on.brightness !== null)
        setBrightness(currentConfig.action.on.brightness ?? 80)
      })
      .catch((error: Error) => {
        if (active) setMessage({ text: error.message, tone: 'error' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const statusTimer = window.setInterval(() => {
      refreshStatus().catch(() => undefined)
    }, 3000)
    const discoveryTimer = window.setInterval(() => {
      refreshDiscovery().catch(() => undefined)
    }, 5000)

    return () => {
      active = false
      window.clearInterval(statusTimer)
      window.clearInterval(discoveryTimer)
    }
  }, [refreshDiscovery, refreshStatus])

  const bluetoothDevices = useMemo(() => {
    const devices = [...discovery.bluetooth]
    const address = draft?.sensor.address
    if (address && !devices.some((device) => device.address === address)) {
      devices.push({
        address,
        name: address,
        model: 'Bouton configuré',
        battery: null,
        buttonCount: Math.max(1, (draft?.sensor.button ?? 0) + 1),
      })
    }
    return devices
  }, [discovery.bluetooth, draft?.sensor.address, draft?.sensor.button])

  const lanDevices = useMemo(() => {
    const devices = [...discovery.lan]
    const ip = draft?.target.ip
    if (ip && !devices.some((device) => device.ip === ip)) {
      devices.push({ ip, name: `${ip} — Lampe configurée` })
    }
    return devices
  }, [discovery.lan, draft?.target.ip])

  const selectedBluetooth = bluetoothDevices.find(
    (device) => device.address === draft?.sensor.address,
  )
  const buttonItems = Array.from(
    { length: selectedBluetooth?.buttonCount ?? 1 },
    (_, index) => ({ label: `Bouton ${index + 1}`, value: String(index) }),
  )

  const discover = async () => {
    setDiscovering(true)
    setMessage({ text: 'Recherche des appareils en cours…', tone: 'neutral' })
    try {
      await request('/api/discovery/lan', { method: 'POST' })
      await refreshDiscovery()
      setMessage({ text: 'Liste des appareils actualisée.', tone: 'success' })
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'error' })
    } finally {
      setDiscovering(false)
    }
  }

  const save = async (runTest: boolean) => {
    if (!draft?.sensor.address) {
      setMessage({ text: 'Sélectionnez un bouton Bluetooth.', tone: 'error' })
      return
    }
    if (!draft.target.ip) {
      setMessage({ text: 'Sélectionnez une lampe Govee LAN.', tone: 'error' })
      return
    }

    setSaving(true)
    setMessage({
      text: runTest ? 'Enregistrement et test en cours…' : 'Enregistrement en cours…',
      tone: 'neutral',
    })

    const nextConfig: DaemonConfig = {
      ...draft,
      action: {
        mode: draft.action.mode,
        on: {
          color:
            draft.action.mode === 'power-color-toggle'
              ? hexToRgb(/^#[0-9a-f]{6}$/i.test(colorText) ? colorText : color)
              : null,
          brightness:
            draft.action.mode === 'power-color-toggle' && brightnessEnabled
              ? brightness
              : null,
        },
      },
    }

    try {
      const saved = await request<DaemonConfig>('/api/config', {
        method: 'POST',
        body: JSON.stringify(nextConfig),
      })
      if (runTest) {
        await request('/api/action/test', { method: 'POST' })
      }
      setConfig(saved)
      setDraft(saved)
      setMessage({
        text: runTest
          ? 'Configuration enregistrée et action exécutée.'
          : 'Configuration enregistrée.',
        tone: 'success',
      })
      await refreshStatus()
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const updateDraft = (update: (current: DaemonConfig) => DaemonConfig) => {
    setDraft((current) => (current ? update(current) : current))
  }

  const isReady = status?.ready === true
  const powerLabel =
    status?.target.lastPower === 1
      ? 'Allumée'
      : status?.target.lastPower === 0
        ? 'Éteinte'
        : 'Inconnue'

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Govee Smart Toggle
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Associez un bouton Bluetooth à une lampe Govee sur le réseau local.
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          <span
            className={`size-1.5 rounded-full ${
              isReady ? 'bg-foreground' : 'bg-muted-foreground'
            }`}
          />
          {isReady ? 'Prêt' : 'Dégradé'}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Appareils</CardTitle>
          <CardDescription>
            Le bouton et la lampe utilisés par le service.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              onClick={discover}
              disabled={discovering || loading}
            >
              {discovering ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {discovering ? 'Recherche…' : 'Rechercher'}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel>Bouton Bluetooth</FieldLabel>
              <Select
                items={bluetoothDevices.map((device) => ({
                  label: `${device.name} — ${device.model}`,
                  value: device.address,
                }))}
                value={draft?.sensor.address ?? ''}
                onValueChange={(value) => {
                  if (!value) return
                  updateDraft((current) => ({
                    ...current,
                    sensor: { address: value, button: 0 },
                  }))
                }}
                disabled={loading || bluetoothDevices.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Bouton Bluetooth">
                  <SelectValue placeholder="Aucun bouton détecté" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {bluetoothDevices.map((device) => (
                      <SelectItem key={device.address} value={device.address}>
                        <span className="min-w-0">
                          <span className="block truncate">
                            {device.name} — {device.model}
                          </span>
                          {device.battery !== null && (
                            <span className="block text-xs text-muted-foreground">
                              Batterie {device.battery} %
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Bouton physique</FieldLabel>
              <Select
                items={buttonItems}
                value={String(draft?.sensor.button ?? 0)}
                onValueChange={(value) => {
                  if (value === null) return
                  updateDraft((current) => ({
                    ...current,
                    sensor: { ...current.sensor, button: Number(value) },
                  }))
                }}
                disabled={loading || !draft?.sensor.address}
              >
                <SelectTrigger className="w-full" aria-label="Bouton physique">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {buttonItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel>Lampe Govee LAN</FieldLabel>
              <Select
                items={lanDevices.map((device) => ({
                  label: device.name,
                  value: device.ip,
                }))}
                value={draft?.target.ip ?? ''}
                onValueChange={(value) => {
                  if (!value) return
                  updateDraft((current) => ({
                    ...current,
                    target: { ...current.target, ip: value },
                  }))
                }}
                disabled={loading || lanDevices.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Lampe Govee LAN">
                  <SelectValue placeholder="Aucune lampe détectée" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {lanDevices.map((device) => (
                      <SelectItem key={device.ip} value={device.ip}>
                        <span className="min-w-0">
                          <span className="block truncate">{device.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {device.sku ? `${device.sku} · ` : ''}
                            {device.ip}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>

        <Separator />

        <CardHeader>
          <CardTitle>Action</CardTitle>
          <CardDescription>
            Ce que la lampe doit faire à chaque pression.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Mode</FieldLabel>
              <Select
                items={actionModes}
                value={draft?.action.mode ?? 'power-toggle'}
                onValueChange={(value) => {
                  if (
                    value !== 'power-toggle' &&
                    value !== 'power-color-toggle'
                  ) {
                    return
                  }
                  updateDraft((current) => ({
                    ...current,
                    action: { ...current.action, mode: value },
                  }))
                }}
                disabled={loading}
              >
                <SelectTrigger className="w-full" aria-label="Mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {actionModes.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {draft?.action.mode === 'power-color-toggle' && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="color-value">Couleur à l’allumage</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Choisir la couleur"
                      type="color"
                      className="size-8 shrink-0 cursor-pointer p-1"
                      value={color}
                      onChange={(event) => {
                        setColor(event.target.value)
                        setColorText(event.target.value)
                      }}
                    />
                    <Input
                      id="color-value"
                      value={colorText}
                      onChange={(event) => setColorText(event.target.value)}
                      onBlur={() => {
                        if (/^#[0-9a-f]{6}$/i.test(colorText)) {
                          const normalized = colorText.toLowerCase()
                          setColor(normalized)
                          setColorText(normalized)
                        } else {
                          setColorText(color)
                        }
                      }}
                    />
                  </div>
                </Field>

                <Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="force-brightness"
                      checked={brightnessEnabled}
                      onCheckedChange={setBrightnessEnabled}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="force-brightness">
                        Forcer la luminosité
                      </FieldLabel>
                    </FieldContent>
                  </Field>
                  <div className="flex min-h-8 items-center gap-3">
                    <Slider
                      value={[brightness]}
                      min={1}
                      max={100}
                      step={1}
                      disabled={!brightnessEnabled}
                      onValueChange={(value) =>
                        setBrightness(
                          typeof value === 'number' ? value : (value[0] ?? 80),
                        )
                      }
                    />
                    <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                      {brightness} %
                    </span>
                  </div>
                </Field>
              </div>
            )}
          </FieldGroup>
        </CardContent>

        <Separator />

        <CardHeader>
          <CardTitle>État du service</CardTitle>
          <CardDescription>
            Informations actualisées automatiquement.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Field>
              <FieldTitle>{powerLabel}</FieldTitle>
              <FieldDescription>Lampe</FieldDescription>
            </Field>
            <Field>
              <FieldTitle>
                {status?.ble.scanning ? 'Actif' : status?.ble.state || '—'}
              </FieldTitle>
              <FieldDescription>Bluetooth</FieldDescription>
            </Field>
            <Field>
              <FieldTitle>
                {status?.target.lastActionAt
                  ? new Date(status.target.lastActionAt).toLocaleTimeString(
                      'fr-FR',
                      { hour: '2-digit', minute: '2-digit' },
                    )
                  : 'Jamais'}
              </FieldTitle>
              <FieldDescription>Dernière action</FieldDescription>
            </Field>
            <Field>
              <FieldTitle>{formatUptime(status?.uptimeSeconds)}</FieldTitle>
              <FieldDescription>En service</FieldDescription>
            </Field>
          </div>

          <p
            role={message?.tone === 'error' ? 'alert' : 'status'}
            className={`mt-5 min-h-5 text-sm ${
              message?.tone === 'error'
                ? 'text-destructive'
                : message?.tone === 'success'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
            }`}
          >
            {message?.text ??
              (config ? 'La configuration est chargée.' : 'Chargement…')}
          </p>
        </CardContent>

        <CardFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => save(true)}
            disabled={saving || loading}
          >
            {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
            Enregistrer et tester
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => save(false)}
            disabled={saving || loading}
          >
            {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
            Enregistrer
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

export default App
