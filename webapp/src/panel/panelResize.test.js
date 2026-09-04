// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { clampPanelWidth, initPanelResize } from './panelResize.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: vi.fn(key => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    _store: store,
  };
}

function makeElements() {
  return {
    handleEl: document.createElement('div'),
    bodyEl: document.createElement('div'),
  };
}

describe('clampPanelWidth', () => {
  it('leaves a width already within [min, max] untouched', () => {
    expect(clampPanelWidth(500, { min: 320, max: 900 })).toBe(500);
  });

  it('clamps a width below the minimum up to the minimum', () => {
    expect(clampPanelWidth(100, { min: 320, max: 900 })).toBe(320);
  });

  it('clamps a width above the maximum down to the maximum', () => {
    expect(clampPanelWidth(2000, { min: 320, max: 900 })).toBe(900);
  });

  it('defaults to the built-in 320-900 range when no bounds are passed', () => {
    expect(clampPanelWidth(50)).toBe(320);
    expect(clampPanelWidth(5000)).toBe(900);
  });
});

describe('initPanelResize', () => {
  it('does not set --panel-width on init when nothing is stored, leaving CSS defaults in control', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage });
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('');
  });

  it('applies a previously stored width on init', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage({ 'mkg:panelWidth': '600' });
    initPanelResize({ handleEl, bodyEl, storage });
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('600px');
  });

  it('clamps an out-of-range stored width on init', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage({ 'mkg:panelWidth': '50' });
    initPanelResize({ handleEl, bodyEl, storage, minWidth: 320, maxWidth: 900 });
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('320px');
  });

  it('ignores a garbage stored value', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage({ 'mkg:panelWidth': 'not-a-number' });
    initPanelResize({ handleEl, bodyEl, storage });
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('');
  });

  it('updates --panel-width live while dragging, tracking the pointer from the right edge of the viewport', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200 });

    handleEl.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, button: 0 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }));
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('500px'); // 1200 - 700

    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 850 }));
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('350px'); // 1200 - 850
  });

  it('clamps the width while dragging past the configured bounds', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200, minWidth: 320, maxWidth: 900 });

    handleEl.dispatchEvent(new MouseEvent('pointerdown', { clientX: 1150, button: 0 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 1150 })); // would be 50px
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('320px');
  });

  it('ignores pointer moves before a drag has started', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200 });

    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }));
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('');
  });

  it('persists the final width to storage on pointerup', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200 });

    handleEl.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, button: 0 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }));
    document.dispatchEvent(new MouseEvent('pointerup', {}));

    expect(storage.setItem).toHaveBeenCalledWith('mkg:panelWidth', '500');
  });

  it('stops tracking pointer moves after pointerup', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200 });

    handleEl.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, button: 0 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }));
    document.dispatchEvent(new MouseEvent('pointerup', {}));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 850 }));

    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('500px'); // unchanged since pointerup
  });

  it('ignores non-primary pointer buttons (e.g. right-click)', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage();
    initPanelResize({ handleEl, bodyEl, storage, getViewportWidth: () => 1200 });

    handleEl.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, button: 2 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }));
    expect(bodyEl.style.getPropertyValue('--panel-width')).toBe('');
  });

  it('exposes the current width via getWidth()', () => {
    const { handleEl, bodyEl } = makeElements();
    const storage = makeStorage({ 'mkg:panelWidth': '600' });
    const resize = initPanelResize({ handleEl, bodyEl, storage });
    expect(resize.getWidth()).toBe(600);
  });
});
