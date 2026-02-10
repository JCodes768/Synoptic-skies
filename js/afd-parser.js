/**
 * AFD Parser for Synoptic Skies
 * Parses raw NWS Area Forecast Discussion text into structured sections.
 */

const SECTION_CONFIG = {
  // Core narrative sections (expanded by default)
  'UPDATE': { display: 'Update', priority: 0, collapsed: false },
  'WHAT HAS CHANGED': { display: 'What Has Changed', priority: 0, collapsed: false },
  'SYNOPSIS': { display: 'Synopsis', priority: 1, collapsed: false },
  'DISCUSSION': { display: 'Discussion', priority: 1, collapsed: false },
  'SHORT TERM': { display: 'Short Term', priority: 2, collapsed: false },
  'NEAR TERM': { display: 'Near Term', priority: 2, collapsed: false },
  'LONG TERM': { display: 'Long Term', priority: 3, collapsed: false },
  'EXTENDED': { display: 'Extended', priority: 3, collapsed: false },
  'FIRE WEATHER': { display: 'Fire Weather', priority: 4, collapsed: false },
  'HYDROLOGY': { display: 'Hydrology', priority: 5, collapsed: false },

  // Deprioritized / collapsed sections
  'KEY MESSAGES': { display: 'Key Messages', priority: 8, collapsed: true, special: true },
  'CLIMATE': { display: 'Climate', priority: 6, collapsed: true },
  'PRELIMINARY POINT TEMPS/POPS': { display: 'Point Temps & PoPs', priority: 7, collapsed: true },
  'SPOTTER INFORMATION STATEMENT': { display: 'Spotter Info', priority: 9, collapsed: true },

  // Supplemental sections (separate area below main content)
  'AVIATION': { display: 'Aviation', priority: 50, collapsed: true, supplemental: true },
  'MARINE': { display: 'Marine', priority: 50, collapsed: true, supplemental: true },
};

// Only these section names are valid for author attribution
const VALID_AUTHOR_SECTIONS = new Set([
  'SYNOPSIS', 'DISCUSSION', 'SHORT TERM', 'NEAR TERM', 'LONG TERM', 'EXTENDED',
  'AVIATION', 'MARINE', 'FIRE WEATHER', 'CLIMATE', 'HYDROLOGY',
  'UPDATE', 'KEY MESSAGES', 'WHAT HAS CHANGED'
]);

/**
 * Parse raw AFD text into structured data
 */
export function parseAFD(rawText) {
  if (!rawText) return { sections: [], authors: {}, timestamp: null };

  const lines = rawText.split('\n');
  const productTimestamp = extractProductTimestamp(lines);
  const authors = extractAuthors(rawText);
  const sections = extractSections(rawText);

  // Attach authors and fallback timestamps to sections
  for (const section of sections) {
    const authorKey = findAuthorKey(section.name, authors);
    if (authorKey) {
      section.author = authors[authorKey];
    } else if (authors['_general']) {
      // Fallback: some offices attribute the whole AFD to one person
      section.author = authors['_general'];
    }
    // If section has no timestamp, inherit the product-level timestamp
    if (!section.timestamp && productTimestamp) {
      section.timestamp = productTimestamp;
    }
  }

  return { sections, authors, timestamp: productTimestamp };
}

function extractProductTimestamp(lines) {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const match = lines[i].match(
      /(\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})/i
    );
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Extract author attributions from the bottom of the AFD.
 * Handles multiple formats:
 *   - "SECTION NAME...AuthorCode" (MTR, BOX style)
 *   - Bare "AuthorName" or "AuthorA/AuthorB" lines (GSP, PQ style)
 */
function extractAuthors(text) {
  const authors = {};
  const dollarIndex = text.lastIndexOf('$$');
  if (dollarIndex === -1) return authors;

  const attribution = text.substring(dollarIndex + 2);
  const lines = attribution.split('\n');

  let foundSectionStyle = false;

  for (const line of lines) {
    // Match "SECTION NAME...AuthorCode" pattern (standard format)
    const match = line.match(/^\s*([A-Z][A-Z\s/]+?)\.{2,}\s*([A-Za-z][A-Za-z/\s]*)/);
    if (!match) continue;

    const sectionName = match[1].trim();
    let authorName = match[2].trim();

    // Only keep known forecast section attributions
    if (!isKnownSection(sectionName)) continue;

    // Clean the author name: take only the first word/code
    authorName = authorName.split(/\s+/)[0].replace(/[^A-Za-z/]/g, '');

    if (!authorName || authorName.length === 0 || authorName.length > 25) continue;

    authors[sectionName] = authorName;
    foundSectionStyle = true;
  }

  // If no section-style attributions found, look for bare author names
  // (some offices just put "Smith" or "JW/AB" after $$)
  if (!foundSectionStyle) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip lines that look like URLs, office names, or boilerplate
      if (trimmed.includes('http') || trimmed.includes('www') ||
          trimmed.includes('NATIONAL') || trimmed.includes('WEATHER SERVICE') ||
          trimmed.includes('VISIT') || trimmed.length > 40) continue;
      // Match initials/names like "JW", "Smith", "Smith/Jones"
      const nameMatch = trimmed.match(/^([A-Za-z][A-Za-z/\s]{0,30})$/);
      if (nameMatch) {
        const name = nameMatch[1].trim().split(/\s+/)[0].replace(/[^A-Za-z/]/g, '');
        if (name && name.length >= 1 && name.length <= 25) {
          authors['_general'] = name;
          break;
        }
      }
    }
  }

  return authors;
}

