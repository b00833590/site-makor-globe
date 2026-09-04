// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initBrightnessMode } from './brightnessMode.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: vi.fn(key => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = value; }),
  };
}

function makeElements() {
  return {
    toggleBtn: document.createElement('button'),
    bodyEl: document.createElement('div'),
  };
}

describe('initBrightnessMode', () => {
  it('defaults to standard (no data-brightness attribute) when nothing is stored', () => {
    const { toggleBtn, bodyEl } = makeElements();
    initBrightnessMode({ toggleBtn, bodyEl, storage: makeStorage() });
    expect(bodyEl.dataset.brightness).toBeUndefined();
    expect(toggleBtn.textContent).toBe('☀️ Luminosité : Standard');
  });

  it('restores a previously stored level on init', () => {
    const { toggleBtn, bodyEl } = makeElements();
    initBrightnessMode({ toggleBtn, bodyEl, storage: makeStorage({ 'mkg:brightness': 'lumineux' }) });
    expect(bodyEl.dataset.brightness).toBe('lumineux');
    expect(toggleBtn.textContent).toBe('☀️ Luminosité : Lumineux');
  });

  it('ignores an unrecognized stored value and falls back to standard', () => {
    const { toggleBtn, bodyEl } = makeElements();
    initBrightnessMode({ toggleBtn, bodyEl, storage: makeStorage({ 'mkg:brightness': 'not-a-level' }) });
    expect(bodyEl.dataset.brightness).toBeUndefined();
  });

  it('cycles standard -> lumineux -> tres-lumineux -> standard on each click', () => {
    const { toggleBtn, bodyEl } = makeElements();
    initBrightnessMode({ toggleBtn, bodyEl, storage: makeStorage() });

    toggleBtn.click();
    expect(bodyEl.dataset.brightness).toBe('lumineux');
    expect(toggleBtn.textContent).toBe('☀️ Luminosité : Lumineux');

    toggleBtn.click();
    expect(bodyEl.dataset.brightness).toBe('tres-lumineux');
    expect(toggleBtn.textContent).toBe('☀️ Luminosité : Très lumineux');

    toggleBtn.click();
    expect(bodyEl.dataset.brightness).toBeUndefined();
    expect(toggleBtn.textContent).toBe('☀️ Luminosité : Standard');
  });

  it('persists the level to storage on every change', () => {
    const { toggleBtn, bodyEl } = makeElements();
    const storage = makeStorage();
    initBrightnessMode({ toggleBtn, bodyEl, storage });

    toggleBtn.click();
    expect(storage.setItem).toHaveBeenCalledWith('mkg:brightness', 'lumineux');

    toggleBtn.click();
    expect(storage.setItem).toHaveBeenCalledWith('mkg:brightness', 'tres-lumineux');
  });

  it('exposes the current level via getLevel() and cycle()', () => {
    const { toggleBtn, bodyEl } = makeElements();
    const mode = initBrightnessMode({ toggleBtn, bodyEl, storage: makeStorage() });
    expect(mode.getLevel()).toBe('standard');
    mode.cycle();
    expect(mode.getLevel()).toBe('lumineux');
  });
});
