// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initPresentationUploadModal } from './presentationUploadModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    fileInputEl: document.createElement('input'),
    titleInputEl: document.createElement('input'),
    errorEl: document.createElement('div'),
    cancelBtn: document.createElement('button'),
    okBtn: document.createElement('button'),
  };
}

function setFile(fileInputEl, file) {
  Object.defineProperty(fileInputEl, 'files', { value: file ? [file] : [], configurable: true });
}

describe('initPresentationUploadModal', () => {
  it('opens the modal, clears previous file/title, and hides the error', () => {
    const els = makeElements();
    const modal = initPresentationUploadModal({ ...els, onSubmit: () => {} });
    els.titleInputEl.value = 'leftover';
    modal.open();
    expect(els.modalEl.classList.contains('open')).toBe(true);
    expect(els.titleInputEl.value).toBe('');
  });

  it('closes the modal', () => {
    const els = makeElements();
    const modal = initPresentationUploadModal({ ...els, onSubmit: () => {} });
    modal.open();
    modal.close();
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });

  it('shows an error and does not call onSubmit when no file is selected', () => {
    const els = makeElements();
    const onSubmit = vi.fn();
    const modal = initPresentationUploadModal({ ...els, onSubmit });
    setFile(els.fileInputEl, null);
    els.okBtn.click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(els.errorEl.style.display).toBe('block');
  });

  it('calls onSubmit with the file and the trimmed title when one is entered', () => {
    const els = makeElements();
    const onSubmit = vi.fn();
    const modal = initPresentationUploadModal({ ...els, onSubmit });
    const file = new File(['%PDF-1.4'], 'deck.pdf', { type: 'application/pdf' });
    setFile(els.fileInputEl, file);
    els.titleInputEl.value = '  Mon titre  ';
    els.okBtn.click();
    expect(onSubmit).toHaveBeenCalledWith(file, 'Mon titre');
  });

  it('defaults the title to the filename (without .pdf) when left blank', () => {
    const els = makeElements();
    const onSubmit = vi.fn();
    const modal = initPresentationUploadModal({ ...els, onSubmit });
    const file = new File(['%PDF-1.4'], 'Rapport Q3.pdf', { type: 'application/pdf' });
    setFile(els.fileInputEl, file);
    els.okBtn.click();
    expect(onSubmit).toHaveBeenCalledWith(file, 'Rapport Q3');
  });

  it('closes without calling onSubmit when Cancel is clicked', () => {
    const els = makeElements();
    const onSubmit = vi.fn();
    const modal = initPresentationUploadModal({ ...els, onSubmit });
    modal.open();
    els.cancelBtn.click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });

  it('setSubmitting(true) disables both buttons and changes the OK button label; setSubmitting(false) reverts', () => {
    const els = makeElements();
    const modal = initPresentationUploadModal({ ...els, onSubmit: () => {} });
    modal.setSubmitting(true);
    expect(els.okBtn.disabled).toBe(true);
    expect(els.cancelBtn.disabled).toBe(true);
    expect(els.okBtn.textContent).toBe('Envoi en cours...');
    modal.setSubmitting(false);
    expect(els.okBtn.disabled).toBe(false);
    expect(els.cancelBtn.disabled).toBe(false);
    expect(els.okBtn.textContent).toBe('Envoyer');
  });
});
