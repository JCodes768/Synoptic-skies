/**
 * AFD Parser for Synoptic Skies
 * Parses raw NWS Area Forecast Discussion text into structured sections.
 */

const SECTION_CONFIG = {
  'KEY MESSAGES': { display: 'Key Messages', priority: 8, collapsed: true, special: true },
  'SYNOPSIS': { display: 'Synopsis', priority: 1, collapsed: false },
  'SHORT TERM': { display: 'Short Term', priority: 2, collapsed: false },
  'NEAR TERM': { display: 'Near Term', priority: 2, collapsed: false },
  'LONG TERM': { display: 'Long Term', priority: 3, collapsed: false },
  'EXTENDED': { display: 'Extended', priority: 3, collapsed: false },
  'AVIATION': { display: 'Aviation', priority: 50, collapsed: true, supplemental: true },
  'MARINE': { display: 'Marine', priority: 50, collapsed: true, supplemental: true },
  'FIRE WEATHER': { display: 'Fire Weather', priority: 4, collapsed: false },
  'CLIMATE': { display: 'Climate', priority: 6, collapsed: true },
  'HYDROLOGY': { display: 'Hydrology', priority: 5, collapsed: true },
  'UPDATE': { display: 'Update', priority: 0, collapsed: false }
};

// Only these section names are valid for author attribution
const VALID_AUTHOR_SECTIONS = new Set([
  'SYNOPSIS', 'SHORT TERM', 'NEAR TERM', 'LONG TERM', 'EXTENDED',
  'AVIATION', 'MARINE', 'FIRE WEATHER', 'CLIMATE', 'HYDROLOGY',
  'UPDATE', 'KEY MESSAGES'
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

  // Attach authors to their sections
  for (const section of sections) {
    const authorKey = findAuthorKey(section.name, authors);
    if (authorKey) {
      section.author = authors[authorKey];
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
 * Filters to only known section names, removing artifacts like
 * "VISIT US", URLs, office names, etc.
 */
function extractAuthors(text) {
  const authors = {};
  const dollarIndex = text.lastIndexOf('$$');
  if (dollarIndex === -1) return authors;

  const attribution = text.substring(dollarIndex + 2);
  const lines = attribution.split('\n');

  for (const line of lines) {
    // Match "SECTION NAME...AuthorCode" pattern
    const match = line.match(/^\s*([A-Z][A-Z\s/]+?)\.{2,}\s*([A-Za-z][A-Za-z/\s]*)/);
    if (!match) continue;

    const sectionName = match[1].trim();
    let authorName = match[2].trim();

    // Only keep known forecast section attributions
    if (!isKnownSection(sectionName)) continue;

    // Clean the author name: take only the first word/code
    // Author codes are typically short like "Sarment", "Smith", "AB"
    authorName = authorName.split(/\s+/)[0].replace(/[^A-Za-z/]/g, '');

    if (!authorName || authorName.length === 0 || authorName.length > 25) continue;

    authors[sectionName] = authorName;
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

  const sectionRegex = /\.([A-Z][A-Z\s/]+?)\.{3}/g;
  const matches = [];
  let match;

  while ((match = sectionRegex.exec(bodyText)) !== null) {
    matches.push({
      name: match[1].trim(),
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

function extractTimeRange(body) {
  const lines = body.split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (/^[A-Z][a-z]+(?:\s+\w+)?\s+through\s+[A-Z][a-z]+/i.test(line)) {
      return line;
    }
    if (/^\w{3}\s+\d{1,2}\s+through\s+\w{3}\s+\d{1,2}/i.test(line)) {
      return line;
    }
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

  if (lines.length > 0) {
    const first = lines[0].trim();
    if (/^[A-Z][a-z]+(?:\s+\w+)?\s+through\s+[A-Z][a-z]+/i.test(first) ||
        /^\w{3}\s+\d{1,2}\s+through\s+\w{3}\s+\d{1,2}/i.test(first)) {
      lines.shift();
    }
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

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
