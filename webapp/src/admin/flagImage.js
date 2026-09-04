// Same asset source as the sibling root `index.html` app: jdecked/twemoji (the
// actively-maintained twemoji fork), raster PNG rather than SVG — this app's
// jsPDF/html2canvas experiments (see pdfReportBuilder.js's own history) showed
// SVG twemoji assets don't rasterize reliably, while PNGs do, in both places
// flags are drawn. Pinned to a specific release so the URL never changes shape.
const TWEMOJI_PNG_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/';

// A flag emoji is a 2-codepoint "regional indicator" sequence (U+1F1E6-1F1FF,
// A-Z offset from U+1F1E6). Anything else (a stray "FR" typed as literal text,
// an empty value) isn't a real flag and has no matching image asset.
export function isFlagSequence(flag) {
  if (!flag) return false;
  const codePoints = [...flag].map(ch => ch.codePointAt(0));
  return codePoints.length === 2 && codePoints.every(cp => cp >= 0x1f1e6 && cp <= 0x1f1ff);
}

export function flagImageUrl(flag) {
  if (!isFlagSequence(flag)) return null;
  const codePoints = [...flag].map(ch => ch.codePointAt(0).toString(16));
  return `${TWEMOJI_PNG_BASE}${codePoints.join('-')}.png`;
}

// Builds an <img> for the live panel UI. Returns null when there's no real
// flag image to show (caller should fall back to rendering the raw value as
// text, e.g. a stray "FR" typed instead of a real flag emoji).
export function buildFlagImageEl(flag) {
  const url = flagImageUrl(flag);
  if (!url) return null;
  const img = document.createElement('img');
  img.className = 'flag-emoji';
  img.src = url;
  img.alt = flag;
  img.loading = 'lazy';
  return img;
}

// Appends `parts` (strings or DOM nodes, e.g. a flag <img>) into `parentEl`,
// dropping empty/falsy parts and joining survivors with a literal `separator`
// text node — the DOM-node equivalent of `parts.filter(Boolean).join(separator)`,
// needed wherever a flag image sits inline between text fields (index name,
// company yahooSymbol/country line).
export function appendJoinedParts(parentEl, parts, separator) {
  const surviving = parts.filter(Boolean);
  surviving.forEach((part, i) => {
    if (i > 0) parentEl.appendChild(document.createTextNode(separator));
    parentEl.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
  });
}
