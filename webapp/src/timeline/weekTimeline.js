const SCROLL_IDLE_DELAY_MS = 600;

export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  let currentWeeks = weeks;
  let scrollIdleTimer = null;
  let fadeLeft = null;
  let fadeRight = null;

  // container.parentNode is null in the existing unit tests (they create a
  // bare, unattached container) — guarded so those tests keep passing
  // unmodified. In the real app container is always already mounted in
  // index.html by the time bootstrap() calls this, so the wrapper/fades are
  // always created there.
  if (container.parentNode) {
    const wrapper = document.createElement('div');
    wrapper.className = 'week-timeline-wrap';
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);

    fadeLeft = document.createElement('div');
    fadeLeft.className = 'week-timeline-fade week-timeline-fade-left';
    fadeRight = document.createElement('div');
    fadeRight.className = 'week-timeline-fade week-timeline-fade-right';
    wrapper.appendChild(fadeLeft);
    wrapper.appendChild(fadeRight);
  }

  function updateFades() {
    if (!fadeLeft || !fadeRight) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    fadeLeft.classList.toggle('visible', scrollLeft > 1);
    fadeRight.classList.toggle('visible', scrollLeft < scrollWidth - clientWidth - 1);
  }

  container.addEventListener('scroll', () => {
    updateFades();
    container.classList.add('is-scrolling');
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => container.classList.remove('is-scrolling'), SCROLL_IDLE_DELAY_MS);
  }, { passive: true });

  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of currentWeeks) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'week-tab' + (week.id === currentActiveId ? ' active' : '');
      tab.textContent = week.label;
      tab.addEventListener('click', () => {
        onSelect(week.id);
        render(week.id);
      });
      container.appendChild(tab);
    }
    if (currentActiveId) {
      const activeTab = container.querySelector('.week-tab.active');
      if (activeTab && typeof activeTab.scrollIntoView === 'function') {
        activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }
    }
    // Layout has just changed (tab count/widths) — recompute fade visibility
    // on the next frame, once the browser has applied the new scrollWidth.
    requestAnimationFrame(updateFades);
  }

  render(activeWeekId);

  return {
    setWeeks(newWeeks, newActiveWeekId) {
      currentWeeks = newWeeks;
      render(newActiveWeekId);
    },
  };
}
