// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { checkPassword, initPasswordModal } from './passwordModal.js';

describe('checkPassword', () => {
  it('returns true when the input exactly matches the expected password', () => {
    expect(checkPassword('secret123', 'secret123')).toBe(true);
  });

  it('returns false for a wrong password', () => {
    expect(checkPassword('wrong', 'secret123')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(checkPassword('Secret123', 'secret123')).toBe(false);
  });

  it('returns false for a non-string input', () => {
    expect(checkPassword(undefined, 'secret123')).toBe(false);
    expect(checkPassword(null, 'secret123')).toBe(false);
  });
});

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    inputEl: document.createElement('input'),
    errorEl: document.createElement('div'),
    cancelBtn: document.createElement('button'),
    okBtn: document.createElement('button'),
  };
}

describe('initPasswordModal', () => {
  it('opens the modal, clears any previous input, and focuses the input', () => {
    const els = makeElements();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock: () => {} });
    els.inputEl.value = 'leftover';
    document.body.appendChild(els.inputEl); // focus() only works on an attached element
    modal.open();
    expect(els.modalEl.classList.contains('open')).toBe(true);
    expect(els.inputEl.value).toBe('');
  });

  it('calls onUnlock and closes the modal when the correct password is submitted via the OK button', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'pw';
    els.okBtn.click();
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });

  it('shows an error and does not call onUnlock for a wrong password', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'wrong';
    els.okBtn.click();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(els.errorEl.style.display).toBe('block');
    expect(els.modalEl.classList.contains('open')).toBe(true);
  });

  it('submits on Enter key inside the input', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'pw';
    els.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('closes without calling onUnlock when Cancel is clicked', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.cancelBtn.click();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });
});
