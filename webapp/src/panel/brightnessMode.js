const LEVELS = ['standard', 'lumineux', 'tres-lumineux'];
const LABELS = {
  standard: 'Standard',
  lumineux: 'Lumineux',
  'tres-lumineux': 'Très lumineux',
};

// Cycling brightness toggle for well-lit presentation rooms — mirrors
// presentationMode.js's shape (a single button driving a body attribute
// that CSS keys off of), but as a 3-level cycle instead of a boolean.
// brightnessMode.css overrides the --surface*/--border/--text-muted design
// tokens per level; because ~18 stylesheets across the app already read
// those tokens (panels, cards, modals, buttons), setting the one attribute
// here is enough to brighten the whole UI in sync, without touching --navy/
// --navy2 (the globe/space backdrop, deliberately kept dark) or --accent
// (the theme's one deliberate strong-contrast color) — same reasoning
// globe.css documents for why those two are protected.
export function initBrightnessMode({ toggleBtn, bodyEl, storage = window.localStorage, storageKey = 'mkg:brightness' }) {
  const stored = storage ? storage.getItem(storageKey) : null;
  let level = LEVELS.includes(stored) ? stored : LEVELS[0];

  function apply() {
    if (level === 'standard') delete bodyEl.dataset.brightness;
    else bodyEl.dataset.brightness = level;
    toggleBtn.textContent = `☀️ Luminosité : ${LABELS[level]}`;
    toggleBtn.setAttribute('aria-label', `Luminosité actuelle : ${LABELS[level]}. Cliquer pour changer de niveau.`);
  }

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(storageKey, level);
    } catch {
      // Storage unavailable (private browsing, quota) — the level still
      // applies for this session, it just won't survive a reload.
    }
  }

  function cycle() {
    level = LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
    apply();
    persist();
  }

  toggleBtn.addEventListener('click', cycle);
  apply();

  return { getLevel: () => level, cycle };
}
