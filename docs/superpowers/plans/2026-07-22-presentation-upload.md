---
title: Upload de présentations in-app (version simple)
date: 2026-07-22
status: draft
---

## Contexte

La sous-fonctionnalité Présentations (phase 22) affiche, ouvre, renomme et supprime des présentations PDF, mais l'ajout est purement informationnel : `handlePresentationAddClick` (`main.js:303-305`) se contente d'un toast expliquant que l'ajout se fait manuellement, hors-app — copie fidèle du comportement de production (`index.html:2269-2271`, qui affiche le même genre de message).

**Il n'existe donc aucun flux d'upload de référence à porter** — ni côté production, ni côté `webapp/`. Ce plan construit une version volontairement simple : sélection d'un seul fichier PDF via un `<input type="file">` classique (pas de drag-and-drop), un champ titre optionnel, découpage en chunks Firestore réutilisant l'infrastructure de lecture déjà en place (`presentationPdf.js`, `firestoreClient.js`), et une barre de progression textuelle basique (réutilisant le pattern toast déjà établi pour le téléchargement, cf. `handlePresentationOpen`).

## Modèle de données et contraintes Firestore

Une présentation = 1 document metadata (`mkg:presentation:{id}` dans `mkg_data`, déjà géré) + N documents chunk (`mkg:pdfchunk:{id}:{n}` dans `mkg_pdfchunks`, déjà géré en lecture par `presentationPdf.js`). Le PDF est encodé en base64 (comme le fait déjà `base64ToPdfBlob` en sens inverse), puis la chaîne base64 est découpée en tranches de taille fixe stockées une par document — chaque chunk est un simple substring de la chaîne base64 concaténée, pas un base64 indépendamment valide (c'est déjà le modèle utilisé en lecture : `openPresentationPdf` fait `parts.join('')` avant de décoder l'ensemble).

**Taille de chunk** : Firestore limite un document à environ 1 MiB (1 048 576 octets). On choisit `CHUNK_SIZE_CHARS = 900000` caractères base64 (= 900 000 octets, l'alphabet base64 étant ASCII pur) par chunk — une fois entouré des guillemets ajoutés par `JSON.stringify` (comme le fait `writeDoc`) et le petit overhead du champ `updatedAt` et des métadonnées internes de Firestore, on reste avec une marge confortable (~14%) sous la limite.

**Taille de fichier max** : `MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024` (15 Mo bruts, ≈ 20 Mo une fois en base64, soit une vingtaine de chunks). Choix pragmatique pour une action admin occasionnelle avec upload séquentiel (pas de gros dashboard de gestion de fichiers à construire) — un fichier de cette taille prend environ 10-15 secondes à envoyer avec la barre de progression. Décision volontairement conservatrice, ajustable plus tard si un vrai deck dépasse cette limite.

**Écriture séquentielle, pas de batch atomique** : contrairement à `applyBatch`/`writeDocsBatch` (limités à 500 opérations et surtout à ~10 Mio par requête Firestore), un fichier de 15 Mo en base64 dépasserait largement la limite de taille d'un seul batch. Les chunks sont donc écrits un par un via `client.writeDoc` (qui a déjà sa propre logique de retry, `writeWithRetry`, 2 tentatives, 900ms de délai). **Le document metadata n'est écrit qu'en tout dernier, une fois tous les chunks confirmés** — si l'upload échoue en cours de route, aucune carte de présentation n'apparaît (plutôt qu'une carte cassée avec un PDF partiel) : c'est un choix délibéré, différent du pattern "mise à jour optimiste puis rollback" utilisé partout ailleurs dans ce projet, justifié par la nature multi-secondes et multi-documents de cette écriture spécifique (contrairement à un simple `setDoc`, il n'y a rien de cohérent à montrer avant la fin complète de l'upload).

En cas d'échec (un chunk ou le document metadata), tentative de nettoyage best-effort des chunks déjà écrits via `client.deleteDocsBatch` (déjà utilisé par `handlePresentationDelete`) — si ce nettoyage échoue aussi, les chunks orphelins restent en base (dette mineure acceptée, cf. la note similaire déjà actée pour le cap des 500 opérations dans le plan de la phase 23).

## Tâche 1 — Logique pure et injectable : `webapp/src/panel/presentationUpload.js`

Nouveau fichier, symétrique de `presentationPdf.js` (qui gère la lecture) :

