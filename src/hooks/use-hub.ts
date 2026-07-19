import * as React from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { formatTime } from "@/lib/color"
import type { BleEvent, HubState } from "@/lib/types"

const EMPTY_STATE: HubState = {
  devices: [],
  scenes: [],
  settings: { retryMode: false, retryMaxAttempts: 0, retryVerifyDelayMs: 0 },
  cloud: {
    configured: false,
    configuredSource: null,
    keyPreview: null,
    baseUrl: "",
    lastError: null,
    deviceCount: 0,
    fetchedAt: null,
    refreshing: false,
    lastRefreshError: null,
  },
  ble: {
    status: { available: false, enabled: false, scanning: false, state: null, error: null },
    buttons: [],
    events: [],
  },
}

function parse<T>(event: MessageEvent): T | null {
  if (!event.data || event.data === "undefined") return null
  try {
    return JSON.parse(event.data) as T
  } catch {
    return null
  }
}

export function useHub() {
  const [state, setState] = React.useState<HubState>(EMPTY_STATE)
  const [loaded, setLoaded] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  const [lastActivity, setLastActivity] = React.useState("Connexion au serveur…")

  const refresh = React.useCallback(async () => {
    const next = await api.state()
    setState(next)
    setLoaded(true)
  }, [])

  React.useEffect(() => {
    refresh().catch((error: Error) => setLastActivity(error.message))

    const source = new EventSource("/api/events")
    const patch = (partial: Partial<HubState> | null) => {
      if (partial) setState((previous) => ({ ...previous, ...partial }))
    }

    source.onopen = () => setConnected(true)
    source.onerror = () => {
      setConnected(false)
      setLastActivity("SSE déconnecté, reconnexion…")
    }

    source.addEventListener("state", (event) => {
      const payload = parse<HubState>(event)
      if (payload) {
        setState(payload)
        setLoaded(true)
        setConnected(true)
      }
    })
    source.addEventListener("devices", (event) => patch(parse<{ devices: HubState["devices"] }>(event)))
    source.addEventListener("scenes", (event) => patch(parse<{ scenes: HubState["scenes"] }>(event)))
    source.addEventListener("settings", (event) => patch(parse<{ settings: HubState["settings"] }>(event)))
    source.addEventListener("cloud-status", (event) => {
      const payload = parse<{ status: HubState["cloud"] }>(event)
      if (payload) setState((previous) => ({ ...previous, cloud: payload.status }))
    })
    source.addEventListener("ble-status", (event) => {
      const payload = parse<{ status: HubState["ble"]["status"] }>(event)
      if (payload) setState((previous) => ({ ...previous, ble: { ...previous.ble, status: payload.status } }))
    })
    source.addEventListener("ble-buttons", (event) => {
      const payload = parse<{ buttons: HubState["ble"]["buttons"] }>(event)
      if (payload) setState((previous) => ({ ...previous, ble: { ...previous.ble, buttons: payload.buttons } }))
    })
    source.addEventListener("ble-event", (event) => {
      const payload = parse<BleEvent>(event)
      if (!payload) return
      setState((previous) => ({
        ...previous,
        ble: { ...previous.ble, events: [payload, ...previous.ble.events].slice(0, 50) },
      }))
      const name = payload.button?.name || payload.button?.address || "Bouton BLE"
      setLastActivity(`${name} · ${payload.event?.type || "event"} · ${formatTime(payload.at)}`)
    })
    source.addEventListener("scan", (event) => {
      const payload = parse<{ at: string }>(event)
      if (payload) setLastActivity(`Scan LAN lancé à ${formatTime(payload.at)}`)
    })
    source.addEventListener("retry", (event) => {
      const payload = parse<{ label?: string; kind: string; attempt: number; maxAttempts: number; at: string }>(event)
      if (payload) setLastActivity(`Retry LAN ${payload.label || payload.kind} ${payload.attempt}/${payload.maxAttempts}`)
    })
    source.addEventListener("error", (event) => {
      const payload = parse<{ message: string }>(event as MessageEvent)
      if (payload?.message) {
        setLastActivity(payload.message)
        toast.error(payload.message)
      }
    })

    return () => source.close()
  }, [refresh])

  return { state, loaded, connected, lastActivity, refresh }
}

/** Runs an API call, toasting the error instead of throwing. */
export async function run(action: () => Promise<unknown>, successMessage?: string) {
  try {
    await action()
    if (successMessage) toast.success(successMessage)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
