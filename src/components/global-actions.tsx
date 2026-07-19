import * as React from "react"
import { Power, PowerOff } from "lucide-react"

import { ColorPicker } from "@/components/color-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { api } from "@/lib/api"
import { hexToRgb } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import { sliderValue } from "@/lib/utils"

export function GlobalActions({ deviceCount }: { deviceCount: number }) {
  const [brightness, setBrightness] = React.useState(50)
  const [color, setColor] = React.useState("#ff5500")

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <Button onClick={() => run(() => api.allAction({ type: "power", on: true }))} disabled={deviceCount === 0}>
            <Power data-icon="inline-start" /> Tout allumer
          </Button>
          <Button
            variant="outline"
            onClick={() => run(() => api.allAction({ type: "power", on: false }))}
            disabled={deviceCount === 0}
          >
            <PowerOff data-icon="inline-start" /> Tout éteindre
          </Button>
        </div>

        <Separator className="lg:hidden" />
        <Separator orientation="vertical" className="hidden self-stretch lg:block" />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-xs text-muted-foreground">Luminosité {brightness}%</span>
          <Slider
            value={[brightness]}
            min={1}
            max={100}
            onValueChange={(value) => setBrightness(sliderValue(value))}
            onValueCommitted={(value) =>
              run(() => api.allAction({ type: "brightness", value: sliderValue(value) }))
            }
            className="flex-1"
          />
        </div>

        <Separator className="lg:hidden" />
        <Separator orientation="vertical" className="hidden self-stretch lg:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Couleur globale</span>
          <ColorPicker value={color} onChange={setColor} />
          <Button
            variant="outline"
            onClick={() => run(() => api.allAction({ type: "color", ...hexToRgb(color) }))}
            disabled={deviceCount === 0}
          >
            Appliquer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