/**
 * Check if a section name matches a known forecast section
 */
function isKnownSection(name) {
  if (VALID_AUTHOR_SECTIONS.has(name)) return true;
  for (const valid of VALID_AUTHOR_SECTIONS) {
    if (valid.includes(name) || name.includes(valid)) return true;
  }
  return false;
}

function findAuthorKey(sectionName, authors) {
  const normalized = sectionName.toUpperCase();
  if (authors[normalized]) return normalized;
  for (const key of Object.keys(authors)) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  return null;
}

function extractSections(text) {
  const sections = [];
  const dollarIndex = text.lastIndexOf('$$');
  const bodyText = dollarIndex !== -1 ? text.substring(0, dollarIndex) : text;

  // Match section headers: .SECTION NAME... or .SECTION NAME /time range/...
  const sectionRegex = /\.([A-Z][A-Z\s/]+?)(?:\s*\/[^/]*\/\s*)?\.{3}/g;
  const matches = [];
  let match;

  while ((match = sectionRegex.exec(bodyText)) !== null) {
    // Normalize section name: strip any trailing time range qualifier
    const rawName = match[1].trim();
    // Extract just the known section name prefix
    const name = normalizeSecName(rawName);
    matches.push({
      name,
      startIndex: match.index,
      headerEnd: match.index + match[0].length
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].startIndex : bodyText.length;

    let body = bodyText.substring(current.headerEnd, nextStart);

    const terminatorIndex = body.lastIndexOf('&&');
    if (terminatorIndex !== -1) {
      body = body.substring(0, terminatorIndex);
    }

    body = body.trim();
    if (!body) continue;

    const sectionTimestamp = extractSectionTimestamp(body);
    const timeRange = extractTimeRange(body);
    const cleanedBody = cleanBody(body);

    const config = SECTION_CONFIG[current.name] || {
      display: titleCase(current.name),
      priority: 10,
      collapsed: true
    };

    const isWWA = current.name.includes('WATCHES') ||
      current.name.includes('WARNINGS') ||
      current.name.includes('ADVISORIES');

    sections.push({
      name: current.name,
      displayName: config.display,
      priority: config.priority,
      collapsed: config.collapsed,
      isSpecial: config.special || false,
      isSupplemental: config.supplemental || false,
      isWWA,
      timestamp: sectionTimestamp,
      timeRange,
      body: cleanedBody,
      author: null
    });
  }

  sections.sort((a, b) => a.priority - b.priority);
  return sections;
}

function extractSectionTimestamp(body) {
  const match = body.match(
    /(\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})/i
  );
  return match ? match[1].trim() : null;
}

function isStandaloneTimeRange(line) {
  // Must be short and free of sentence punctuation — real time ranges are
  // standalone labels like "Tonight through Wednesday", not body text.
  if (!line || line.length > 60 || line.includes('.') || line.includes(',')) return false;
  // Pattern 1: starts with a day name / Tonight / Today / This
  if (/^(?:today|tonight|this\s+\w+|(?:sun|mon|tue|wed|thu|fri|sat)\w*(?:\s+(?:night|afternoon|evening|morning))?)\s+through\s+/i.test(line)) {
    return true;
  }
  // Pattern 2: abbreviated date range "Mon 10 through Fri 14"
  if (/^\w{3}\s+\d{1,2}\s+through\s+\w{3}\s+\d{1,2}/i.test(line)) {
    return true;
  }
  return false;
}

function extractTimeRange(body) {
  const lines = body.split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (isStandaloneTimeRange(line)) return line;
  }
  return null;
}

function cleanBody(body) {
  let lines = body.split('\n');

  while (lines.length > 0 && lines[0].trim() === '') lines.shift();

  const timestampPattern = /^\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}/i;
  if (lines.length > 0 && timestampPattern.test(lines[0].trim())) {
    lines.shift();
  }

  if (lines.length > 0 && isStandaloneTimeRange(lines[0].trim())) {
    lines.shift();
  }

  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.join('\n');
}

/**
 * Convert a section body to HTML paragraphs
 */
export function bodyToHTML(body, isKeyMessages = false) {
  if (!body) return '';

  if (isKeyMessages) {
    return formatKeyMessages(body);
  }

  const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim());

  return paragraphs.map(p => {
    const text = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return `<p>${escapeHTML(text)}</p>`;
  }).join('\n');
}

function formatKeyMessages(body) {
  const lines = body.split('\n').filter(l => l.trim());
  const items = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]/.test(trimmed) || /^\d+[.)]/.test(trimmed)) {
      if (current) items.push(current);
      current = trimmed.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
    } else if (current) {
      current += ' ' + trimmed;
    } else {
      current = trimmed;
    }
  }
  if (current) items.push(current);

  if (items.length === 0) return `<p>${escapeHTML(body)}</p>`;

  return '<ul>' +
    items.map(item => `<li>${escapeHTML(item)}</li>`).join('\n') +
    '</ul>';
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeSecName(rawName) {
  const upper = rawName.toUpperCase().trim();
  // Direct match
  if (SECTION_CONFIG[upper]) return upper;
  // Try matching known section names as prefixes (e.g., "SHORT TERM" from "SHORT TERM THROUGH TUESDAY")
  for (const key of Object.keys(SECTION_CONFIG)) {
    if (upper.startsWith(key)) return key;
  }
  // Also check VALID_AUTHOR_SECTIONS
  for (const key of VALID_AUTHOR_SECTIONS) {
    if (upper.startsWith(key)) return key;
  }
  return upper;
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
