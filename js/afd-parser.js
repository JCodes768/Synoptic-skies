/**
 * AFD Parser for Synoptic Skies
 * Parses raw NWS Area Forecast Discussion text into structured sections.
 *
 * AFD format:
 * - WMO header line(s) at top
 * - Product identifier (AFDMTR, etc.)
 * - Sections delimited by .SECTION_NAME...
 * - Section content ends with &&
 * - Author attributions after $$ at bottom
 * - Timestamps like "Issued at 143 AM PST Thu Dec 18 2025"
 */

// Section names we recognize and their display configuration
const SECTION_CONFIG = {
  'KEY MESSAGES': { display: 'Key Messages', priority: 0, collapsed: false, special: true },
  'SYNOPSIS': { display: 'Synopsis', priority: 1, collapsed: false },
  'SHORT TERM': { display: 'Short Term', priority: 2, collapsed: false },
  'NEAR TERM': { display: 'Near Term', priority: 2, collapsed: false },
  'LONG TERM': { display: 'Long Term', priority: 3, collapsed: false },
  'EXTENDED': { display: 'Extended', priority: 3, collapsed: false },
  'AVIATION': { display: 'Aviation', priority: 5, collapsed: true },
  'MARINE': { display: 'Marine', priority: 4, collapsed: false },
  'FIRE WEATHER': { display: 'Fire Weather', priority: 4, collapsed: false },
  'CLIMATE': { display: 'Climate', priority: 6, collapsed: true },
  'HYDROLOGY': { display: 'Hydrology', priority: 4, collapsed: true },
  'UPDATE': { display: 'Update', priority: 0, collapsed: false }
};

/**
 * Parse raw AFD text into structured data
 * @param {string} rawText - Raw AFD product text
 * @returns {Object} Parsed AFD with sections, authors, and metadata
 */
export function parseAFD(rawText) {
  if (!rawText) return { sections: [], authors: {}, timestamp: null };

  const lines = rawText.split('\n');

  // Extract product-level timestamp from header
  const productTimestamp = extractProductTimestamp(lines);

  // Find and extract author attributions from bottom (after $$)
  const authors = extractAuthors(rawText);

  // Split into sections
  const sections = extractSections(rawText);

  // Attach authors to their sections
  for (const section of sections) {
    const authorKey = findAuthorKey(section.name, authors);
    if (authorKey) {
      section.author = authors[authorKey];
    }
  }

  return {
    sections,
    authors,
    timestamp: productTimestamp
  };
}

/**
 * Extract the product timestamp from the header area
 */
function extractProductTimestamp(lines) {
  // Look for patterns like "643 AM PST Wed Dec 18 2024" or "Issued at..."
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const match = lines[i].match(
      /(\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})/i
    );
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Extract author attributions from the bottom of the AFD
 * Format: "SECTION NAME...AuthorName" after the $$ terminator
 */
function extractAuthors(text) {
  const authors = {};
  const dollarIndex = text.lastIndexOf('$$');
  if (dollarIndex === -1) return authors;

  const attribution = text.substring(dollarIndex + 2);
  // Match patterns like "SHORT TERM...Sarment" or "AVIATION...Smith/Johnson"
  const authorRegex = /([A-Z\s/]+?)\.{2,}\s*([A-Za-z/\s]+)/g;
  let match;
  while ((match = authorRegex.exec(attribution)) !== null) {
    const sectionName = match[1].trim();
    const authorName = match[2].trim();
    if (authorName && authorName.length > 0 && authorName.length < 40) {
      authors[sectionName] = authorName;
    }
  }

  return authors;
}

/**
 * Find the best matching author key for a section name
 */
function findAuthorKey(sectionName, authors) {
  const normalized = sectionName.toUpperCase();
  // Direct match
  if (authors[normalized]) return normalized;
  // Partial match
  for (const key of Object.keys(authors)) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  return null;
}

/**
 * Extract sections from the AFD text
 */
