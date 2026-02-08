/**
 * Satellite imagery for Synoptic Skies
 * Loads GOES-18 Pacific Southwest image. Simple and clean.
 */

const SATELLITE_URL = 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/WFO/mtr/GEOCOLOR/1200x1200.jpg';

/**
 * Initialize the satellite widget — just a B&W image, no effects
 */
export function initSatellite(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="satellite-wrapper">
      <img
        class="satellite-image"
        src="${SATELLITE_URL}"
        alt="GOES-18 GeoColor satellite imagery — San Francisco Bay Area"
        crossorigin="anonymous"
        loading="lazy"
      />
      <div class="satellite-loading">Loading satellite...</div>
    </div>
    <p class="satellite-caption">GOES-West GeoColor &middot; CIRA/NOAA</p>
  `;

  const img = container.querySelector('.satellite-image');
  const loading = container.querySelector('.satellite-loading');

  img.onload = () => {
    loading.style.display = 'none';
    img.style.opacity = '1';
  };

  img.onerror = () => {
    loading.textContent = 'Satellite imagery unavailable';
    loading.classList.add('satellite-error');
    img.style.display = 'none';
  };
}
