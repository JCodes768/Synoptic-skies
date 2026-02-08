/**
 * NWS API client for Synoptic Skies
 * All data fetched from api.weather.gov (free, CORS-enabled)
 */

const API_BASE = 'https://api.weather.gov';
const USER_AGENT = '(synopticskies.com, joshcodes@proton.me)';

// Default office and station config — MTR (San Francisco Bay Area)
const CONFIG = {
  office: 'MTR',
  station: 'KOAK',
  gridpoint: { wfo: 'MTR', x: 85, y: 105 },
  state: 'CA'
};

const headers = {
  'Accept': 'application/geo+json',
  'User-Agent': USER_AGENT
};

/**
 * Generic fetch wrapper with caching and error handling
 */
async function apiFetch(url, cacheKey, cacheDuration = 300000) {
  // Check sessionStorage cache
  if (cacheKey) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheDuration) {
        return data;
      }
    }
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Cache the result
  if (cacheKey) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      // sessionStorage full or unavailable — not critical
    }
  }

  return data;
}

/**
 * Fetch the latest Area Forecast Discussion for the configured office
 * Returns { id, issuanceTime, productText }
 */
export async function fetchLatestAFD() {
  // First get the list of recent AFDs
  const listUrl = `${API_BASE}/products/types/AFD/locations/${CONFIG.office}`;
  const list = await apiFetch(listUrl, `afd-list-${CONFIG.office}`, 600000);

  if (!list['@graph'] || list['@graph'].length === 0) {
    throw new Error('No AFD products found');
  }

  // Fetch the most recent one
  const latestId = list['@graph'][0].id;
  const cachedProduct = sessionStorage.getItem(`afd-${latestId}`);
  if (cachedProduct) {
    return JSON.parse(cachedProduct);
  }

  const productUrl = `${API_BASE}/products/${latestId}`;
  const product = await apiFetch(productUrl, null);

  const result = {
    id: latestId,
    issuanceTime: product.issuanceTime,
    productText: product.productText,
    productName: product.productName
  };

  try {
    sessionStorage.setItem(`afd-${latestId}`, JSON.stringify(result));
  } catch (e) { /* ok */ }

  return result;
}

/**
 * Fetch current weather conditions from the configured station
 */
export async function fetchCurrentConditions() {
  const url = `${API_BASE}/stations/${CONFIG.station}/observations/latest`;
  const data = await apiFetch(url, `conditions-${CONFIG.station}`, 300000);

  const props = data.properties;
  return {
    station: CONFIG.station,
    timestamp: props.timestamp,
    textDescription: props.textDescription || 'N/A',
    temperature: convertTemp(props.temperature),
    dewpoint: convertTemp(props.dewpoint),
    humidity: props.relativeHumidity?.value != null
      ? Math.round(props.relativeHumidity.value)
      : null,
    windSpeed: convertWind(props.windSpeed),
    windDirection: props.windDirection?.value != null
      ? degreesToCardinal(props.windDirection.value)
      : 'Calm',
    windGust: convertWind(props.windGust),
    pressure: convertPressure(props.barometricPressure),
    visibility: convertVisibility(props.visibility),
    icon: props.icon
  };
}

/**
 * Fetch 7-day forecast for the configured gridpoint
 */
export async function fetchForecast() {
  const { wfo, x, y } = CONFIG.gridpoint;
  const url = `${API_BASE}/gridpoints/${wfo}/${x},${y}/forecast`;
  const data = await apiFetch(url, `forecast-${wfo}-${x}-${y}`, 600000);

  return data.properties.periods.map(period => ({
    name: period.name,
    temperature: period.temperature,
    temperatureUnit: period.temperatureUnit,
    windSpeed: period.windSpeed,
    windDirection: period.windDirection,
    shortForecast: period.shortForecast,
    detailedForecast: period.detailedForecast,
    icon: period.icon,
    isDaytime: period.isDaytime,
    startTime: period.startTime
  }));
}

/**
 * Fetch active weather alerts for the area
 */
export async function fetchAlerts() {
  const url = `${API_BASE}/alerts/active?point=37.8044,-122.2712`;
  const data = await apiFetch(url, `alerts-mtr`, 300000);

  if (!data.features || data.features.length === 0) {
    return [];
  }

  return data.features.map(f => ({
    event: f.properties.event,
    headline: f.properties.headline,
    description: f.properties.description,
    severity: f.properties.severity,
    urgency: f.properties.urgency,
    onset: f.properties.onset,
    expires: f.properties.expires
  }));
}

// -- Unit conversion helpers --

function convertTemp(measurement) {
  if (!measurement || measurement.value == null) return null;
  if (measurement.unitCode === 'wmoUnit:degC' || measurement.unitCode === 'unit:degC') {
    return Math.round(measurement.value * 9 / 5 + 32);
  }
  return Math.round(measurement.value);
}

function convertWind(measurement) {
  if (!measurement || measurement.value == null) return null;
  // API returns km/h, convert to mph
  if (measurement.unitCode === 'wmoUnit:km_h-1' || measurement.unitCode === 'unit:km_h-1') {
    return Math.round(measurement.value * 0.621371);
  }
  return Math.round(measurement.value);
}

function convertPressure(measurement) {
  if (!measurement || measurement.value == null) return null;
  // API returns Pascals, convert to inHg
  if (measurement.unitCode === 'wmoUnit:Pa' || measurement.unitCode === 'unit:Pa') {
    return (measurement.value * 0.00029530).toFixed(2);
  }
  return measurement.value;
}

function convertVisibility(measurement) {
  if (!measurement || measurement.value == null) return null;
  // API returns meters, convert to miles
  if (measurement.unitCode === 'wmoUnit:m' || measurement.unitCode === 'unit:m') {
    return (measurement.value * 0.000621371).toFixed(1);
  }
  return measurement.value;
}

function degreesToCardinal(degrees) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}
