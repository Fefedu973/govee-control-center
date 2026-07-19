import type { Rgb } from "./types"

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace(/^#/, "")
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16)
  if (Number.isNaN(value)) return { r: 255, g: 255, b: 255 }
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

export function rgbToHex(color?: Rgb | null): string {
  if (!color || typeof color.r !== "number") return "#ffffff"
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

export const COLOR_PRESETS = [
  "#ffffff",
  "#ffd9a0",
  "#ffb347",
  "#ff5500",
  "#ff2d2d",
  "#ff4fa3",
  "#b855ff",
  "#6a5cff",
  "#2f7bff",
  "#2fd4ff",
  "#2fff9e",
  "#c8ff4f",
]

export function formatTime(value?: string | null): string {
  if (!value) return "jamais"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "inconnu"
  return date.toLocaleTimeString("fr-FR")
}
