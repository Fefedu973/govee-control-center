import * as React from "react"
import { Pipette } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COLOR_PRESETS } from "@/lib/color"
import { cn } from "@/lib/utils"

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
  }
}

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (hex: string) => void
  className?: string
}) {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])

  function commitHex(next: string) {
    const trimmed = next.trim()
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
    if (HEX_PATTERN.test(candidate)) onChange(candidate.toLowerCase())
    else setDraft(value)
  }

  async function pickWithEyeDropper() {
    try {
      const result = await new window.EyeDropper!().open()
      onChange(result.sRGBHex.toLowerCase())
    } catch {
      // picking cancelled
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none select-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
              className,
            )}
          />
        }
      >
        <span aria-hidden className="size-4 shrink-0 rounded-full border border-foreground/20" style={{ backgroundColor: value }} />
        <span className="font-mono text-xs uppercase">{value}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="grid grid-cols-6 gap-1.5">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              aria-label={`Couleur ${preset}`}
              className={cn(
                "aspect-square rounded-md border border-foreground/15 transition hover:scale-105",
                value === preset && "ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
        <label className="relative block h-9 cursor-pointer overflow-hidden rounded-md border">
          <input
            type="color"
            value={HEX_PATTERN.test(value) ? value : "#ffffff"}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Choisir une couleur"
            className="absolute -inset-2 size-[calc(100%+1rem)] cursor-pointer border-0 p-0"
          />
        </label>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commitHex(draft)}
            onKeyDown={(event) => event.key === "Enter" && commitHex(draft)}
            aria-label="Couleur hexadécimale"
            className="h-8 font-mono text-xs uppercase"
          />
          {typeof window !== "undefined" && window.EyeDropper ? (
            <Button variant="outline" size="icon-sm" onClick={pickWithEyeDropper} aria-label="Pipette">
              <Pipette />
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
