import * as React from "react"
import { Cloud, EllipsisVertical, RefreshCw, Sun, Thermometer, Wifi } from "lucide-react"

import { DeviceDetailsDialog } from "@/components/device-details-dialog"
import { ColorPicker } from "@/components/color-picker"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { api } from "@/lib/api"
import { formatTime, hexToRgb, rgbToHex } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import type { HubDevice, Transport } from "@/lib/types"
import { cn, sliderValue } from "@/lib/utils"

export function DeviceCard({ device }: { device: HubDevice }) {
  const isOn = device.state.on === 1
  const stateHex = rgbToHex(device.state.color)
  const [brightness, setBrightness] = React.useState(device.state.brightness ?? 50)
  const [kelvin, setKelvin] = React.useState(device.state.kelvin ?? 4000)
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  React.useEffect(() => {
    setBrightness(device.state.brightness ?? 50)
    setKelvin(device.state.kelvin ?? 4000)
  }, [device.id, device.state.brightness, device.state.kelvin])

  const command = (body: Parameters<typeof api.command>[1]) => run(() => api.command(device.id, body))
  const forceVia = (via: Transport) => run(() => api.command(device.id, { type: "refresh", via }))

  const lan = device.transports.lan
  const cloud = device.transports.cloud

  return (
    <Card
      className={cn(
        "gap-4 transition-[border-color,box-shadow]",
        isOn && "border-emerald-400/50 shadow-[0_0_0_1px_rgba(52,211,153,0.25),0_10px_32px_rgba(16,185,129,0.12)]",
      )}
    >
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium" title={device.id}>{device.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {device.sku ? <Badge variant="outline">{device.sku}</Badge> : null}
              {lan ? (
                <Badge variant="secondary" className={cn(lan.online && "text-emerald-600 dark:text-emerald-400")}>
                  <Wifi data-icon="inline-start" /> LAN
                </Badge>
              ) : null}
              {cloud ? (
                <Badge variant="secondary">
                  <Cloud data-icon="inline-start" /> Cloud
                </Badge>
              ) : null}
              {lan?.manual ? <Badge variant="outline">manuel</Badge> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch
              checked={isOn}
              aria-label={isOn ? "Éteindre" : "Allumer"}
              onCheckedChange={(checked) => command({ type: "power", on: Boolean(checked) })}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Options de l'appareil" />}
              >
                <EllipsisVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => command({ type: "refresh" })}>
                  <RefreshCw /> Rafraîchir l'état
                </DropdownMenuItem>
                {lan?.ip ? (
                  <DropdownMenuItem onClick={() => forceVia("lan")}>
                    <Wifi /> Relire via LAN
                  </DropdownMenuItem>
                ) : null}
                {cloud ? (
                  <DropdownMenuItem onClick={() => forceVia("cloud")}>
                    <Cloud /> Relire via Cloud
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setDetailsOpen(true)}>Détails & fonctions cloud</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {device.capabilities.brightness ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Sun className="size-3.5" /> Luminosité</span>
              <span>{brightness}%</span>
            </div>
            <Slider
              value={[brightness]}
              min={1}
              max={100}
              onValueChange={(value) => setBrightness(sliderValue(value))}
              onValueCommitted={(value) => command({ type: "brightness", value: sliderValue(value) })}
            />
          </div>
        ) : null}

        {device.capabilities.colorTemperature ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Thermometer className="size-3.5" /> Température</span>
              <span>{kelvin} K</span>
            </div>
            <Slider
              value={[kelvin]}
              min={2000}
              max={9000}
              step={100}
              onValueChange={(value) => setKelvin(sliderValue(value))}
              onValueCommitted={(value) => command({ type: "color-temperature", kelvin: sliderValue(value) })}
            />
          </div>
        ) : null}

        {device.capabilities.color ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Couleur</span>
            <ColorPicker value={stateHex} onChange={(hex) => command({ type: "color", ...hexToRgb(hex) })} />
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {device.state.source
            ? `État ${device.state.source === "lan" ? "LAN" : "cloud"} · ${formatTime(device.state.updatedAt)}`
            : "État inconnu — lance un scan ou un rafraîchissement."}
          {cloud?.statusError ? ` · ${cloud.statusError}` : ""}
        </p>
      </CardContent>

      <DeviceDetailsDialog device={device} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </Card>
  )
}
