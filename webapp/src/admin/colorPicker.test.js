// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildColorDot, COLOR_PALETTE } from './colorPicker.js';

afterEach(() => {
  document.getElementById('active-color-popup')?.remove();
});

describe('buildColorDot', () => {
  it('renders a color-dot span with the given color as its background', () => {
    const dot = buildColorDot('#e74c3c', () => {});
    expect(dot.className).toBe('color-dot');
    expect(dot.style.background).toBe('rgb(231, 76, 60)');
  });

  it('falls back to a neutral default background when no color is given', () => {
    const dot = buildColorDot(null, () => {});
    expect(dot.style.background).not.toBe('');
  });

  it('opens a popup with one swatch per palette color plus a reset swatch when clicked', () => {
    const dot = buildColorDot(null, () => {});
    document.body.appendChild(dot);
    dot.click();
    const popup = document.getElementById('active-color-popup');
    expect(popup).not.toBeNull();
    expect(popup.querySelectorAll('.color-swatch')).toHaveLength(COLOR_PALETTE.length + 1);
  });

  it('calls onPick with the clicked swatch color and closes the popup', () => {
    const onPick = vi.fn();
    const dot = buildColorDot(null, onPick);
    document.body.appendChild(dot);
    dot.click();
    const swatch = document.getElementById('active-color-popup').querySelectorAll('.color-swatch')[0];
    swatch.click();
    expect(onPick).toHaveBeenCalledWith(COLOR_PALETTE[0]);
    expect(document.getElementById('active-color-popup')).toBeNull();
  });

  it('calls onPick with null and closes the popup when the reset swatch is clicked', () => {
    const onPick = vi.fn();
    const dot = buildColorDot('#e74c3c', onPick);
    document.body.appendChild(dot);
    dot.click();
    const resetSwatch = document.getElementById('active-color-popup').querySelector('.color-swatch-reset');
    resetSwatch.click();
    expect(onPick).toHaveBeenCalledWith(null);
    expect(document.getElementById('active-color-popup')).toBeNull();
  });

  it('closes any already-open popup when a different dot is clicked', () => {
    const dotA = buildColorDot(null, () => {});
    const dotB = buildColorDot(null, () => {});
    document.body.append(dotA, dotB);
    dotA.click();
    const firstPopup = document.getElementById('active-color-popup');
    dotB.click();
    expect(document.getElementById('active-color-popup')).not.toBe(firstPopup);
    expect(document.querySelectorAll('#active-color-popup')).toHaveLength(1);
  });

  it('closes the popup when clicking outside of it', () => {
    const dot = buildColorDot(null, () => {});
    document.body.appendChild(dot);
    dot.click();
    expect(document.getElementById('active-color-popup')).not.toBeNull();
    document.body.click();
    expect(document.getElementById('active-color-popup')).toBeNull();
  });
});
