/**
 * NWS API client for Synoptic Skies
 * All data fetched from api.weather.gov (free, CORS-enabled)
 */

const API_BASE = 'https://api.weather.gov';
const USER_AGENT = '(synopticskies.com, joshcodes@proton.me)';

// Default config — MTR (San Francisco Bay Area), KSFO, 94131 area
export const CONFIG = {
  office: 'MTR',
  officeName: 'San Francisco Bay Area',
  officeCity: 'Monterey',
  officeState: 'CA',
  station: 'KSFO',
  gridpoint: { wfo: 'MTR', x: 85, y: 105 },
  lat: 37.7516,
  lon: -122.4477,
  zip: '94131'
};

const headers = {
  'Accept': 'application/geo+json',
  'User-Agent': USER_AGENT
};

/**
 * Generic fetch wrapper with caching and error handling
 */
async function apiFetch(url, cacheKey, cacheDuration = 300000) {
  if (cacheKey) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < cacheDuration) {
          return data;
        }
      }
    } catch (e) { /* ignore cache errors */ }
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (cacheKey) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) { /* sessionStorage full or unavailable */ }
  }

  return data;
}

/**
 * Fetch the latest Area Forecast Discussion
 */
export async function fetchLatestAFD() {
  const listUrl = `${API_BASE}/products/types/AFD/locations/${CONFIG.office}`;
  const list = await apiFetch(listUrl, `afd-list-${CONFIG.office}`, 600000);

  if (!list['@graph'] || list['@graph'].length === 0) {
    throw new Error('No AFD products found');
  }

  const latestId = list['@graph'][0].id;
  const previousIssuanceTime = list['@graph'][1]?.issuanceTime || null;

  try {
    const cachedProduct = sessionStorage.getItem(`afd-${latestId}`);
    if (cachedProduct) return JSON.parse(cachedProduct);
  } catch (e) { /* ignore */ }

  const productUrl = `${API_BASE}/products/${latestId}`;
  const product = await apiFetch(productUrl, null);

  const result = {
    id: latestId,
    issuanceTime: product.issuanceTime,
    previousIssuanceTime,
    productText: product.productText,
    productName: product.productName
  };

  try {
    sessionStorage.setItem(`afd-${latestId}`, JSON.stringify(result));
  } catch (e) { /* ok */ }

  return result;
}

/**
 * Fetch current weather conditions from KSFO
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
 * Fetch 7-day forecast for 94110 area
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
    startTime: period.startTime,
    precipChance: period.probabilityOfPrecipitation?.value ?? null
  }));
}

/**
 * Fetch hourly forecast for the next 24–48 hours
 */
export async function fetchHourlyForecast() {
  const { wfo, x, y } = CONFIG.gridpoint;
  const url = `${API_BASE}/gridpoints/${wfo}/${x},${y}/forecast/hourly`;
  const data = await apiFetch(url, `hourly-${wfo}-${x}-${y}`, 600000);

  return data.properties.periods.map(period => ({
    startTime: period.startTime,
    temperature: period.temperature,
    temperatureUnit: period.temperatureUnit,
    shortForecast: period.shortForecast,
    isDaytime: period.isDaytime,
    precipChance: period.probabilityOfPrecipitation?.value ?? null
  }));
}

/**
 * Fetch active weather alerts for the area
 */