```js
export const CHUNK_SIZE_CHARS = 900000;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

// Converts an ArrayBuffer to a base64 string without blowing the call stack —
// String.fromCharCode(...hugeArray) fails past ~100k arguments in most engines,
// so this walks the buffer in fixed-size slices instead.
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const SLICE = 8192;
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
  }
  return btoa(binary);
}

export function splitBase64IntoChunks(base64, chunkSize = CHUNK_SIZE_CHARS) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [''];
}

export function validatePresentationFile(file) {
  if (!file) return 'no-file';
  if (file.type !== 'application/pdf') return 'wrong-type';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'too-large';
  return null;
}

// Uploads a presentation's chunks sequentially, then its metadata doc last —
// see the plan's rationale for why this isn't a single atomic batch and why
// metadata is written only after every chunk is confirmed.
export async function uploadPresentation({ id, title, base64, client, chunkSize = CHUNK_SIZE_CHARS, onProgress }) {
  const chunks = splitBase64IntoChunks(base64, chunkSize);
  const chunkKeys = chunks.map((_, i) => `mkg:pdfchunk:${id}:${i}`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await client.writeDoc(chunkKeys[i], chunks[i]);
    } catch {
      await client.deleteDocsBatch(chunkKeys.slice(0, i)).catch(() => {});
      return { ok: false, reason: 'chunk-failed' };
    }
    if (onProgress) onProgress(i + 1, chunks.length);
  }

  const presentationKey = `mkg:presentation:${id}`;
  const metadata = { id, title, thumb: '', createdAt: Date.now() };
  try {
    await client.writeDoc(presentationKey, metadata);
  } catch {
    await client.deleteDocsBatch(chunkKeys).catch(() => {});
    return { ok: false, reason: 'metadata-failed' };
  }

  return { ok: true, key: presentationKey, value: metadata };
}
```

### Tests — `webapp/src/panel/presentationUpload.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { arrayBufferToBase64, splitBase64IntoChunks, validatePresentationFile, uploadPresentation, MAX_FILE_SIZE_BYTES } from './presentationUpload.js';

describe('arrayBufferToBase64', () => {
  it('encodes a small buffer correctly', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(arrayBufferToBase64(bytes.buffer)).toBe('SGVsbG8=');
  });

  it('handles a buffer larger than the internal slicing chunk size without throwing', () => {
    const bytes = new Uint8Array(20000).fill(65); // larger than the 8192-byte SLICE
    expect(() => arrayBufferToBase64(bytes.buffer)).not.toThrow();
    expect(arrayBufferToBase64(bytes.buffer).length).toBeGreaterThan(0);
  });
});

describe('splitBase64IntoChunks', () => {
  it('splits a string into equal-sized pieces with a shorter remainder', () => {
    expect(splitBase64IntoChunks('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('returns a single empty chunk for an empty string (never zero chunks)', () => {
    expect(splitBase64IntoChunks('', 4)).toEqual(['']);
  });

  it('returns a single chunk when the string is shorter than chunkSize', () => {
    expect(splitBase64IntoChunks('abc', 100)).toEqual(['abc']);
  });
});

describe('validatePresentationFile', () => {
  it('rejects a missing file', () => {
    expect(validatePresentationFile(null)).toBe('no-file');
  });

  it('rejects a non-PDF file', () => {
    expect(validatePresentationFile({ type: 'image/png', size: 100 })).toBe('wrong-type');
  });

  it('rejects a PDF larger than the max size', () => {
    expect(validatePresentationFile({ type: 'application/pdf', size: MAX_FILE_SIZE_BYTES + 1 })).toBe('too-large');
  });

  it('accepts a valid PDF within the size limit', () => {
    expect(validatePresentationFile({ type: 'application/pdf', size: 1000 })).toBeNull();
  });
});

function makeClient(overrides = {}) {
  return {
    writeDoc: vi.fn().mockResolvedValue(undefined),
    deleteDocsBatch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('uploadPresentation', () => {
  it('writes every chunk then the metadata doc last, and reports progress', async () => {
    const client = makeClient();
    const onProgress = vi.fn();
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4, onProgress });

    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:0', 'abcd');
    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:1', 'efgh');
    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:2', 'ij');
    expect(client.writeDoc).toHaveBeenLastCalledWith('mkg:presentation:p1', expect.objectContaining({ id: 'p1', title: 'Deck' }));
    expect(onProgress).toHaveBeenCalledWith(3, 3);
    expect(result).toEqual({ ok: true, key: 'mkg:presentation:p1', value: expect.objectContaining({ id: 'p1', title: 'Deck' }) });
  });

  it('aborts and cleans up already-written chunks when a chunk write fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn()
        .mockResolvedValueOnce(undefined) // chunk 0 ok
        .mockRejectedValueOnce(new Error('network')), // chunk 1 fails
    });
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4 });

    expect(client.deleteDocsBatch).toHaveBeenCalledWith(['mkg:pdfchunk:p1:0']);
    expect(result).toEqual({ ok: false, reason: 'chunk-failed' });
  });

  it('cleans up all chunks when the final metadata write fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn()
        .mockResolvedValueOnce(undefined) // chunk 0
        .mockResolvedValueOnce(undefined) // chunk 1
        .mockResolvedValueOnce(undefined) // chunk 2
        .mockRejectedValueOnce(new Error('network')), // metadata
    });
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4 });

    expect(client.deleteDocsBatch).toHaveBeenCalledWith(['mkg:pdfchunk:p1:0', 'mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:2']);
    expect(result).toEqual({ ok: false, reason: 'metadata-failed' });
  });

  it('still returns a failure result even if the cleanup delete itself fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn().mockRejectedValueOnce(new Error('network')),
      deleteDocsBatch: vi.fn().mockRejectedValue(new Error('also down')),
    });
    await expect(uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcd', client, chunkSize: 4 }))
      .resolves.toEqual({ ok: false, reason: 'chunk-failed' });
  });
});
```

## Tâche 2 — Composant modal : `webapp/src/admin/presentationUploadModal.js`

Mirrors `passwordModal.js`'s structure, avec deux différences : la soumission est asynchrone (ne ferme pas la modale immédiatement — c'est l'appelant qui décide via `close()`/`showError()` une fois l'upload résolu), et un état "en cours d'envoi" désactive les deux boutons pour empêcher un double-clic pendant l'upload séquentiel de plusieurs secondes.

```js
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
```

### Tests — `webapp/src/admin/presentationUploadModal.test.js`

```js
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
```

## Tâche 3 — Markup et styles

### `webapp/index.html`

Ajouter, juste après le `#password-modal` existant (avant `#admin-toast`) :

