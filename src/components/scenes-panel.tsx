import * as React from "react"
import { Camera, Play, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { formatTime } from "@/lib/color"
import { run } from "@/hooks/use-hub"
import type { Scene } from "@/lib/types"

function sceneSummary(scene: Scene): string {
  const devices = scene.devices || []
  const onCount = devices.filter((device) => (device.on ?? (device as { onOff?: number }).onOff) === 1).length
  return `${devices.length} appareil(s) · ${onCount} allumé(s)`
}

export function ScenesPanel({ scenes, canSnapshot }: { scenes: Scene[]; canSnapshot: boolean }) {
  const [name, setName] = React.useState("")

  function snapshot() {
    void run(async () => {
      const payload = await api.snapshotScene(name.trim() || undefined)
      setName("")
      return payload
    }, "Scène sauvegardée.")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scènes locales</CardTitle>
        <CardDescription>
          Snapshot des états connus de tous les appareils, réapplicable plus tard. Stocké dans{" "}
          <code>data/config.json</code>, sans dépendre du cloud.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && canSnapshot && snapshot()}
            placeholder="Nom de la scène, ex. Bureau nuit"
            className="max-w-sm"
          />
          <Button onClick={snapshot} disabled={!canSnapshot}>
            <Camera data-icon="inline-start" /> Sauver l'état actuel
          </Button>
        </div>

        {scenes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Aucune scène sauvegardée. Attends que les appareils remontent leur état, puis sauvegarde un snapshot.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scenes.map((scene) => (
              <div key={scene.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{scene.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sceneSummary(scene)} · {formatTime(scene.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">local</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => run(() => api.applyScene(scene.id), `Scène « ${scene.name} » appliquée.`)}>
                    <Play data-icon="inline-start" /> Appliquer
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => run(() => api.deleteScene(scene.id), `Scène « ${scene.name} » supprimée.`)}
                  >
                    <Trash2 data-icon="inline-start" /> Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
