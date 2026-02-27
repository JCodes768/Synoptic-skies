/**
 * Synoptic Skies — Main Application
 * Orchestrates data fetching, rendering, and UI interactions.
 */

import { fetchLatestAFD, fetchCurrentConditions, fetchForecast, fetchHourlyForecast, fetchAlerts, lookupLocation, CONFIG } from './api.js';
import { parseAFD, bodyToHTML } from './afd-parser.js';
import { loadGlossary, initGlossaryUI, highlightTerms, selectTermOfTheDay, showTermOfTheDay, buildAfdTermList } from './glossary.js';
import { initSatellite } from './satellite.js';
import { initTheme } from './theme.js';

// ── Weather Icons Integration ───────────────────────────────
// Using Weather Icons by Erik Flowers
// https://github.com/erikflowers/weather-icons

/**
 * Map NWS short forecast text to a Weather Icons class name.
 *
 * Strategy:
 *   - Precipitation & phenomena → always neutral (no sun/moon)
 *   - Cloud-dominant (mostly cloudy, overcast) → neutral cloud
 *   - Mixed (partly cloudy/sunny) → day/night cloud variant
 *   - Sun-dominant (mostly sunny/clear) → day/night sunny variant
 *   - Clear/sunny → day/night sunny
 */
function getIconClass(shortForecast, isDaytime = true) {
  const text = shortForecast.toLowerCase();

  // Precipitation & phenomena — always neutral, no sun/moon
  if (text.includes('thunder') || text.includes('tstm')) return 'wi-thunderstorm';
  if (text.includes('blizzard')) return 'wi-snow-wind';
  if (text.includes('sleet') || text.includes('freezing rain')) return 'wi-sleet';
  if (text.includes('snow') || text.includes('flurr')) return 'wi-snow';
  if (text.includes('heavy rain')) return 'wi-showers';
  if (text.includes('rain') && text.includes('wind')) return 'wi-rain-wind';
  if (text.includes('shower')) return 'wi-showers';
  if (text.includes('light rain')) return 'wi-sprinkle';
  if (text.includes('rain')) return 'wi-rain';
  if (text.includes('drizzle')) return 'wi-sprinkle';
  if (text.includes('fog') || text.includes('mist')) return 'wi-fog';
  if (text.includes('haze') || text.includes('smoke')) return 'wi-dust';
  if (text.includes('wind') && !text.includes('cloud')) return 'wi-strong-wind';

  // Cloud-dominant — neutral cloud
  if (text.includes('overcast')) return 'wi-cloudy';
  if (text.includes('mostly cloudy')) return 'wi-cloudy';

  // Mixed — day/night variant (sun/moon peeking through clouds)
  if (text.includes('partly cloudy') || text.includes('partly sunny')) return isDaytime ? 'wi-day-cloudy' : 'wi-night-alt-cloudy';

  // Sun-dominant — day/night sunny (a few clouds, but mostly clear)
  if (text.includes('mostly sunny') || text.includes('mostly clear')) return isDaytime ? 'wi-day-sunny' : 'wi-night-clear';

  // Clear/sunny
  if (text.includes('sunny') || text.includes('clear')) return isDaytime ? 'wi-day-sunny' : 'wi-night-clear';

  // Generic cloud fallback
  if (text.includes('cloud')) return 'wi-cloudy';

  return isDaytime ? 'wi-day-sunny' : 'wi-night-clear';
}

function weatherIconHTML(shortForecast, isDaytime = true, size = '48') {
  const iconClass = getIconClass(shortForecast, isDaytime);
  return `<i class="wi ${iconClass} weather-icon" style="font-size: ${size}px;"></i>`;
}

/**
 * Is it currently daytime? (rough check for icon selection)
 */
function isDaytimeNow() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 20;
}

// ── Moon Phase ──────────────────────────────────────────────