```html
  <div id="presentation-upload-modal" class="presentation-upload-modal">
    <div class="presentation-upload-modal-content">
      <h3>📤 Ajouter une présentation</h3>
      <input type="file" id="presentation-upload-file" accept="application/pdf" />
      <input type="text" id="presentation-upload-title" placeholder="Titre (optionnel — par défaut, le nom du fichier)" />
      <div id="presentation-upload-error" class="presentation-upload-modal-error"></div>
      <div class="presentation-upload-modal-actions">
        <button id="presentation-upload-cancel" type="button">Annuler</button>
        <button id="presentation-upload-ok" type="button">Envoyer</button>
      </div>
    </div>
  </div>
```

### `webapp/src/admin/presentationUploadModal.css`

Nouveau fichier, copie volontaire (pas de réutilisation croisée) des règles de `passwordModal.css` avec des noms de classe propres à ce composant — cohérent avec le principe "un fichier CSS par composant admin" déjà suivi dans ce dossier (`colorPicker.css`, `passwordModal.css`, `toast.css`) :

```css
.presentation-upload-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 20;
  align-items: center;
  justify-content: center;
}

.presentation-upload-modal.open {
  display: flex;
}

.presentation-upload-modal-content {
  background: rgba(15, 23, 48, 0.98);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 8px;
  padding: 20px;
  min-width: 320px;
}

.presentation-upload-modal-content h3 {
  color: #fff;
  font-size: 14px;
  margin: 0 0 12px;
}

.presentation-upload-modal-content input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(224, 181, 61, 0.4);
  background: #0f1730;
  color: #fff;
  font-size: 13px;
  margin-top: 10px;
}

.presentation-upload-modal-content input:first-of-type {
  margin-top: 0;
}

.presentation-upload-modal-error {
  display: none;
  color: #e0736a;
  font-size: 12px;
  margin-top: 8px;
}

.presentation-upload-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.presentation-upload-modal-actions button {
  background: transparent;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
}

.presentation-upload-modal-actions button:hover:not(:disabled) {
  background: rgba(201, 151, 31, 0.2);
}

.presentation-upload-modal-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
```

## Tâche 4 — Câblage dans `main.js`

**Imports** (ajouter aux imports existants en haut du fichier) :

```js
import './admin/presentationUploadModal.css';
```

```js
import { initPresentationUploadModal } from './admin/presentationUploadModal.js';
import { arrayBufferToBase64, validatePresentationFile, uploadPresentation, MAX_FILE_SIZE_BYTES } from './panel/presentationUpload.js';
```

**Remplacer `handlePresentationAddClick`** (actuellement lignes 303-305) :

