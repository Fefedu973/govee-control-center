import type {
  BleAction,
  BleButton,
  BleStatus,
  CloudSceneOption,
  CloudStatus,
  CommandBody,
  GlobalActionBody,
  HubDevice,
  HubState,
  LanSettings,
  Scene,
} from "./types"

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = options.body === undefined ? "GET" : "POST", body } = options
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`)
  return data as T
}

export const api = {
  state: () => request<HubState>("/api/state"),

  scan: (ips: string[] = []) => request<{ ok: boolean }>("/api/scan", { body: { ips } }),

  addManualDevice: (body: { ip: string; sku?: string; device?: string }) =>
    request<{ ok: boolean; devices: HubDevice[] }>("/api/devices/manual", { body }),

  command: (deviceId: string, body: CommandBody) =>
    request<{ ok: boolean; devices: HubDevice[] }>(`/api/devices/${encodeURIComponent(deviceId)}/command`, { body }),

  cloudScenes: (deviceId: string) =>
    request<{ ok: boolean; scenes: CloudSceneOption[]; errors: string[] }>(
      `/api/devices/${encodeURIComponent(deviceId)}/cloud-scenes`,
    ),

  allAction: (body: GlobalActionBody) =>
    request<{ ok: boolean; results: { deviceId: string; ok: boolean; error?: string }[] }>("/api/actions/all", { body }),

  snapshotScene: (name?: string) =>
    request<{ ok: boolean; scene: Scene; scenes: Scene[] }>("/api/scenes/snapshot", { body: { name } }),

  applyScene: (sceneId: string) =>
    request<{ ok: boolean; results: { deviceId: string; ok: boolean; error?: string }[] }>(
      `/api/scenes/${encodeURIComponent(sceneId)}/apply`,
      { body: {} },
    ),

  deleteScene: (sceneId: string) =>
    request<{ ok: boolean; scenes: Scene[] }>(`/api/scenes/${encodeURIComponent(sceneId)}`, { method: "DELETE" }),

  bleEnable: (enabled: boolean) =>
    request<{ ok: boolean; status: BleStatus }>("/api/ble/enable", { body: { enabled } }),

  bleSetAction: (buttonId: string, action: BleAction) =>
    request<{ ok: boolean; action: BleAction; buttons: BleButton[] }>(
      `/api/ble/buttons/${encodeURIComponent(buttonId)}/action`,
      { body: action },
    ),

  bleTestAction: (buttonId: string) =>
    request<{ ok: boolean }>(`/api/ble/buttons/${encodeURIComponent(buttonId)}/test`, { body: {} }),

  setCloudApiKey: (apiKey: string) =>
    request<{ ok: boolean; status: CloudStatus }>("/api/cloud/api-key", { body: { apiKey } }),

  refreshCloud: () => request<{ ok: boolean; status: CloudStatus }>("/api/cloud/refresh", { body: {} }),

  setSettings: (settings: { retryMode?: boolean }) =>
    request<{ ok: boolean; settings: LanSettings }>("/api/settings", { body: settings }),
}
