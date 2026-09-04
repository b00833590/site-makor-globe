const DEFAULT_DURATION_MS = 2200;

export function showToast(toastEl, message, durationMs = DEFAULT_DURATION_MS) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), durationMs);
}