const MOON_ICON_CLASSES = [
  'wi-moon-new',
  'wi-moon-waxing-crescent-1', 'wi-moon-waxing-crescent-2', 'wi-moon-waxing-crescent-3',
  'wi-moon-waxing-crescent-4', 'wi-moon-waxing-crescent-5', 'wi-moon-waxing-crescent-6',
  'wi-moon-first-quarter',
  'wi-moon-waxing-gibbous-1', 'wi-moon-waxing-gibbous-2', 'wi-moon-waxing-gibbous-3',
  'wi-moon-waxing-gibbous-4', 'wi-moon-waxing-gibbous-5', 'wi-moon-waxing-gibbous-6',
  'wi-moon-full',
  'wi-moon-waning-gibbous-1', 'wi-moon-waning-gibbous-2', 'wi-moon-waning-gibbous-3',
  'wi-moon-waning-gibbous-4', 'wi-moon-waning-gibbous-5', 'wi-moon-waning-gibbous-6',
  'wi-moon-third-quarter',
  'wi-moon-waning-crescent-1', 'wi-moon-waning-crescent-2', 'wi-moon-waning-crescent-3',
  'wi-moon-waning-crescent-4', 'wi-moon-waning-crescent-5', 'wi-moon-waning-crescent-6',
];

const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent', 'Waxing Crescent', 'Waxing Crescent',
  'Waxing Crescent', 'Waxing Crescent', 'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous', 'Waxing Gibbous', 'Waxing Gibbous',
  'Waxing Gibbous', 'Waxing Gibbous', 'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous', 'Waning Gibbous', 'Waning Gibbous',
  'Waning Gibbous', 'Waning Gibbous', 'Waning Gibbous',
  'Third Quarter',
  'Waning Crescent', 'Waning Crescent', 'Waning Crescent',
  'Waning Crescent', 'Waning Crescent', 'Waning Crescent',
];

/**
 * Calculate the current moon phase index (0–27) based on a known new moon.
 * Reference new moon: 2024-01-11T11:57Z
 */
function getMoonPhaseIndex(date = new Date()) {
  const LUNAR_CYCLE = 29.53058770576;
  const knownNewMoon = new Date('2024-01-11T11:57:00Z');
  const daysSince = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  const phase = ((daysSince % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;
  return Math.round(phase / LUNAR_CYCLE * 28) % 28;
}

function getMoonPhase(date) {
  const idx = getMoonPhaseIndex(date);
  return { iconClass: MOON_ICON_CLASSES[idx], name: MOON_PHASE_NAMES[idx] };
}

// ── Text Size Controls ──────────────────────────────────────

const TEXT_SIZE_KEY = 'synoptic-skies-text-scale';
let textScale = parseFloat(localStorage.getItem(TEXT_SIZE_KEY) || '1');

function initTextSize() {
  applyTextScale();

  const decrease = document.getElementById('text-decrease');
  const increase = document.getElementById('text-increase');

  if (decrease) decrease.addEventListener('click', () => adjustTextSize(-0.1));
  if (increase) increase.addEventListener('click', () => adjustTextSize(0.1));
}

function adjustTextSize(delta) {
  textScale = Math.max(0.75, Math.min(1.5, textScale + delta));
  localStorage.setItem(TEXT_SIZE_KEY, textScale.toString());
  applyTextScale();
}

function applyTextScale() {
  document.documentElement.style.setProperty('--text-size-adjust', textScale.toString());
}

// ── Rendering Functions ─────────────────────────────────────

function renderCurrentConditions(data) {
  const el = document.getElementById('current-conditions');
  if (!el) return;

  const daytime = isDaytimeNow();
  const icon = weatherIconHTML(data.textDescription, daytime, '32');

  el.innerHTML = `
    <div class="conditions-compact">
      <div class="conditions-icon">${icon}</div>
      <span class="temp-value">${data.temperature ?? '--'}\u00B0F</span>
      <span class="temp-desc">${escapeHTML(data.textDescription)}</span>
    </div>
    <div class="conditions-details-compact">
      <span class="detail-compact"><span class="detail-label">Wind</span> ${data.windDirection} ${data.windSpeed ?? '--'} mph${data.windGust ? ` (G${data.windGust})` : ''}</span>
      <span class="detail-compact"><span class="detail-label">Dew Pt</span> ${data.dewpoint ?? '--'}\u00B0F</span>
      <span class="detail-compact"><i class="wi ${getMoonPhase().iconClass} moon-phase-icon"></i> ${getMoonPhase().name}</span>
    </div>
  `;

  el.classList.remove('loading');
}

function renderHourlyForecast(periods) {
  const el = document.getElementById('hourly-forecast');
  if (!el || !periods || periods.length === 0) return;

  // Skip the current hour — start from the next one
  const now = new Date();
  const startIdx = periods.findIndex(p => new Date(p.startTime) > now);
  const hours = periods.slice(startIdx >= 0 ? startIdx : 1, (startIdx >= 0 ? startIdx : 1) + 72);
  const temps = hours.map(h => h.temperature);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp || 1;

  let lastDate = null;
  let html = '<div class="hourly-day-sep"><span>Hourly</span></div>';

  hours.forEach((hour, i) => {
    const dt = new Date(hour.startTime);
    const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short' });

    // Day separator
    if (lastDate !== null && dateStr !== lastDate) {
      html += `<div class="hourly-day-sep"><span>${dateStr}</span></div>`;
    }
    lastDate = dateStr;

    // Time label
    const timeLabel = dt.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });

    // Icon
    const icon = weatherIconHTML(hour.shortForecast, hour.isDaytime, '16');

    // Precip — only show if >= 15%
    const precip = hour.precipChance != null && hour.precipChance >= 15
      ? `<div class="hourly-precip"><i class="wi wi-raindrop"></i> ${hour.precipChance}%</div>`
      : '<div class="hourly-precip"></div>';

    // Store normalized temp position (0=coldest, 1=warmest) for CSS-driven color
    const t = ((hour.temperature - minTemp) / tempRange).toFixed(3);

    html += `
      <div class="hourly-item">
        <div class="hourly-time">${escapeHTML(timeLabel)}</div>
        <div class="hourly-icon">${icon}</div>
        ${precip}
        <div class="hourly-temp" data-t="${t}">${hour.temperature}&deg;</div>
      </div>
    `;
  });

  el.innerHTML = `<div class="hourly-forecast">${html}</div>`;
  colorizeHourlyTemps();
}