```js
function handlePresentationAddClick() {
  presentationUploadModal.open();
}

async function handlePresentationUpload(file, title) {
  const invalidReason = validatePresentationFile(file);
  if (invalidReason) {
    const messages = {
      'wrong-type': 'Seuls les fichiers PDF sont acceptés.',
      'too-large': `Fichier trop volumineux (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} Mo).`,
    };
    presentationUploadModal.showError(messages[invalidReason] || 'Fichier invalide.');
    return;
  }

  presentationUploadModal.setSubmitting(true);
  const id = generateId();
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  const result = await uploadPresentation({
    id,
    title,
    base64,
    client,
    onProgress: (done, total) => {
      if (done % 3 === 0 || done === total) {
        showToast(document.getElementById('admin-toast'), `Envoi de la présentation... (${done}/${total})`);
      }
    },
  });

  presentationUploadModal.setSubmitting(false);

  if (!result.ok) {
    presentationUploadModal.showError("Échec de l'envoi — vérifie ta connexion et réessaie.");
    return;
  }

  db[result.key] = result.value;
  renderPanelForCurrentSelection();
  presentationUploadModal.close();
  showToast(document.getElementById('admin-toast'), '✓ Présentation ajoutée');
}
```

**Initialiser la modale**, juste après le bloc `const passwordModal = initPasswordModal({...})` existant (autour de la ligne 543) — **important : cette déclaration `const` doit rester au niveau module, avant `bootstrap()`, pour la même raison de portée que `passwordModal` ; `handlePresentationAddClick`/`handlePresentationUpload` référencent `presentationUploadModal` uniquement à l'intérieur de leur corps de fonction (exécuté seulement lors d'un clic bien après le chargement complet du module), donc aucun risque de TDZ tant que cette `const` est déclarée au niveau module comme les autres — c'est exactement le genre d'erreur qui a été trouvée et corrigée par l'implémenteur pendant la phase 23 (undo), donc la vigilance reste de mise ici aussi** :

```js
const presentationUploadModal = initPresentationUploadModal({
  modalEl: document.getElementById('presentation-upload-modal'),
  fileInputEl: document.getElementById('presentation-upload-file'),
  titleInputEl: document.getElementById('presentation-upload-title'),
  errorEl: document.getElementById('presentation-upload-error'),
  cancelBtn: document.getElementById('presentation-upload-cancel'),
  okBtn: document.getElementById('presentation-upload-ok'),
  onSubmit: handlePresentationUpload,
});
```

`onPresentationAddClick: handlePresentationAddClick` dans l'appel à `initSidePanel(...)` (ligne ~458) reste inchangé — la fonction existe déjà sous ce nom, seul son corps change.

## Contraintes globales

- Pas de génération de vignette (`thumb`) — le champ reste `''`, ce que `presentations.js` gère déjà gracieusement (`<img src="">`, fond gris translucide via `.presentation-thumb { background: rgba(255,255,255,0.08); }`). Générer une vraie vignette nécessiterait de rendre la première page du PDF dans un canvas (ex. PDF.js) — hors périmètre de la "version simple".
- Pas de drag-and-drop — sélection de fichier classique uniquement, confirmé par l'utilisateur.
- Pas de `window.confirm()` — matche le pattern "Add-family" déjà établi (ajouter n'efface jamais de donnée existante), contrairement à la suppression.
- La modale ne se ferme pas automatiquement en cas d'erreur (contrairement à `passwordModal`, qui ferme sur succès) — elle reste ouverte avec le message d'erreur affiché, pour permettre de corriger et réessayer sans re-sélectionner le fichier.
- Aucun changement dans `presentationPdf.js` (lecture) ni `firestoreClient.js` (aucune nouvelle méthode client nécessaire — `writeDoc`/`deleteDocsBatch` existent déjà et suffisent).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec ~15-16 tests en plus (9 pour `presentationUpload.js`, 7 pour `presentationUploadModal.js`).
- `npm run build` doit rester propre.
- **Vérification manuelle obligatoire contre Firestore de production réelle** (nouvelle écriture cross-collection, la plus complexe du projet après la suppression en cascade et l'undo de session) :
  - Uploader un petit PDF de test manifestement fictif (quelques Ko, titre "TEST — À IGNORER"), observer la progression dans le toast, confirmer que la carte apparaît avec le bon titre après succès.
  - Confirmer que le PDF s'ouvre correctement (bouton, pas juste la carte) — prouve que les chunks sont bien reconstructibles avec `openPresentationPdf`, symétrie lecture/écriture.
  - Recharger la page (hard reload), confirmer la persistance.
  - Renommer, puis supprimer cette présentation de test (fonctionnalités déjà existantes) et confirmer via `fetchKeysWithPrefix` qu'aucun chunk orphelin ne subsiste (même vérification que la phase 22).
  - Tester un cas d'erreur volontaire : sélectionner un fichier non-PDF (ex. une image), confirmer le message d'erreur clair, la modale reste ouverte.
  - Vérifier que les 4 présentations réelles existantes ne sont pas affectées tout au long du test.
  - Aucune erreur console.
