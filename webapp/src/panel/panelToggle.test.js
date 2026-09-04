// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initPanelToggle } from './panelToggle.js';

function makeElements() {
  return {
    toggleBtn: document.createElement('button'),
    rootEl: document.createElement('div'),
  };
}

describe('initPanelToggle', () => {
  it('defaults to collapsed (no panel-open class, aria-expanded false) when defaultOpen is not passed', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPanelToggle({ toggleBtn, bodyEl: rootEl });
    expect(rootEl.classList.contains('panel-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel and updates aria-expanded/icon when open() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl });
    panel.open();
    expect(rootEl.classList.contains('panel-open')).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(toggleBtn.textContent).toBe('›');
  });

  it('closes the panel when close() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl, defaultOpen: true });
    panel.close();
    expect(rootEl.classList.contains('panel-open')).toBe(false);
    expect(toggleBtn.textContent).toBe('‹');
  });

  it('toggles state on button click', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPanelToggle({ toggleBtn, bodyEl: rootEl });
    toggleBtn.click();
    expect(rootEl.classList.contains('panel-open')).toBe(true);
    toggleBtn.click();
    expect(rootEl.classList.contains('panel-open')).toBe(false);
  });

  it('exposes the current open state via isOpen()', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl });
    expect(panel.isOpen()).toBe(false);
    panel.open();
    expect(panel.isOpen()).toBe(true);
  });
});
