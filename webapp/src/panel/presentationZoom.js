// Manual zoom for the presentation-mode content (side panel + chart modal),
// replacing the old fixed set of hardcoded font-size bumps that used to
// apply automatically the moment presentation mode turned on — that jump
// was itself "the automatic zoom" this replaces. CSS `zoom` (not `transform:
// scale`) is used deliberately: it rescales layout AND text together on the
// target element without needing a per-descendant font-size override for
// every component (indices, news, companies, portfolio, chart modal), and —
// unlike a `transform` — it never triggers a browser-level page zoom, since
// it's set on these specific containers, not `html`/`body`.
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.6;
const STEP = 0.1;
const DEFAULT_ZOOM = 1;

export function initPresentationZoom({ outBtn, inBtn, valueEl, targets }) {
  let level = DEFAULT_ZOOM;

  function apply() {
    targets.forEach((el) => { if (el) el.style.zoom = String(level); });
    if (valueEl) valueEl.textContent = `${Math.round(level * 100)}%`;
    if (outBtn) outBtn.disabled = level <= MIN_ZOOM;
    if (inBtn) inBtn.disabled = level >= MAX_ZOOM;
  }

  function setLevel(next) {
    level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
    apply();
  }

  function reset() {
    setLevel(DEFAULT_ZOOM);
  }

  if (outBtn) outBtn.addEventListener('click', () => setLevel(level - STEP));
  if (inBtn) inBtn.addEventListener('click', () => setLevel(level + STEP));
  apply();

  return { getLevel: () => level, setLevel, reset };
}
