/**
 * Satellite imagery for Synoptic Skies
 * Dynamically selects GOES-East or GOES-West sector based on location.
 */

const CDN_BASE = 'https://cdn.star.nesdis.noaa.gov';
const VIEWER_BASE = 'https://www.star.nesdis.noaa.gov/goes/sector.php';

/**
 * Pick the right GOES satellite and sector for a given lat/lon.
 * Returns { sat, sector, sectorName }.
 */
function getSatelliteSector(lat, lon) {
  // Hawaii
  if (lat >= 18 && lat <= 23 && lon <= -154) {
    return { sat: 'GOES18', sector: 'hi', sectorName: 'Hawaii' };
  }
  // Alaska
  if (lat > 54) {
    return { sat: 'GOES18', sector: 'ak', sectorName: 'Alaska' };
  }

  // GOES-West (west of -100°)
  if (lon <= -100) {
    if (lat >= 42) {
      return { sat: 'GOES18', sector: 'pnw', sectorName: 'Pacific Northwest' };
    }
    return { sat: 'GOES18', sector: 'psw', sectorName: 'Pacific Southwest' };
  }

  // GOES-East (east of -100°)
  if (lat >= 42 && lon >= -80) {
    return { sat: 'GOES16', sector: 'ne', sectorName: 'Northeast' };
  }
  if (lat >= 42 && lon >= -93) {
    return { sat: 'GOES16', sector: 'cgl', sectorName: 'Great Lakes' };
  }
  if (lat >= 42) {
    return { sat: 'GOES16', sector: 'umv', sectorName: 'Upper Mississippi Valley' };
  }
  if (lat <= 33 && lon >= -82) {
    return { sat: 'GOES16', sector: 'se', sectorName: 'Southeast' };
  }
  if (lat <= 33 && lon <= -90) {
    return { sat: 'GOES16', sector: 'gm', sectorName: 'Gulf of Mexico' };
  }
  if (lon <= -93) {
    return { sat: 'GOES16', sector: 'sp', sectorName: 'Southern Plains' };
  }
  if (lon <= -85) {
    return { sat: 'GOES16', sector: 'smv', sectorName: 'Southern Mississippi Valley' };
  }
  return { sat: 'GOES16', sector: 'se', sectorName: 'Southeast' };
}

/**
 * Initialize the satellite widget with location-aware imagery.
 * @param {HTMLElement} container
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
export function initSatellite(container, lat = 37.7516, lon = -122.4477) {
  if (!container) return;

  const { sat, sector, sectorName } = getSatelliteSector(lat, lon);
  const url = `${CDN_BASE}/${sat}/ABI/SECTOR/${sector}/GEOCOLOR/1200x1200.jpg`;
  const satLabel = sat === 'GOES18' ? 'GOES-West' : 'GOES-East';
  const viewerUrl = `${VIEWER_BASE}?sat=${sat === 'GOES18' ? 'G18' : 'G16'}&sector=${sector}&product=GEOCOLOR`;

  container.innerHTML = `
    <a href="${viewerUrl}" target="_blank" rel="noopener" class="satellite-link" title="View full-resolution image on NOAA">
      <div class="satellite-wrapper">
        <img
          class="satellite-image"
          src="${url}"
          alt="${satLabel} GeoColor satellite imagery — ${sectorName}"
          crossorigin="anonymous"
          loading="eager"
        />
        <div class="satellite-loading">Loading satellite...</div>
      </div>
    </a>
    <p class="satellite-caption">${satLabel} GeoColor &middot; ${sectorName} &middot; <span class="satellite-time"></span>CIRA/NOAA</p>
  `;

  const img = container.querySelector('.satellite-image');
  const loading = container.querySelector('.satellite-loading');
  const caption = container.querySelector('.satellite-caption');
  const link = container.querySelector('.satellite-link');
  const timeSpan = container.querySelector('.satellite-time');

  img.onload = () => {
    loading.style.display = 'none';
    img.style.opacity = '1';
    // Fetch the image timestamp via HEAD request
    fetchImageTimestamp(img.src, timeSpan);
  };

  img.onerror = () => {
    // Try alternate satellite designation (GOES16↔GOES19 transition)
    const altSat = sat === 'GOES16' ? 'GOES19' : sat === 'GOES19' ? 'GOES16' : null;
    if (altSat && !img.dataset.retried) {
      img.dataset.retried = 'true';
      const altUrl = `${CDN_BASE}/${altSat}/ABI/SECTOR/${sector}/GEOCOLOR/1200x1200.jpg`;
      img.src = altUrl;
      const altLabel = altSat === 'GOES19' ? 'GOES-East' : satLabel;
      const altViewerUrl = `${VIEWER_BASE}?sat=${altSat === 'GOES18' ? 'G18' : altSat === 'GOES19' ? 'G16' : 'G16'}&sector=${sector}&product=GEOCOLOR`;
      link.href = altViewerUrl;
      caption.innerHTML = `${altLabel} GeoColor \u00B7 ${sectorName} \u00B7 <span class="satellite-time"></span>CIRA/NOAA`;
      return;
    }
    loading.textContent = 'Satellite imagery unavailable';
    loading.classList.add('satellite-error');
    img.style.display = 'none';
  };
}

/**
 * Fetch the Last-Modified header from the satellite image to display the timestamp.
 */
async function fetchImageTimestamp(imageUrl, timeSpan) {
  if (!timeSpan) return;
  try {
    const resp = await fetch(imageUrl, { method: 'HEAD' });
    const lastMod = resp.headers.get('Last-Modified');
    if (lastMod) {
      const d = new Date(lastMod);
      const now = new Date();
      const diffMin = Math.round((now - d) / 60000);
      let ago;
      if (diffMin < 2) ago = 'just now';
      else if (diffMin < 60) ago = `${diffMin} min ago`;
      else if (diffMin < 120) ago = '1 hr ago';
      else ago = `${Math.floor(diffMin / 60)} hrs ago`;
      timeSpan.textContent = `${ago} \u00B7 `;
    }
  } catch {
    // Non-critical, skip timestamp
  }
}