function colorizeHourlyTemps() {
  const style = getComputedStyle(document.documentElement);
  const warm = style.getPropertyValue('--color-temp-warm').trim().split(',').map(Number);
  const cold = style.getPropertyValue('--color-temp-cold').trim().split(',').map(Number);

  document.querySelectorAll('.hourly-temp[data-t]').forEach(el => {
    const t = parseFloat(el.dataset.t);
    const r = Math.round(cold[0] + (warm[0] - cold[0]) * t);
    const g = Math.round(cold[1] + (warm[1] - cold[1]) * t);
    const b = Math.round(cold[2] + (warm[2] - cold[2]) * t);
    el.style.color = `rgb(${r},${g},${b})`;
  });
}

function renderForecast(periods) {
  const el = document.getElementById('forecast');
  if (!el) return;

  const display = periods.slice(0, 10);

  el.innerHTML = display.map((period, i) => {
    const icon = weatherIconHTML(period.shortForecast, period.isDaytime, '28');
    const precipTag = period.precipChance != null && period.precipChance >= 15
      ? ` <span class="forecast-precip">(${period.precipChance}%)</span>`
      : '';
    // Calculate moon phase for this period's date
    const periodDate = new Date(period.startTime);
    const moonIcon = !period.isDaytime
      ? `<i class="wi ${getMoonPhase(periodDate).iconClass} forecast-moon"></i>`
      : '';
    return `
      <div class="forecast-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-name-row">
          <span class="forecast-name">${escapeHTML(period.name)}</span>
          ${moonIcon}
          <span class="forecast-temp">${period.temperature}\u00B0${period.temperatureUnit}</span>
        </div>
        <div class="forecast-desc">${escapeHTML(period.shortForecast)}${precipTag}</div>
      </div>
    `;
  }).join('');

  el.classList.remove('loading');
}

