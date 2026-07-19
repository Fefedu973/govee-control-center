export type Rgb = { r: number; g: number; b: number }

export type Transport = "lan" | "cloud"

export type DeviceState = {
  on: 0 | 1 | null
  brightness: number | null
  color: Rgb | null
  kelvin: number | null
  source: Transport | null
  updatedAt: string | null
}

export type LanTransport = {
  id: string
  ip: string | null
  online: boolean
  manual: boolean
  lastSeen: string | null
  lastStatusAt: string | null
}

export type CloudTransport = {
  sku: string | null
  device: string | null
  retrievedAt: string | null
  statusError: string | null
}

export type DeviceCapabilities = {
  power: boolean
  brightness: boolean
  color: boolean
  colorTemperature: boolean
  cloudScenes: boolean
  segments: boolean
  music: boolean
}

export type CloudCapability = {
  type: string
  instance?: string
  parameters?: {
    options?: { name?: string; value: number | string }[]
    fields?: { fieldName: string; options?: { name?: string; value: number | string }[] }[]
  }
}

export type HubDevice = {
  id: string
  name: string
  sku: string | null
  transports: { lan: LanTransport | null; cloud: CloudTransport | null }
  capabilities: DeviceCapabilities
  state: DeviceState
  raw: { lan: unknown; cloud: { capabilities?: CloudCapability[] } | null }
}

export type SceneEntry = {
  deviceId: string
  name?: string
  sku?: string | null
  on: number | null
  brightness: number | null
  color: Rgb | null
  kelvin: number | null
}

export type Scene = {
  id: string
  name: string
  createdAt: string
  devices: SceneEntry[]
}

export type BleActionMode = "smart-toggle" | "toggle-cached" | "turn-on" | "turn-off"

export type BleAction = {
  targetDeviceId: string
  mode: BleActionMode
  fallbackOnUnknown: boolean
}

export type BleButton = {
  id: string
  address: string
  name: string
  model: string
  buttonCount: number
  battery: number | null
  rssi: number | null
  lastSeen: string | null
  lastEventId?: string
  action: BleAction | null
}

export type BleStatus = {
  available: boolean
  enabled: boolean
  scanning: boolean
  state: string | null
  error: string | null
}

export type BleEvent = {
  button: BleButton
  event: { id: string; type: string; key: string; button?: number; battery: number | null }
  action?: BleAction
  test?: boolean
  at: string
}

export type CloudStatus = {
  configured: boolean
  configuredSource: "app" | "env" | null
  keyPreview: string | null
  baseUrl: string
  lastError: string | null
  deviceCount: number
  fetchedAt: string | null
  refreshing: boolean
  lastRefreshError: string | null
}

export type LanSettings = {
  retryMode: boolean
  retryMaxAttempts: number
  retryVerifyDelayMs: number
}

export type HubState = {
  devices: HubDevice[]
  scenes: Scene[]
  settings: LanSettings
  cloud: CloudStatus
  ble: { status: BleStatus; buttons: BleButton[]; events: BleEvent[] }
}

export type CloudSceneOption = {
  name: string
  value: number | string
  instance: "lightScene" | "diyScene"
}

export type CommandBody =
  | { type: "power"; on: boolean; via?: Transport }
  | { type: "toggle"; fallbackOnUnknown?: boolean; fresh?: boolean; via?: Transport }
  | { type: "brightness"; value: number; via?: Transport }
  | ({ type: "color"; via?: Transport } & Rgb)
  | { type: "color-temperature"; kelvin: number; via?: Transport }
  | { type: "refresh"; via?: Transport }
  | { type: "cloud-scene"; value: number | string; instance: "lightScene" | "diyScene" }
  | { type: "segment-color"; segment: number | number[]; color: Rgb }
  | { type: "segment-brightness"; segment: number | number[]; brightness: number }
  | { type: "music-mode"; mode: number; sensitivity: number; autoColor: boolean; color?: Rgb }

export type GlobalActionBody =
  | { type: "power"; on: boolean }
  | { type: "brightness"; value: number }
  | ({ type: "color" } & Rgb)
