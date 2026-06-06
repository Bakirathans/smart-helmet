// ============================================================
//  SmartHelmet — Full SPA Controller
//  Pages: Dashboard · Analytics · Alerts · Settings
//  Firebase RTDB real-time listener
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// ── Firebase ──────────────────────────────────────────────────
const app = initializeApp({
  databaseURL: "https://mines-7b85e-default-rtdb.asia-southeast1.firebasedatabase.app/"
});
const db = getDatabase(app);

// ── Thresholds (live, editable via Settings) ──────────────────
let THRESH = loadSettings();

function defaultSettings() {
  return {
    temp: { warn: 34, danger: 40, max: 100 },
    hum: { warn: 80, danger: 85, max: 100 },
    gas: { warn: 680, danger: 750, max: 1000 },
    notif: { browser: false, sound: false, strip: true }
  };
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('smSettings');
    return saved ? JSON.parse(saved) : defaultSettings();
  } catch { return defaultSettings(); }
}

function persistSettings() {
  localStorage.setItem('smSettings', JSON.stringify(THRESH));
}

// ── Session data stores ───────────────────────────────────────
let history = { temp: [], hum: [], gas: [], ts: [] };
const MAX_HISTORY = 40;
let alertFeedRecords = [];
let sessionStart = Date.now();
let dangerCount = 0, warnCount = 0, safeCount = 0;
let logRowsData = [];

// ── LocalStorage State Sync ──────────────────────────────────
function loadSessionState() {
  try {
    const saved = localStorage.getItem('smSessionState');
    if (saved) {
      const state = JSON.parse(saved);
      if (state.history && Array.isArray(state.history.temp)) {
        history = state.history;
      }
      if (Array.isArray(state.alertFeedRecords)) {
        alertFeedRecords = state.alertFeedRecords;
      }
      if (typeof state.sessionStart === 'number') {
        sessionStart = state.sessionStart;
      }
      if (typeof state.dangerCount === 'number') {
        dangerCount = state.dangerCount;
        warnCount = state.warnCount;
        safeCount = state.safeCount;
      }
      if (Array.isArray(state.logRowsData)) {
        logRowsData = state.logRowsData;
      }
    }
  } catch (e) {
    console.error("Failed to load session state", e);
  }
}

function saveSessionState() {
  try {
    localStorage.setItem('smSessionState', JSON.stringify({
      history,
      alertFeedRecords,
      sessionStart,
      dangerCount,
      warnCount,
      safeCount,
      logRowsData
    }));
  } catch (e) {
    console.error("Failed to save session state", e);
  }
}

// Mobile menu hamburger toggle
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');

if (menuToggle && sidebar && backdrop) {
  const toggleMenu = () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('open');
  };
  menuToggle.addEventListener('click', toggleMenu);
  backdrop.addEventListener('click', toggleMenu);
}

// ─────────────────────────────────────────────────────────────
//  FIREBASE LISTENER
// ─────────────────────────────────────────────────────────────
onValue(ref(db, '/'), snap => {
  const d = snap.val();
  if (!d) return;
  setConnection(true);

  const temp = parseFloat(d.Temp) || 0;
  const hum = parseFloat(d.Hum) || 0;
  const gas = parseFloat(d.Gas) || 0;
  const ts = d.Timestamp || new Date().toLocaleTimeString();

  // Store history
  history.temp.push(temp); history.hum.push(hum);
  history.gas.push(gas); history.ts.push(ts);
  if (history.temp.length > MAX_HISTORY) {
    history.temp.shift(); history.hum.shift();
    history.gas.shift(); history.ts.shift();
  }

  // Update all UI sections
  updateDashboard(temp, hum, gas, ts);
  updateAnalytics(temp, hum, gas);
  checkAlerts(temp, hum, gas, ts);
  addLogRow(ts, temp, hum, gas);

  document.getElementById('lastTimestamp').textContent = ts;

}, err => {
  console.error(err);
  setConnection(false);
});

// ─────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────
function updateDashboard(temp, hum, gas, ts) {
  updateDashboardThresholdLabels();
  updateKPI('temp', temp, THRESH.temp);
  updateKPI('hum', hum, THRESH.hum);
  updateKPI('gas', gas, THRESH.gas);

  const score = calcScore(temp, hum, gas);
  updateScoreUI(score, temp, hum, gas);

  if (window.drawRadial) {
    window.drawRadial('gTemp', temp / THRESH.temp.max, 'temp', temp.toFixed(1), '°C');
    window.drawRadial('gHum', hum / THRESH.hum.max, 'hum', hum.toFixed(1), '%RH');
    window.drawRadial('gGas', gas / THRESH.gas.max, 'gas', gas.toFixed(0), 'ppm');
  }
}

