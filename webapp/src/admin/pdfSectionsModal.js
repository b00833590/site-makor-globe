// Section ids match generateReportPDF's `sections` option (pdfReportBuilder.js):
// 'indices' | 'news' | 'companies' | 'portfolio'.
export const PDF_SECTIONS = [
  { id: 'indices', label: 'Indices' },
  { id: 'news', label: 'News macro' },
  { id: 'companies', label: 'Entreprises' },
  { id: 'portfolio', label: 'Suivi du portefeuille' },
];

export function initPdfSectionsModal({ modalEl, checkboxEls, cancelBtn, okBtn, onConfirm }) {
  function open() {
    checkboxEls.forEach(cb => { cb.checked = true; });
    modalEl.classList.add('open');
  }

  function close() {
    modalEl.classList.remove('open');
  }

  function submit() {
    const sections = checkboxEls.filter(cb => cb.checked).map(cb => cb.value);
    close();
    onConfirm(sections);
  }

  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);

  return { open, close };
}
