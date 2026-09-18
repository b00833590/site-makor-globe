// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initPresentationZoom } from './presentationZoom.js';

function makeElements() {
  return {
    outBtn: document.createElement('button'),
    inBtn: document.createElement('button'),
    valueEl: document.createElement('span'),
    target: document.createElement('div'),
  };
}

describe('initPresentationZoom', () => {
  it('defaults to 100% and applies zoom:1 to every target', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    expect(target.style.zoom).toBe('1');
    expect(valueEl.textContent).toBe('100%');
  });

  it('increases zoom on inBtn click and applies it to every target', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    inBtn.click();
    expect(target.style.zoom).toBe('1.1');
    expect(valueEl.textContent).toBe('110%');
  });

  it('decreases zoom on outBtn click', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    outBtn.click();
    expect(target.style.zoom).toBe('0.9');
  });

  it('clamps to the max zoom and disables the increase button', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    const zoom = initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    zoom.setLevel(10);
    expect(target.style.zoom).toBe('1.6');
    expect(inBtn.disabled).toBe(true);
  });

  it('clamps to the min zoom and disables the decrease button', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    const zoom = initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    zoom.setLevel(0);
    expect(target.style.zoom).toBe('0.8');
    expect(outBtn.disabled).toBe(true);
  });

  it('reset() returns to 100%', () => {
    const { outBtn, inBtn, valueEl, target } = makeElements();
    const zoom = initPresentationZoom({ outBtn, inBtn, valueEl, targets: [target] });
    zoom.setLevel(1.4);
    zoom.reset();
    expect(target.style.zoom).toBe('1');
    expect(zoom.getLevel()).toBe(1);
  });

  it('applies the same level to every target', () => {
    const { outBtn, inBtn, valueEl } = makeElements();
    const targetA = document.createElement('div');
    const targetB = document.createElement('div');
    const zoom = initPresentationZoom({ outBtn, inBtn, valueEl, targets: [targetA, targetB] });
    zoom.setLevel(1.2);
    expect(targetA.style.zoom).toBe('1.2');
    expect(targetB.style.zoom).toBe('1.2');
  });
});
