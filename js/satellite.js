/**
 * Satellite imagery handler for Synoptic Skies
 * Fetches GOES-18 Pacific Southwest imagery and applies
 * a pixelation/dithering effect via canvas for retro aesthetic.
 * Hover/tap reveals the clear original image.
 */

// GOES-18 Pacific Southwest sector geocolor
const SATELLITE_URL = 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/SECTOR/psw/GEOCOLOR/1200x1200.jpg';

/**
 * Initialize the satellite widget
 * @param {HTMLElement} container - The satellite container element
 */
export function initSatellite(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="satellite-wrapper">
      <canvas class="satellite-pixelated" aria-hidden="true"></canvas>
      <img class="satellite-original" alt="GOES-18 satellite imagery of the Pacific Southwest" crossorigin="anonymous" />
      <div class="satellite-loading">Loading satellite imagery...</div>
    </div>
    <p class="satellite-caption">GOES-18 Pacific Southwest · Hover to reveal</p>
  `;

  const canvas = container.querySelector('.satellite-pixelated');
  const img = container.querySelector('.satellite-original');
  const loading = container.querySelector('.satellite-loading');

  // Load the satellite image
  const sourceImg = new Image();
  sourceImg.crossOrigin = 'anonymous';

  sourceImg.onload = () => {
    loading.style.display = 'none';

    // Set the clear original image
    img.src = sourceImg.src;

    // Create pixelated version on canvas
    applyPixelation(canvas, sourceImg);

    // Show the widget
    canvas.style.opacity = '1';
  };

  sourceImg.onerror = () => {
    loading.textContent = 'Satellite imagery unavailable';
    loading.classList.add('satellite-error');
  };

  sourceImg.src = SATELLITE_URL;
}

/**
 * Apply pixelation and grayscale effect to the canvas
 */
function applyPixelation(canvas, sourceImg) {
  const ctx = canvas.getContext('2d');

  // Target display size
  const displayWidth = canvas.parentElement.clientWidth || 400;
  const displayHeight = Math.round(displayWidth * (sourceImg.height / sourceImg.width));

  canvas.width = displayWidth;
  canvas.height = displayHeight;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';

  // Pixel size for the chunky look — larger = more pixelated
  const pixelSize = 6;
  const smallWidth = Math.ceil(displayWidth / pixelSize);
  const smallHeight = Math.ceil(displayHeight / pixelSize);

  // Draw at tiny resolution first
  const offscreen = document.createElement('canvas');
  offscreen.width = smallWidth;
  offscreen.height = smallHeight;
  const offCtx = offscreen.getContext('2d');

  // Disable smoothing for crisp pixels
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(sourceImg, 0, 0, smallWidth, smallHeight);

  // Apply grayscale
  const imageData = offCtx.getImageData(0, 0, smallWidth, smallHeight);
  applyGrayscale(imageData);

  // Apply simple dithering for texture
  applyDithering(imageData, smallWidth, smallHeight);

  offCtx.putImageData(imageData, 0, 0);

  // Scale back up with no smoothing for pixel art look
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, smallWidth, smallHeight, 0, 0, displayWidth, displayHeight);
}

/**
 * Convert image data to grayscale
 */
function applyGrayscale(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = luminance;
    data[i + 1] = luminance;
    data[i + 2] = luminance;
  }
}

/**
 * Apply Floyd-Steinberg dithering for a retro texture
 */
function applyDithering(imageData, width, height) {
  const data = imageData.data;
  const levels = 8; // Number of gray levels

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldVal = data[idx];

      // Quantize to reduced levels
      const newVal = Math.round(oldVal / 255 * (levels - 1)) / (levels - 1) * 255;

      data[idx] = newVal;
      data[idx + 1] = newVal;
      data[idx + 2] = newVal;

      const error = oldVal - newVal;

      // Distribute error to neighbors (Floyd-Steinberg)
      distributeError(data, width, height, x + 1, y, error * 7 / 16);
      distributeError(data, width, height, x - 1, y + 1, error * 3 / 16);
      distributeError(data, width, height, x, y + 1, error * 5 / 16);
      distributeError(data, width, height, x + 1, y + 1, error * 1 / 16);
    }
  }
}

function distributeError(data, width, height, x, y, error) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  const clamped = Math.max(0, Math.min(255, data[idx] + error));
  data[idx] = clamped;
  data[idx + 1] = clamped;
  data[idx + 2] = clamped;
}
