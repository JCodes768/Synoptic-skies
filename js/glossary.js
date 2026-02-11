/**
 * Glossary system for Synoptic Skies
 * Detects meteorological terms in AFD text, wraps them in interactive spans,
 * and manages tooltip + sidebar definition display.
 */

let glossaryData = [];
let sidebarEl = null;
let tooltipEl = null;
let termOfTheDay = null;

/**
 * Load glossary data from JSON
 */
export async function loadGlossary() {
  try {
    const response = await fetch('./data/glossary.json');
    const data = await response.json();
    glossaryData = data.terms;
    // Sort by term length descending so longer multi-word terms match first
    glossaryData.sort((a, b) => b.term.length - a.term.length);
  } catch (e) {
    console.warn('Failed to load glossary:', e);
    glossaryData = [];
  }
}

/**
 * Initialize the glossary UI
 * @param {HTMLElement} sidebar - The glossary sidebar content element
 */
export function initGlossaryUI(sidebar) {
  sidebarEl = sidebar;

  // Create floating tooltip
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'glossary-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.style.display = 'none';
  document.body.appendChild(tooltipEl);

  // Tooltip hover persistence
  tooltipEl.addEventListener('mouseenter', () => {
    if (hideTimeout) clearTimeout(hideTimeout);
  });
  tooltipEl.addEventListener('mouseleave', () => {
    hideTooltip();
  });

  // Dismiss on click elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.glossary-term') && !e.target.closest('.glossary-tooltip')) {
      hideTooltip();
    }
  });
}

/**
 * Select "term of the day" based on terms found in the AFD text.
 * Prefers more interesting/educational terms.
 */
export function selectTermOfTheDay(afdText) {
  if (!glossaryData.length || !afdText) return null;

  const text = afdText.toLowerCase();

  // Find all glossary terms that appear in the AFD
  const found = glossaryData.filter(entry => {
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  });

  if (found.length === 0) {
    // Fallback: pick any term
    termOfTheDay = glossaryData[0];
    return termOfTheDay;
  }

  // Score terms: prefer longer terms (more specific), longer definitions (more educational)
  found.sort((a, b) => {
    const scoreA = a.term.length * 2 + (a.long.length / 40);
    const scoreB = b.term.length * 2 + (b.long.length / 40);
    return scoreB - scoreA;
  });

  // Use day of year for daily rotation among top candidates
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const index = dayOfYear % Math.min(found.length, 7);

  termOfTheDay = found[index];
  return termOfTheDay;
}

/**
 * Show the term of the day in the sidebar
 */
let afdTerms = [];
let carouselIndex = -1; // -1 means showing term of the day

export function showTermOfTheDay() {
  if (!sidebarEl || !termOfTheDay) return;
  carouselIndex = -1;
  renderSidebarTerm(termOfTheDay, true);
}

function renderSidebarTerm(entry, isTotd) {
  if (!sidebarEl || !entry) return;

  const wikiLink = entry.wikipedia
    ? `<a href="${esc(entry.wikipedia)}" target="_blank" rel="noopener" class="glossary-wiki-link">Wikipedia &rarr;</a>`
    : '';

  sidebarEl.innerHTML = `
    ${isTotd ? '<div class="glossary-totd-label">Term of the Day</div>' : '<div class="glossary-totd-label">Glossary</div>'}
    <h4 class="glossary-sidebar-term">${esc(entry.term)}</h4>
    <p class="glossary-sidebar-definition">${esc(entry.long)}</p>
    <div class="glossary-sidebar-nav">
      <button class="glossary-next-btn" aria-label="Next term">Next term &rarr;</button>
      ${wikiLink}
      <a href="glossary.html" class="glossary-browse-link">Browse all</a>
    </div>
  `;
  sidebarEl.classList.add('glossary-active');

  sidebarEl.querySelector('.glossary-next-btn')?.addEventListener('click', showNextTerm);
}

function showNextTerm() {
  if (!afdTerms.length) return;
  carouselIndex = (carouselIndex + 1) % afdTerms.length;
  renderSidebarTerm(afdTerms[carouselIndex], false);
}

/**
 * Build list of terms found in the AFD for the carousel.
 */
export function buildAfdTermList(afdText) {
  if (!glossaryData.length || !afdText) return;
  const text = afdText.toLowerCase();
  afdTerms = glossaryData.filter(entry => {
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  });
}

/**
 * Scan a DOM element for glossary terms and wrap them in interactive spans.
 * Uses DocumentFragment for safe DOM manipulation (no innerHTML XSS risk).
 */
export function highlightTerms(element) {
  if (!glossaryData.length || !element) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('.glossary-term')) continue;
    if (!node.textContent.trim()) continue;
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const matches = findTermMatches(textNode.textContent);
    if (matches.length === 0) continue;

    const fragment = buildHighlightedFragment(textNode.textContent, matches);
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  // Attach event listeners
  element.querySelectorAll('.glossary-term').forEach(termEl => {
    termEl.addEventListener('mouseenter', handleTermHover);
    termEl.addEventListener('mouseleave', handleTermLeave);
    termEl.addEventListener('click', handleTermClick);
    termEl.addEventListener('focus', handleTermHover);
    termEl.addEventListener('blur', handleTermLeave);
  });
}

