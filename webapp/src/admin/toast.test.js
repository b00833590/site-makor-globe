// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { showToast } from './toast.js';

describe('showToast', () => {
  afterEach(() => vi.useRealTimers());

  it('sets the message text and adds the visible class', () => {
    const toastEl = document.createElement('div');
    showToast(toastEl, 'Échec de la sauvegarde');
    expect(toastEl.textContent).toBe('Échec de la sauvegarde');
    expect(toastEl.classList.contains('show')).toBe(true);
  });

  it('removes the visible class after the display duration', () => {
    vi.useFakeTimers();
    const toastEl = document.createElement('div');
    showToast(toastEl, 'message', 100);
    expect(toastEl.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(toastEl.classList.contains('show')).toBe(false);
  });
});
