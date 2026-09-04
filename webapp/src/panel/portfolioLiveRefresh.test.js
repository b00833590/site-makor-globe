import { describe, it, expect, vi } from 'vitest';
import { startPortfolioLiveRefresh } from './portfolioLiveRefresh.js';

describe('startPortfolioLiveRefresh', () => {
  it('runs an immediate refresh cycle and applies the resulting overrides', async () => {
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];
    const fetchQuoteSinceFn = vi.fn().mockResolvedValue({ sinceChange: 2, ytdChange: 3 });
    const onOverrides = vi.fn();

    startPortfolioLiveRefresh({
      getEntries: () => entries,
      onOverrides,
      fetchQuoteSinceFn,
      delayMs: 0,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onOverrides).toHaveBeenCalledWith({ p1: { depuis: 2, ytd: 3 } });
  });

  it('does not call onOverrides when the cycle produces no overrides', async () => {
    const onOverrides = vi.fn();
    startPortfolioLiveRefresh({
      getEntries: () => [],
      onOverrides,
      fetchQuoteSinceFn: vi.fn(),
      delayMs: 0,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onOverrides).not.toHaveBeenCalled();
  });

  it('schedules a recurring cycle at the given interval via the injected setIntervalFn', () => {
    const setIntervalFn = vi.fn(() => 42);
    startPortfolioLiveRefresh({
      getEntries: () => [],
      onOverrides: () => {},
      fetchQuoteSinceFn: vi.fn(),
      intervalMs: 60000,
      delayMs: 0,
      setIntervalFn,
      clearIntervalFn: () => {},
    });
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60000);
  });

  it('stop() clears the interval and prevents an in-flight cycle from applying overrides', async () => {
    let resolveQuote;
    const fetchQuoteSinceFn = vi.fn(() => new Promise(resolve => { resolveQuote = resolve; }));
    const onOverrides = vi.fn();
    const clearIntervalFn = vi.fn();
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];

    const handle = startPortfolioLiveRefresh({
      getEntries: () => entries,
      onOverrides,
      fetchQuoteSinceFn,
      delayMs: 0,
      setIntervalFn: () => 7,
      clearIntervalFn,
    });
    handle.stop();
    resolveQuote({ sinceChange: 1, ytdChange: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clearIntervalFn).toHaveBeenCalledWith(7);
    expect(onOverrides).not.toHaveBeenCalled();
  });
});
