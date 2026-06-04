"use client";
import { PipetteIcon } from "lucide-react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import {
  Children,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ColorPickerContext = createContext(undefined)

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0))

const componentToHex = value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")

const sliderValue = value => Array.isArray(value) ? value[0] : value

export const rgbToHex = color => {
  if (typeof color === "string") {
    return normalizeHex(color)
  }

  if (Array.isArray(color)) {
    return `#${componentToHex(color[0])}${componentToHex(color[1])}${componentToHex(color[2])}`
  }

  return `#${componentToHex(color?.r ?? 255)}${componentToHex(color?.g ?? 85)}${componentToHex(color?.b ?? 0)}`
}

export const hexToRgb = value => {
  const hex = normalizeHex(value).slice(1)
  const fullHex = hex.length === 3
    ? hex.split("").map(part => `${part}${part}`).join("")
    : hex

  return {
    r: Number.parseInt(fullHex.slice(0, 2), 16),
    g: Number.parseInt(fullHex.slice(2, 4), 16),
    b: Number.parseInt(fullHex.slice(4, 6), 16),
  }
}

const normalizeHex = value => {
  const raw = String(value || "").trim()
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)

  return match ? `#${match[1].toLowerCase()}` : "#ff5500"
}

const isValidHex = value => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim())

const rgbToHsl = ({ r, g, b }) => {
  const red = clamp(r, 0, 255) / 255
  const green = clamp(g, 0, 255) / 255
  const blue = clamp(b, 0, 255) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
  }

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  }
}

const hueToRgb = (p, q, t) => {
  let channel = t
  if (channel < 0) channel += 1
  if (channel > 1) channel -= 1
  if (channel < 1 / 6) return p + (q - p) * 6 * channel
  if (channel < 1 / 2) return q
  if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6
  return p
}

