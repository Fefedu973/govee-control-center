import * as React from "react"
import { Loader2, Music, Palette, SlidersHorizontal } from "lucide-react"

import { ColorPicker } from "@/components/color-picker"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { hexToRgb } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import type { CloudSceneOption, HubDevice } from "@/lib/types"
import { cn, sliderValue } from "@/lib/utils"

const MAX_SEGMENTS = 64

function musicModeOptions(device: HubDevice) {
  const capability = (device.raw.cloud?.capabilities || []).find(
    (entry) => entry.type === "devices.capabilities.music_setting",
  )
  const field = capability?.parameters?.fields?.find((entry) => entry.fieldName === "musicMode")
  return field?.options || []
}

function CloudScenesTab({ device }: { device: HubDevice }) {
  const [scenes, setScenes] = React.useState<CloudSceneOption[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState("")

  async function load() {
    setLoading(true)
    await run(async () => {
      const payload = await api.cloudScenes(device.id)
      setScenes(payload.scenes)
      if (payload.scenes[0]) setSelected(`${payload.scenes[0].instance}:${payload.scenes[0].value}`)
    })
    setLoading(false)
  }

  const options = (scenes || []).map((scene) => ({
    value: `${scene.instance}:${scene.value}`,
    label: `${scene.instance === "diyScene" ? "DIY" : "LightScene"} · ${scene.name}`,
  }))

  function apply() {
    const scene = (scenes || []).find((entry) => `${entry.instance}:${entry.value}` === selected)
    if (!scene) return
    void run(
      () => api.command(device.id, { type: "cloud-scene", value: Number(scene.value), instance: scene.instance }),
      `Scène « ${scene.name} » appliquée.`,
    )
  }

  return (
    <div className="space-y-3">
      {scenes === null ? (
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null} Charger les scènes cloud
        </Button>
      ) : scenes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune scène cloud disponible pour ce modèle.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect value={selected} onChange={setSelected} options={options} className="max-w-72" />
          <Button onClick={apply} disabled={!selected}>Appliquer</Button>
          <Button variant="outline" onClick={load} disabled={loading}>Recharger</Button>
        </div>
      )}
    </div>
  )
}

function MusicTab({ device }: { device: HubDevice }) {
  const options = musicModeOptions(device)
  const [mode, setMode] = React.useState(options[0] ? String(options[0].value) : "")
  const [sensitivity, setSensitivity] = React.useState(100)
  const [autoColor, setAutoColor] = React.useState(true)
  const [color, setColor] = React.useState("#ffffff")

  return (
    <div className="space-y-4">
      {options.length > 0 ? (
        <div className="space-y-2">
          <Label>Mode</Label>
          <SimpleSelect
            value={mode}
            onChange={setMode}
            options={options.map((option) => ({ value: String(option.value), label: option.name || String(option.value) }))}
            className="max-w-72"
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Sensibilité</span>
          <span>{sensitivity}%</span>
        </div>
        <Slider value={[sensitivity]} min={0} max={100} onValueChange={(value) => setSensitivity(sliderValue(value))} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label>Couleur automatique</Label>
        <Switch checked={autoColor} onCheckedChange={(checked) => setAutoColor(Boolean(checked))} />
      </div>
      {!autoColor ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Couleur</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      ) : null}
      <Button
        onClick={() =>
          run(
            () =>
              api.command(device.id, {
                type: "music-mode",
                mode: Number(mode),
                sensitivity,
                autoColor,
                color: hexToRgb(color),
              }),
            "Music mode appliqué.",
          )
        }
        disabled={!mode}
      >
        <Music data-icon="inline-start" /> Appliquer le music mode
      </Button>
    </div>
  )
}

function SegmentsTab({ device }: { device: HubDevice }) {
  const [count, setCount] = React.useState(15)
  const [active, setActive] = React.useState(0)
  const [color, setColor] = React.useState("#ff5500")
  const [brightness, setBrightness] = React.useState(100)

  const safeCount = Math.max(1, Math.min(MAX_SEGMENTS, count))
  const safeActive = Math.min(active, safeCount - 1)
  const allSegments = Array.from({ length: safeCount }, (_, index) => index)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="space-y-2">
          <Label>Segments</Label>
          <Input
            type="number"
            min={1}
            max={MAX_SEGMENTS}
            value={safeCount}
            onChange={(event) => setCount(Number(event.target.value) || 1)}
          />
        </div>
        <div className="space-y-2">
          <Label>Segment actif</Label>
          <div className="grid grid-cols-8 gap-1">
            {allSegments.map((index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActive(index)}
                className={cn(
                  "h-7 rounded-md border text-[11px] font-medium transition hover:bg-muted",
                  index === safeActive && "border-ring bg-muted ring-2 ring-ring/40",
                )}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Couleur</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Luminosité</span>
            <span>{brightness}%</span>
          </div>
          <Slider value={[brightness]} min={1} max={100} onValueChange={(value) => setBrightness(sliderValue(value))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => run(() => api.command(device.id, { type: "segment-color", segment: safeActive, color: hexToRgb(color) }))}
        >
          Couleur du segment {safeActive + 1}
        </Button>
        <Button
          variant="outline"
          onClick={() => run(() => api.command(device.id, { type: "segment-brightness", segment: safeActive, brightness }))}
        >
          Luminosité du segment
        </Button>
        <Button
          variant="outline"
          onClick={() => run(() => api.command(device.id, { type: "segment-color", segment: allSegments, color: hexToRgb(color) }))}
        >
          Couleur de tous
        </Button>
        <Button
          variant="outline"
          onClick={() => run(() => api.command(device.id, { type: "segment-brightness", segment: allSegments, brightness }))}
        >
          Luminosité de tous
        </Button>
      </div>
    </div>
  )
}

export function DeviceDetailsDialog({
  device,
  open,
  onOpenChange,
}: {
  device: HubDevice
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const tabs = [
    device.capabilities.cloudScenes ? { value: "scenes", label: "Scènes cloud", icon: Palette } : null,
    device.capabilities.music ? { value: "music", label: "Musique", icon: Music } : null,
    device.capabilities.segments ? { value: "segments", label: "Segments", icon: SlidersHorizontal } : null,
  ].filter((tab): tab is { value: string; label: string; icon: typeof Palette } => tab !== null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{device.name}</DialogTitle>
          <DialogDescription>
            {device.sku || "Govee"} · {device.id}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={tabs[0]?.value ?? "data"}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                <tab.icon /> {tab.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="data">Données</TabsTrigger>
          </TabsList>
          {device.capabilities.cloudScenes ? (
            <TabsContent value="scenes" className="pt-2">
              <CloudScenesTab device={device} />
            </TabsContent>
          ) : null}
          {device.capabilities.music ? (
            <TabsContent value="music" className="pt-2">
              <MusicTab device={device} />
            </TabsContent>
          ) : null}
          {device.capabilities.segments ? (
            <TabsContent value="segments" className="pt-2">
              <SegmentsTab device={device} />
            </TabsContent>
          ) : null}
          <TabsContent value="data" className="pt-2">
            <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
              {JSON.stringify(device, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
