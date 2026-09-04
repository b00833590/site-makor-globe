export const COLOR_PALETTE = [
  '#1c2233', '#4b5568', '#8b95a5', '#c0392b', '#e74c3c', '#e67e22', '#f1c40f',
  '#c9971f', '#16a34a', '#1c8a4b', '#0e7c66', '#0aa89e', '#2980b9', '#2f6fed',
  '#0f1730', '#6c3fc5', '#9b59b6', '#d63384', '#8d6e63', '#5c4033', '#000000',
];

const DEFAULT_DOT_COLOR = '#c8ccd6';

function closeColorPopup() {
  document.getElementById('active-color-popup')?.remove();
}

function openColorPopup(dot, onPick) {
  closeColorPopup();
  const rect = dot.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.id = 'active-color-popup';
  popup.className = 'color-popup';
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;

  for (const color of COLOR_PALETTE) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(color);
      closeColorPopup();
    });
    popup.appendChild(swatch);
  }

  const reset = document.createElement('div');
  reset.className = 'color-swatch color-swatch-reset';
  reset.textContent = '✕';
  reset.title = 'Réinitialiser (couleur par défaut)';
  reset.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick(null);
    closeColorPopup();
  });
  popup.appendChild(reset);

  document.body.appendChild(popup);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('#active-color-popup')) closeColorPopup();
});

export function buildColorDot(currentColor, onPick) {
  const dot = document.createElement('span');
  dot.className = 'color-dot';
  dot.style.background = currentColor || DEFAULT_DOT_COLOR;
  dot.title = 'Choisir une couleur';
  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    openColorPopup(dot, onPick);
  });
  return dot;
}