const hslToRgb = (hue, saturation, lightness) => {
  const h = (((Number(hue) || 0) % 360) + 360) % 360 / 360
  const s = clamp(saturation, 0, 100) / 100
  const l = clamp(lightness, 0, 100) / 100

  if (s === 0) {
    const value = Math.round(l * 255)
    return { r: value, g: value, b: value }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

export const useColorPicker = () => {
  const context = useContext(ColorPickerContext)

  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider")
  }

  return context
}

export const ColorPicker = ({
  value,
  defaultValue = "#000000",
  onChange,
  className,
  triggerClassName,
  contentClassName,
  children,
  ...props
}) => {
  const selectedColor = rgbToHsl(hexToRgb(value || defaultValue))
  const defaultColor = rgbToHsl(hexToRgb(defaultValue))

  const [hue, setHue] = useState(selectedColor.hue || defaultColor.hue || 0)
  const [saturation, setSaturation] = useState(selectedColor.saturation || defaultColor.saturation || 100)
  const [lightness, setLightness] = useState(selectedColor.lightness || defaultColor.lightness || 50)
  const [alpha, setAlpha] = useState(100)
  const [mode, setMode] = useState("hex")
  const hasCustomChildren = Children.count(children) > 0
  const currentHex = useMemo(() => rgbToHex(hslToRgb(hue, saturation, lightness)), [hue, saturation, lightness])
  const onChangeRef = useRef(onChange)
  const syncingFromValueRef = useRef(false)
  const lastNotifiedColorRef = useRef(currentHex)
  const lastValuePropRef = useRef(normalizeHex(value || defaultValue))

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const nextHex = normalizeHex(value || defaultValue)

    if (nextHex === lastValuePropRef.current) {
      return
    }

    lastValuePropRef.current = nextHex

    if (nextHex === currentHex) {
      return
    }

    const color = rgbToHsl(hexToRgb(nextHex))

    syncingFromValueRef.current = true
    setHue(color.hue)
    setSaturation(color.saturation)
    setLightness(color.lightness)
  }, [currentHex, defaultValue, value])

  useEffect(() => {
    if (syncingFromValueRef.current) {
      syncingFromValueRef.current = false
      lastNotifiedColorRef.current = currentHex
      return
    }

    if (currentHex !== lastNotifiedColorRef.current) {
      lastNotifiedColorRef.current = currentHex
      onChangeRef.current?.(currentHex)
    }
  }, [currentHex])

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Choisir la couleur ${currentHex}`}
        className={cn(buttonVariants({ variant: "outline" }), "justify-start gap-2", triggerClassName)}
        type="button"
        {...props}>
        <span
          className="size-4 rounded border border-border"
          style={{ backgroundColor: currentHex }}
        />
        <span className="font-mono text-xs uppercase">{currentHex}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-72 p-3", contentClassName)}>
        <ColorPickerContext.Provider
          value={{
            hue,
            saturation,
            lightness,
            alpha,
            mode,
            setHue,
            setSaturation,
            setLightness,
            setAlpha,
            setMode,
          }}>
          <div className={cn("flex w-full min-w-48 flex-col gap-3", className)}>
            {hasCustomChildren ? children : (
              <>
                <ColorPickerSelection className="h-36 rounded-lg" />
                <ColorPickerHue />
                <ColorPickerAlpha />
                <div className="flex items-center gap-2">
                  <ColorPickerEyeDropper />
                  <ColorPickerOutput />
                  <ColorPickerFormat />
                </div>
              </>
            )}
          </div>
        </ColorPickerContext.Provider>
      </PopoverContent>
    </Popover>
  );
}

export const ColorPickerSelection = memo(({
  className,
  ...props
}) => {
  const containerRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const { hue, saturation, lightness, setSaturation, setLightness } = useColorPicker()

  const backgroundGradient = useMemo(() => {
    return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`
  }, [hue])

  useEffect(() => {
    const x = clamp(saturation, 0, 100) / 100
    const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
    const y = topLightness > 0 ? 1 - clamp(lightness, 0, topLightness) / topLightness : 0

    setPositionX(x)
    setPositionY(clamp(y, 0, 1))
  }, [saturation, lightness])

  const updatePositionFromPointer = useCallback((event) => {
    if (!containerRef.current) {
      return
    }

    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setPositionX(x)
    setPositionY(y)
    setSaturation(x * 100)
    const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
    const lightness = topLightness * (1 - y)

    setLightness(lightness)
  }, [setSaturation, setLightness])

  const handlePointerMove = useCallback((event) => {
    if (isDragging) {
      updatePositionFromPointer(event)
    }
  }, [isDragging, updatePositionFromPointer])

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    };
  }, [isDragging, handlePointerMove])

  return (
    <div
      className={cn("relative size-full cursor-crosshair rounded", className)}
      onPointerDown={e => {
        e.preventDefault()
        setIsDragging(true)
        updatePositionFromPointer(e.nativeEvent)
      }}
      ref={containerRef}
      style={{
        background: backgroundGradient,
      }}
      {...(props)}>
      <div
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
        style={{
          left: `${positionX * 100}%`,
          top: `${positionY * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }} />
    </div>
  );
})

ColorPickerSelection.displayName = "ColorPickerSelection"

export const ColorPickerHue = ({
  className,
  ...props
}) => {
  const { hue, setHue } = useColorPicker()

  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={value => setHue(sliderValue(value))}
      step={1}
      value={hue}
      {...(props)}>
      <SliderPrimitive.Control className="relative flex h-4 w-full touch-none items-center select-none">
      <SliderPrimitive.Track
        className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <SliderPrimitive.Indicator className="absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        index={0}
        className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export const ColorPickerAlpha = ({
  className,
  ...props
}) => {
  const { hue, saturation, lightness, alpha, setAlpha } = useColorPicker()
  const { r, g, b } = hslToRgb(hue, saturation, lightness)

  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={value => setAlpha(sliderValue(value))}
      step={1}
      value={alpha}
      {...(props)}>
      <SliderPrimitive.Control className="relative flex h-4 w-full touch-none items-center select-none">
      <SliderPrimitive.Track
        className="relative my-0.5 h-3 w-full grow rounded-full"
        style={{
          background:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==") left center',
        }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, rgb(${r}, ${g}, ${b}))` }} />
        <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-transparent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        index={0}
        className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export const ColorPickerEyeDropper = ({
  className,
  ...props
}) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker()

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper()
      const result = await eyeDropper.open()
      const color = rgbToHsl(hexToRgb(result.sRGBHex))

      setHue(color.hue)
      setSaturation(color.saturation)
      setLightness(color.lightness)
      setAlpha(100)
    } catch (error) {
      console.error("EyeDropper failed:", error)
    }
  }

  return (
    <Button
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...(props)}>
      <PipetteIcon size={16} />
    </Button>
  );
}

