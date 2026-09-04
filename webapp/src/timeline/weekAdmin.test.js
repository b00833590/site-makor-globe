// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWeekAdmin } from './weekAdmin.js';

const WEEK = { id: 'w1', label: 'Semaine 1', order: 0 };

describe('renderWeekAdmin', () => {
  it('renders nothing when isEditing is false', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: false, onLabelEdit: () => {}, onAddWeek: () => {} });
    expect(container.children).toHaveLength(0);
  });

  it('renders the active week label as an editable input and an add-week button when isEditing is true', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {} });
    const input = container.querySelector('.week-admin-label-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Semaine 1');
    expect(container.querySelector('.week-admin-add')).not.toBeNull();
  });

  it('calls onLabelEdit with the active week and a label patch when the input changes', () => {
    const onLabelEdit = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit, onAddWeek: () => {} });
    const input = container.querySelector('.week-admin-label-input');
    input.value = 'Semaine renommée';
    input.dispatchEvent(new Event('change'));
    expect(onLabelEdit).toHaveBeenCalledWith(WEEK, { label: 'Semaine renommée' });
  });

  it('calls onAddWeek when the add-week button is clicked', () => {
    const onAddWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek });
    container.querySelector('.week-admin-add').click();
    expect(onAddWeek).toHaveBeenCalledTimes(1);
  });

  it('renders the add-week button (but no label input, no crash) when isEditing is true and activeWeek is null', () => {
    const container = document.createElement('div');
    expect(() => renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {} })).not.toThrow();
    expect(container.querySelector('.week-admin-label-input')).toBeNull();
    expect(container.querySelector('.week-admin-add')).not.toBeNull();
  });

  it('renders a delete-week button in edit mode that calls onDeleteWeek with the active week', () => {
    const onDeleteWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek });
    container.querySelector('.week-admin-delete').click();
    expect(onDeleteWeek).toHaveBeenCalledWith(WEEK);
  });

  it('does not render a delete-week button when there is no active week', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {} });
    expect(container.querySelector('.week-admin-delete')).toBeNull();
  });

  it('renders a duplicate-week button in edit mode that calls onDuplicateWeek with the active week', () => {
    const onDuplicateWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {}, onDuplicateWeek });
    container.querySelector('.week-admin-duplicate').click();
    expect(onDuplicateWeek).toHaveBeenCalledWith(WEEK);
  });

  it('does not render a duplicate-week button when there is no active week', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {}, onDuplicateWeek: () => {} });
    expect(container.querySelector('.week-admin-duplicate')).toBeNull();
  });
});