function renderAFD(parsed) {
  const container = document.getElementById('afd-content');
  const supplementalContainer = document.getElementById('supplemental-content');
  if (!container) return;

  // Update header timestamp
  const timestampEl = document.getElementById('afd-timestamp');
  if (timestampEl && parsed.timestamp) {
    timestampEl.textContent = parsed.timestamp;
  }

  container.innerHTML = '';

  // Separate main vs supplemental sections
  const mainSections = parsed.sections.filter(s => !s.isSupplemental);
  const supplementalSections = parsed.sections.filter(s => s.isSupplemental);

  for (const section of mainSections) {
    if (section.isWWA && section.body.trim().toLowerCase() === 'none.') continue;
    container.appendChild(buildSectionElement(section));
  }

  container.classList.remove('loading');

  // Render supplemental sections (Marine, Aviation)
  if (supplementalContainer && supplementalSections.length > 0) {
    const wrapper = document.getElementById('supplemental-wrapper');
    if (wrapper) wrapper.style.display = 'block';

    for (const section of supplementalSections) {
      supplementalContainer.appendChild(buildSectionElement(section));
    }
  }

  // Highlight glossary terms in both containers
  highlightTerms(container);
  if (supplementalContainer) highlightTerms(supplementalContainer);
}

function buildSectionElement(section) {
  const sectionEl = document.createElement('section');
  sectionEl.className = `afd-section${section.isSpecial ? ' afd-section-special' : ''}${section.isWWA ? ' afd-section-alert' : ''}`;
  sectionEl.setAttribute('data-section', section.name);

  const headerHTML = `
    <div class="afd-section-header ${section.collapsed ? 'collapsible collapsed' : 'collapsible'}">
      <h2 class="afd-section-title">
        ${section.collapsed ? '<span class="collapse-indicator" aria-hidden="true"></span>' : ''}
        ${escapeHTML(section.displayName)}
      </h2>
      ${section.timeRange ? `<span class="afd-section-range">${escapeHTML(section.timeRange)}</span>` : ''}
      ${section.timestamp ? `<span class="afd-section-range">Issued ${escapeHTML(section.timestamp)}</span>` : ''}
      ${section.author ? `<span class="afd-section-author">Forecaster: ${escapeHTML(section.author)}</span>` : ''}
    </div>
  `;

  const bodyHTML = bodyToHTML(section.body, section.isSpecial);

  sectionEl.innerHTML = `
    ${headerHTML}
    <div class="afd-section-body ${section.collapsed ? 'collapsed' : ''}">${bodyHTML}</div>
  `;

  if (section.collapsed) {
    const header = sectionEl.querySelector('.afd-section-header');
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      sectionEl.querySelector('.afd-section-body').classList.toggle('collapsed');
    });
    header.style.cursor = 'pointer';
  }

  return sectionEl;
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts');
  if (!el) return;

  if (!alerts || alerts.length === 0) {
    el.innerHTML = `<div class="alerts-inline-none"><span class="alerts-label">Active Weather Alerts:</span> None</div>`;
    return;
  }

  el.innerHTML = `
    <div class="alerts-inline-header"><span class="alerts-label">Active Weather Alerts</span></div>
    ${alerts.map(alert => `
      <div class="alert-item alert-${alert.severity.toLowerCase()}">
        <div class="alert-event">${escapeHTML(alert.event)}</div>
        <div class="alert-headline">${escapeHTML(alert.headline || '')}</div>
      </div>
    `).join('')}
  `;
}

function renderForecasterCard(authors) {
  const el = document.getElementById('forecaster-card');
  if (!el) return;

  const names = [...new Set(Object.values(authors))];
  if (names.length === 0) {
    el.style.display = 'none';
    return;
  }

  el.innerHTML = `
    <h3 class="widget-title">Today's Forecasters</h3>
    <div class="forecaster-names">${names.map(n => `<strong>${escapeHTML(n)}</strong>`).join(', ')}</div>
    <div class="forecaster-credit">authored today's forecast discussion</div>
  `;
  el.style.display = 'block';
}

// ── The Gist (AI Summary) ───────────────────────────────────

const GIST_CACHE_KEY = 'synoptic-skies-gist';
let currentAfdText = null;
let currentAfdId = null;
let currentPointForecast = null;

