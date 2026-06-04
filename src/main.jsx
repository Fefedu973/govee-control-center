import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bluetooth,
  Boxes,
  Cloud,
  Layers,
  Lightbulb,
  Loader2,
  Moon,
  Music,
  Palette,
  Plus,
  RadioTower,
  RefreshCw,
  ScanLine,
  Settings2,
  Sun,
  Trash2,
  Zap,
} from 'lucide-react';
import './index.css';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ColorPicker, hexToRgb, rgbToHex } from '@/components/ui/color-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const DEFAULT_SEGMENT_COUNT = 15;
const MAX_UI_SEGMENTS = 64;
const DEFAULT_DIRECT = {
  protocol: 'razer',
  ledCount: 1,
  color: '#ff5500',
  gradientOff: true,
  segmentCount: DEFAULT_SEGMENT_COUNT,
  activeSegment: 0,
  segments: createSegments(DEFAULT_SEGMENT_COUNT, '#ff5500'),
};
const DEFAULT_ACTION = { targetDeviceId: '', mode: 'smart-toggle', fallbackOnUnknown: true };

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
}

function formatTime(value) {
  if (!value) return 'jamais';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'inconnu';
  return date.toLocaleTimeString();
}

function formatJson(value) {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value ?? '');
  }
}

function parseEventData(event, fallback = {}) {
  if (!event?.data || event.data === 'undefined') return fallback;
  try {
    return JSON.parse(event.data);
  } catch {
    return fallback;
  }
}

function powerLabel(device) {
  const state = device?.status?.onOff;
  if (state === 1) return { label: 'Allumé', variant: 'success' };
  if (state === 0) return { label: 'Éteint', variant: 'outline' };
  return { label: 'Inconnu', variant: 'secondary' };
}

function nodeText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) return nodeText(node.props.children);
  return '';
}

function selectedOptionLabel(children, selectedValue) {
  let label = '';
  React.Children.forEach(children, (child) => {
    if (label || !React.isValidElement(child)) return;
    if (String(child.props.value) === String(selectedValue)) {
      label = nodeText(child.props.children);
      return;
    }
    label = selectedOptionLabel(child.props.children, selectedValue);
  });
  return label;
}

