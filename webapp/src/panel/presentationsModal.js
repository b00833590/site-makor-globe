import { initScrollActivity } from '../styles/scrollActivity.js';

export function initPresentationsModal({ modalEl, closeBtn, triggerBtn }) {
  function open() {
    modalEl.classList.add('open');
  }

  function close() {
    modalEl.classList.remove('open');
  }

  triggerBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  const contentEl = modalEl.querySelector('.presentations-modal-content');
  if (contentEl) initScrollActivity(contentEl);

  return { open, close };
}
