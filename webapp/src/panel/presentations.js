import { buildEditableInput } from '../admin/editableInput.js';

export function renderPresentations(container, items, isEditing, { onOpen, onDelete, onTitleEdit, onAddClick }) {
  container.replaceChildren();

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'presentation-card';
    card.addEventListener('click', () => onOpen(item));

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'presentation-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.title || 'cette présentation'}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(item); });
      card.appendChild(delBtn);
    }

    const thumb = document.createElement('img');
    thumb.className = 'presentation-thumb';
    thumb.src = item.thumb || '';
    thumb.alt = item.title || '';
    card.appendChild(thumb);

    const name = document.createElement('div');
    name.className = 'presentation-name';
    if (isEditing) {
      const input = buildEditableInput(item.title, 'text', 'presentation-name-input', v => onTitleEdit(item, v));
      input.addEventListener('click', e => e.stopPropagation());
      name.appendChild(input);
    } else {
      name.textContent = item.title || 'Sans titre';
    }
    card.appendChild(name);

    container.appendChild(card);
  }

  if (isEditing) {
    const addCard = document.createElement('div');
    addCard.className = 'presentation-add-card';
    addCard.textContent = '+ Ajouter une présentation';
    addCard.addEventListener('click', () => onAddClick());
    container.appendChild(addCard);
  }
}
