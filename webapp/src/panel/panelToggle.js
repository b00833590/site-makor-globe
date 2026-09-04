export function initPanelToggle({ toggleBtn, bodyEl, defaultOpen = false }) {
  let isOpen = defaultOpen;

  function apply() {
    bodyEl.classList.toggle('panel-open', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    toggleBtn.setAttribute('aria-label', isOpen ? 'Masquer le panneau d\'informations' : 'Afficher le panneau d\'informations');
    toggleBtn.textContent = isOpen ? '›' : '‹';
  }

  function open() {
    isOpen = true;
    apply();
  }

  function close() {
    isOpen = false;
    apply();
  }

  function toggle() {
    isOpen = !isOpen;
    apply();
  }

  toggleBtn.addEventListener('click', toggle);
  apply();

  return { isOpen: () => isOpen, open, close, toggle };
}