/**
 * Find glossary term matches in a text string.
 * Returns sorted, non-overlapping match positions.
 */
function findTermMatches(text) {
  const matches = [];
  const usedRanges = [];

  for (const entry of glossaryData) {
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const match = regex.exec(text);
    if (!match) continue;

    const start = match.index;
    const end = start + match[0].length;

    // Skip if overlaps with an existing match
    const overlaps = usedRanges.some(r => start < r.end && end > r.start);
    if (overlaps) continue;

    matches.push({ start, end, term: entry.term, original: match[0] });
    usedRanges.push({ start, end });
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Build a DocumentFragment with glossary terms wrapped in interactive spans.
 * Uses createTextNode for non-matched text (safe, no escaping needed).
 */
function buildHighlightedFragment(text, matches) {
  const fragment = document.createDocumentFragment();
  let pos = 0;

  for (const m of matches) {
    if (m.start > pos) {
      fragment.appendChild(document.createTextNode(text.substring(pos, m.start)));
    }

    const span = document.createElement('span');
    span.className = 'glossary-term';
    span.dataset.term = m.term.toLowerCase();
    span.tabIndex = 0;
    span.textContent = m.original;
    fragment.appendChild(span);

    pos = m.end;
  }

  if (pos < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(pos)));
  }

  return fragment;
}

// ── Event handlers ──────────────────────────────────────────

function handleTermHover(e) {
  const term = e.target.dataset.term;
  if (!term) return;
  showTooltip(e.target, term);
  showSidebarDefinition(term);
}

function handleTermLeave() {
  scheduleHideTooltip();
  // Revert sidebar to current carousel state after a delay
  setTimeout(() => {
    if (!document.querySelector('.glossary-term:hover')) {
      if (carouselIndex >= 0 && afdTerms[carouselIndex]) {
        renderSidebarTerm(afdTerms[carouselIndex], false);
      } else {
        showTermOfTheDay();
      }
    }
  }, 400);
}

function handleTermClick(e) {
  e.preventDefault();
  const term = e.target.dataset.term;
  if (!term) return;
  showTooltip(e.target, term);
  showSidebarDefinition(term);

  if (window.innerWidth < 768) {
    showMobileDefinition(term);
  }
}

let hideTimeout = null;

function scheduleHideTooltip() {
  hideTimeout = setTimeout(hideTooltip, 250);
}

function showTooltip(targetEl, termKey) {
  if (hideTimeout) clearTimeout(hideTimeout);

  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry || !tooltipEl) return;

  tooltipEl.textContent = entry.short;
  tooltipEl.style.display = 'block';

  const rect = targetEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
  let top = rect.top - tipRect.height - 8;

  if (left < 8) left = 8;
  if (left + tipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tipRect.width - 8;
  }
  if (top < 8) {
    top = rect.bottom + 8;
  }

  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = (top + window.scrollY) + 'px';
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

function showSidebarDefinition(termKey) {
  if (!sidebarEl) return;

  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry) return;

  const wikiLink = entry.wikipedia
    ? `<a href="${esc(entry.wikipedia)}" target="_blank" rel="noopener" class="glossary-wiki-link">Wikipedia &rarr;</a>`
    : '';

  sidebarEl.innerHTML = `
    <h4 class="glossary-sidebar-term">${esc(entry.term)}</h4>
    <p class="glossary-sidebar-definition">${esc(entry.long)}</p>
    <div class="glossary-sidebar-nav">
      ${wikiLink}
      <a href="glossary.html" class="glossary-browse-link">Browse all terms &rarr;</a>
    </div>
  `;
  sidebarEl.classList.add('glossary-active');
}

function showMobileDefinition(termKey) {
  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry) return;

  const existing = document.querySelector('.glossary-bottom-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.className = 'glossary-bottom-sheet';
  const mobileWiki = entry.wikipedia
    ? `<a href="${esc(entry.wikipedia)}" target="_blank" rel="noopener" class="glossary-wiki-link">Read more on Wikipedia &rarr;</a>`
    : '';

  sheet.innerHTML = `
    <div class="glossary-bottom-sheet-content">
      <button class="glossary-bottom-sheet-close" aria-label="Close">&times;</button>
      <h4>${esc(entry.term)}</h4>
      <p>${esc(entry.long)}</p>
      ${mobileWiki}
    </div>
  `;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('visible'));

  sheet.querySelector('.glossary-bottom-sheet-close').addEventListener('click', () => {
    sheet.classList.remove('visible');
    setTimeout(() => sheet.remove(), 300);
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) {
      sheet.classList.remove('visible');
      setTimeout(() => sheet.remove(), 300);
    }
  });
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
