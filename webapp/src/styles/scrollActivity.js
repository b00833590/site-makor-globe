const SCROLL_IDLE_DELAY_MS = 600;

// Toggles .is-scrolling on `el` while it's actively being scrolled, removed
// after a short idle delay — shared by every vertical scroll container that
// uses the .scroll-y-styled class (see scrollbar.css), mirroring the same
// idle-timeout pattern already used by the horizontal week-timeline scrollbar.
export function initScrollActivity(el) {
  let idleTimer = null;
  el.addEventListener('scroll', () => {
    el.classList.add('is-scrolling');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_IDLE_DELAY_MS);
  }, { passive: true });
}
