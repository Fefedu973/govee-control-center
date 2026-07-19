export const managementPage = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Govee Smart Toggle</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light dark;--bg:#f5f5f4;--panel:#fff;--text:#18181b;--muted:#71717a;--border:#e4e4e7;--accent:#18181b;--accent-text:#fff;--ok:#15803d;--warn:#b45309;--radius:8px}
    @media(prefers-color-scheme:dark){:root{--bg:#09090b;--panel:#111113;--text:#fafafa;--muted:#a1a1aa;--border:#27272a;--accent:#fafafa;--accent-text:#18181b;--ok:#4ade80;--warn:#fbbf24}}
    *{box-sizing:border-box}body{margin:0;min-height:100dvh;background:var(--bg);color:var(--text)}main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:48px 0 64px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:28px}h1{font-size:24px;line-height:1.2;margin:0 0 6px;letter-spacing:0}p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}.status{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px}.dot{width:7px;height:7px;border-radius:50%;background:var(--warn)}.status[data-ready=true] .dot{background:var(--ok)}.panel{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.section{padding:24px}.section+.section{border-top:1px solid var(--border)}h2{font-size:15px;margin:0 0 18px;letter-spacing:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:grid;gap:7px}.span-2{grid-column:1/-1}label,.label{font-size:13px;font-weight:600}select,input[type=text],input[type=number]{width:100%;height:38px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);padding:0 11px;font:inherit;font-size:14px}input[type=color]{width:46px;height:38px;border:1px solid var(--border);border-radius:6px;background:transparent;padding:3px}.color-row{display:flex;align-items:center;gap:10px}.range-row{display:grid;grid-template-columns:auto 1fr 42px;align-items:center;gap:10px}.range-row input[type=range]{width:100%;accent-color:var(--accent)}.range-row output{font-variant-numeric:tabular-nums;text-align:right;font-size:13px}.check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500}.check input{width:16px;height:16px}.actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 24px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel),var(--bg) 28%)}button{height:36px;border-radius:6px;border:1px solid var(--border);padding:0 14px;background:transparent;color:var(--text);font:inherit;font-size:13px;font-weight:600;cursor:pointer}button.primary{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}button:disabled{opacity:.5;cursor:not-allowed}.inline-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.inline-head h2{margin:0}.meta{margin-top:7px;font-size:12px;color:var(--muted)}.live{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{border-left:2px solid var(--border);padding-left:10px}.metric strong{display:block;font-size:14px;margin-bottom:3px}.metric span{font-size:12px;color:var(--muted)}#message{min-height:20px;margin-top:14px;font-size:13px;color:var(--muted)}#message.error{color:#dc2626}#message.success{color:var(--ok)}[hidden]{display:none!important}@media(max-width:620px){main{width:min(100% - 24px,760px);padding:24px 0 40px}header{align-items:stretch;flex-direction:column}.status{align-self:flex-start}.grid{grid-template-columns:1fr}.span-2{grid-column:auto}.section{padding:20px}.live{grid-template-columns:1fr}.actions{padding:16px 20px;flex-wrap:wrap}.actions button{flex:1}}
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Govee Smart Toggle</h1><p>Configuration locale du bouton et de la lampe.</p></div>
      <div class="status" id="service-status" data-ready="false"><span class="dot"></span><span>Connexion...</span></div>
    </header>

    <div class="panel">
      <section class="section">
        <div class="inline-head"><h2>Appareils</h2><button id="discover">Rechercher</button></div>
        <div class="grid">
          <div class="field">
            <label for="sensor">Bouton Bluetooth</label>
            <select id="sensor"></select>
            <p class="meta">Appuyez sur un bouton H512x pour le faire apparaitre.</p>
          </div>
          <div class="field">
            <label for="button">Touche</label>
            <select id="button"></select>
          </div>
          <div class="field span-2">
            <label for="target">Lampe Govee LAN</label>
            <select id="target"></select>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Action</h2>
        <div class="grid">
          <div class="field span-2">
            <label for="mode">Mode</label>
            <select id="mode">
              <option value="power-toggle">Allumer / eteindre</option>
              <option value="power-color-toggle">Allumer avec une couleur / eteindre</option>
            </select>
          </div>
          <div id="color-options" class="grid span-2" hidden>
            <div class="field">
              <span class="label">Couleur a l'allumage</span>
              <div class="color-row"><input id="color" type="color" value="#ff7830"><input id="color-text" type="text" value="#ff7830" maxlength="7" aria-label="Couleur hexadecimale"></div>
            </div>
            <div class="field">
              <label class="check"><input id="force-brightness" type="checkbox">Forcer la luminosite</label>
              <div class="range-row"><span></span><input id="brightness" type="range" min="1" max="100" value="80"><output id="brightness-value">80%</output></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Etat</h2>
        <div class="live">
          <div class="metric"><strong id="power">Inconnu</strong><span>Lampe</span></div>
          <div class="metric"><strong id="ble">Inconnu</strong><span>Bluetooth</span></div>
          <div class="metric"><strong id="active-mode">Inconnu</strong><span>Mode actif</span></div>
          <div class="metric"><strong id="last-action">Jamais</strong><span>Derniere action</span></div>
        </div>
        <div id="message" role="status" aria-live="polite"></div>
      </section>

      <div class="actions"><button id="test">Enregistrer et tester</button><button id="save" class="primary">Enregistrer</button></div>
    </div>
  </main>
  <script>
    const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
    let config;
    let discovery = { bluetooth: [], lan: [] };

    const request = async (url, options) => {
      const response = await fetch(url, options);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Requete impossible');
      return payload;
    };
    const setMessage = (text, type = '') => { elements.message.textContent = text; elements.message.className = type; };
    const hexToRgb = (hex) => { const value = hex.replace('#', ''); return { r: parseInt(value.slice(0,2),16), g: parseInt(value.slice(2,4),16), b: parseInt(value.slice(4,6),16) }; };
    const rgbToHex = (color) => color ? '#' + [color.r,color.g,color.b].map((value) => value.toString(16).padStart(2,'0')).join('') : '#ff7830';

    function option(value, label, selected) {
      const entry = document.createElement('option'); entry.value = value; entry.textContent = label; entry.selected = selected; return entry;
    }
    function renderButtons() {
      const previousButton = elements.button.value || String(config.sensor.button);
      const selectedSensor = discovery.bluetooth.find((device) => device.address === elements.sensor.value);
      const count = Math.max(1, selectedSensor?.buttonCount || 1);
      const selectedButton = Math.min(Number(previousButton), count - 1);
      elements.button.replaceChildren(...Array.from({length:count},(_,index) => option(String(index), index === 0 ? 'Bouton principal' : 'Bouton ' + (index + 1), index === selectedButton)));
    }
    function renderDevices() {
      const selectedSensor = elements.sensor.value || config.sensor.address;
      const selectedTarget = elements.target.value || config.target.ip;
      elements.sensor.replaceChildren(...discovery.bluetooth.map((device) => option(device.address, device.name + ' - ' + device.model + (device.battery === null ? '' : ' (' + device.battery + '%)'), device.address === selectedSensor)));
      elements.target.replaceChildren(...discovery.lan.map((device) => option(device.ip, device.name, device.ip === selectedTarget)));
      renderButtons();
    }
    function renderConfig() {
      elements.mode.value = config.action.mode;
      elements.color.value = rgbToHex(config.action.on.color);
      elements['color-text'].value = elements.color.value;
      elements['force-brightness'].checked = config.action.on.brightness !== null;
      elements.brightness.value = config.action.on.brightness || 80;
      elements['brightness-value'].value = elements.brightness.value + '%';
      elements['color-options'].hidden = elements.mode.value !== 'power-color-toggle';
      elements['active-mode'].textContent = config.action.mode === 'power-color-toggle' ? 'Couleur forcee' : 'Bascule simple';
    }
    function buildConfig() {
      const colorValue = /^#[0-9a-f]{6}$/i.test(elements['color-text'].value) ? elements['color-text'].value : elements.color.value;
      return {
        ...config,
        sensor: { address: elements.sensor.value, button: Number(elements.button.value) },
        target: { ...config.target, ip: elements.target.value },
        action: {
          mode: elements.mode.value,
          on: {
            color: elements.mode.value === 'power-color-toggle' ? hexToRgb(colorValue) : null,
            brightness: elements.mode.value === 'power-color-toggle' && elements['force-brightness'].checked ? Number(elements.brightness.value) : null,
          },
        },
      };
    }
    async function refreshDiscovery(trigger = false) {
      if (trigger) await request('/api/discovery/lan', { method:'POST' });
      discovery = await request('/api/discovery');
      renderDevices();
    }
    async function refreshStatus() {
      try {
        const status = await request('/api/status');
        elements['service-status'].dataset.ready = String(status.ready);
        elements['service-status'].lastElementChild.textContent = status.ready ? 'Pret' : 'Degrade';
        elements.power.textContent = status.target.lastPower === 1 ? 'Allumee' : status.target.lastPower === 0 ? 'Eteinte' : 'Inconnue';
        elements.ble.textContent = status.ble.scanning ? 'Actif' : status.ble.state;
        elements['last-action'].textContent = status.target.lastActionAt ? new Date(status.target.lastActionAt).toLocaleTimeString() : 'Jamais';
      } catch { elements['service-status'].lastElementChild.textContent = 'Hors ligne'; }
    }
    async function save(testAfter = false) {
      setMessage('Enregistrement...');
      try {
        config = await request('/api/config', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(buildConfig()) });
        renderConfig();
        if (testAfter) await request('/api/action/test', { method:'POST' });
        setMessage(testAfter ? 'Configuration enregistree et action executee.' : 'Configuration enregistree.', 'success');
        await refreshStatus();
      } catch (error) { setMessage(error.message, 'error'); }
    }

    elements.mode.addEventListener('change', () => { elements['color-options'].hidden = elements.mode.value !== 'power-color-toggle'; });
    elements.sensor.addEventListener('change', renderButtons);
    elements.color.addEventListener('input', () => { elements['color-text'].value = elements.color.value; });
    elements['color-text'].addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(elements['color-text'].value)) elements.color.value = elements['color-text'].value; });
    elements.brightness.addEventListener('input', () => { elements['brightness-value'].value = elements.brightness.value + '%'; });
    elements.discover.addEventListener('click', async () => { elements.discover.disabled = true; setMessage('Recherche en cours...'); try { await refreshDiscovery(true); setMessage('Liste actualisee.'); } catch(error) { setMessage(error.message,'error'); } finally { elements.discover.disabled = false; } });
    elements.save.addEventListener('click', () => save(false));
    elements.test.addEventListener('click', () => save(true));

    Promise.all([request('/api/config'), request('/api/discovery')]).then(([currentConfig,currentDiscovery]) => { config=currentConfig; discovery=currentDiscovery; renderConfig(); renderDevices(); refreshStatus(); setInterval(refreshStatus,3000); setInterval(() => refreshDiscovery(false).catch(()=>{}),5000); }).catch((error) => setMessage(error.message,'error'));
  </script>
</body>
</html>`;