function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }

function updateKPI(key, value, thresh) {
  const pct = Math.min((value / thresh.max) * 100, 100);
  const level = value >= thresh.danger ? 'danger' : value >= thresh.warn ? 'warn' : 'safe';
  const labels = { safe: 'Normal', warn: 'Warning', danger: 'Danger' };
  const suffix = { temp: '°C', hum: '%', gas: 'ppm' }[key];

  const valEl = document.getElementById(`${key}Value`);
  const barEl = document.getElementById(`${key}Bar`);
  const pillEl = document.getElementById(`${cap(key)}Pill`);
  const cardEl = document.getElementById(`kpi${cap(key)}`);

  if (valEl) valEl.innerHTML = `${value.toFixed(key === 'gas' ? 0 : 1)}<span class="kpi-suffix">${suffix}</span>`;
  if (barEl) barEl.style.width = `${pct}%`;
  if (pillEl) { pillEl.textContent = labels[level]; pillEl.className = `kpi-status-pill ${level}`; }
  if (cardEl) cardEl.className = `kpi-card${level !== 'safe' ? ' state-' + level : ''}`;

  const sbEl = document.getElementById(`sb${cap(key)}`);
  const sbVal = document.getElementById(`sb${cap(key)}Val`);
  if (sbEl) sbEl.style.width = `${pct}%`;
  if (sbVal) sbVal.textContent = key === 'gas' ? value.toFixed(0) : value.toFixed(1);
}

function calcScore(temp, hum, gas) {
  let s = 100;
  s -= penalty(temp, THRESH.temp, 33);
  s -= penalty(hum, THRESH.hum, 33);
  s -= penalty(gas, THRESH.gas, 34);
  return Math.max(0, Math.round(s));
}

function penalty(v, t, mp) {
  if (v <= t.warn) return 0;
  if (v >= t.danger) return mp;
  return Math.round(((v - t.warn) / (t.danger - t.warn)) * mp);
}

function updateScoreUI(score, temp, hum, gas) {
  const numEl = document.getElementById('scoreNum');
  const lblEl = document.getElementById('scoreLabel');
  const vrdEl = document.getElementById('scoreVerdict');
  const chipEl = document.getElementById('scoreChip');

  if (numEl) numEl.textContent = score;
  if (lblEl) lblEl.textContent = `Score: ${score}`;

  let lvl = 'safe', txt = 'All Clear';
  if (score < 50) { lvl = 'danger'; txt = 'Critical Danger'; }
  else if (score < 75) { lvl = 'warn'; txt = 'Caution'; }

  if (vrdEl) { vrdEl.textContent = txt; vrdEl.className = `score-verdict ${lvl === 'safe' ? '' : lvl}`; }
  if (chipEl) chipEl.className = `score-chip ${lvl === 'safe' ? '' : lvl}`;
  if (window.drawScoreRing) window.drawScoreRing('scoreRing', score);
}

// ─────────────────────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────────────────────
function updateAnalytics(temp, hum, gas) {
  const n = history.temp.length;
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  setText('aAvgTemp', avg(history.temp).toFixed(1));
  setText('aAvgHum', avg(history.hum).toFixed(1));
  setText('aAvgGas', avg(history.gas).toFixed(0));
  setText('aReadings', n);

  // Min/Max
  const mn = a => Math.min(...a), mx = a => Math.max(...a);
  const fmtT = v => v.toFixed(1) + '°C';
  const fmtH = v => v.toFixed(1) + '%';
  const fmtG = v => v.toFixed(0) + ' ppm';

  setText('mmTempMin', fmtT(mn(history.temp)));
  setText('mmTempMax', fmtT(mx(history.temp)));
  setText('mmTempRange', (mx(history.temp) - mn(history.temp)).toFixed(1) + '°C');

  setText('mmHumMin', fmtH(mn(history.hum)));
  setText('mmHumMax', fmtH(mx(history.hum)));
  setText('mmHumRange', (mx(history.hum) - mn(history.hum)).toFixed(1) + '%');

  setText('mmGasMin', fmtG(mn(history.gas)));
  setText('mmGasMax', fmtG(mx(history.gas)));
  setText('mmGasRange', (mx(history.gas) - mn(history.gas)).toFixed(0) + ' ppm');

  // Uptime
  const secs = Math.floor((Date.now() - sessionStart) / 1000);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  setText('aUptime', `${mm}m ${ss}s`);

  // Charts rendered on tab visit
}

