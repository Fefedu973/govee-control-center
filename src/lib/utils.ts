import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalizes a Base UI slider value (number or array) to a single number. */
export function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? Number(value[0] ?? 0) : (value as number)
}
