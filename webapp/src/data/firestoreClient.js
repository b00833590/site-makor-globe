import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, query, where, documentId, onSnapshot } from 'firebase/firestore';

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyDSq-wkq28uEsU3CO5WT6aW0CQgU1SW7bk',
  authDomain: 'makor-morning-news.firebaseapp.com',
  projectId: 'makor-morning-news',
  storageBucket: 'makor-morning-news.firebasestorage.app',
  messagingSenderId: '651054346177',
  appId: '1:651054346177:web:a31a6fbca4b90853338940',
  measurementId: 'G-XN8VTJDMQV',
};

const MAIN_COLLECTION = 'mkg_data';
const PDF_PREFIX = 'mkg:pdfchunk:';
const PDF_COLLECTION = 'mkg_pdfchunks';
const EMPTY_RETRY_DELAY_MS = 1200;
const WRITE_RETRY_COUNT = 2;
const WRITE_RETRY_DELAY_MS = 900;

export function collectionForKey(key) {
  return key.startsWith(PDF_PREFIX) ? PDF_COLLECTION : MAIN_COLLECTION;
}

// Shared by loadAllOnce and subscribeToChanges — both turn a Firestore
// query snapshot into the same {key: parsedValue} shape.
export function docsToDb(docs) {
  const out = {};
  for (const d of docs) {
    try {
      out[d.id] = JSON.parse(d.data().value);
    } catch {
      // corrupt row — skip, matches production behavior
    }
  }
  return out;
}

export async function writeWithRetry(writeFn, retries = WRITE_RETRY_COUNT, delayMs = WRITE_RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await writeFn();
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export function createFirestoreClient(config = DEFAULT_CONFIG) {
  const app = initializeApp(config);
  const db = getFirestore(app);

  async function loadAllOnce() {
    const snapshot = await getDocs(collection(db, MAIN_COLLECTION));
    return docsToDb(snapshot.docs);
  }

  // Live-updates onChange(dbShape) every time anything in mkg_data changes,
  // starting with the current state (fires once immediately, then again on
  // every subsequent change). Lets a save made on the old site propagate to
  // an already-open makor-globe tab without a manual reload.
  function subscribeToChanges(onChange) {
    return onSnapshot(
      collection(db, MAIN_COLLECTION),
      snapshot => onChange(docsToDb(snapshot.docs)),
      error => console.error('Firestore live sync error', error),
    );
  }

  async function writeDoc(key, value) {
    await writeWithRetry(() => setDoc(doc(db, collectionForKey(key), key), {
      value: JSON.stringify(value),
      updatedAt: serverTimestamp(),
    }));
  }

  async function deleteDocByKey(key) {
    await writeWithRetry(() => deleteDoc(doc(db, collectionForKey(key), key)));
  }

  async function deleteDocsBatch(keys) {
    if (keys.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const key of keys) {
        batch.delete(doc(db, collectionForKey(key), key));
      }
      await batch.commit();
    });
  }

  async function writeDocsBatch(entries) {
    if (entries.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const [key, value] of entries) {
        batch.set(doc(db, collectionForKey(key), key), {
          value: JSON.stringify(value),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    });
  }

  // Single all-or-nothing commit combining sets and deletes. Used by the
  // session-undo restore, where a partially-applied restore would leave the
  // admin in a state that is neither "before" nor "after" — worse than
  // failing outright. Routes each key to its own collection, so a restore
  // spanning mkg_data and mkg_pdfchunks stays atomic across both.
  //
  // Firestore caps a batch at 500 operations; a session touching more than
  // 500 documents will reject rather than half-apply. Deliberately not
  // chunked — see the plan's Global Constraints.
  async function applyBatch({ writes, deletes }) {
    if (writes.length === 0 && deletes.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const [key, value] of writes) {
        batch.set(doc(db, collectionForKey(key), key), {
          value: JSON.stringify(value),
          updatedAt: serverTimestamp(),
        });
      }
      for (const key of deletes) {
        batch.delete(doc(db, collectionForKey(key), key));
      }
      await batch.commit();
    });
  }

  async function fetchKeysWithPrefix(prefix) {
    const coll = collectionForKey(prefix);
    const q = query(
      collection(db, coll),
      where(documentId(), '>=', prefix),
      where(documentId(), '<', prefix + ''),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.id);
  }

  async function fetchRawValue(key) {
    const snap = await getDoc(doc(db, collectionForKey(key), key));
    return snap.exists() ? snap.data().value : null;
  }

  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch, writeDocsBatch, fetchKeysWithPrefix, fetchRawValue, applyBatch, subscribeToChanges };
}

export async function loadAllWithRetry(loadOnceFn, delayMs = EMPTY_RETRY_DELAY_MS) {
  const first = await loadOnceFn();
  if (first && Object.keys(first).length > 0) return first;
  await new Promise(resolve => setTimeout(resolve, delayMs));
  const second = await loadOnceFn();
  return second || {};
}
