import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type SelectOption = { value: string; label: string }

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Choisir…",
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Select value={value || null} onValueChange={(next) => onChange(String(next ?? ""))}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue>{selected?.label ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
