/**
 * Synoptic Skies — Main Application
 * Orchestrates data fetching, rendering, and UI interactions.
 */

import { fetchLatestAFD, fetchCurrentConditions, fetchForecast, fetchAlerts, CONFIG } from './api.js';
import { parseAFD, bodyToHTML } from './afd-parser.js';
import { loadGlossary, initGlossaryUI, highlightTerms, selectTermOfTheDay, showTermOfTheDay } from './glossary.js';
import { initSatellite } from './satellite.js';
import { initTheme } from './theme.js';

// ── Meteocons Integration ───────────────────────────────────
// Using Meteocons by Bas Milius via jsDelivr CDN, rendered in grayscale

const METEOCON_BASE = 'https://cdn.jsdelivr.net/gh/basmilius/weather-icons@dev/production/fill/svg/';

/**
 * Map NWS short forecast text to a Meteocon icon filename
 */
function getIconName(shortForecast, isDaytime = true) {
  const text = shortForecast.toLowerCase();

  if (text.includes('thunder') || text.includes('tstm')) return 'thunderstorms';
  if (text.includes('blizzard')) return 'snow';
  if (text.includes('sleet') || text.includes('freezing rain')) return 'sleet';
  if (text.includes('snow') || text.includes('flurr')) return 'snow';
  if (text.includes('rain') || text.includes('shower')) return isDaytime ? 'partly-cloudy-day-rain' : 'partly-cloudy-night-rain';
  if (text.includes('drizzle')) return 'drizzle';
  if (text.includes('fog') || text.includes('mist')) return isDaytime ? 'fog-day' : 'fog-night';
  if (text.includes('haze') || text.includes('smoke')) return isDaytime ? 'haze-day' : 'haze-night';
  if (text.includes('wind') && !text.includes('cloud')) return 'wind';
  if (text.includes('overcast')) return isDaytime ? 'overcast-day' : 'overcast-night';
  if (text.includes('mostly cloudy')) return isDaytime ? 'overcast-day' : 'overcast-night';
  if (text.includes('partly cloudy') || text.includes('partly sunny')) return isDaytime ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (text.includes('mostly sunny') || text.includes('mostly clear')) return isDaytime ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (text.includes('sunny') || text.includes('clear')) return isDaytime ? 'clear-day' : 'clear-night';
  if (text.includes('cloud')) return 'cloudy';

  return isDaytime ? 'partly-cloudy-day' : 'partly-cloudy-night';
}

function weatherIconHTML(shortForecast, isDaytime = true, size = '48') {
  const name = getIconName(shortForecast, isDaytime);
  const url = `${METEOCON_BASE}${name}.svg`;
  return `<img src="${url}" alt="" class="weather-icon" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none'">`;
}

/**
 * Is it currently daytime? (rough check for icon selection)
 */
function isDaytimeNow() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 20;
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
  const icon = weatherIconHTML(data.textDescription, daytime, '56');

  el.innerHTML = `
    <div class="conditions-header">
      <div class="conditions-icon">${icon}</div>
      <div class="conditions-temp">
        <span class="temp-value">${data.temperature ?? '--'}\u00B0F</span>
        <span class="temp-desc">${escapeHTML(data.textDescription)}</span>
      </div>
    </div>
    <div class="conditions-details">
      <div class="detail-row">
        <span class="detail-label">Wind</span>
        <span class="detail-value">${data.windDirection} ${data.windSpeed ?? '--'} mph${data.windGust ? ` (G${data.windGust})` : ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Humidity</span>
        <span class="detail-value">${data.humidity ?? '--'}%</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Dew Point</span>
        <span class="detail-value">${data.dewpoint ?? '--'}\u00B0F</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Pressure</span>
        <span class="detail-value">${data.pressure ?? '--'}" Hg</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Visibility</span>
        <span class="detail-value">${data.visibility ?? '--'} mi</span>
      </div>
    </div>
    <div class="conditions-station">Station: ${data.station}</div>
  `;

  el.classList.remove('loading');
}

function renderForecast(periods) {
  const el = document.getElementById('forecast');
  if (!el) return;

  const display = periods.slice(0, 10);

  el.innerHTML = display.map(period => {
    const icon = weatherIconHTML(period.shortForecast, period.isDaytime, '32');
    return `
      <div class="forecast-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
        <div class="forecast-name">${escapeHTML(period.name)}</div>
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-temp">${period.temperature}\u00B0${period.temperatureUnit}</div>
        <div class="forecast-desc">${escapeHTML(period.shortForecast)}</div>
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

  el.style.display = 'block';

  if (!alerts || alerts.length === 0) {
    el.innerHTML = `
      <div class="alerts-header">
        <h2 class="alerts-title">Active Alerts</h2>
      </div>
      <p class="alerts-none">No active alerts for this area.</p>
    `;
    return;
  }

  el.innerHTML = `
    <div class="alerts-header">
      <h2 class="alerts-title">Active Alerts</h2>
    </div>
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

function initGist() {
  const btn = document.getElementById('gist-btn');
  if (!btn) return;

  // Check for cached summary
  try {
    const cached = sessionStorage.getItem(GIST_CACHE_KEY);
    if (cached) {
      const { summary, afdId } = JSON.parse(cached);
      if (afdId && afdId === currentAfdId) {
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
      body: JSON.stringify({ afdText: currentAfdText, afdId: currentAfdId })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const summary = data.summary;

    // Cache the result
    try {
      sessionStorage.setItem(GIST_CACHE_KEY, JSON.stringify({
        summary,
        afdId: currentAfdId
      }));
    } catch (e) { /* ok */ }

    showGistSummary(summary);
  } catch (err) {
    console.error('Gist fetch failed:', err);
    contentEl.innerHTML = `
      <p class="gist-error">Unable to generate summary. Try again later.</p>
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
    <p class="gist-disclaimer">Generated by AI — always refer to the full forecast discussion below.</p>
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

// ── Initialization ──────────────────────────────────────────

async function init() {
  initTheme();
  initTextSize();

  // Set up glossary sidebar
  const glossarySidebar = document.getElementById('glossary-content');
  initGlossaryUI(glossarySidebar);

  // Show loading states
  showLoading('current-conditions');
  showLoading('forecast');
  showLoading('afd-content');

  // Load glossary data first (needed before AFD rendering)
  await loadGlossary();

  // Fetch all API data in parallel
  const [afdResult, conditionsResult, forecastResult, alertsResult] = await Promise.allSettled([
    fetchLatestAFD(),
    fetchCurrentConditions(),
    fetchForecast(),
    fetchAlerts()
  ]);

  // Render AFD
  if (afdResult.status === 'fulfilled') {
    const parsed = parseAFD(afdResult.value.productText);
    renderAFD(parsed);
    renderForecasterCard(parsed.authors);

    // Store AFD for Gist feature
    currentAfdText = afdResult.value.productText;
    currentAfdId = afdResult.value.id;
    initGist();

    // Select and show term of the day based on AFD content
    selectTermOfTheDay(afdResult.value.productText);
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

  // Render forecast
  if (forecastResult.status === 'fulfilled') {
    renderForecast(forecastResult.value);
  } else {
    showError('forecast', 'Unable to load forecast.');
    console.error('Forecast fetch failed:', forecastResult.reason);
  }

  // Render alerts
  if (alertsResult.status === 'fulfilled') {
    renderAlerts(alertsResult.value);
  }

  // Initialize satellite widget
  initSatellite(document.getElementById('satellite'));
}

// ── Helpers ─────────────────────────────────────────────────

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
