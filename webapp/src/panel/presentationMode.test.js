// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initPresentationMode } from './presentationMode.js';

function makeElements() {
  return {
    toggleBtn: document.createElement('button'),
    rootEl: document.createElement('div'),
  };
}

describe('initPresentationMode', () => {
  it('defaults to inactive (no presentation-mode class, aria-pressed false)', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPresentationMode({ toggleBtn, bodyEl: rootEl });
    expect(rootEl.classList.contains('presentation-mode')).toBe(false);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('activates presentation mode and calls onEnter when enter() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const onEnter = vi.fn();
    const mode = initPresentationMode({ toggleBtn, bodyEl: rootEl, onEnter });
    mode.enter();
    expect(rootEl.classList.contains('presentation-mode')).toBe(true);
    expect(toggleBtn.classList.contains('active')).toBe(true);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('does not call onEnter again if already active', () => {
    const { toggleBtn, rootEl } = makeElements();
    const onEnter = vi.fn();
    const mode = initPresentationMode({ toggleBtn, bodyEl: rootEl, onEnter });
    mode.enter();
    mode.enter();
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('deactivates presentation mode when exit() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const mode = initPresentationMode({ toggleBtn, bodyEl: rootEl });
    mode.enter();
    mode.exit();
    expect(rootEl.classList.contains('presentation-mode')).toBe(false);
    expect(toggleBtn.classList.contains('active')).toBe(false);
  });

  it('toggles state on button click', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPresentationMode({ toggleBtn, bodyEl: rootEl });
    toggleBtn.click();
    expect(rootEl.classList.contains('presentation-mode')).toBe(true);
    toggleBtn.click();
    expect(rootEl.classList.contains('presentation-mode')).toBe(false);
  });

  it('exposes the current active state via isActive()', () => {
    const { toggleBtn, rootEl } = makeElements();
    const mode = initPresentationMode({ toggleBtn, bodyEl: rootEl });
    expect(mode.isActive()).toBe(false);
    mode.enter();
    expect(mode.isActive()).toBe(true);
  });
});
