const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

export function clampPanelWidth(width, { min = MIN_WIDTH, max = MAX_WIDTH } = {}) {
  return Math.min(max, Math.max(min, width));
}

// Lets the admin drag the border between the globe and the side panel to
// resize it. #globe-container, .region-indicator, .arrow-next and
// .panel-toggle-btn all already read var(--panel-width, 460px) (globe.css,
// panelToggle.css), and the globe itself re-fits via a ResizeObserver on its
// container (globeScene.js) — so setting this one custom property on <body>
// is enough to resize everything in sync, no extra wiring needed. Set on
// body (not :root) so this inline value also wins over presentation-mode's
// own `body.presentation-mode { --panel-width: 760px }` (globe.css/
// sidePanel.css): once an admin has picked a width, it's a deliberate
// per-presentation choice that should stick even if presentation mode is
// toggled afterwards.
export function initPanelResize({
  handleEl,
  bodyEl,
  storage = window.localStorage,
  storageKey = 'mkg:panelWidth',
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  getViewportWidth = () => window.innerWidth,
}) {
  let dragging = false;
  let currentWidth = null;

  function applyWidth(width) {
    currentWidth = clampPanelWidth(width, { min: minWidth, max: maxWidth });
    bodyEl.style.setProperty('--panel-width', `${currentWidth}px`);
  }

  // Restore the admin's last chosen width, if any — otherwise leave
  // --panel-width untouched so the existing :root/presentation-mode defaults
  // (460px / 760px) keep governing it exactly as before this feature.
  const stored = storage ? Number(storage.getItem(storageKey)) : NaN;
  if (Number.isFinite(stored) && stored > 0) applyWidth(stored);

  function persistWidth() {
    if (!storage || currentWidth == null) return;
    try {
      storage.setItem(storageKey, String(currentWidth));
    } catch {
      // Storage unavailable (private browsing, quota) — the width still
      // applies for this session, it just won't survive a reload.
    }
  }

  function onPointerMove(event) {
    if (!dragging) return;
    applyWidth(getViewportWidth() - event.clientX);
  }

  function stopDragging() {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    bodyEl.classList.remove('panel-resizing');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', stopDragging);
    persistWidth();
  }

  function startDragging(event) {
    if (event.button !== undefined && event.button !== 0) return; // left click / primary pointer only
    dragging = true;
    handleEl.classList.add('dragging');
    bodyEl.classList.add('panel-resizing');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', stopDragging);
    event.preventDefault();
  }

  handleEl.addEventListener('pointerdown', startDragging);

  return { getWidth: () => currentWidth };
}
