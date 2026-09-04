export function initPresentationUploadModal({ modalEl, fileInputEl, titleInputEl, errorEl, cancelBtn, okBtn, onSubmit }) {
  function open() {
    fileInputEl.value = '';
    titleInputEl.value = '';
    errorEl.style.display = 'none';
    modalEl.classList.add('open');
  }

  function close() {
    modalEl.classList.remove('open');
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function setSubmitting(isSubmitting) {
    okBtn.disabled = isSubmitting;
    cancelBtn.disabled = isSubmitting;
    okBtn.textContent = isSubmitting ? 'Envoi en cours...' : 'Envoyer';
  }

  function submit() {
    const file = fileInputEl.files[0];
    if (!file) {
      showError('Choisis un fichier PDF.');
      return;
    }
    const title = titleInputEl.value.trim() || file.name.replace(/\.pdf$/i, '');
    onSubmit(file, title);
  }

  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);

  return { open, close, showError, setSubmitting };
}
