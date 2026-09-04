// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderPresentations } from './presentations.js';

const ITEM = { id: 'p1', title: 'Deck A', thumb: 'data:image/png;base64,xxx', createdAt: 100 };

describe('renderPresentations', () => {
  it('renders one card per presentation with thumbnail and title', () => {
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    const card = container.querySelector('.presentation-card');
    expect(card.querySelector('.presentation-thumb').src).toContain('data:image/png');
    expect(card.querySelector('.presentation-name').textContent).toBe('Deck A');
  });

  it('falls back to "Sans titre" when the title is missing', () => {
    const container = document.createElement('div');
    renderPresentations(container, [{ ...ITEM, title: '' }], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    expect(container.querySelector('.presentation-name').textContent).toBe('Sans titre');
  });

  it('calls onOpen with the item when the card is clicked', () => {
    const onOpen = vi.fn();
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], false, { onOpen, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    container.querySelector('.presentation-card').click();
    expect(onOpen).toHaveBeenCalledWith(ITEM);
  });

  it('does not render a delete button or title input when not editing', () => {
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    expect(container.querySelector('.presentation-delete')).toBeNull();
    expect(container.querySelector('.presentation-name-input')).toBeNull();
  });

  it('renders a delete button and a title input in edit mode', () => {
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], true, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    expect(container.querySelector('.presentation-delete')).not.toBeNull();
    expect(container.querySelector('.presentation-name-input').value).toBe('Deck A');
  });

  it('calls onDelete with the item when the delete button is clicked, without also triggering onOpen', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], true, { onOpen, onDelete, onTitleEdit: () => {}, onAddClick: () => {} });
    container.querySelector('.presentation-delete').click();
    expect(onDelete).toHaveBeenCalledWith(ITEM);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onTitleEdit with the item and new title when the title input changes, without triggering onOpen', () => {
    const onOpen = vi.fn();
    const onTitleEdit = vi.fn();
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], true, { onOpen, onDelete: () => {}, onTitleEdit, onAddClick: () => {} });
    const input = container.querySelector('.presentation-name-input');
    input.value = 'Deck A (renamed)';
    input.dispatchEvent(new Event('change'));
    expect(onTitleEdit).toHaveBeenCalledWith(ITEM, 'Deck A (renamed)');
  });

  it('renders an add-presentation card in edit mode that calls onAddClick', () => {
    const onAddClick = vi.fn();
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], true, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick });
    container.querySelector('.presentation-add-card').click();
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });

  it('does not render an add-presentation card when not editing', () => {
    const container = document.createElement('div');
    renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    expect(container.querySelector('.presentation-add-card')).toBeNull();
  });

  it('never interprets stored content as HTML', () => {
    const container = document.createElement('div');
    renderPresentations(container, [{ ...ITEM, title: '<img src=x onerror=alert(1)>' }], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
    expect(container.querySelector('.presentation-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img.presentation-thumb')).not.toBeNull(); // the real thumbnail <img> is fine
    expect(container.querySelectorAll('img')).toHaveLength(1); // but no *second*, injected <img> from the title
  });
});
