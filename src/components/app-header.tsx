import { Moon, ScanLine, Sun, Zap } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Changer de thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}

export function AppHeader({
  connected,
  lastActivity,
  onScan,
}: {
  connected: boolean
  lastActivity: string
  onScan: () => void
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm leading-tight font-semibold">Govee Control Hub</h1>
            <p className="truncate text-xs text-muted-foreground">{lastActivity}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-label={connected ? "Connecté au serveur" : "Déconnecté du serveur"}
            title={connected ? "Connecté au serveur" : "Déconnecté du serveur"}
            className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")}
          />
          <Button variant="outline" onClick={onScan}>
            <ScanLine data-icon="inline-start" />
            <span className="hidden sm:inline">Scanner le LAN</span>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