function renderCharts() {
  if (!window.drawLineChart) return;
  if (history.temp.length < 2) return;
  window.drawLineChart('chartTemp', history.temp, '#E8730A', 0, 100, THRESH.temp.danger, THRESH.temp.warn);
  window.drawLineChart('chartHum', history.hum, '#0E6BB5', 0, 100, THRESH.hum.danger, THRESH.hum.warn);
  window.drawLineChart('chartGas', history.gas, '#6D28D9', 0, 1000, THRESH.gas.danger, THRESH.gas.warn);
}

// ─────────────────────────────────────────────────────────────
//  ALERTS
// ─────────────────────────────────────────────────────────────
function checkAlerts(temp, hum, gas, ts) {
  const violations = [];

  if (temp >= THRESH.temp.danger) violations.push({ msg: `Temperature critical: ${temp.toFixed(1)}°C (limit ${THRESH.temp.danger}°C)`, lvl: 'danger' });
  else if (temp >= THRESH.temp.warn) violations.push({ msg: `Temperature warning: ${temp.toFixed(1)}°C`, lvl: 'warn' });

  if (hum >= THRESH.hum.danger) violations.push({ msg: `Humidity critical: ${hum.toFixed(1)}% (limit ${THRESH.hum.danger}%)`, lvl: 'danger' });
  else if (hum >= THRESH.hum.warn) violations.push({ msg: `Humidity warning: ${hum.toFixed(1)}%`, lvl: 'warn' });

  if (gas >= THRESH.gas.danger) violations.push({ msg: `Gas level critical: ${gas.toFixed(0)} ppm (limit ${THRESH.gas.danger})`, lvl: 'danger' });
  else if (gas >= THRESH.gas.warn) violations.push({ msg: `Gas warning: ${gas.toFixed(0)} ppm`, lvl: 'warn' });

  const hasDanger = violations.some(v => v.lvl === 'danger');
  const hasWarn = violations.some(v => v.lvl === 'warn');

  // Top strip
  if (THRESH.notif.strip && violations.length) {
    const strip = document.getElementById('alertStrip');
    const msgEl = document.getElementById('alertMessage');
    if (strip && msgEl) {
      msgEl.textContent = violations.map(v => v.msg).join('  ·  ');
      strip.style.display = 'flex';
    }
  }

  // Sound
  if (THRESH.notif.sound && hasDanger) playBeep();

  // Browser notification
  if (THRESH.notif.browser && violations.length && typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      new Notification('SmartHelmet Alert', {
        body: violations[0].msg,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="%23DC2626"/></svg>'
      });
    }
  }

  // Nav badge
  const badge = document.getElementById('navBadge');
  if (badge) {
    if (violations.length) {
      badge.textContent = violations.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  // Feed
  violations.forEach(v => addFeedItem(v.msg, v.lvl, ts));

  // Counters
  if (hasDanger) dangerCount++;
  else if (hasWarn) warnCount++;
  else safeCount++;

  setText('aDangerCount', dangerCount);
  setText('aWarnCount', warnCount);
  setText('aSafeCount', safeCount);

  const secs = Math.floor((Date.now() - sessionStart) / 1000);
  setText('aUptime', `${Math.floor(secs / 60)}m ${secs % 60}s`);
}

function addFeedItem(msg, lvl, ts) {
  alertFeedRecords.unshift({ msg, lvl, ts });
  if (alertFeedRecords.length > 100) { alertFeedRecords.pop(); }

  const feed = document.getElementById('alertFeed');
  if (!feed) return;
  const empty = feed.querySelector('.alert-feed-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `feed-item ${lvl}`;
  div.innerHTML = `<span class="feed-dot"></span><div class="feed-content"><div class="feed-msg">${msg}</div><div class="feed-time">${ts}</div></div>`;
  feed.insertBefore(div, feed.firstChild);
}

window.clearAlertFeed = () => {
  alertFeedRecords = [];
  saveSessionState();
  const feed = document.getElementById('alertFeed');
  if (feed) { feed.innerHTML = '<div class="alert-feed-empty">Feed cleared.</div>'; }
};

window.dismissTopAlert = () => {
  const s = document.getElementById('alertStrip');
  if (s) s.style.display = 'none';
};

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; gain.gain.value = 0.15;
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch { }
}

// ─────────────────────────────────────────────────────────────
//  EVENT LOG (Dashboard)
// ─────────────────────────────────────────────────────────────
function addLogRow(ts, temp, hum, gas) {
  const score = calcScore(temp, hum, gas);
  const lvl = score >= 75 ? 'safe' : score >= 50 ? 'warn' : 'danger';
  const lbl = { safe: 'Normal', warn: 'Warning', danger: 'Danger' }[lvl];

  logRowsData.unshift({ ts, temp, hum, gas, lvl, lbl });
  if (logRowsData.length > 50) { logRowsData.pop(); }

  const tbody = document.getElementById('logBody');
  if (!tbody) return;
  const empty = tbody.querySelector('.log-empty');
  if (empty) empty.remove();

  const tr = document.createElement('tr');
  tr.className = 'row-flash';
  tr.innerHTML = `
    <td>${ts}</td>
    <td style="color:var(--temp)">${temp.toFixed(1)}</td>
    <td style="color:var(--hum)">${hum.toFixed(1)}</td>
    <td style="color:var(--gas)">${gas.toFixed(0)}</td>
    <td><span class="log-pill ${lvl}">${lbl}</span></td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}

window.clearLog = () => {
  logRowsData = [];
  saveSessionState();
  const tbody = document.getElementById('logBody');
  if (tbody) { tbody.innerHTML = '<tr class="log-empty"><td colspan="5">Log cleared.</td></tr>'; }
};

// ─────────────────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────────────────
function applySettingsToUI() {
  const fields = [
    ['TempWarn', THRESH.temp.warn], ['TempDanger', THRESH.temp.danger],
    ['HumWarn', THRESH.hum.warn], ['HumDanger', THRESH.hum.danger],
    ['GasWarn', THRESH.gas.warn], ['GasDanger', THRESH.gas.danger],
  ];
  fields.forEach(([k, v]) => {
    const sl = document.getElementById(`sl${k}`); if (sl) sl.value = v;
    const inp = document.getElementById(`in${k}`); if (inp) inp.value = v;
  });

  const togBrowser = document.getElementById('togBrowserNotif');
  const togSound = document.getElementById('togSound');
  const togStrip = document.getElementById('togStrip');
  if (togBrowser) togBrowser.checked = THRESH.notif.browser;
  if (togSound) togSound.checked = THRESH.notif.sound;
  if (togStrip) togStrip.checked = THRESH.notif.strip;

  updateThresholdDisplays();
}

function updateDashboardThresholdLabels() {
  // Temp
  const tempWarnEl = document.querySelector('#kpiTemp .warn-marker');
  const tempDangerEl = document.querySelector('#kpiTemp .danger-marker');
  if (tempWarnEl) tempWarnEl.textContent = `Warn ${THRESH.temp.warn}°`;
  if (tempDangerEl) tempDangerEl.textContent = `Danger ${THRESH.temp.danger}°`;

  // Hum
  const humWarnEl = document.querySelector('#kpiHum .warn-marker');
  const humDangerEl = document.querySelector('#kpiHum .danger-marker');
  if (humWarnEl) humWarnEl.textContent = `Warn ${THRESH.hum.warn}%`;
  if (humDangerEl) humDangerEl.textContent = `Danger ${THRESH.hum.danger}%`;

  // Gas
  const gasWarnEl = document.querySelector('#kpiGas .warn-marker');
  const gasDangerEl = document.querySelector('#kpiGas .danger-marker');
  if (gasWarnEl) gasWarnEl.textContent = `Warn ${THRESH.gas.warn}`;
  if (gasDangerEl) gasDangerEl.textContent = `Danger ${THRESH.gas.danger}`;
}

function updateThresholdDisplays() {
  setText('dispTempWarn', THRESH.temp.warn);
  setText('dispTempDanger', THRESH.temp.danger);
  setText('dispHumWarn', THRESH.hum.warn);
  setText('dispHumDanger', THRESH.hum.danger);
  setText('dispGasWarn', THRESH.gas.warn);
  setText('dispGasDanger', THRESH.gas.danger);
  updateDashboardThresholdLabels();
}

window.syncSlider = (key, val) => {
  const inp = document.getElementById(`in${key}`); if (inp) inp.value = val;
  applyThreshFromInputs();
};

window.syncInput = (key, val) => {
  const sl = document.getElementById(`sl${key}`); if (sl) sl.value = val;
  applyThreshFromInputs();
};

function applyThreshFromInputs() {
  const get = id => parseFloat(document.getElementById(id)?.value) || 0;
  THRESH.temp.warn = get('inTempWarn');
  THRESH.temp.danger = get('inTempDanger');
  THRESH.hum.warn = get('inHumWarn');
  THRESH.hum.danger = get('inHumDanger');
  THRESH.gas.warn = get('inGasWarn');
  THRESH.gas.danger = get('inGasDanger');
}

window.saveSettings = () => {
  applyThreshFromInputs();
  persistSettings();
  updateThresholdDisplays();
  const saved = document.getElementById('settingsSaved');
  if (saved) {
    saved.style.display = 'block';
    setTimeout(() => { saved.style.display = 'none'; }, 2500);
  }
};

window.resetSettings = () => {
  THRESH = defaultSettings();
  applySettingsToUI();
  persistSettings();
  updateThresholdDisplays();
};

window.saveNotifSettings = () => {
  THRESH.notif.browser = document.getElementById('togBrowserNotif')?.checked || false;
  THRESH.notif.sound = document.getElementById('togSound')?.checked || false;
  THRESH.notif.strip = document.getElementById('togStrip')?.checked !== false;
  persistSettings();

  // Request browser notification permission if toggled on
  if (typeof Notification !== 'undefined' && THRESH.notif.browser && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

// ─────────────────────────────────────────────────────────────
//  CONNECTION
// ─────────────────────────────────────────────────────────────
function setConnection(live) {
  const dot = document.getElementById('connDot');
  const label = document.getElementById('connLabel');
  const info = document.getElementById('infoConn');
  const mhDot = document.getElementById('mhConnDot');
  if (dot) dot.className = `conn-dot ${live ? 'live' : 'offline'}`;
  if (label) label.textContent = live ? 'Live' : 'Offline';
  if (info) info.textContent = live ? '🟢 Connected' : '🔴 Disconnected';
  if (mhDot) mhDot.className = `conn-dot ${live ? 'live' : 'offline'}`;
}

// ─────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id); if (el) el.textContent = val;
}

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────
loadSessionState();
applySettingsToUI();

// Populate UI components from loaded state
const lastIdx = history.temp.length - 1;
if (lastIdx >= 0) {
  const temp = history.temp[lastIdx];
  const hum = history.hum[lastIdx];
  const gas = history.gas[lastIdx];
  const ts = history.ts[lastIdx];
  updateDashboard(temp, hum, gas, ts);
  const timestampEl = document.getElementById('lastTimestamp');
  if (timestampEl) timestampEl.textContent = ts;
}

// Populate Dashboard Log Table
const tbody = document.getElementById('logBody');
if (tbody && logRowsData.length > 0) {
  const empty = tbody.querySelector('.log-empty');
  if (empty) empty.remove();
  tbody.innerHTML = '';
  logRowsData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.ts}</td>
      <td style="color:var(--temp)">${row.temp.toFixed(1)}</td>
      <td style="color:var(--hum)">${row.hum.toFixed(1)}</td>
      <td style="color:var(--gas)">${row.gas.toFixed(0)}</td>
      <td><span class="log-pill ${row.lvl}">${row.lbl}</span></td>`;
    tbody.appendChild(tr);
  });
}

