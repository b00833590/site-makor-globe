function showPasswordModal(){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="pwOverlay">
      <div class="modal">
        <h3>🔒 Mode édition</h3>
        <input type="password" id="pwInput" placeholder="Mot de passe">
        <div class="error-txt" id="pwError" style="display:none;">Mot de passe incorrect.</div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" id="pwCancel">Annuler</button>
          <button class="btn btn-primary btn-sm" id="pwOk">Déverrouiller</button>
        </div>
      </div>
    </div>`;
  const input = document.getElementById('pwInput');
  input.focus();
  const submit = () => {
    if(input.value === PASSWORD){
      state.isEditing = true;
      sessionSnapshot = JSON.parse(JSON.stringify(DB));
      undoStack = [];
      root.innerHTML = '';
      showToast('Mode édition activé');
      render();
    } else {
      document.getElementById('pwError').style.display = 'block';
    }
  };
  document.getElementById('pwOk').onclick = submit;
  input.addEventListener('keydown', e => { if(e.key==='Enter') submit(); });
  document.getElementById('pwCancel').onclick = () => root.innerHTML = '';
  document.getElementById('pwOverlay').addEventListener('click', (e)=>{ if(e.target.id==='pwOverlay') root.innerHTML=''; });
}

document.getElementById('editToggleBtn').onclick = () => {
  if(state.isEditing){
    commitActiveEdit();
    state.isEditing = false;
    sessionSnapshot = null;
    undoStack = [];
    render();
  } else {
    showPasswordModal();
  }
};

document.getElementById('undoAllBtn').onclick = undoAllSession;

// ---------- SEED: Semaine 23-27 MARS (données reprises de l'ancien site) ----------