function SelectField({ value, onValueChange, placeholder = 'Choisir…', children }) {
  const selectedLabel = selectedOptionLabel(children, value);

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder}>{selectedLabel || placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function sliderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function clampUiInteger(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function createSegments(count = DEFAULT_SEGMENT_COUNT, color = '#ff5500') {
  const safeCount = clampUiInteger(count, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  return Array.from({ length: safeCount }, () => ({ color, brightness: 100 }));
}

function resizeSegments(segments = [], count = DEFAULT_SEGMENT_COUNT, fallbackColor = '#ff5500') {
  const safeCount = clampUiInteger(count, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  return Array.from({ length: safeCount }, (_, index) => ({
    color: segments[index]?.color || fallbackColor,
    brightness: clampUiInteger(segments[index]?.brightness ?? 100, 0, 100, 100),
  }));
}

function updateSegment(segments, index, patch, fallbackColor = '#ff5500') {
  const next = resizeSegments(segments, Math.max(segments?.length || 0, index + 1), fallbackColor);
  next[index] = { ...next[index], ...patch };
  return next;
}

function segmentIndexes(count) {
  return Array.from({ length: clampUiInteger(count, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT) }, (_, index) => index);
}

function scaledRgb(hex, brightness = 100) {
  const rgb = hexToRgb(hex);
  const factor = clampUiInteger(brightness, 0, 100, 100) / 100;
  return {
    r: Math.round(rgb.r * factor),
    g: Math.round(rgb.g * factor),
    b: Math.round(rgb.b * factor),
  };
}

function buildSegmentPixels(direct) {
  const ledCount = clampUiInteger(direct.ledCount, 1, 512, 1);
  const segmentCount = clampUiInteger(direct.segmentCount, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  const segments = resizeSegments(direct.segments, segmentCount, direct.color);
  return Array.from({ length: ledCount }, (_, ledIndex) => {
    const segmentIndex = Math.min(segmentCount - 1, Math.floor((ledIndex * segmentCount) / ledCount));
    const segment = segments[segmentIndex] || { color: direct.color, brightness: 100 };
    return scaledRgb(segment.color, segment.brightness);
  });
}

function cloudCapability(device, type, instance) {
  return (device.capabilities || []).find((capability) => (
    capability.type === type && (!instance || capability.instance === instance)
  ));
}

function cloudFieldOptions(capability, fieldName) {
  const fields = capability?.parameters?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.find((field) => field.fieldName === fieldName)?.options || [];
}

function cloudPowerLabel(value) {
  if (value === 1 || value === true) return { label: 'Allumé', variant: 'default' };
  if (value === 0 || value === false) return { label: 'Éteint', variant: 'outline' };
  return { label: 'Cloud', variant: 'secondary' };
}

function scenePowerSummary(scene) {
  const devices = scene?.devices || [];
  const onCount = devices.filter((device) => device.onOff === 1).length;
  const offCount = devices.filter((device) => device.onOff === 0).length;
  if (!onCount && !offCount) return '';
  return ` · ${onCount} allumé(s), ${offCount} éteint(s)`;
}

function SegmentControlPanel({
  segmentCount,
  segments,
  activeSegment,
  onSegmentCountChange,
  onActiveSegmentChange,
  onSegmentColorChange,
  onSegmentBrightnessChange,
  actions,
}) {
  const safeCount = clampUiInteger(segmentCount, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  const safeActive = Math.min(clampUiInteger(activeSegment, 0, safeCount - 1, 0), safeCount - 1);
  const normalizedSegments = resizeSegments(segments, safeCount);
  const active = normalizedSegments[safeActive] || { color: '#ff5500', brightness: 100 };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="grid gap-2">
          <Label>Segments</Label>
          <Input
            type="number"
            min="1"
            max={MAX_UI_SEGMENTS}
            value={safeCount}
            onChange={(event) => onSegmentCountChange(clampUiInteger(event.target.value, 1, MAX_UI_SEGMENTS, safeCount))}
          />
        </div>
        <div className="grid gap-2">
          <Label>Segment actif</Label>
          <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
            {normalizedSegments.map((segment, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onActiveSegmentChange(index)}
                className={cn(
                  'h-8 rounded-md border text-[11px] font-medium text-white shadow-sm transition',
                  index === safeActive && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                )}
                style={{ backgroundColor: segment.color }}
                title={`Segment ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-2">
          <Label>Couleur segment {safeActive + 1}</Label>
          <ColorPicker value={active.color} onChange={onSegmentColorChange} />
        </div>
        <div className="grid gap-2">
          <div className="flex justify-between text-sm"><Label>Luminosité segment</Label><span className="text-muted-foreground">{active.brightness}%</span></div>
          <Slider value={[active.brightness]} min={0} max={100} onValueChange={(value) => onSegmentBrightnessChange(sliderValue(value))} />
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function groupBlePackets(packets = [], uniqueEvents = []) {
  const source = packets.length > 0
    ? packets
    : uniqueEvents.map((event) => ({ ...event, duplicate: false }));
  const groups = new Map();

  for (const packet of source) {
    const sensorId = packet.sensor?.id || packet.sensor?.address || 'unknown';
    const eventId = packet.event?.id || packet.event?.nonce || packet.event?.counter || packet.at || 'unknown';
    const key = `${sensorId}:${packet.event?.key || packet.event?.type || 'event'}:${eventId}`;
    const existing = groups.get(key) || {
      key,
      sensor: packet.sensor,
      event: packet.event,
      eventId,
      packets: [],
      firstAt: packet.at,
      lastAt: packet.at,
    };
    existing.packets.push(packet);
    existing.lastAt = packet.at > existing.lastAt ? packet.at : existing.lastAt;
    existing.firstAt = packet.at < existing.firstAt ? packet.at : existing.firstAt;
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      packets: group.packets.sort((left, right) => String(right.at).localeCompare(String(left.at))),
      duplicateCount: group.packets.filter((packet) => packet.duplicate).length,
    }))
    .sort((left, right) => String(right.lastAt).localeCompare(String(left.lastAt)));
}

function useGoveeState({ cloudEnabled = false } = {}) {
  const [devices, setDevices] = React.useState([]);
  const [settings, setSettings] = React.useState({ retryMode: false });
  const [cloudDevices, setCloudDevices] = React.useState([]);
  const [cloudStatus, setCloudStatus] = React.useState({ configured: false, lastError: null });
  const [bleSensors, setBleSensors] = React.useState([]);
  const [bleStatus, setBleStatus] = React.useState({ available: false, enabled: false, scanning: false, error: null });
  const [events, setEvents] = React.useState([]);
  const [blePackets, setBlePackets] = React.useState([]);
  const [bleRaw, setBleRaw] = React.useState([]);
  const [scenes, setScenes] = React.useState([]);
  const [lastEvent, setLastEvent] = React.useState('Connexion au backend…');

  const refresh = React.useCallback(async () => {
    const [devicePayload, settingsPayload, cloudPayload, blePayload, scenesPayload] = await Promise.all([
      api('/api/devices'),
      api('/api/settings').catch(() => ({ settings: { retryMode: false } })),
      (cloudEnabled ? api('/api/cloud/devices') : api('/api/cloud/status')).catch(() => ({ status: { configured: false }, devices: [] })),
      api('/api/ble/status').catch(() => null),
      api('/api/scenes').catch(() => ({ scenes: [] })),
    ]);
    setDevices(devicePayload.devices || []);
    setSettings(settingsPayload.settings || { retryMode: false });
    setCloudDevices(cloudEnabled ? (cloudPayload.devices || []) : []);
    setCloudStatus(cloudPayload.status || { configured: false });
    setScenes(scenesPayload.scenes || []);
    if (blePayload) {
      setBleSensors(blePayload.sensors || []);
      setBleStatus(blePayload.status || {});
      setEvents(blePayload.events || []);
      setBlePackets(blePayload.packets || []);
      setBleRaw(blePayload.rawAdvertisements || []);
    }
  }, [cloudEnabled]);

  React.useEffect(() => {
    refresh().catch((error) => setLastEvent(error.message));
    const source = new EventSource('/api/events');
    source.addEventListener('devices', (event) => setDevices(parseEventData(event).devices || []));
    source.addEventListener('settings', (event) => setSettings(parseEventData(event).settings || { retryMode: false }));
    source.addEventListener('ble-sensors', (event) => setBleSensors(parseEventData(event).sensors || []));
    source.addEventListener('ble-status', (event) => setBleStatus(parseEventData(event).status || {}));
    source.addEventListener('ble-raw-history', (event) => setBleRaw(parseEventData(event).rawAdvertisements || []));
    source.addEventListener('ble-raw', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setBleRaw((previous) => [payload, ...previous.filter((entry) => entry.fingerprint !== payload.fingerprint || entry.id !== payload.id)].slice(0, 160));
    });
    source.addEventListener('ble-event', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setEvents((previous) => [payload, ...previous].slice(0, 80));
      const sourceName = payload.sensor?.name || payload.sensor?.address || 'H5122';
      const eventId = payload.event?.id ? ` · ${payload.event.id}` : '';
      setLastEvent(`${sourceName} · ${payload.event?.type || 'event'}${eventId} · ${new Date(payload.at).toLocaleTimeString()}`);
    });
    source.addEventListener('ble-packet', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setBlePackets((previous) => [payload, ...previous].slice(0, 240));
    });
    source.addEventListener('scan', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setLastEvent(`Scan LAN lancé à ${formatTime(payload.at)}`);
    });
    source.addEventListener('retry', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setLastEvent(`Retry LAN ${payload.label || payload.kind} ${payload.attempt}/${payload.maxAttempts} · ${formatTime(payload.at)}`);
    });
    source.addEventListener('backend-error', (event) => {
      const payload = parseEventData(event, null);
      if (!payload) return;
      setLastEvent(payload.message || 'Erreur backend');
    });
    source.onerror = () => setLastEvent('SSE déconnecté, tentative de reconnexion…');
    return () => source.close();
  }, [refresh]);

  return {
    devices,
    setDevices,
    settings,
    setSettings,
    cloudDevices,
    setCloudDevices,
    cloudStatus,
    setCloudStatus,
    bleSensors,
    setBleSensors,
    bleStatus,
    setBleStatus,
    events,
    setEvents,
    blePackets,
    setBlePackets,
    bleRaw,
    setBleRaw,
    scenes,
    setScenes,
    lastEvent,
    refresh,
  };
}

function Header({ onScan, onRefresh, busy, lastEvent, theme, onThemeToggle }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-white shadow-sm md:p-8">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl space-y-3">
          <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/10">Govee local hub</Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">LAN API, Direct Connect & H5122 BLE</h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-300 md:text-base">
              Contrôle local Govee avec UI shadcn/Radix, scènes locales, actions globales, DreamView/Razer expérimental et boutons H5122 dédupliqués par event id BLE.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-zinc-400"><Activity className="size-4" /> {lastEvent}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onThemeToggle} disabled={busy} variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? 'Clair' : 'Sombre'}
          </Button>
          <Button onClick={onScan} disabled={busy} variant="secondary"><ScanLine className="size-4" /> Scanner LAN</Button>
          <Button onClick={onRefresh} disabled={busy} variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className="size-4" /> Rafraîchir</Button>
        </div>
      </div>
    </section>
  );
}

function DiscoveryCard({ onManualAdd, bleStatus, onBleToggle }) {
  const [ip, setIp] = React.useState('');
  const [sku, setSku] = React.useState('');
  const [device, setDevice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await onManualAdd({ ip, sku, device });
      setIp(''); setSku(''); setDevice('');
      setMessage('Appareil ajouté, lecture du statut demandée.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><RadioTower className="size-5" /> Détection</CardTitle>
        <CardDescription>Le LAN passe par UDP multicast. Le H5122 passe par un scan BLE passif côté serveur Node.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_0.8fr_0.8fr_auto]">
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP ex: 192.168.1.42" inputMode="numeric" />
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU ex: H6008" />
          <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Device id optionnel" />
          <Button disabled={busy || !ip.trim()} type="submit"><Plus className="size-4" /> Ajouter</Button>
          {message ? <p className="text-muted-foreground sm:col-span-4 text-sm">{message}</p> : null}
        </form>
        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Bluetooth H5122</p>
              <p className="text-muted-foreground text-xs">
                {bleStatus.available ? (bleStatus.scanning ? 'Scan actif' : 'Noble chargé, scan arrêté') : 'Module BLE non disponible'}
              </p>
              {bleStatus.error ? <p className="mt-1 text-xs text-destructive">{bleStatus.error}</p> : null}
            </div>
            <Switch checked={Boolean(bleStatus.enabled)} onCheckedChange={onBleToggle} disabled={!bleStatus.available} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalActionsCard({ devices, command, settings, onRetryModeChange }) {
  const [brightness, setBrightness] = React.useState(50);
  const [color, setColor] = React.useState('#ff5500');
  const controllableCount = devices.filter((device) => device.ip).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes className="size-5" /> Actions globales</CardTitle>
        <CardDescription>Implémente une partie de l’ancien projet : all toggle, couleur commune et luminosité commune sur les appareils LAN détectés.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Alimentation</p>
          <p className="text-muted-foreground text-xs">{controllableCount} appareil(s) contrôlable(s).</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => command('all:on', '/api/actions/all-power', { on: true })}>Tout allumer</Button>
            <Button variant="outline" onClick={() => command('all:off', '/api/actions/all-power', { on: false })}>Tout éteindre</Button>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between text-sm"><Label>Luminosité globale</Label><span className="text-muted-foreground">{brightness}%</span></div>
          <Slider value={[brightness]} min={1} max={100} onValueChange={(value) => setBrightness(sliderValue(value))} />
          <Button variant="outline" onClick={() => command('all:brightness', '/api/actions/all-brightness', { value: brightness })}>Appliquer à tous</Button>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <Label>Couleur globale</Label>
          <div className="grid min-w-0 gap-2 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
            <ColorPicker value={color} onChange={setColor} triggerClassName="w-full min-w-0" />
            <Button className="w-full whitespace-nowrap 2xl:w-auto" variant="outline" onClick={() => command('all:color', '/api/actions/all-color', hexToRgb(color))}>Appliquer à tous</Button>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Retry LAN</p>
              <p className="text-muted-foreground text-xs">Power et couleur vérifiés par statut.</p>
            </div>
            <Switch checked={Boolean(settings?.retryMode)} onCheckedChange={onRetryModeChange} />
          </div>
          <Badge variant={settings?.retryMode ? 'default' : 'secondary'}>{settings?.retryMode ? 'actif' : 'désactivé'}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenesCard({ scenes, setScenes, devices, command }) {
  const [name, setName] = React.useState('');
  const [message, setMessage] = React.useState('');

  async function snapshot() {
    setMessage('');
    try {
      const payload = await api('/api/scenes/snapshot', { name: name || undefined });
      setScenes(payload.scenes || []);
      setName('');
      setMessage(`Scene “${payload.scene?.name}” sauvegardée.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function applyScene(scene) {
    await command(`scene:${scene.id}:apply`, `/api/scenes/${encodeURIComponent(scene.id)}/apply`, {});
  }

  async function removeScene(scene) {
    setMessage('');
    try {
      const payload = await api(`/api/scenes/${encodeURIComponent(scene.id)}/delete`, {});
      setScenes(payload.scenes || []);
      setMessage(`Scene “${scene.name}” supprimée.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Layers className="size-5" /> Scènes locales</CardTitle>
        <CardDescription>Sauvegarde un snapshot local des états connus puis réapplique-le plus tard. Ça ne dépend pas du cloud Govee.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom de scène, ex: Bureau nuit" />
          <Button onClick={snapshot} disabled={devices.length === 0}><Plus className="size-4" /> Sauver snapshot</Button>
        </div>
        {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenes.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Aucune scène sauvegardée. Lis les statuts des appareils puis sauvegarde un snapshot.</div>
          ) : scenes.map((scene) => (
            <div key={scene.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{scene.name}</p>
                  <p className="text-muted-foreground text-xs">{scene.devices?.length || 0} appareil(s){scenePowerSummary(scene)} · {formatTime(scene.createdAt)}</p>
                </div>
                <Badge variant="secondary">local</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => applyScene(scene)}>Appliquer</Button>
                <Button size="sm" variant="outline" onClick={() => removeScene(scene)}><Trash2 className="size-4" /> Supprimer</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DeviceCard({ device, command }) {
  const status = powerLabel(device);
  const statusColor = rgbToHex(device.status?.color);
  const [brightness, setBrightness] = React.useState(device.status?.brightness ?? 50);
  const [kelvin, setKelvin] = React.useState(device.status?.colorTemInKelvin || 4000);
  const [color, setColor] = React.useState(statusColor);
  const [direct, setDirect] = React.useState({ ...DEFAULT_DIRECT, color: statusColor });
  const previousDeviceIdRef = React.useRef(device.id);
  const previousStatusColorRef = React.useRef(statusColor);
  const previousStatusAtRef = React.useRef(device.lastStatusAt || null);

  React.useEffect(() => {
    const previousDeviceId = previousDeviceIdRef.current;
    const previousStatusColor = previousStatusColorRef.current;
    const previousStatusAt = previousStatusAtRef.current;
    const deviceChanged = previousDeviceId !== device.id;
    const statusReadChanged = Boolean(device.lastStatusAt && device.lastStatusAt !== previousStatusAt);

    previousDeviceIdRef.current = device.id;
    previousStatusColorRef.current = statusColor;
    previousStatusAtRef.current = device.lastStatusAt || null;

    setBrightness(device.status?.brightness ?? 50);
    setKelvin(device.status?.colorTemInKelvin || 4000);
    setColor((previous) => (deviceChanged || statusReadChanged || previous === previousStatusColor ? statusColor : previous));
    setDirect((previous) => ({
      ...previous,
      color: deviceChanged || statusReadChanged || previous.color === previousStatusColor ? statusColor : previous.color,
      protocol: device.status?.directProtocol || previous.protocol,
      ledCount: device.status?.directLedCount || previous.ledCount,
      segmentCount: previous.segmentCount || DEFAULT_SEGMENT_COUNT,
      activeSegment: previous.activeSegment || 0,
      segments: deviceChanged
        ? createSegments(previous.segmentCount || DEFAULT_SEGMENT_COUNT, statusColor)
        : resizeSegments(previous.segments, previous.segmentCount || DEFAULT_SEGMENT_COUNT, previous.color || statusColor),
    }));
  }, [device.id, device.lastStatusAt, device.status?.brightness, device.status?.colorTemInKelvin, device.status?.directLedCount, device.status?.directProtocol, statusColor]);

  const id = encodeURIComponent(device.id);
  const isOn = device.status?.onOff === 1;
  const directSegmentCount = clampUiInteger(direct.segmentCount, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  const directActiveSegment = Math.min(clampUiInteger(direct.activeSegment, 0, directSegmentCount - 1, 0), directSegmentCount - 1);
  const directSegments = resizeSegments(direct.segments, directSegmentCount, direct.color);

  function setDirectSegmentCount(count) {
    setDirect((previous) => ({
      ...previous,
      segmentCount: count,
      activeSegment: Math.min(previous.activeSegment || 0, count - 1),
      segments: resizeSegments(previous.segments, count, previous.color),
    }));
  }

  function setDirectActiveSegment(index) {
    setDirect((previous) => ({ ...previous, activeSegment: index }));
  }

  function setDirectSegmentColor(value) {
    setDirect((previous) => ({
      ...previous,
      segments: updateSegment(resizeSegments(previous.segments, previous.segmentCount, previous.color), directActiveSegment, { color: value }, previous.color),
    }));
  }

  function setDirectSegmentBrightness(value) {
    setDirect((previous) => ({
      ...previous,
      segments: updateSegment(resizeSegments(previous.segments, previous.segmentCount, previous.color), directActiveSegment, { brightness: clampUiInteger(value, 0, 100, 100) }, previous.color),
    }));
  }

  return (
    <Card
      className={cn(
        "overflow-hidden transition-[border-color,box-shadow,background-color]",
        isOn && "border-emerald-400/60 bg-emerald-500/[0.03] shadow-[0_0_0_1px_rgba(52,211,153,0.28),0_16px_48px_rgba(16,185,129,0.14)]"
      )}>
      <CardHeader className={cn("border-b transition-colors", isOn && "border-emerald-400/30 bg-emerald-500/[0.04]")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{device.sku || 'Govee'}</Badge>
              {device.manual ? <Badge variant="secondary">manuel</Badge> : null}
              {device.status?.directProtocol ? <Badge variant="warning">{device.status.directProtocol}</Badge> : null}
            </div>
            <CardTitle className="mt-3 truncate">{device.device || device.id}</CardTitle>
            <CardDescription>{device.ip || 'IP inconnue'} · vu à {formatTime(device.lastSeen)}</CardDescription>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="basic"><Lightbulb className="size-4" /> Base</TabsTrigger>
            <TabsTrigger value="direct"><Zap className="size-4" /> Direct</TabsTrigger>
            <TabsTrigger value="raw"><Settings2 className="size-4" /> Raw</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => command(`${device.id}:power`, `/api/devices/${id}/power`, { on: !isOn })}>{isOn ? 'Éteindre' : 'Allumer'}</Button>
              <Button variant="outline" onClick={() => command(`${device.id}:status`, `/api/devices/${id}/status`, {})}>Lire le statut</Button>
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between text-sm"><Label>Luminosité</Label><span className="text-muted-foreground">{brightness}%</span></div>
              <Slider
                value={[brightness]}
                min={1}
                max={100}
                onValueChange={(value) => setBrightness(sliderValue(value))}
                onValueCommitted={(value) => command(`${device.id}:brightness`, `/api/devices/${id}/brightness`, { value: sliderValue(value) })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Couleur</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <ColorPicker value={color} onChange={setColor} />
                  <Button variant="outline" onClick={() => command(`${device.id}:color`, `/api/devices/${id}/color`, hexToRgb(color))}>Appliquer</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex justify-between text-sm"><Label>Température</Label><span className="text-muted-foreground">{kelvin} K</span></div>
                <Slider
                  value={[kelvin]}
                  min={2000}
                  max={9000}
                  step={100}
                  onValueChange={(value) => setKelvin(sliderValue(value))}
                  onValueCommitted={(value) => command(`${device.id}:kelvin`, `/api/devices/${id}/color-temperature`, { kelvin: sliderValue(value) })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="direct" className="grid gap-4">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              Envoie des payloads binaires Razer/DreamView dans <code>cmd: "razer"</code>. C’est expérimental : certains modèles ignorent silencieusement ces paquets.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Protocole</Label>
                <SelectField value={direct.protocol} onValueChange={(value) => setDirect({ ...direct, protocol: value })}>
                  <SelectItem value="razer">Razer</SelectItem>
                  <SelectItem value="dreamview">DreamView</SelectItem>
                  <SelectItem value="dreamview-v2">DreamView V2</SelectItem>
                  <SelectItem value="razer-legacy">Razer Legacy</SelectItem>
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label>LED count</Label>
                <Input type="number" min="1" max="512" value={direct.ledCount} onChange={(e) => setDirect({ ...direct, ledCount: Number(e.target.value || 1) })} />
              </div>
              <div className="grid gap-2">
                <Label>Couleur directe</Label>
                <ColorPicker value={direct.color} onChange={(value) => setDirect({ ...direct, color: value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Gradient off</Label>
                  <p className="text-muted-foreground text-xs">Utilisé par DreamView.</p>
                </div>
                <Switch checked={direct.gradientOff} onCheckedChange={(checked) => setDirect({ ...direct, gradientOff: checked })} />
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <SegmentControlPanel
                segmentCount={directSegmentCount}
                segments={directSegments}
                activeSegment={directActiveSegment}
                onSegmentCountChange={setDirectSegmentCount}
                onActiveSegmentChange={setDirectActiveSegment}
                onSegmentColorChange={setDirectSegmentColor}
                onSegmentBrightnessChange={setDirectSegmentBrightness}
                actions={(
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDirect((previous) => ({ ...previous, segments: createSegments(previous.segmentCount || DEFAULT_SEGMENT_COUNT, previous.color) }))}
                    >
                      Remplir avec la couleur directe
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => command(`${device.id}:direct-pixels`, `/api/devices/${id}/direct-pixels`, {
                        protocol: direct.protocol,
                        gradientOff: direct.gradientOff ? 1 : 0,
                        pixels: buildSegmentPixels({ ...direct, segments: directSegments, segmentCount: directSegmentCount }),
                      })}
                    >
                      Envoyer segments
                    </Button>
                  </>
                )}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => command(`${device.id}:direct-on`, `/api/devices/${id}/direct-mode`, { enabled: true })}>Activer</Button>
              <Button onClick={() => command(`${device.id}:direct-color`, `/api/devices/${id}/direct-color`, { protocol: direct.protocol, ledCount: direct.ledCount, gradientOff: direct.gradientOff ? 1 : 0, ...hexToRgb(direct.color) })}>Envoyer direct</Button>
              <Button variant="outline" onClick={() => command(`${device.id}:direct-off`, `/api/devices/${id}/direct-mode`, { enabled: false })}>Désactiver</Button>
            </div>
          </TabsContent>

          <TabsContent value="raw">
            <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">{JSON.stringify(device, null, 2)}</pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CloudDeviceFallback({ device, command }) {
  const power = cloudPowerLabel(device.status?.onOff);
  const powerCap = cloudCapability(device, 'devices.capabilities.on_off');
  const brightnessCap = cloudCapability(device, 'devices.capabilities.range', 'brightness');
  const colorCap = cloudCapability(device, 'devices.capabilities.color_setting', 'colorRgb');
  const kelvinCap = cloudCapability(device, 'devices.capabilities.color_setting', 'colorTemperatureK')
    || cloudCapability(device, 'devices.capabilities.range', 'colorTemperatureK');
  const sceneCap = cloudCapability(device, 'devices.capabilities.dynamic_scene');
  const segmentCap = cloudCapability(device, 'devices.capabilities.segment_color_setting');
  const gradientCap = cloudCapability(device, 'devices.capabilities.toggle', 'gradientToggle');
  const musicCap = cloudCapability(device, 'devices.capabilities.music_setting');
  const musicOptions = cloudFieldOptions(musicCap, 'musicMode');
  const [brightness, setBrightness] = React.useState(device.status?.brightness ?? 50);
  const [kelvin, setKelvin] = React.useState(device.status?.colorTemInKelvin || 4000);
  const [color, setColor] = React.useState(rgbToHex(device.status?.color));
  const [scenes, setScenes] = React.useState([]);
  const [sceneValue, setSceneValue] = React.useState('');
  const [sceneInstance, setSceneInstance] = React.useState('lightScene');
  const [sceneMessage, setSceneMessage] = React.useState('');
  const [segmentCount, setSegmentCount] = React.useState(DEFAULT_SEGMENT_COUNT);
  const [activeSegment, setActiveSegment] = React.useState(0);
  const [segments, setSegments] = React.useState(() => createSegments(DEFAULT_SEGMENT_COUNT, '#ff5500'));
  const [musicMode, setMusicMode] = React.useState('');
  const [musicSensitivity, setMusicSensitivity] = React.useState(100);
  const [musicAutoColor, setMusicAutoColor] = React.useState(true);
  const [musicColor, setMusicColor] = React.useState('#ffffff');

  React.useEffect(() => {
    setBrightness(device.status?.brightness ?? 50);
    setKelvin(device.status?.colorTemInKelvin || 4000);
    setColor(rgbToHex(device.status?.color));
  }, [device.id, device.status?.brightness, device.status?.colorTemInKelvin, JSON.stringify(device.status?.color)]);

  React.useEffect(() => {
    if (!musicMode && musicOptions[0]) setMusicMode(String(musicOptions[0].value));
  }, [musicMode, musicOptions]);

  const cloudBody = { sku: device.sku, device: device.device };
  const runCloudAction = (action, payload = {}) => command(`cloud:${device.id}:${action}`, '/api/cloud/device-action', { ...cloudBody, action, ...payload });
  const cloudSegmentCount = clampUiInteger(segmentCount, 1, MAX_UI_SEGMENTS, DEFAULT_SEGMENT_COUNT);
  const cloudActiveSegment = Math.min(clampUiInteger(activeSegment, 0, cloudSegmentCount - 1, 0), cloudSegmentCount - 1);
  const cloudSegments = resizeSegments(segments, cloudSegmentCount, '#ff5500');
  const cloudSegment = cloudSegments[cloudActiveSegment] || { color: '#ff5500', brightness: 100 };

  function setCloudSegmentCount(count) {
    setSegmentCount(count);
    setActiveSegment((previous) => Math.min(previous, count - 1));
    setSegments((previous) => resizeSegments(previous, count, '#ff5500'));
  }

  function setCloudSegmentColor(value) {
    setSegments((previous) => updateSegment(resizeSegments(previous, cloudSegmentCount, '#ff5500'), cloudActiveSegment, { color: value }, '#ff5500'));
  }

  function setCloudSegmentBrightness(value) {
    setSegments((previous) => updateSegment(resizeSegments(previous, cloudSegmentCount, '#ff5500'), cloudActiveSegment, { brightness: clampUiInteger(value, 0, 100, 100) }, '#ff5500'));
  }

  async function loadScenes() {
    setSceneMessage('');
    try {
      const payload = await api('/api/cloud/device-scenes', cloudBody);
      const nextScenes = payload.scenes || [];
      setScenes(nextScenes);
      if (!sceneValue && nextScenes[0]) {
        setSceneValue(String(nextScenes[0].value));
        setSceneInstance(nextScenes[0].instance);
      }
      setSceneMessage(nextScenes.length ? `${nextScenes.length} scène(s) cloud chargée(s).` : 'Aucune scène cloud disponible.');
    } catch (error) {
      setSceneMessage(error.message);
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{device.name || device.device}</p>
          <p className="text-muted-foreground text-xs">{device.sku} · {device.device}</p>
          {device.statusError ? <p className="mt-1 text-xs text-destructive">{device.statusError}</p> : null}
        </div>
        <Badge variant={power.variant}>{power.label}</Badge>
      </div>

      <Tabs defaultValue="base" className="mt-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="base"><Lightbulb className="size-4" /> Base</TabsTrigger>
          <TabsTrigger value="ambiance"><Layers className="size-4" /> Ambiances</TabsTrigger>
          <TabsTrigger value="segments"><Palette className="size-4" /> Segments</TabsTrigger>
          <TabsTrigger value="modes"><Music className="size-4" /> Modes</TabsTrigger>
        </TabsList>

        <TabsContent value="base" className="mt-4 grid gap-4">
        {powerCap ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => runCloudAction('power', { on: true })}>Allumer cloud</Button>
            <Button size="sm" variant="outline" onClick={() => runCloudAction('power', { on: false })}>Éteindre cloud</Button>
          </div>
        ) : null}

        {brightnessCap ? (
          <div className="grid gap-2">
            <div className="flex justify-between text-sm"><Label>Luminosité cloud</Label><span className="text-muted-foreground">{brightness}%</span></div>
            <Slider value={[brightness]} min={1} max={100} onValueChange={(value) => setBrightness(sliderValue(value))} onValueCommitted={(value) => runCloudAction('brightness', { value: sliderValue(value) })} />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {colorCap ? (
            <div className="grid gap-2">
              <Label>Couleur cloud</Label>
              <div className="flex flex-wrap gap-2">
                <ColorPicker value={color} onChange={setColor} />
                <Button size="sm" variant="outline" onClick={() => runCloudAction('color', { color: hexToRgb(color) })}>Appliquer</Button>
              </div>
            </div>
          ) : null}
          {kelvinCap ? (
            <div className="grid gap-2">
              <div className="flex justify-between text-sm"><Label>Température cloud</Label><span className="text-muted-foreground">{kelvin} K</span></div>
              <Slider value={[kelvin]} min={2000} max={9000} step={100} onValueChange={(value) => setKelvin(sliderValue(value))} onValueCommitted={(value) => runCloudAction('color-temperature', { kelvin: sliderValue(value) })} />
            </div>
          ) : null}
        </div>
        </TabsContent>

        <TabsContent value="ambiance" className="mt-4 grid gap-4">
        {sceneCap ? (
          <div className="grid gap-2">
            <Label>LightScenes / DIY</Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={loadScenes}>Charger scènes</Button>
              {scenes.length > 0 ? (
                <>
                  <SelectField
                    value={sceneValue}
                    onValueChange={(value) => {
                      const scene = scenes.find((entry) => String(entry.value) === String(value));
                      setSceneValue(value);
                      setSceneInstance(scene?.instance || 'lightScene');
                    }}>
                    {scenes.map((scene) => <SelectItem key={`${scene.instance}:${scene.value}`} value={String(scene.value)}>{scene.instance === 'diyScene' ? 'DIY' : 'LightScene'} · {scene.name}</SelectItem>)}
                  </SelectField>
                  <Button size="sm" onClick={() => runCloudAction('scene', { value: Number(sceneValue), instance: sceneInstance })}>Appliquer scène</Button>
                </>
              ) : null}
            </div>
            {sceneMessage ? <p className="text-muted-foreground text-xs">{sceneMessage}</p> : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune ambiance cloud exposée par ce modèle.</div>
        )}
        </TabsContent>

        <TabsContent value="segments" className="mt-4 grid gap-4">
              {segmentCap ? (
                <SegmentControlPanel
                  segmentCount={cloudSegmentCount}
                  segments={cloudSegments}
                  activeSegment={cloudActiveSegment}
                  onSegmentCountChange={setCloudSegmentCount}
                  onActiveSegmentChange={setActiveSegment}
                  onSegmentColorChange={setCloudSegmentColor}
                  onSegmentBrightnessChange={setCloudSegmentBrightness}
                  actions={(
                    <>
                      <Button size="sm" onClick={() => runCloudAction('segment-color', { segment: cloudActiveSegment, color: hexToRgb(cloudSegment.color) })}>Couleur segment</Button>
                      <Button size="sm" variant="outline" onClick={() => runCloudAction('segment-brightness', { segment: cloudActiveSegment, brightness: cloudSegment.brightness })}>Luminosité segment</Button>
                      <Button size="sm" variant="outline" onClick={() => runCloudAction('segment-color', { segment: segmentIndexes(cloudSegmentCount), color: hexToRgb(cloudSegment.color) })}>Couleur tous segments</Button>
                      <Button size="sm" variant="outline" onClick={() => runCloudAction('segment-brightness', { segment: segmentIndexes(cloudSegmentCount), brightness: cloudSegment.brightness })}>Luminosité tous segments</Button>
                    </>
                  )}
                />
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ce modèle ne publie pas de contrôle segment cloud.</div>
              )}
        </TabsContent>

        <TabsContent value="modes" className="mt-4 grid gap-4">
              {gradientCap ? (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Gradient cloud</Label>
                  <Switch checked={true} onCheckedChange={(enabled) => runCloudAction('gradient', { enabled })} />
                </div>
              ) : null}
              {musicCap ? (
                <div className="grid gap-3">
                  <Label>Music mode cloud</Label>
                  {musicOptions.length > 0 ? (
                    <SelectField value={musicMode} onValueChange={setMusicMode}>
                      {musicOptions.map((mode) => <SelectItem key={mode.value} value={String(mode.value)}>{mode.name || mode.value}</SelectItem>)}
                    </SelectField>
                  ) : null}
                  <div className="flex justify-between text-sm"><span>Sensibilité</span><span className="text-muted-foreground">{musicSensitivity}%</span></div>
                  <Slider value={[musicSensitivity]} min={0} max={100} onValueChange={(value) => setMusicSensitivity(sliderValue(value))} />
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label>Auto color</Label>
                    <Switch checked={musicAutoColor} onCheckedChange={setMusicAutoColor} />
                  </div>
                  {!musicAutoColor ? <ColorPicker value={musicColor} onChange={setMusicColor} /> : null}
                  <Button size="sm" onClick={() => runCloudAction('music-mode', { mode: Number(musicMode), sensitivity: musicSensitivity, autoColor: musicAutoColor, color: hexToRgb(musicColor) })}>Appliquer music mode</Button>
                </div>
              ) : null}
              {!gradientCap && !musicCap ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun mode cloud exposé par ce modèle.</div>
              ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CloudFallbackPanel({ enabled, onEnabledChange, cloudStatus, cloudDevices, command, refresh, onStatusChange }) {
  const [apiKey, setApiKey] = React.useState('');
  const [keyMessage, setKeyMessage] = React.useState('');

  async function saveApiKey(nextKey = apiKey) {
    setKeyMessage('');
    try {
      const payload = await api('/api/cloud/api-key', { apiKey: nextKey });
      onStatusChange(payload.status || { configured: false });
      setApiKey('');
      if (!payload.status?.configured) onEnabledChange(false);
      if (enabled && payload.status?.configured) await refresh();
      setKeyMessage(nextKey ? 'Clé API enregistrée.' : 'Clé API app oubliée.');
    } catch (error) {
      setKeyMessage(error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Cloud className="size-5" /> Fallback Cloud Govee</CardTitle>
            <CardDescription>Chemin secondaire pour les fonctions non supportées en LAN local: LightScenes/DIY, segments, music mode et appareils cloud-only.</CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} disabled={!cloudStatus.configured} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Label>Clé API Govee</Label>
              <p className="text-muted-foreground text-sm">
                {cloudStatus.configured
                  ? `Configurée via ${cloudStatus.configuredSource === 'env' ? 'variable env' : 'l’app'}${cloudStatus.keyPreview ? ` (${cloudStatus.keyPreview})` : ''}.`
                  : 'Ajoute une clé pour activer les routes cloud secondaires.'}
              </p>
            </div>
            <Badge variant={cloudStatus.configured ? 'default' : 'secondary'}>{cloudStatus.configured ? 'configurée' : 'absente'}</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Coller une clé API Govee"
              autoComplete="off"
            />
            <Button onClick={() => saveApiKey()} disabled={!apiKey.trim()}>Enregistrer</Button>
            <Button variant="outline" onClick={() => saveApiKey('')} disabled={cloudStatus.configuredSource !== 'app'}>Oublier</Button>
          </div>
          {keyMessage ? <p className="mt-2 text-muted-foreground text-sm">{keyMessage}</p> : null}
        </div>
        {cloudStatus.configured ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'cloud actif' : 'cloud désactivé'}</Badge>
            <Button variant="outline" onClick={refresh} disabled={!enabled}>Rafraîchir cloud</Button>
          </div>
        ) : null}
        {enabled ? (
          cloudDevices.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucun device cloud chargé.</div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {cloudDevices.map((device) => <CloudDeviceFallback key={device.id} device={device} command={command} />)}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function BlePanel({ bleSensors, bleStatus, devices, events, blePackets = [], bleRaw = [], onDebugToggle }) {
  const [selected, setSelected] = React.useState('');
  const [action, setAction] = React.useState(DEFAULT_ACTION);
  const [selectedRawId, setSelectedRawId] = React.useState('');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (!selected && bleSensors[0]) setSelected(bleSensors[0].id);
  }, [bleSensors, selected]);

  React.useEffect(() => {
    if (!action.targetDeviceId && devices[0]) setAction((previous) => ({ ...previous, targetDeviceId: devices[0].id }));
  }, [devices, action.targetDeviceId]);

  const selectedSensor = bleSensors.find((sensor) => sensor.id === selected);
  const packetGroups = React.useMemo(() => groupBlePackets(blePackets, events), [blePackets, events]);
  const rawAdvertisements = Array.isArray(bleRaw) ? bleRaw : [];
  const selectedRaw = rawAdvertisements.find((entry) => entry.id === selectedRawId) || rawAdvertisements[0] || null;

  React.useEffect(() => {
    if (selectedSensor?.action) setAction({ ...DEFAULT_ACTION, ...selectedSensor.action });
  }, [selectedSensor?.id]);

  React.useEffect(() => {
    if (!selectedRawId && rawAdvertisements[0]) setSelectedRawId(rawAdvertisements[0].id);
  }, [rawAdvertisements, selectedRawId]);

  async function saveAction() {
    if (!selectedSensor) return;
    try {
      const payload = await api(`/api/ble/sensors/${encodeURIComponent(selectedSensor.id)}/action`, action);
      setMessage(payload.ok ? 'Action enregistrée.' : 'Action non enregistrée.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function testAction() {
    if (!selectedSensor) return;
    try {
      await api(`/api/ble/sensors/${encodeURIComponent(selectedSensor.id)}/test-action`, action);
      setMessage('Action testée.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Bluetooth className="size-5" /> H5122 / Bluetooth</CardTitle>
            <CardDescription>
              {bleStatus.available
                ? `${bleSensors.length} capteur(s) BLE détecté(s). ${rawAdvertisements.length} annonce(s) brutes en mémoire.`
                : 'BLE indisponible côté serveur'}
            </CardDescription>
          </div>
          <Badge variant={bleStatus.scanning ? 'success' : 'secondary'}>{bleStatus.scanning ? 'scan actif' : 'scan arrêté'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3 rounded-xl border p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Diagnostic BLE</h3>
              <p className="text-muted-foreground text-sm">
                État {bleStatus.state || 'inconnu'} · {bleStatus.enabled ? 'activé' : 'désactivé'} · {bleStatus.scanning ? 'scan actif' : 'scan arrêté'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="ble-debug">Debug raw</Label>
              <Switch
                id="ble-debug"
                checked={Boolean(bleStatus.debug)}
                disabled={!bleStatus.available || !onDebugToggle}
                onCheckedChange={(checked) => onDebugToggle?.(checked)}
              />
            </div>
          </div>
          {bleStatus.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{bleStatus.error}</p> : null}
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs">Disponible</p>
              <p className="font-medium">{bleStatus.available ? 'oui' : 'non'}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs">Scan Noble</p>
              <p className="font-medium">{bleStatus.scanning ? 'actif' : 'arrêté'}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs">Annonces raw</p>
              <p className="font-medium">{bleStatus.rawCount ?? rawAdvertisements.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-muted-foreground text-xs">Dernière raw</p>
              <p className="font-medium">{formatTime(rawAdvertisements[0]?.lastAt || rawAdvertisements[0]?.at)}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {rawAdvertisements.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Aucune annonce brute reçue par l’app.</p>
              ) : rawAdvertisements.map((raw) => (
                <button
                  key={raw.id}
                  type="button"
                  onClick={() => setSelectedRawId(raw.id)}
                  className={cn('w-full rounded-lg border p-3 text-left text-xs transition hover:bg-accent', selectedRaw?.id === raw.id && 'border-primary bg-primary/5')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{raw.localName || raw.address || 'Annonce BLE'}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={raw.parsed ? 'success' : raw.interesting ? 'secondary' : 'outline'}>{raw.parsed ? 'décodée' : raw.interesting ? 'candidate' : 'raw'}</Badge>
                      {raw.seenCount > 1 ? <Badge variant="outline">x{raw.seenCount}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                    <span>{raw.address || 'adresse inconnue'}</span>
                    <span>RSSI {raw.rssi ?? '—'} · {formatTime(raw.lastAt || raw.at)}</span>
                    <span className="sm:col-span-2 break-all">{raw.reason || 'pas de raison'}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="rounded-lg border bg-background/40 p-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Annonce sélectionnée</p>
              {selectedRaw ? (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px]">{formatJson(selectedRaw)}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune annonce.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {bleSensors.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Appuie une fois sur le H5122 ou rapproche-le du dongle Bluetooth. Les capteurs H512x sont “sleepy”, donc l’annonce utile arrive surtout lors d’un événement.
            </div>
          ) : bleSensors.map((sensor) => (
            <button
              key={sensor.id}
              type="button"
              onClick={() => setSelected(sensor.id)}
              className={cn('w-full rounded-xl border p-4 text-left transition hover:bg-accent', selected === sensor.id && 'border-primary bg-accent')}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{sensor.name || sensor.model || 'Govee BLE'}</p>
                  <p className="text-muted-foreground text-xs">{sensor.address}</p>
                </div>
                <Badge variant="outline">{sensor.model || 'BLE'}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>Batt. {sensor.battery ?? '—'}%</span>
                <span>RSSI {sensor.rssi ?? '—'}</span>
                <span>Dernier {formatTime(sensor.lastSeen)}</span>
              </div>
              {sensor.raw?.eventId ? <p className="mt-2 font-mono text-[11px] text-muted-foreground">dernier event id: {sensor.raw.eventId}</p> : null}
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <div>
            <h3 className="font-medium">Action sur pression</h3>
            <p className="text-muted-foreground text-sm">Plus besoin d’un debounce manuel : un même appui est identifié par son nonce/event id BLE.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Capteur</Label>
              <SelectField value={selected} onValueChange={setSelected}>
                {bleSensors.map((sensor) => <SelectItem key={sensor.id} value={sensor.id}>{sensor.name || sensor.address}</SelectItem>)}
              </SelectField>
            </div>
            <div className="grid gap-2">
              <Label>Lumière cible</Label>
              <SelectField value={action.targetDeviceId} onValueChange={(value) => setAction({ ...action, targetDeviceId: value })}>
                {devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.sku || 'Govee'} · {device.ip || device.id}</SelectItem>)}
              </SelectField>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Mode</Label>
              <SelectField value={action.mode} onValueChange={(value) => setAction({ ...action, mode: value })}>
                <SelectItem value="smart-toggle">Smart toggle: lire l’état puis inverser</SelectItem>
                <SelectItem value="toggle-cached">Toggle d’après l’état connu</SelectItem>
                <SelectItem value="turn-on">Toujours allumer</SelectItem>
                <SelectItem value="turn-off">Toujours éteindre</SelectItem>
              </SelectField>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Si état inconnu, allumer</Label>
              <p className="text-muted-foreground text-xs">Utile quand la lumière n’a pas encore répondu au LAN.</p>
            </div>
            <Switch checked={action.fallbackOnUnknown} onCheckedChange={(checked) => setAction({ ...action, fallbackOnUnknown: checked })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={saveAction} disabled={!selectedSensor || !action.targetDeviceId}>Enregistrer l’action</Button>
            <Button variant="outline" onClick={testAction} disabled={!selectedSensor || !action.targetDeviceId}>Tester l’action</Button>
            {message ? <span className="text-muted-foreground text-sm">{message}</span> : null}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Timeline BLE par event id</h4>
            <div className="max-h-80 space-y-3 overflow-auto">
              {packetGroups.length === 0 ? <p className="text-muted-foreground text-sm">Aucune pression détectée.</p> : packetGroups.map((group, index) => (
                <div
                  key={group.key}
                  className={cn('rounded-lg border bg-muted/30 p-3 text-xs', index === 0 && 'border-primary/50 bg-primary/5 shadow-sm')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{group.sensor?.name || group.sensor?.address || 'Capteur BLE'}</span>
                      <Badge variant="secondary">{group.event?.type || group.event?.key || 'event'}</Badge>
                      {group.eventId ? <Badge variant="outline" className="font-mono">{group.eventId}</Badge> : null}
                      {index === 0 ? <Badge variant="success">Nouveau</Badge> : null}
                      <Badge variant={group.duplicateCount > 0 ? 'outline' : 'secondary'}>
                        {group.packets.length} paquet(s), {group.duplicateCount} doublon(s)
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">{formatTime(group.lastAt)}</span>
                  </div>

                  <div className="mt-2 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                    <div>Adresse: <span className="text-foreground">{group.sensor?.address || '—'}</span></div>
                    <div>Modele: <span className="text-foreground">{group.sensor?.model || '—'}</span></div>
                    <div>Batterie: <span className="text-foreground">{group.sensor?.battery ?? group.event?.battery ?? '—'}%</span></div>
                    <div>RSSI: <span className="text-foreground">{group.sensor?.rssi ?? '—'}</span></div>
                    <div>Bouton: <span className="text-foreground">{group.event?.button ?? '—'}</span></div>
                    <div>Fenêtre: <span className="text-foreground">{formatTime(group.firstAt)} → {formatTime(group.lastAt)}</span></div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <div className="rounded-md border bg-background/60 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Paquets reçus</p>
                      <div className="space-y-1">
                        {group.packets.map((packet, packetIndex) => (
                          <div key={`${packet.at}-${packetIndex}`} className="flex items-center justify-between gap-3 rounded bg-muted/30 px-2 py-1">
                            <span>{formatTime(packet.at)}</span>
                            <Badge variant={packet.duplicate ? 'outline' : 'default'}>{packet.duplicate ? 'doublon' : 'unique'}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border bg-background/40 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Payload groupe</p>
                      <pre className="max-h-56 overflow-auto text-[11px]">{formatJson(group)}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function App() {
  const [theme, setTheme] = React.useState(() => localStorage.getItem('govee-theme') || 'light');
  const [cloudEnabled, setCloudEnabled] = React.useState(false);
  const {
    devices,
    setDevices,
    settings,
    setSettings,
    cloudDevices,
    setCloudDevices,
    cloudStatus,
    setCloudStatus,
    bleSensors,
    setBleSensors,
    bleStatus,
    setBleStatus,
    events,
    setEvents,
    blePackets,
    setBlePackets,
    bleRaw,
    setBleRaw,
    scenes,
    setScenes,
    lastEvent,
    refresh,
  } = useGoveeState({ cloudEnabled });
  const [busy, setBusy] = React.useState(new Set());
  const [toast, setToast] = React.useState('');

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('govee-theme', theme);
  }, [theme]);

  const command = React.useCallback(async (key, path, body, options = {}) => {
    setBusy((previous) => new Set(previous).add(key));
    setToast('');
    try {
      const payload = await api(path, body);
      if (path.startsWith('/api/ble/') && payload.status) setBleStatus(payload.status);
      if (payload.devices) setDevices(payload.devices);
      if (payload.sensors) setBleSensors(payload.sensors);
      if (payload.events) setEvents(payload.events);
      if (payload.packets) setBlePackets(payload.packets);
      if (payload.rawAdvertisements) setBleRaw(payload.rawAdvertisements);
      if (payload.scenes) setScenes(payload.scenes);
      if (payload.settings) setSettings(payload.settings);
      if (payload.status?.configured !== undefined) setCloudStatus(payload.status);
      if (payload.cloudDevices) setCloudDevices(payload.cloudDevices);
      options.onSuccess?.(payload);
      if (options.refresh) await refresh();
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, [refresh, setBlePackets, setBleRaw, setBleSensors, setBleStatus, setCloudDevices, setCloudStatus, setDevices, setEvents, setScenes, setSettings]);

  async function scan() {
    await command('scan', '/api/scan', { ips: [] });
  }

  async function manualAdd(body) {
    const payload = await api('/api/manual-device', body);
    if (payload.device) {
      setDevices((previous) => [payload.device, ...previous.filter((device) => device.id !== payload.device.id)]);
    }
  }

  async function toggleBle(enabled) {
    await command('ble', '/api/ble/enable', { enabled });
  }

  async function toggleBleDebug(enabled) {
    await command('ble:debug', '/api/ble/debug', { enabled });
  }

  async function toggleRetryMode(enabled) {
    await command('settings:retry', '/api/settings', { retryMode: enabled });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 md:p-8">
      <Header
        onScan={scan}
        onRefresh={refresh}
        busy={busy.size > 0}
        lastEvent={lastEvent}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />
      {toast ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{toast}</div> : null}
      <DiscoveryCard onManualAdd={manualAdd} bleStatus={bleStatus} onBleToggle={toggleBle} />
      <GlobalActionsCard devices={devices} command={command} settings={settings} onRetryModeChange={toggleRetryMode} />
      <ScenesCard scenes={scenes} setScenes={setScenes} devices={devices} command={command} />
      <CloudFallbackPanel enabled={cloudEnabled} onEnabledChange={setCloudEnabled} cloudStatus={cloudStatus} cloudDevices={cloudDevices} command={command} refresh={refresh} onStatusChange={setCloudStatus} />
      <BlePanel
        bleSensors={bleSensors}
        bleStatus={bleStatus}
        devices={devices}
        events={events}
        blePackets={blePackets}
        bleRaw={bleRaw}
        onDebugToggle={toggleBleDebug}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {devices.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <h2 className="text-xl font-semibold">Aucune lumière LAN détectée</h2>
              <p className="text-muted-foreground max-w-xl text-sm">Active “LAN Control” dans Govee Home, vérifie que ton PC est sur le même réseau, ou ajoute une IP manuellement.</p>
            </CardContent>
          </Card>
        ) : devices.map((device) => <DeviceCard key={device.id} device={device} command={command} />)}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
