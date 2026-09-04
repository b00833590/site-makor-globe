// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initPresentationsModal } from './presentationsModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    closeBtn: document.createElement('button'),
    triggerBtn: document.createElement('button'),
  };
}

describe('initPresentationsModal', () => {
  it('opens the modal when the trigger button is clicked', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    triggerBtn.click();
    expect(modalEl.classList.contains('open')).toBe(true);
  });

  it('closes the modal when the close button is clicked', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    const modal = initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    modal.open();
    closeBtn.click();
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('exposes open()/close() programmatically, independent of the buttons', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    const modal = initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    modal.open();
    expect(modalEl.classList.contains('open')).toBe(true);
    modal.close();
    expect(modalEl.classList.contains('open')).toBe(false);
  });
});
