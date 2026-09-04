export function checkPassword(input, expected) {
  return typeof input === 'string' && input === expected;
}

export function initPasswordModal({ modalEl, inputEl, errorEl, cancelBtn, okBtn, expectedPassword, onUnlock }) {
  function open() {
    inputEl.value = '';
    errorEl.style.display = 'none';
    modalEl.classList.add('open');
    inputEl.focus();
  }

  function close() {
    modalEl.classList.remove('open');
  }

  function submit() {
    if (checkPassword(inputEl.value, expectedPassword)) {
      close();
      onUnlock();
    } else {
      errorEl.style.display = 'block';
    }
  }

  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') submit();
  });

  return { open, close };
}