const formats = ["hex", "rgb", "css", "hsl"]

export const ColorPickerOutput = ({
  className,
  ...props
}) => {
  const { mode, setMode } = useColorPicker()

  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...(props)}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {formats.map(format => (
          <SelectItem className="text-xs" key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const HexInput = ({
  className,
  value,
  onCommit,
  ...props
}) => {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    if (isValidHex(draft)) {
      onCommit(normalizeHex(draft))
    } else {
      setDraft(value)
    }
  }

  return (
    <Input
      className={cn("h-8 rounded-r-none bg-secondary px-2 font-mono text-xs shadow-none uppercase", className)}
      type="text"
      value={draft}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
      {...props} />
  )
}

const PercentageInput = ({
  className,
  value,
  onCommit,
  ...props
}) => {
  const [draft, setDraft] = useState(String(Math.round(value)))

  useEffect(() => {
    setDraft(String(Math.round(value)))
  }, [value])

  const commit = () => {
    const nextValue = Number.parseInt(draft, 10)

    if (Number.isFinite(nextValue)) {
      onCommit(clamp(nextValue, 0, 100))
    } else {
      setDraft(String(Math.round(value)))
    }
  }

  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={100}
        {...(props)}
        className={cn(
          "h-8 w-[3.25rem] rounded-l-none bg-secondary px-2 pr-5 text-xs shadow-none",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          } else if (event.key === "Escape") {
            setDraft(String(Math.round(value)))
            event.currentTarget.blur()
          }
        }} />
      <span
        className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground text-xs">
        %
      </span>
    </div>
  );
}

export const ColorPickerFormat = ({
  className,
  ...props
}) => {
  const { hue, saturation, lightness, alpha, mode, setHue, setSaturation, setLightness, setAlpha } = useColorPicker()
  const rgbColor = hslToRgb(hue, saturation, lightness)

  const commitHex = hex => {
    const nextColor = rgbToHsl(hexToRgb(hex))

    setHue(nextColor.hue)
    setSaturation(nextColor.saturation)
    setLightness(nextColor.lightness)
  }

  if (mode === "hex") {
    const hex = rgbToHex(rgbColor)

    return (
      <div
        className={cn(
          "-space-x-px relative flex w-full items-center rounded-md shadow-sm",
          className
        )}
        {...(props)}>
        <HexInput value={hex} onCommit={commitHex} />
        <PercentageInput value={alpha} onCommit={setAlpha} />
      </div>
    );
  }

  if (mode === "rgb") {
    const rgb = [rgbColor.r, rgbColor.g, rgbColor.b]

    return (
      <div
        className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)}
        {...(props)}>
        {rgb.map((value, index) => (
          <Input
            className={cn(
              "h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
              index && "rounded-l-none",
              className
            )}
            key={index}
            readOnly
            type="text"
            value={value} />
        ))}
        <PercentageInput value={alpha} onCommit={setAlpha} />
      </div>
    );
  }

  if (mode === "css") {
    const rgb = [rgbColor.r, rgbColor.g, rgbColor.b]

    return (
      <div className={cn("w-full rounded-md shadow-sm", className)} {...(props)}>
        <Input
          className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={`rgba(${rgb.join(", ")}, ${alpha}%)`}
          {...(props)} />
      </div>
    );
  }

  if (mode === "hsl") {
    const hsl = [hue, saturation, lightness].map(value => Math.round(value))

    return (
      <div
        className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)}
        {...(props)}>
        {hsl.map((value, index) => (
          <Input
            className={cn(
              "h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
              index && "rounded-l-none",
              className
            )}
            key={index}
            readOnly
            type="text"
            value={value} />
        ))}
        <PercentageInput value={alpha} onCommit={setAlpha} />
      </div>
    );
  }

  return null
}

// Demo
export function Demo() {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-8">
      <ColorPicker defaultValue="#6366f1" className="h-auto w-64">
        <ColorPickerSelection className="h-40 rounded-lg" />
        <ColorPickerHue />
        <ColorPickerAlpha />
        <div className="flex items-center gap-2">
          <ColorPickerEyeDropper />
          <ColorPickerOutput />
          <ColorPickerFormat />
        </div>
      </ColorPicker>
    </div>
  );
}