function initGist() {
  const btn = document.getElementById('gist-btn');
  if (!btn) return;

  // Check for cached summary (keyed by AFD ID + location)
  const cacheId = `${currentAfdId}-${CONFIG.officeCity}`;
  try {
    const cached = sessionStorage.getItem(GIST_CACHE_KEY);
    if (cached) {
      const { summary, id } = JSON.parse(cached);
      if (id && id === cacheId) {
        showGistSummary(summary);
        return;
      }
    }
  } catch (e) { /* ignore */ }

  btn.addEventListener('click', fetchGistSummary);
}

async function fetchGistSummary() {
  const contentEl = document.getElementById('gist-content');
  if (!contentEl || !currentAfdText) return;

  contentEl.innerHTML = '<p class="gist-loading">Generating summary&hellip;</p>';

  try {
    const response = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        afdText: currentAfdText,
        afdId: currentAfdId,
        location: `${CONFIG.officeCity}, ${CONFIG.officeState}`,
        pointForecast: currentPointForecast
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const summary = data.summary;

    // Cache the result (keyed by AFD ID + location)
    try {
      sessionStorage.setItem(GIST_CACHE_KEY, JSON.stringify({
        summary,
        id: `${currentAfdId}-${CONFIG.officeCity}`
      }));
    } catch (e) { /* ok */ }

    showGistSummary(summary);
  } catch (err) {
    console.error('Gist fetch failed:', err);
    contentEl.innerHTML = `
      <p class="gist-error">Unable to generate summary: ${escapeHTML(err.message)}</p>
      <button id="gist-btn" class="gist-btn" style="margin-top:var(--space-sm)">Retry</button>
    `;
    contentEl.querySelector('#gist-btn')?.addEventListener('click', fetchGistSummary);
  }
}

