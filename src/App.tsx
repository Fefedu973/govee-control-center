import { Bluetooth, Layers, Lightbulb, Loader2, Settings2 } from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { BlePanel } from "@/components/ble-panel"
import { DeviceCard } from "@/components/device-card"
import { GlobalActions } from "@/components/global-actions"
import { ScenesPanel } from "@/components/scenes-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { run, useHub } from "@/hooks/use-hub"

function EmptyDevices() {
  return (
    <Card>
      <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
        <div>
          <h2 className="font-semibold">Aucun appareil détecté</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Active « LAN Control » dans Govee Home, vérifie que le serveur est sur le même réseau, ajoute
            une IP dans Réglages, ou configure une clé cloud.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const { state, loaded, connected, lastActivity } = useHub()
  const { devices, scenes, settings, cloud, ble } = state
  const knownStateCount = devices.filter((device) => device.state.on !== null).length

  return (
    <div className="min-h-screen bg-background">
      <AppHeader connected={connected} lastActivity={lastActivity} onScan={() => run(() => api.scan())} />

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Tabs defaultValue="devices">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="devices">
                <Lightbulb /> Appareils
                {devices.length > 0 ? <Badge variant="secondary" className="ml-1">{devices.length}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="scenes">
                <Layers /> Scènes
              </TabsTrigger>
              <TabsTrigger value="buttons">
                <Bluetooth /> Boutons
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 /> Réglages
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="devices" className="space-y-4 pt-2">
            <GlobalActions deviceCount={devices.length} />
            {!loaded ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-64 rounded-xl" />
                ))}
              </div>
            ) : devices.length === 0 ? (
              <EmptyDevices />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {devices.map((device) => (
                  <DeviceCard key={device.id} device={device} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="scenes" className="pt-2">
            <ScenesPanel scenes={scenes} canSnapshot={knownStateCount > 0} />
          </TabsContent>

          <TabsContent value="buttons" className="pt-2">
            <BlePanel status={ble.status} buttons={ble.buttons} events={ble.events} devices={devices} />
          </TabsContent>

          <TabsContent value="settings" className="pt-2">
            <SettingsPanel cloud={cloud} settings={settings} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
