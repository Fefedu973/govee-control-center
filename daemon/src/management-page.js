export const managementPage = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#0b0d12">
  <title>Govee Smart Toggle</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, "Segoe UI", ui-sans-serif, system-ui, sans-serif;
      --bg: #f5f6f8;
      --bg-elevated: rgba(255, 255, 255, .88);
      --panel: #ffffff;
      --panel-soft: #f8f9fb;
      --text: #15171c;
      --muted: #686d78;
      --faint: #959ba7;
      --border: #e1e4e9;
      --border-strong: #d4d8df;
      --accent: #5367f8;
      --accent-hover: #4659e7;
      --accent-soft: #eef0ff;
      --accent-text: #ffffff;
      --warm: #ff7a45;
      --warm-soft: #fff1ea;
      --ok: #16865d;
      --ok-soft: #e8f8f1;
      --warn: #b66a0b;
      --warn-soft: #fff5df;
      --danger: #c33f4a;
      --danger-soft: #fff0f1;
      --shadow: 0 18px 50px rgba(31, 38, 60, .09);
      --shadow-soft: 0 8px 24px rgba(31, 38, 60, .06);
      --radius: 20px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0d12;
        --bg-elevated: rgba(17, 20, 28, .88);
        --panel: #12151d;
        --panel-soft: #171a23;
        --text: #f5f6f8;
        --muted: #a5aab5;
        --faint: #777d8a;
        --border: #272b36;
        --border-strong: #343946;
        --accent: #8290ff;
        --accent-hover: #929eff;
        --accent-soft: #202544;
        --accent-text: #0d1020;
        --warm: #ff9468;
        --warm-soft: #34231f;
        --ok: #65d6aa;
        --ok-soft: #152d27;
        --warn: #f3bd63;
        --warn-soft: #332817;
        --danger: #ff8d98;
        --danger-soft: #351f24;
        --shadow: 0 20px 60px rgba(0, 0, 0, .34);
        --shadow-soft: 0 8px 24px rgba(0, 0, 0, .2);
      }
    }

    * { box-sizing: border-box; }
    html { min-width: 320px; }
    body {
      margin: 0;
      min-height: 100dvh;
      color: var(--text);
      background:
        radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--accent) 12%, transparent) 0, transparent 34rem),
        radial-gradient(circle at 94% 8%, color-mix(in srgb, var(--warm) 11%, transparent) 0, transparent 30rem),
        var(--bg);
    }
    button, select, input { font: inherit; }
    button, select, input[type="color"], input[type="range"], input[type="checkbox"] { cursor: pointer; }
    button:focus-visible, select:focus-visible, input:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--accent) 28%, transparent);
      outline-offset: 2px;
    }
    [hidden] { display: none !important; }

    .shell {
      width: min(1120px, calc(100% - 40px));
      margin: 0 auto;
      padding: 24px 0 56px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 56px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border: 1px solid color-mix(in srgb, var(--warm) 35%, var(--border));
      border-radius: 14px;
      color: var(--warm);
      background: var(--warm-soft);
      box-shadow: var(--shadow-soft);
    }
    .brand-mark svg { width: 21px; height: 21px; }
    .brand-copy strong { display: block; font-size: 14px; letter-spacing: -.01em; }
    .brand-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-height: 36px;
      padding: 0 13px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-soft);
      font-size: 12px;
      font-weight: 650;
      backdrop-filter: blur(16px);
    }
    .status-orb {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--warn);
      box-shadow: 0 0 0 4px var(--warn-soft);
    }
    .status-pill[data-state="ready"] { color: var(--ok); }
    .status-pill[data-state="ready"] .status-orb {
      background: var(--ok);
      box-shadow: 0 0 0 4px var(--ok-soft);
    }
    .status-pill[data-state="offline"] { color: var(--danger); }
    .status-pill[data-state="offline"] .status-orb {
      background: var(--danger);
      box-shadow: 0 0 0 4px var(--danger-soft);
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr);
      align-items: end;
      gap: 44px;
      margin-bottom: 36px;
    }
    .eyebrow {
      margin: 0 0 13px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 750;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 {
      max-width: 760px;
      margin: 0;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 1.01;
      letter-spacing: -.055em;
      text-wrap: balance;
    }
    .hero-copy {
      margin: 0 0 5px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(300px, .75fr);
      gap: 22px;
      align-items: start;
    }
    .panel {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .panel-section { padding: 28px; }
    .panel-section + .panel-section { border-top: 1px solid var(--border); }
    .section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 22px;
    }
    .section-kicker {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .step {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 8px;
      color: var(--accent);
      background: var(--accent-soft);
      font-size: 11px;
      font-weight: 800;
    }
    h2 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
    .section-copy { margin: 4px 0 0 34px; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .span-2 { grid-column: 1 / -1; }
    .field { display: grid; gap: 8px; min-width: 0; }
    label, .label { color: var(--text); font-size: 12px; font-weight: 700; }
    .field-note { margin: 0; color: var(--faint); font-size: 11px; line-height: 1.45; }
    select, input[type="text"] {
      width: 100%;
      height: 44px;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      padding: 0 13px;
      color: var(--text);
      background: var(--panel-soft);
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    select:hover, input[type="text"]:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
    select:disabled { cursor: not-allowed; opacity: .65; }
    .secondary-button, .primary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      border-radius: 12px;
      padding: 0 15px;
      font-size: 12px;
      font-weight: 750;
      transition: transform .15s ease, background .15s ease, border-color .15s ease;
    }
    .secondary-button {
      border: 1px solid var(--border-strong);
      color: var(--text);
      background: var(--panel-soft);
    }
    .secondary-button:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-1px); }
    .primary-button {
      border: 1px solid var(--accent);
      color: var(--accent-text);
      background: var(--accent);
      box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    .primary-button:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    button:disabled { cursor: not-allowed; opacity: .48; }
    .button-icon { width: 15px; height: 15px; }

    .condition-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      padding: 18px;
      border: 1px solid color-mix(in srgb, var(--warm) 25%, var(--border));
      border-radius: 15px;
      background: color-mix(in srgb, var(--warm-soft) 55%, var(--panel));
    }
    .color-row { display: grid; grid-template-columns: 48px 1fr; gap: 10px; }
    input[type="color"] {
      width: 48px;
      height: 44px;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      padding: 4px;
      background: var(--panel-soft);
    }
    .check { display: flex; align-items: center; gap: 9px; min-height: 22px; }
    .check input { width: 17px; height: 17px; accent-color: var(--accent); }
    .range-row { display: grid; grid-template-columns: 1fr 44px; align-items: center; gap: 10px; min-height: 44px; }
    input[type="range"] { width: 100%; accent-color: var(--accent); }
    output { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }

    .action-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 28px;
      border-top: 1px solid var(--border);
      background: var(--panel-soft);
    }
    .message {
      min-height: 20px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .message.success { color: var(--ok); }
    .message.error { color: var(--danger); }
    .action-buttons { display: flex; gap: 10px; flex: 0 0 auto; }

    .rail { display: grid; gap: 18px; }
    .rail-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px;
      background: var(--bg-elevated);
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(16px);
    }
    .rail-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .rail-title h2 { font-size: 15px; }
    .tiny-label {
      padding: 5px 8px;
      border-radius: 999px;
      color: var(--accent);
      background: var(--accent-soft);
      font-size: 10px;
      font-weight: 750;
    }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .metric {
      min-width: 0;
      padding: 13px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel);
    }
    .metric span { display: block; margin-bottom: 7px; color: var(--faint); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .metric strong { display: block; overflow: hidden; font-size: 13px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
    .metric strong[data-tone="ok"] { color: var(--ok); }
    .metric strong[data-tone="warn"] { color: var(--warn); }
    .access-card { position: relative; overflow: hidden; }
    .access-card::after {
      position: absolute;
      right: -28px;
      bottom: -36px;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      content: "";
    }
    .access-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      margin-bottom: 16px;
      border-radius: 12px;
      color: var(--accent);
      background: var(--accent-soft);
    }
    .access-icon svg { width: 18px; height: 18px; }
    .access-card h2 { margin-bottom: 8px; }
    .access-card p { position: relative; z-index: 1; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
    .address {
      display: block;
      position: relative;
      z-index: 1;
      overflow: hidden;
      margin-top: 14px;
      padding: 10px 11px;
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      background: var(--panel);
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .privacy-note { margin-top: 12px !important; color: var(--faint) !important; }

    @media (max-width: 860px) {
      .hero { grid-template-columns: 1fr; gap: 18px; }
      .hero-copy { max-width: 680px; }
      .workspace { grid-template-columns: 1fr; }
      .rail { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .shell { width: min(100% - 24px, 1120px); padding-top: 14px; }
      .topbar { align-items: flex-start; margin-bottom: 38px; }
      .brand-copy span { display: none; }
      .hero { margin-bottom: 26px; }
      h1 { font-size: clamp(33px, 12vw, 48px); }
      .grid, .condition-panel, .rail { grid-template-columns: 1fr; }
      .span-2 { grid-column: auto; }
      .panel-section { padding: 22px 18px; }
      .section-head { align-items: stretch; flex-direction: column; }
      .section-head .secondary-button { align-self: flex-start; }
      .section-copy { margin-left: 34px; }
      .action-bar { align-items: stretch; flex-direction: column; padding: 16px 18px; }
      .action-buttons { width: 100%; }
      .action-buttons button { flex: 1; padding-inline: 10px; }
      .metrics { grid-template-columns: 1fr 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M13 2 5.5 13h5L9.8 22 18.5 10h-5L13 2Z"/>
          </svg>
        </div>
        <div class="brand-copy">
          <strong>Govee Smart Toggle</strong>
          <span>Daemon local · Raspberry Pi</span>
        </div>
      </div>
      <div class="status-pill" id="service-status" data-state="loading" role="status" aria-live="polite">
        <span class="status-orb"></span>
        <span>Connexion…</span>
      </div>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">Automatisation locale</p>
        <h1>Un bouton. Une lumière. Aucun détour par le cloud.</h1>
      </div>
      <p class="hero-copy">Associez un bouton Govee Bluetooth à une lampe du réseau local, choisissez l’action, puis laissez le daemon réagir instantanément.</p>
    </section>

    <div class="workspace">
      <section class="panel" aria-label="Configuration du smart toggle">
        <div class="panel-section">
          <div class="section-head">
            <div>
              <div class="section-kicker"><span class="step">01</span><h2>Appareils</h2></div>
              <p class="section-copy">Sélectionnez le déclencheur Bluetooth et la lampe à piloter.</p>
            </div>
            <button class="secondary-button" id="discover" type="button">
              <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>
              </svg>
              Rechercher
            </button>
          </div>
          <div class="grid">
            <div class="field">
              <label for="sensor">Bouton Bluetooth</label>
              <select id="sensor" aria-describedby="sensor-note"></select>
              <p class="field-note" id="sensor-note">Appuyez sur un H5122, H5125 ou H5126 pour le faire apparaître.</p>
            </div>
            <div class="field">
              <label for="button">Touche physique</label>
              <select id="button"></select>
              <p class="field-note">Les modèles multi-boutons exposent chaque touche séparément.</p>
            </div>
            <div class="field span-2">
              <label for="target">Lampe Govee LAN</label>
              <select id="target"></select>
              <p class="field-note">Le contrôle LAN doit être activé dans l’application Govee Home.</p>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-head">
            <div>
              <div class="section-kicker"><span class="step">02</span><h2>Action</h2></div>
              <p class="section-copy">Définissez ce que le bouton applique à chaque pression.</p>
            </div>
          </div>
          <div class="grid">
            <div class="field span-2">
              <label for="mode">Comportement</label>
              <select id="mode">
                <option value="power-toggle">Basculer entre allumé et éteint</option>
                <option value="power-color-toggle">Allumer avec une ambiance précise, puis éteindre</option>
              </select>
            </div>
            <div id="color-options" class="condition-panel span-2" hidden>
              <div class="field">
                <span class="label">Couleur à l’allumage</span>
                <div class="color-row">
                  <input id="color" type="color" value="#ff7830" aria-label="Sélecteur de couleur">
                  <input id="color-text" type="text" value="#ff7830" maxlength="7" aria-label="Couleur hexadécimale">
                </div>
              </div>
              <div class="field">
                <label class="check"><input id="force-brightness" type="checkbox">Forcer la luminosité</label>
                <div class="range-row">
                  <input id="brightness" type="range" min="1" max="100" value="80" aria-label="Luminosité">
                  <output id="brightness-value">80%</output>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="action-bar">
          <div class="message" id="message" role="status" aria-live="polite">Les modifications restent locales au Raspberry Pi.</div>
          <div class="action-buttons">
            <button class="secondary-button" id="test" type="button">Enregistrer et tester</button>
            <button class="primary-button" id="save" type="button">Enregistrer</button>
          </div>
        </div>
      </section>

      <aside class="rail">
        <section class="rail-card" aria-labelledby="live-title">
          <div class="rail-title">
            <h2 id="live-title">État en direct</h2>
            <span class="tiny-label" id="device-counts">0 appareil</span>
          </div>
          <div class="metrics">
            <div class="metric"><span>Lampe</span><strong id="power">Inconnue</strong></div>
            <div class="metric"><span>Bluetooth</span><strong id="ble">Connexion…</strong></div>
            <div class="metric"><span>Cible LAN</span><strong id="target-status">Inconnue</strong></div>
            <div class="metric"><span>Mode actif</span><strong id="active-mode">Inconnu</strong></div>
            <div class="metric"><span>Dernière action</span><strong id="last-action">Jamais</strong></div>
            <div class="metric"><span>Disponibilité</span><strong id="uptime">—</strong></div>
          </div>
        </section>

        <section class="rail-card access-card" aria-labelledby="access-title">
          <div class="access-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 id="access-title">Console privée</h2>
          <p>Cette page reste liée à l’interface locale du daemon. Utilisez le tunnel SSH fourni par le projet pour l’ouvrir depuis votre poste.</p>
          <code class="address" id="console-address">http://127.0.0.1:8788</code>
          <p class="privacy-note">N’exposez pas ce port directement sur Internet.</p>
        </section>
      </aside>
    </div>
  </main>

  <script>
    const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
    let config;
    let discovery = { bluetooth: [], lan: [] };

    const request = async (url, options) => {
      const response = await fetch(url, options);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Requête impossible');
      return payload;
    };

    const setMessage = (text, type = '') => {
      elements.message.textContent = text;
      elements.message.className = 'message' + (type ? ' ' + type : '');
    };

    const setServiceState = (state, label) => {
      elements['service-status'].dataset.state = state;
      elements['service-status'].lastElementChild.textContent = label;
    };

    const hexToRgb = (hex) => {
      const value = hex.replace('#', '');
      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    };

    const rgbToHex = (color) => color
      ? '#' + [color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, '0')).join('')
      : '#ff7830';

    const formatTime = (value) => value
      ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Jamais';

    const formatUptime = (seconds) => {
      if (!Number.isFinite(seconds)) return '—';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return days + ' j ' + hours + ' h';
      if (hours > 0) return hours + ' h ' + minutes + ' min';
      return Math.max(0, minutes) + ' min';
    };

    function option(value, label, selected = false, disabled = false) {
      const entry = document.createElement('option');
      entry.value = value;
      entry.textContent = label;
      entry.selected = selected;
      entry.disabled = disabled;
      return entry;
    }

    function sensorOptions(selectedAddress) {
      const devices = [...discovery.bluetooth];
      if (config.sensor.address && !devices.some((device) => device.address === config.sensor.address)) {
        devices.unshift({
          address: config.sensor.address,
          name: 'Bouton configuré',
          model: 'hors portée',
          battery: null,
          buttonCount: 1,
          configuredOnly: true,
        });
      }
      if (devices.length === 0) return [option('', 'Aucun bouton détecté', true, true)];
      return devices.map((device) => {
        const battery = device.battery === null ? '' : ' · ' + device.battery + '%';
        const suffix = device.configuredOnly ? ' · non détecté' : battery;
        return option(device.address, device.name + ' · ' + device.model + suffix, device.address === selectedAddress);
      });
    }

    function targetOptions(selectedIp) {
      const devices = [...discovery.lan];
      if (config.target.ip && !devices.some((device) => device.ip === config.target.ip)) {
        devices.unshift({ ip: config.target.ip, name: 'Lampe configurée', configuredOnly: true });
      }
      if (devices.length === 0) return [option('', 'Aucune lampe détectée', true, true)];
      return devices.map((device) => option(
        device.ip,
        device.name + (device.configuredOnly ? ' · non détectée' : ' · ' + device.ip),
        device.ip === selectedIp,
      ));
    }

    function renderButtons() {
      const previousButton = elements.button.value || String(config.sensor.button);
      const selectedSensor = discovery.bluetooth.find((device) => device.address === elements.sensor.value);
      const count = Math.max(1, selectedSensor?.buttonCount || 1);
      const selectedButton = Math.min(Number(previousButton), count - 1);
      elements.button.replaceChildren(...Array.from(
        { length: count },
        (_, index) => option(String(index), index === 0 ? 'Bouton principal' : 'Bouton ' + (index + 1), index === selectedButton),
      ));
    }

    function updateActionAvailability() {
      const enabled = Boolean(elements.sensor.value && elements.target.value);
      elements.save.disabled = !enabled;
      elements.test.disabled = !enabled;
    }

    function renderDevices() {
      const selectedSensor = elements.sensor.value || config.sensor.address;
      const selectedTarget = elements.target.value || config.target.ip;
      elements.sensor.replaceChildren(...sensorOptions(selectedSensor));
      elements.target.replaceChildren(...targetOptions(selectedTarget));
      renderButtons();
      updateActionAvailability();
      const total = discovery.bluetooth.length + discovery.lan.length;
      elements['device-counts'].textContent = total + ' appareil' + (total === 1 ? '' : 's');
    }

    function renderConfig() {
      elements.mode.value = config.action.mode;
      elements.color.value = rgbToHex(config.action.on.color);
      elements['color-text'].value = elements.color.value;
      elements['force-brightness'].checked = config.action.on.brightness !== null;
      elements.brightness.value = config.action.on.brightness || 80;
      elements['brightness-value'].value = elements.brightness.value + '%';
      elements['color-options'].hidden = elements.mode.value !== 'power-color-toggle';
      elements['active-mode'].textContent = config.action.mode === 'power-color-toggle' ? 'Ambiance' : 'Bascule';
    }

    function buildConfig() {
      const colorValue = /^#[0-9a-f]{6}$/i.test(elements['color-text'].value)
        ? elements['color-text'].value
        : elements.color.value;
      return {
        ...config,
        sensor: { address: elements.sensor.value, button: Number(elements.button.value) },
        target: { ...config.target, ip: elements.target.value },
        action: {
          mode: elements.mode.value,
          on: {
            color: elements.mode.value === 'power-color-toggle' ? hexToRgb(colorValue) : null,
            brightness: elements.mode.value === 'power-color-toggle' && elements['force-brightness'].checked
              ? Number(elements.brightness.value)
              : null,
          },
        },
      };
    }

    async function refreshDiscovery(trigger = false) {
      if (trigger) await request('/api/discovery/lan', { method: 'POST' });
      discovery = await request('/api/discovery');
      renderDevices();
    }

    async function refreshStatus() {
      try {
        const status = await request('/api/status');
        setServiceState(status.ready ? 'ready' : 'degraded', status.ready ? 'Prêt' : 'Dégradé');
        elements.power.textContent = status.target.lastPower === 1
          ? 'Allumée'
          : status.target.lastPower === 0
            ? 'Éteinte'
            : 'Inconnue';
        elements.power.dataset.tone = status.target.lastPower === null ? 'warn' : 'ok';
        elements.ble.textContent = status.ble.scanning ? 'Actif' : status.ble.state;
        elements.ble.dataset.tone = status.ble.scanning ? 'ok' : 'warn';
        elements['target-status'].textContent = status.target.reachable ? 'Joignable' : 'Hors ligne';
        elements['target-status'].dataset.tone = status.target.reachable ? 'ok' : 'warn';
        elements['last-action'].textContent = formatTime(status.target.lastActionAt);
        elements.uptime.textContent = formatUptime(status.uptimeSeconds);
      } catch {
        setServiceState('offline', 'Hors ligne');
        elements.ble.textContent = 'Hors ligne';
        elements.ble.dataset.tone = 'warn';
        elements['target-status'].textContent = 'Inconnue';
        elements['target-status'].dataset.tone = 'warn';
      }
    }

    async function save(testAfter = false) {
      if (!elements.sensor.value || !elements.target.value) {
        setMessage('Sélectionnez un bouton et une lampe avant d’enregistrer.', 'error');
        return;
      }

      elements.save.disabled = true;
      elements.test.disabled = true;
      setMessage(testAfter ? 'Enregistrement et test en cours…' : 'Enregistrement…');
      try {
        config = await request('/api/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildConfig()),
        });
        renderConfig();
        if (testAfter) await request('/api/action/test', { method: 'POST' });
        setMessage(
          testAfter ? 'Configuration enregistrée et action exécutée.' : 'Configuration enregistrée.',
          'success',
        );
        await refreshStatus();
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        updateActionAvailability();
      }
    }

    elements.mode.addEventListener('change', () => {
      elements['color-options'].hidden = elements.mode.value !== 'power-color-toggle';
      elements['active-mode'].textContent = elements.mode.value === 'power-color-toggle' ? 'Ambiance' : 'Bascule';
    });
    elements.sensor.addEventListener('change', () => {
      renderButtons();
      updateActionAvailability();
    });
    elements.target.addEventListener('change', updateActionAvailability);
    elements.color.addEventListener('input', () => {
      elements['color-text'].value = elements.color.value;
    });
    elements['color-text'].addEventListener('change', () => {
      if (/^#[0-9a-f]{6}$/i.test(elements['color-text'].value)) {
        elements.color.value = elements['color-text'].value;
      }
    });
    elements.brightness.addEventListener('input', () => {
      elements['brightness-value'].value = elements.brightness.value + '%';
    });
    elements.discover.addEventListener('click', async () => {
      elements.discover.disabled = true;
      setMessage('Recherche des appareils LAN…');
      try {
        await refreshDiscovery(true);
        setMessage('Liste des appareils actualisée.', 'success');
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        elements.discover.disabled = false;
      }
    });
    elements.save.addEventListener('click', () => save(false));
    elements.test.addEventListener('click', () => save(true));

    elements['console-address'].textContent = window.location.origin;

    Promise.all([request('/api/config'), request('/api/discovery')])
      .then(([currentConfig, currentDiscovery]) => {
        config = currentConfig;
        discovery = currentDiscovery;
        renderConfig();
        renderDevices();
        refreshStatus();
        setInterval(refreshStatus, 3000);
        setInterval(() => refreshDiscovery(false).catch(() => {}), 5000);
      })
      .catch((error) => {
        setServiceState('offline', 'Hors ligne');
        setMessage(error.message, 'error');
      });
  </script>
</body>
</html>`;