function showGistSummary(summary) {
  const contentEl = document.getElementById('gist-content');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <p class="gist-text">${escapeHTML(summary)}</p>
    <p class="gist-disclaimer">AI-generated summaries can make mistakes. The point of this site is to behold the human-crafted forecasts — so read on! <a href="about-afd.html">About the AFD</a></p>
  `;
}

// ── Loading & Error States ──────────────────────────────────

function showLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.add('loading');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.remove('loading');
    el.innerHTML = `<div class="error-message">${escapeHTML(message)}</div>`;
  }
}

// ── Zip Code Location ───────────────────────────────────────

const LOCATION_STORAGE_KEY = 'synoptic-skies-location';

function initLocationInput() {
  const form = document.getElementById('zip-form');
  const input = document.getElementById('zip-input');
  const status = document.getElementById('zip-status');
  if (!form || !input) return;

  // Restore saved location
  const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
  if (saved) input.value = saved;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) {
      if (status) status.textContent = 'Enter a zip or city, state';
      return;
    }

    if (status) status.textContent = 'Looking up...';
    input.disabled = true;

    try {
      await lookupLocation(query);
      localStorage.setItem(LOCATION_STORAGE_KEY, query);
      updateHeaderForLocation();
      await loadAllData();
      if (status) status.textContent = '';
    } catch (err) {
      console.error('Location lookup failed:', err);
      if (status) status.textContent = err.message || 'Lookup failed';
    } finally {
      input.disabled = false;
    }
  });
}

function updateHeaderForLocation() {
  const subtitleEl = document.querySelector('.header-subtitle');
  if (!subtitleEl) return;

  const timestampEl = document.getElementById('afd-timestamp');
  const timeText = timestampEl?.textContent || 'Loading\u2026';

  subtitleEl.innerHTML = `
    <strong>${escapeHTML(CONFIG.officeCity)}, ${escapeHTML(CONFIG.officeState)}</strong> &mdash;
    forecast issued by NWS <strong>${escapeHTML(CONFIG.officeName)}</strong> (WFO ${escapeHTML(CONFIG.office)}) &middot;
    <span id="afd-timestamp">${escapeHTML(timeText)}</span>
  `;

  document.title = `Synoptic Skies \u2014 ${CONFIG.officeName} Area Forecast Discussion`;
}

// ── Initialization ──────────────────────────────────────────

async function init() {
  initTheme();
  initTextSize();
  initLocationInput();

  // Set up glossary sidebar
  const glossarySidebar = document.getElementById('glossary-content');
  initGlossaryUI(glossarySidebar);

  // Load glossary data first (needed before AFD rendering)
  await loadGlossary();

  // Check for saved location and apply it before loading data; fall back to 94131
  const savedLocation = localStorage.getItem(LOCATION_STORAGE_KEY) || '94131';
  try {
    await lookupLocation(savedLocation);
    updateHeaderForLocation();
  } catch (e) {
    console.warn('Location lookup failed, using built-in default:', e);
    if (savedLocation !== '94131') localStorage.removeItem(LOCATION_STORAGE_KEY);
  }

  // Re-colorize hourly temps when theme toggles
  new MutationObserver(() => colorizeHourlyTemps())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  await loadAllData();
}

async function loadAllData() {
  // Show loading states
  showLoading('current-conditions');
  showLoading('forecast');
  showLoading('afd-content');

  // Clear supplemental container
  const supplementalContainer = document.getElementById('supplemental-content');
  if (supplementalContainer) supplementalContainer.innerHTML = '';
  const supplementalWrapper = document.getElementById('supplemental-wrapper');
  if (supplementalWrapper) supplementalWrapper.style.display = 'none';

  // Reset Gist state
  currentAfdText = null;
  currentAfdId = null;
  const gistContent = document.getElementById('gist-content');
  if (gistContent) {
    gistContent.innerHTML = '<button id="gist-btn" class="gist-btn">Summarize the forecast, and/or read the human\'s below</button>';
  }

  // Fetch all API data in parallel
  const [afdResult, conditionsResult, forecastResult, hourlyResult, alertsResult] = await Promise.allSettled([
    fetchLatestAFD(),
    fetchCurrentConditions(),
    fetchForecast(),
    fetchHourlyForecast(),
    fetchAlerts()
  ]);

  // Render AFD
  if (afdResult.status === 'fulfilled') {
    const parsed = parseAFD(afdResult.value.productText);

    // Enhance "What Has Changed" heading with previous issuance time
    if (afdResult.value.previousIssuanceTime) {
      const whcSection = parsed.sections.find(s => s.name === 'WHAT HAS CHANGED');
      if (whcSection) {
        whcSection.displayName = `What Has Changed since ${formatPreviousTime(afdResult.value.previousIssuanceTime)}`;
      }
    }

    renderAFD(parsed);
    renderForecasterCard(parsed.authors);

    // Store AFD for Gist feature
    currentAfdText = afdResult.value.productText;
    currentAfdId = afdResult.value.id;
    initGist();

    // Select and show term of the day based on AFD content
    selectTermOfTheDay(afdResult.value.productText);
    buildAfdTermList(afdResult.value.productText);
    showTermOfTheDay();
  } else {
    showError('afd-content', 'Unable to load forecast discussion. The NWS API may be temporarily unavailable.');
    console.error('AFD fetch failed:', afdResult.reason);
  }

  // Render current conditions
  if (conditionsResult.status === 'fulfilled') {
    renderCurrentConditions(conditionsResult.value);
  } else {
    showError('current-conditions', 'Unable to load current conditions.');
    console.error('Conditions fetch failed:', conditionsResult.reason);
  }

  // Render hourly forecast
  if (hourlyResult.status === 'fulfilled') {
    renderHourlyForecast(hourlyResult.value);
  }

  // Render forecast
  if (forecastResult.status === 'fulfilled') {
    renderForecast(forecastResult.value);
    // Store point forecast for Gist personalization
    currentPointForecast = forecastResult.value.slice(0, 4)
      .map(p => `${p.name}: ${p.detailedForecast}`)
      .join(' ');
  } else {
    showError('forecast', 'Unable to load forecast.');
    console.error('Forecast fetch failed:', forecastResult.reason);
  }

  // Render alerts
  if (alertsResult.status === 'fulfilled') {
    renderAlerts(alertsResult.value);
  }

  // Initialize satellite widget
  initSatellite(document.getElementById('satellite'), CONFIG.lat, CONFIG.lon);
}

// ── Helpers ─────────────────────────────────────────────────

function formatPreviousTime(isoString) {
  try {
    const d = new Date(isoString);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minStr = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';
    return `${day} ${hours}${minStr} ${ampm}`;
  } catch {
    return '';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Launch ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