// Populate Analytics views
if (document.getElementById('page-analytics') && history.temp.length > 0) {
  updateAnalytics();
  setTimeout(renderCharts, 200);
}

// Populate Alerts Feed
const feed = document.getElementById('alertFeed');
if (feed && alertFeedRecords.length > 0) {
  const empty = feed.querySelector('.alert-feed-empty');
  if (empty) empty.remove();
  feed.innerHTML = '';
  alertFeedRecords.forEach(v => {
    const div = document.createElement('div');
    div.className = `feed-item ${v.lvl}`;
    div.innerHTML = `<span class="feed-dot"></span><div class="feed-content"><div class="feed-msg">${v.msg}</div><div class="feed-time">${v.ts}</div></div>`;
    feed.appendChild(div);
  });
}

// Populate alert counters
setText('aDangerCount', dangerCount);
setText('aWarnCount', warnCount);
setText('aSafeCount', safeCount);

// Highlight current page in sidebar on load
const currentPath = window.location.pathname;
let currentPage = 'dashboard';
if (currentPath.includes('analytics.html')) currentPage = 'analytics';
else if (currentPath.includes('alerts.html')) currentPage = 'alerts';
else if (currentPath.includes('compliance.html')) currentPage = 'compliance';
else if (currentPath.includes('settings.html')) currentPage = 'settings';

document.querySelectorAll('.nav-item').forEach(el => {
  if (el.dataset.page === currentPage) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
});

// Synchronize thresholds in real-time across open tabs/windows
window.addEventListener('storage', (e) => {
  if (e.key === 'smSettings') {
    THRESH = loadSettings();
    applySettingsToUI();
    const lastIdx = history.temp.length - 1;
    if (lastIdx >= 0) {
      updateDashboard(history.temp[lastIdx], history.hum[lastIdx], history.gas[lastIdx], history.ts[lastIdx]);
    } else {
      updateDashboardThresholdLabels();
    }
  }
});