export async function fetchAlerts() {
  const url = `${API_BASE}/alerts/active?point=${CONFIG.lat},${CONFIG.lon}`;
  const data = await apiFetch(url, `alerts-${CONFIG.office}`, 300000);

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

/**
 * Look up a location (zip or city, state) and update CONFIG.
 * Accepts "94110" or "San Francisco, CA".
 */
export async function lookupLocation(query) {
  const trimmed = query.trim();
  let lat, lon, geocodedCity, geocodedState;

  if (/^\d{5}$/.test(trimmed)) {
    // Zip code → use zippopotam.us
    const geoResp = await fetch(`https://api.zippopotam.us/us/${trimmed}`);
    if (!geoResp.ok) throw new Error('Invalid zip code');
    const geoData = await geoResp.json();
    const place = geoData.places[0];
    lat = parseFloat(place.latitude);
    lon = parseFloat(place.longitude);
    geocodedCity = place['place name'];
    geocodedState = place['state abbreviation'];
  } else {
    // City, State → use Nominatim (OpenStreetMap)
    const encoded = encodeURIComponent(trimmed + ', United States');
    const nomResp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=us&addressdetails=1`,
      { headers: { 'User-Agent': 'SynopticSkies/1.0 (synopticskies.com)' } }
    );
    if (!nomResp.ok) throw new Error('Geocoding failed');
    const nomData = await nomResp.json();
    if (!nomData.length) throw new Error('Location not found');
    lat = parseFloat(nomData[0].lat);
    lon = parseFloat(nomData[0].lon);
    const addr = nomData[0].address || {};
    geocodedCity = addr.city || addr.town || addr.village || nomData[0].display_name.split(',')[0];
    geocodedState = addr.state_code?.toUpperCase() || addr.state || '';
  }

  // 2. NWS point metadata → WFO, gridpoint, station list
  const pointsUrl = `${API_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  const pointsResp = await fetch(pointsUrl, { headers });
  if (!pointsResp.ok) throw new Error('Location not supported by NWS');
  const pointsData = await pointsResp.json();
  const props = pointsData.properties;

  // 3. Nearest observation station
  let nearestStation = CONFIG.station;
  try {
    const stationsResp = await fetch(props.observationStations, { headers });
    const stationsData = await stationsResp.json();
    nearestStation = stationsData.features?.[0]?.properties?.stationIdentifier || nearestStation;
  } catch (e) { /* fall back to default */ }

  // 4. WFO office name
  let officeName = props.cwa;
  try {
    const officeResp = await fetch(`${API_BASE}/offices/${props.cwa}`, { headers });
    const officeData = await officeResp.json();
    officeName = officeData.name || props.cwa;
  } catch (e) { /* fall back to code */ }

  // Clean up office name — remove state suffix like ", CA"
  officeName = officeName.replace(/,\s*[A-Z]{2}$/, '');

  // 5. City: prefer the geocoded city (what the user actually searched for),
  //    fall back to NWS relative location only if geocoder didn't provide one
  const city = geocodedCity || props.relativeLocation?.properties?.city || '';
  const state = geocodedState || props.relativeLocation?.properties?.state || '';

  // 6. Update CONFIG in place (ES module export)
  Object.assign(CONFIG, {
    office: props.cwa,
    officeName,
    officeCity: city,
    officeState: state,
    station: nearestStation,
    gridpoint: { wfo: props.cwa, x: props.gridX, y: props.gridY },
    lat,
    lon,
    query: query.trim()
  });

  // 7. Clear stale caches
  clearCaches();

  return CONFIG;
}

/**
 * Clear session caches so fresh data is fetched for a new location.
 */
function clearCaches() {
  const keysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key.startsWith('afd-') || key.startsWith('conditions-') ||
        key.startsWith('forecast-') || key.startsWith('hourly-') ||
        key.startsWith('alerts-') ||
        key === 'synoptic-skies-gist') {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => sessionStorage.removeItem(k));
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
  if (measurement.unitCode === 'wmoUnit:km_h-1' || measurement.unitCode === 'unit:km_h-1') {
    return Math.round(measurement.value * 0.621371);
  }
  return Math.round(measurement.value);
}

function convertPressure(measurement) {
  if (!measurement || measurement.value == null) return null;
  if (measurement.unitCode === 'wmoUnit:Pa' || measurement.unitCode === 'unit:Pa') {
    return (measurement.value * 0.00029530).toFixed(2);
  }
  return measurement.value;
}

function convertVisibility(measurement) {
  if (!measurement || measurement.value == null) return null;
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