function extractSections(text) {
  const sections = [];

  // Remove everything after $$ (author attributions)
  const dollarIndex = text.lastIndexOf('$$');
  const bodyText = dollarIndex !== -1 ? text.substring(0, dollarIndex) : text;

  // Match section headers: .SECTION NAME...
  // The pattern captures the section name and then everything until the next section or &&
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

    // Extract the body between this header and the next section (or end)
    let body = bodyText.substring(current.headerEnd, nextStart);

    // Remove the && terminator
    const terminatorIndex = body.lastIndexOf('&&');
    if (terminatorIndex !== -1) {
      body = body.substring(0, terminatorIndex);
    }

    body = body.trim();
    if (!body) continue;

    // Extract timestamp from the section body
    const sectionTimestamp = extractSectionTimestamp(body);

    // Extract time range (e.g., "Today through Friday")
    const timeRange = extractTimeRange(body);

    // Clean the body text
    const cleanedBody = cleanBody(body, current.name);

    // Get display config
    const config = SECTION_CONFIG[current.name] || {
      display: titleCase(current.name),
      priority: 10,
      collapsed: true
    };

    // Detect watches/warnings/advisories section
    const isWWA = current.name.includes('WATCHES') ||
      current.name.includes('WARNINGS') ||
      current.name.includes('ADVISORIES');

    sections.push({
      name: current.name,
      displayName: config.display,
      priority: config.priority,
      collapsed: config.collapsed,
      isSpecial: config.special || false,
      isWWA,
      timestamp: sectionTimestamp,
      timeRange,
      body: cleanedBody,
      author: null
    });
  }

  // Sort by priority
  sections.sort((a, b) => a.priority - b.priority);

  return sections;
}

/**
 * Extract a timestamp from within a section's body
 */
function extractSectionTimestamp(body) {
  const match = body.match(
    /(\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})/i
  );
  return match ? match[1].trim() : null;
}

/**
 * Extract a time range like "Today through Friday" from the body
 */
function extractTimeRange(body) {
  const lines = body.split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    // Match patterns like "Today through Friday" or "Saturday through Wednesday"
    if (/^[A-Z][a-z]+(?:\s+\w+)?\s+through\s+[A-Z][a-z]+/i.test(line)) {
      return line;
    }
    // Match date ranges like "Dec 18 through Dec 22"
    if (/^\w{3}\s+\d{1,2}\s+through\s+\w{3}\s+\d{1,2}/i.test(line)) {
      return line;
    }
  }
  return null;
}

/**
 * Clean the body text, removing timestamps and metadata lines at the top
 */
function cleanBody(body, sectionName) {
  let lines = body.split('\n');

  // Remove leading empty lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  // Remove timestamp line if it's in the first few lines
  const timestampPattern = /^\d{1,4}\s*(?:AM|PM)\s+\w{3,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}/i;
  if (lines.length > 0 && timestampPattern.test(lines[0].trim())) {
    lines.shift();
  }

  // Remove time range line (e.g., "Today through Friday") — we've already extracted it
  if (lines.length > 0) {
    const first = lines[0].trim();
    if (/^[A-Z][a-z]+(?:\s+\w+)?\s+through\s+[A-Z][a-z]+/i.test(first) ||
        /^\w{3}\s+\d{1,2}\s+through\s+\w{3}\s+\d{1,2}/i.test(first)) {
      lines.shift();
    }
  }

  // Remove leading/trailing empty lines again
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.join('\n');
}

/**
 * Convert a section body to HTML paragraphs
 * Preserves the monospace feel while adding structure
 */
export function bodyToHTML(body, isKeyMessages = false) {
  if (!body) return '';

  if (isKeyMessages) {
    return formatKeyMessages(body);
  }

  // Split on double newlines for paragraphs, or single newlines with blank line pattern
  const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim());

  return paragraphs.map(p => {
    // Clean up whitespace within each paragraph
    const text = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return `<p>${escapeHTML(text)}</p>`;
  }).join('\n');
}

/**
 * Format the KEY MESSAGES section as a list
 */
function formatKeyMessages(body) {
  const lines = body.split('\n').filter(l => l.trim());
  const items = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect bullet items (starting with -, *, or number)
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
