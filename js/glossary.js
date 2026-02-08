/**
 * Glossary system for Synoptic Skies
 * Detects meteorological terms in AFD text, wraps them in interactive spans,
 * and manages tooltip + sidebar definition display.
 */

let glossaryData = [];
let sidebarEl = null;
let tooltipEl = null;

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
 * Initialize the glossary UI: tooltip element and sidebar reference
 * @param {HTMLElement} sidebar - The glossary sidebar element
 */
export function initGlossaryUI(sidebar) {
  sidebarEl = sidebar;

  // Create the floating tooltip
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'glossary-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.style.display = 'none';
  document.body.appendChild(tooltipEl);

  // Hide tooltip when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.glossary-term') && !e.target.closest('.glossary-tooltip')) {
      hideTooltip();
    }
  });
}

/**
 * Scan an HTML element for glossary terms and wrap them in interactive spans.
 * Operates on the rendered HTML, replacing text nodes.
 * @param {HTMLElement} element - The DOM element containing AFD text
 */
export function highlightTerms(element) {
  if (!glossaryData.length || !element) return;

  // Walk all text nodes within the element
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip if already inside a glossary-term span
        if (node.parentElement.closest('.glossary-term')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const replaced = replaceTermsInText(textNode.textContent);
    if (replaced !== textNode.textContent) {
      const span = document.createElement('span');
      span.innerHTML = replaced;
      textNode.parentNode.replaceChild(span, textNode);
    }
  }

  // Attach event listeners to all new glossary-term spans
  element.querySelectorAll('.glossary-term').forEach(termEl => {
    termEl.addEventListener('mouseenter', handleTermHover);
    termEl.addEventListener('mouseleave', scheduleHideTooltip);
    termEl.addEventListener('click', handleTermClick);
    termEl.addEventListener('focus', handleTermHover);
    termEl.addEventListener('blur', scheduleHideTooltip);
  });
}

/**
 * Replace glossary terms in a text string with wrapped spans.
 * Uses word boundary matching to avoid partial matches.
 */
function replaceTermsInText(text) {
  if (!text.trim()) return text;

  let result = text;
  const matched = new Set();

  for (const entry of glossaryData) {
    const term = entry.term;
    // Skip if we've already matched this term (prevent overlapping)
    if (matched.has(term.toLowerCase())) continue;

    // Build a regex that matches the term with word boundaries, case-insensitive
    // Escape special regex characters in the term
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');

    if (regex.test(result)) {
      matched.add(term.toLowerCase());
      // Only replace the first occurrence per text node to keep things clean
      let replaced = false;
      result = result.replace(regex, (match) => {
        if (replaced) return match;
        replaced = true;
        return `<span class="glossary-term" data-term="${escapeAttr(term.toLowerCase())}" tabindex="0">${escapeHTML(match)}</span>`;
      });
    }
  }

  return result;
}

function handleTermHover(e) {
  const term = e.target.dataset.term;
  if (!term) return;
  showTooltip(e.target, term);
  showSidebarDefinition(term);
}

function handleTermClick(e) {
  e.preventDefault();
  const term = e.target.dataset.term;
  if (!term) return;
  showTooltip(e.target, term);
  showSidebarDefinition(term);

  // On mobile, check if we should show the bottom sheet
  if (window.innerWidth < 768) {
    showMobileDefinition(term);
  }
}

let hideTimeout = null;

function scheduleHideTooltip() {
  hideTimeout = setTimeout(hideTooltip, 200);
}

function showTooltip(targetEl, termKey) {
  if (hideTimeout) clearTimeout(hideTimeout);

  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry || !tooltipEl) return;

  tooltipEl.textContent = entry.short;
  tooltipEl.style.display = 'block';

  // Position above the term
  const rect = targetEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
  let top = rect.top - tipRect.height - 8;

  // Keep within viewport
  if (left < 8) left = 8;
  if (left + tipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tipRect.width - 8;
  }
  if (top < 8) {
    top = rect.bottom + 8; // Show below if no room above
  }

  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = (top + window.scrollY) + 'px';
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
}

function showSidebarDefinition(termKey) {
  if (!sidebarEl) return;

  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry) return;

  sidebarEl.innerHTML = `
    <h4 class="glossary-sidebar-term">${escapeHTML(entry.term)}</h4>
    <p class="glossary-sidebar-definition">${escapeHTML(entry.long)}</p>
  `;
  sidebarEl.classList.add('glossary-active');
}

/**
 * Show a mobile bottom sheet with the term definition
 */
function showMobileDefinition(termKey) {
  const entry = glossaryData.find(t => t.term.toLowerCase() === termKey.toLowerCase());
  if (!entry) return;

  // Remove any existing bottom sheet
  const existing = document.querySelector('.glossary-bottom-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.className = 'glossary-bottom-sheet';
  sheet.innerHTML = `
    <div class="glossary-bottom-sheet-content">
      <button class="glossary-bottom-sheet-close" aria-label="Close">&times;</button>
      <h4>${escapeHTML(entry.term)}</h4>
      <p>${escapeHTML(entry.long)}</p>
    </div>
  `;

  document.body.appendChild(sheet);

  // Trigger animation
  requestAnimationFrame(() => sheet.classList.add('visible'));

  // Close handlers
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

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
