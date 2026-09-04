// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { PDF_SECTIONS, initPdfSectionsModal } from './pdfSectionsModal.js';

function makeElements() {
  const checkboxEls = PDF_SECTIONS.map(section => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = section.id;
    cb.checked = true;
    return cb;
  });
  return {
    modalEl: document.createElement('div'),
    checkboxEls,
    cancelBtn: document.createElement('button'),
    okBtn: document.createElement('button'),
  };
}

describe('PDF_SECTIONS', () => {
  it('exposes exactly the 4 section ids generateReportPDF expects, in order', () => {
    expect(PDF_SECTIONS.map(s => s.id)).toEqual(['indices', 'news', 'companies', 'portfolio']);
  });
});

describe('initPdfSectionsModal', () => {
  it('opens the modal with every checkbox checked by default', () => {
    const els = makeElements();
    els.checkboxEls[1].checked = false; // simulate a leftover unchecked state from a previous open
    const modal = initPdfSectionsModal({ ...els, onConfirm: () => {} });
    modal.open();
    expect(els.modalEl.classList.contains('open')).toBe(true);
    expect(els.checkboxEls.every(cb => cb.checked)).toBe(true);
  });

  it('calls onConfirm with only the checked section ids and closes the modal', () => {
    const els = makeElements();
    const onConfirm = vi.fn();
    const modal = initPdfSectionsModal({ ...els, onConfirm });
    modal.open();
    els.checkboxEls[1].checked = false; // uncheck "news"
    els.okBtn.click();
    expect(onConfirm).toHaveBeenCalledWith(['indices', 'companies', 'portfolio']);
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });

  it('calls onConfirm with an empty array when every section is unchecked', () => {
    const els = makeElements();
    const onConfirm = vi.fn();
    const modal = initPdfSectionsModal({ ...els, onConfirm });
    modal.open();
    els.checkboxEls.forEach(cb => { cb.checked = false; });
    els.okBtn.click();
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it('closes without calling onConfirm when Cancel is clicked', () => {
    const els = makeElements();
    const onConfirm = vi.fn();
    const modal = initPdfSectionsModal({ ...els, onConfirm });
    modal.open();
    els.cancelBtn.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });
});
