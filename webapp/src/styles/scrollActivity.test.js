// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initScrollActivity } from './scrollActivity.js';

describe('initScrollActivity', () => {
  it('adds is-scrolling on scroll and removes it after the idle delay', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    initScrollActivity(el);
    el.dispatchEvent(new Event('scroll'));
    expect(el.classList.contains('is-scrolling')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(el.classList.contains('is-scrolling')).toBe(false);
    vi.useRealTimers();
  });

  it('resets the idle timer on repeated scroll events instead of stacking timeouts', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    initScrollActivity(el);
    el.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(400);
    el.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(400);
    expect(el.classList.contains('is-scrolling')).toBe(true); // only 400ms since the 2nd event
    vi.advanceTimersByTime(200);
    expect(el.classList.contains('is-scrolling')).toBe(false); // now 600ms since the 2nd event
    vi.useRealTimers();
  });
});
