// jsPDF's standard built-in fonts (Helvetica/Times/Courier) only encode CP1252
// (WinAnsi). Two failure modes seen live in the finance-desk bullet text:
//
//  1. Non-CP1252 SPACE variants (U+202F narrow no-break space in French
//     thousands separators like "64 611 pts"): the glyph draws but its advance
//     width is wrong, so every following character drifts and right-aligned text
//     overlaps its neighbour.
//  2. Non-CP1252 PUNCTUATION the analysts type by hand — "→", "≈", "≥", the
//     superscript "ᵉ" in "4ᵉ", etc. jsPDF mis-encodes these (→ renders as "!'",
//     ≈ as '"H') AND miscomputes their width, so splitTextToSize() under-measures
//     the line and pdf.text() then runs the bullet off the right edge of the page.
//
// Both are fixed at the source here: every string is normalised to plain CP1252
// before it reaches pdf.text() / splitTextToSize() / getTextWidth() / autoTable.
const SPECIAL_SPACE_CODEPOINTS = [0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000];
const SPECIAL_SPACES = new RegExp(`[${SPECIAL_SPACE_CODEPOINTS.map(cp => String.fromCodePoint(cp)).join('')}]`, 'g');

// Ordered list of [pattern, replacement]. Only characters that are NOT already
// in CP1252 are listed — "–", "—", "…", "«»", "±", "²³", curly quotes, "€", "•"
// all render fine and are deliberately left untouched.
const PUNCTUATION_REPLACEMENTS = [
  [/[→⇒⟶⟼➔➜➙↦]/g, '->'], // → ⇒ ⟶ ⟼ ➔ ➜ ➙ ↦
  [/[←⇐⟵]/g, '<-'],                              // ← ⇐ ⟵
  [/↔/g, '<->'],
  [/[≈≅≃∼∽]/g, '~'],                   // ≈ ≅ ≃ ∼ ∽
  [/≠/g, '!='],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≪/g, '<<'],
  [/≫/g, '>>'],
  [/−/g, '-'],                                             // U+2212 MINUS SIGN → hyphen
];

// Non-CP1252 superscript/subscript digits and the ordinal letters French text
// uses ("1ᵉʳ", "4ᵉ"). "¹²³" (U+00B9/B2/B3) ARE in CP1252 and are left as-is.
const SUPERSUB = {
  '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ᵉ': 'e', 'ʳ': 'r', 'ᵈ': 'd', 'ᵗ': 't', 'ˢ': 's', 'ᵒ': 'o', 'ᵃ': 'a', 'ᵐ': 'm',
};
const SUPERSUB_RE = new RegExp(`[${Object.keys(SUPERSUB).join('')}]`, 'g');

export function safeText(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).replace(SPECIAL_SPACES, ' ');
  for (const [pattern, replacement] of PUNCTUATION_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(SUPERSUB_RE, ch => SUPERSUB[ch]);
  return text;
}
