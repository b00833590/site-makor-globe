// Big-screen "Presentation Mode" toggle — mirrors panelToggle.js's shape
// (a body class flipped by a floating button), but additionally opens the
// side panel on entry (onEnter) since the whole point of this mode is to
// show the panel's content large and clear, not just declutter the globe.
// No persistence, same as the panel toggle — off by default every session.
export function initPresentationMode({ toggleBtn, bodyEl, onEnter }) {
  let isActive = false;

  function apply() {
    bodyEl.classList.toggle('presentation-mode', isActive);
    toggleBtn.classList.toggle('active', isActive);
    toggleBtn.setAttribute('aria-pressed', String(isActive));
    toggleBtn.textContent = isActive ? '🖥️ Quitter la présentation' : '🖥️ Mode Présentation';
  }

  function enter() {
    if (isActive) return;
    isActive = true;
    apply();
    if (onEnter) onEnter();
  }

  function exit() {
    isActive = false;
    apply();
  }

  function toggle() {
    if (isActive) exit(); else enter();
  }

  toggleBtn.addEventListener('click', toggle);
  apply();

  return { isActive: () => isActive, enter, exit, toggle };
}
