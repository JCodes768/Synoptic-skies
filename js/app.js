/**
 * Synoptic Skies — Main Application
 * Orchestrates data fetching, rendering, and UI interactions.
 */

import { fetchLatestAFD, fetchCurrentConditions, fetchForecast, fetchAlerts } from './api.js';
import { parseAFD, bodyToHTML } from './afd-parser.js';
import { loadGlossary, initGlossaryUI, highlightTerms } from './glossary.js';
import { initSatellite } from './satellite.js';
import { initTheme } from './theme.js';

// ── Pixel Art Weather Icons ──────────────────────────────────────
// Simple 16x16 pixel grid icons as SVG

function pixelIcon(grid, color = 'currentColor') {
  const size = 16;
  const px = 3; // pixel size in SVG units
  let rects = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y] && grid[y][x]) {
        rects += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${color}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${size * px} ${size * px}" class="pixel-icon" aria-hidden="true">${rects}</svg>`;
}

// Icon grid definitions (1 = filled pixel, 0 = empty)
const ICON_GRIDS = {
  sunny: [
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [1,1,0,0,1,1,1,1,1,1,1,0,0,1,1,0],
    [1,1,0,0,1,1,1,1,1,1,1,0,0,1,1,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  cloudy: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  partlyCloudy: [
    [0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0],
    [0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,0,1,1,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  rain: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
    [0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0],
    [0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  thunderstorm: [
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  snow: [
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    [0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0],
    [0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  fog: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  wind: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  nightClear: [
    [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
};

/**
 * Map NWS short forecast text to an icon key
 */
function forecastToIconKey(shortForecast, isDaytime) {
  const text = shortForecast.toLowerCase();

  if (text.includes('thunder') || text.includes('tstm')) return 'thunderstorm';
  if (text.includes('snow') || text.includes('blizzard') || text.includes('flurr')) return 'snow';
  if (text.includes('rain') || text.includes('shower') || text.includes('drizzle')) return 'rain';
  if (text.includes('fog') || text.includes('mist') || text.includes('haz')) return 'fog';
  if (text.includes('wind') && !text.includes('cloud')) return 'wind';
  if (text.includes('overcast') || text.includes('cloudy') && !text.includes('partly') && !text.includes('mostly clear')) return 'cloudy';
  if (text.includes('partly') || text.includes('mostly cloudy') || text.includes('mostly sunny')) {
    return isDaytime ? 'partlyCloudy' : 'nightClear';
  }
  if (text.includes('sunny') || text.includes('clear')) {
    return isDaytime ? 'sunny' : 'nightClear';
  }

  return isDaytime ? 'partlyCloudy' : 'nightClear';
}

function getWeatherIcon(shortForecast, isDaytime = true) {
  const key = forecastToIconKey(shortForecast, isDaytime);
  const grid = ICON_GRIDS[key] || ICON_GRIDS.partlyCloudy;
  return pixelIcon(grid);
}

// ── Rendering Functions ─────────────────────────────────────────

function renderCurrentConditions(data) {
  const el = document.getElementById('current-conditions');
  if (!el) return;

  const icon = getWeatherIcon(data.textDescription, true);

  el.innerHTML = `
    <div class="conditions-header">
      <div class="conditions-icon">${icon}</div>
      <div class="conditions-temp">
        <span class="temp-value">${data.temperature ?? '--'}°F</span>
        <span class="temp-desc">${escapeHTML(data.textDescription)}</span>
      </div>
    </div>
    <div class="conditions-details">
      <div class="detail-row">
        <span class="detail-label">Wind</span>
        <span class="detail-value">${data.windDirection} ${data.windSpeed ?? '--'} mph${data.windGust ? ` (gusts ${data.windGust})` : ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Humidity</span>
        <span class="detail-value">${data.humidity ?? '--'}%</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Dew Point</span>
        <span class="detail-value">${data.dewpoint ?? '--'}°F</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Pressure</span>
        <span class="detail-value">${data.pressure ?? '--'} inHg</span>
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

  // Show up to 10 periods (5 day/night pairs for ~5 days)
  const display = periods.slice(0, 10);

  el.innerHTML = display.map(period => {
    const icon = getWeatherIcon(period.shortForecast, period.isDaytime);
    return `
      <div class="forecast-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
        <div class="forecast-name">${escapeHTML(period.name)}</div>
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-temp">${period.temperature}°${period.temperatureUnit}</div>
        <div class="forecast-desc">${escapeHTML(period.shortForecast)}</div>
      </div>
    `;
  }).join('');

  el.classList.remove('loading');
}

function renderAFD(parsed) {
  const container = document.getElementById('afd-content');
  if (!container) return;

  // Update the header timestamp
  const timestampEl = document.getElementById('afd-timestamp');
  if (timestampEl && parsed.timestamp) {
    timestampEl.textContent = `Issued: ${parsed.timestamp}`;
  }

  container.innerHTML = '';

  for (const section of parsed.sections) {
    // Skip the watches/warnings/advisories "None" section
    if (section.isWWA && section.body.trim().toLowerCase() === 'none.') continue;

    const sectionEl = document.createElement('section');
    sectionEl.className = `afd-section ${section.isSpecial ? 'afd-section-special' : ''} ${section.isWWA ? 'afd-section-alert' : ''}`;
    sectionEl.setAttribute('data-section', section.name);

    // Build the header
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

    // Collapse/expand behavior
    if (section.collapsed) {
      const header = sectionEl.querySelector('.afd-section-header');
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        sectionEl.querySelector('.afd-section-body').classList.toggle('collapsed');
      });
      header.style.cursor = 'pointer';
    }

    container.appendChild(sectionEl);
  }

  container.classList.remove('loading');

  // Highlight glossary terms after rendering
  highlightTerms(container);
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts');
  if (!el) return;

  if (!alerts || alerts.length === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = alerts.map(alert => `
    <div class="alert-item alert-${alert.severity.toLowerCase()}">
      <div class="alert-event">${escapeHTML(alert.event)}</div>
      <div class="alert-headline">${escapeHTML(alert.headline || '')}</div>
    </div>
  `).join('');
}

function renderForecasterCard(authors) {
  const el = document.getElementById('forecaster-card');
  if (!el) return;

  const names = [...new Set(Object.values(authors))];
  if (names.length === 0) {
    el.style.display = 'none';
    return;
  }

  const sections = Object.entries(authors).map(
    ([section, name]) => `<span class="forecaster-section">${titleCase(section)}</span>`
  );

  el.innerHTML = `
    <div class="forecaster-names">${names.map(n => `<strong>${escapeHTML(n)}</strong>`).join(', ')}</div>
    <div class="forecaster-credit">authored today's forecast</div>
  `;
  el.style.display = 'block';
}

// ── Loading States ──────────────────────────────────────────────

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

// ── Initialization ──────────────────────────────────────────────

async function init() {
  // Initialize theme immediately (no async needed)
  initTheme();

  // Initialize glossary sidebar
  const glossarySidebar = document.getElementById('glossary-content');
  initGlossaryUI(glossarySidebar);

  // Show loading states
  showLoading('current-conditions');
  showLoading('forecast');
  showLoading('afd-content');

  // Load glossary data (needed before AFD rendering)
  await loadGlossary();

  // Fetch all data in parallel
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

// ── Helpers ─────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Launch ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
