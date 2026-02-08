/**
 * Satellite imagery for Synoptic Skies
 * Dynamically selects GOES-East or GOES-West sector based on location.
 */

const CDN_BASE = 'https://cdn.star.nesdis.noaa.gov';

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

  container.innerHTML = `
    <div class="satellite-wrapper">
      <img
        class="satellite-image"
        src="${url}"
        alt="${satLabel} GeoColor satellite imagery — ${sectorName}"
        crossorigin="anonymous"
        loading="lazy"
      />
      <div class="satellite-loading">Loading satellite...</div>
    </div>
    <p class="satellite-caption">${satLabel} GeoColor &middot; ${sectorName} &middot; CIRA/NOAA</p>
  `;

  const img = container.querySelector('.satellite-image');
  const loading = container.querySelector('.satellite-loading');
  const caption = container.querySelector('.satellite-caption');

  img.onload = () => {
    loading.style.display = 'none';
    img.style.opacity = '1';
  };

  img.onerror = () => {
    // Try alternate satellite designation (GOES16↔GOES19 transition)
    const altSat = sat === 'GOES16' ? 'GOES19' : sat === 'GOES19' ? 'GOES16' : null;
    if (altSat && !img.dataset.retried) {
      img.dataset.retried = 'true';
      const altUrl = `${CDN_BASE}/${altSat}/ABI/SECTOR/${sector}/GEOCOLOR/1200x1200.jpg`;
      img.src = altUrl;
      caption.textContent = `${altSat === 'GOES19' ? 'GOES-East' : satLabel} GeoColor \u00B7 ${sectorName} \u00B7 CIRA/NOAA`;
      return;
    }
    loading.textContent = 'Satellite imagery unavailable';
    loading.classList.add('satellite-error');
    img.style.display = 'none';
  };
}
