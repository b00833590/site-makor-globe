// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initWeekTimeline } from './weekTimeline.js';

const WEEKS = [
  { id: 'w1', label: 'Semaine 1', order: 0 },
  { id: 'w2', label: 'Semaine 2', order: 1 },
];

describe('initWeekTimeline', () => {
  it('renders one tab per week', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    expect(container.querySelectorAll('.week-tab').length).toBe(2);
  });

  it('marks the active week tab and no other', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w2', onSelect: () => {} });
    const tabs = container.querySelectorAll('.week-tab');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  it('uses the week label as the visible text', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    expect(container.querySelectorAll('.week-tab')[0].textContent).toBe('Semaine 1');
  });

  it('calls onSelect with the clicked week id', () => {
    const container = document.createElement('div');
    const onSelect = vi.fn();
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect });
    container.querySelectorAll('.week-tab')[1].click();
    expect(onSelect).toHaveBeenCalledWith('w2');
  });

  it('moves the active class to the newly clicked week after a click', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    container.querySelectorAll('.week-tab')[1].click();
    const tabs = container.querySelectorAll('.week-tab');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
  });
});

describe('setWeeks', () => {
  it('re-renders with the new weeks list and marks the given active week', () => {
    const container = document.createElement('div');
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const newWeeks = [...WEEKS, { id: 'w3', label: 'Semaine 3', order: 2 }];
    timeline.setWeeks(newWeeks, 'w3');
    const tabs = container.querySelectorAll('.week-tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[2].classList.contains('active')).toBe(true);
    expect(tabs[0].classList.contains('active')).toBe(false);
  });

  it("updates a tab's visible text when a week is renamed", () => {
    const container = document.createElement('div');
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const renamed = WEEKS.map(w => (w.id === 'w1' ? { ...w, label: 'Nouveau nom' } : w));
    timeline.setWeeks(renamed, 'w1');
    expect(container.querySelectorAll('.week-tab')[0].textContent).toBe('Nouveau nom');
  });

  it('newly rendered tabs still call onSelect with the clicked week id', () => {
    const container = document.createElement('div');
    const onSelect = vi.fn();
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect });
    const newWeeks = [...WEEKS, { id: 'w3', label: 'Semaine 3', order: 2 }];
    timeline.setWeeks(newWeeks, 'w1');
    container.querySelectorAll('.week-tab')[2].click();
    expect(onSelect).toHaveBeenCalledWith('w3');
  });
});

describe('wrapper and fade overlays', () => {
  it('creates a wrap element and two fade overlays when container is attached to the DOM', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    expect(document.querySelector('.week-timeline-wrap')).not.toBeNull();
    expect(document.querySelectorAll('.week-timeline-fade')).toHaveLength(2);
  });
});
