// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initCompanyChartModal } from './chartModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    titleEl: document.createElement('span'),
    bodyEl: document.createElement('div'),
  };
}

const CURRENT_YEAR = new Date().getFullYear();
const COMPANY = { name: 'Evergreen Marine', yahooSymbol: '2603.TW' };
const PORTFOLIO_ENTRIES = [{ entreprise: 'Evergreen Marine', date: '16/07' }];

describe('initCompanyChartModal', () => {
  it('opens the modal and sets the title immediately, before the fetch resolves', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn(() => new Promise(() => {})); // never resolves
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(modalEl.classList.contains('open')).toBe(true);
    expect(titleEl.textContent).toBe('Evergreen Marine');
  });

  it('renders a chart once the fetch resolves with points', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('svg')).not.toBeNull();
    expect(fetchQuoteHistoryFn).toHaveBeenCalledWith('2603.TW', `${CURRENT_YEAR}-07-16`);
  });

  it('shows a message instead of calling fetch when the company has no resolvable symbol/date', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open({ name: 'No Symbol Co' }, PORTFOLIO_ENTRIES);
    expect(fetchQuoteHistoryFn).not.toHaveBeenCalled();
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('shows a message when the fetch resolves with no usable data', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue(null);
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('closes the modal and clears the body', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    modal.close();
    expect(modalEl.classList.contains('open')).toBe(false);
    expect(bodyEl.children.length).toBe(0);
  });

  it('never interprets the company name as HTML', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn: vi.fn() });
    await modal.open({ name: '<img src=x onerror=alert(1)>' }, []);
    expect(titleEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(titleEl.querySelector('img')).toBeNull();
  });

  it('shows the presentation date and symbol as a subtitle', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 6.2 }, { date: '2026-07-23', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-modal-sub').textContent).toContain('2603.TW');
    expect(bodyEl.querySelector('.chart-modal-sub').textContent).toContain('Évolution depuis la présentation');
  });

  it('shows the current price and a green percentage for a rising series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 110 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price').textContent).toBe('110.00');
    const change = bodyEl.querySelector('.chart-price-change');
    expect(change.textContent).toContain('+10.00%');
    expect(change.classList.contains('positive')).toBe(true);
  });

  it('shows a red percentage for a falling series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 90 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price-change').classList.contains('negative')).toBe(true);
  });

  it('discards a stale response when a newer open() call has already superseded it', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    let resolveFirst;
    const fetchQuoteHistoryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ points: [{ date: '2026-04-24', close: 50 }, { date: '2026-07-23', close: 60 }] });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });

    const firstOpen = modal.open(COMPANY, PORTFOLIO_ENTRIES); // starts, does not resolve yet
    await modal.open({ name: 'Second Co', yahooSymbol: 'SEC' }, [{ entreprise: 'Second Co', date: '16/07' }]); // resolves and renders fully

    expect(titleEl.textContent).toBe('Second Co');
    const priceBeforeStaleResolution = bodyEl.querySelector('.chart-price')?.textContent;

    resolveFirst({ points: [{ date: '2026-04-24', close: 999 }, { date: '2026-07-23', close: 999 }] }); // stale response for the FIRST company arrives late
    await firstOpen;

    expect(titleEl.textContent).toBe('Second Co'); // still the second company, not overwritten
    expect(bodyEl.querySelector('.chart-price')?.textContent).toBe(priceBeforeStaleResolution);
  });
});
