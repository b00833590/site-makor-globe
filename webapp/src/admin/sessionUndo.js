// Computes what it would take to put `current` back into the exact shape of
// `snapshot` — i.e. to undo every change made since the snapshot was taken.
//
// Change detection is JSON.stringify-based, matching production
// (index.html:845). That is technically key-order sensitive, so two objects
// holding identical data in a different insertion order would be reported as
// "changed". In practice every value here is produced by the same handful of
// code paths (a spread of a previous value plus a patch), so ordering is
// stable — and the only cost of a false positive is one redundant write of
// an identical value, never data loss.
export function computeSessionRestore(snapshot, current) {
  const writes = [];
  const deletes = [];
  const allKeys = new Set([...Object.keys(snapshot), ...Object.keys(current)]);

  for (const key of allKeys) {
    const before = snapshot[key];
    const now = current[key];
    if (JSON.stringify(before) === JSON.stringify(now)) continue;
    if (before === undefined) deletes.push(key);
    // Deep-copied so a caller mutating the returned value can never write
    // back through into the still-live session snapshot.
    else writes.push([key, JSON.parse(JSON.stringify(before))]);
  }

  return { writes, deletes };
}

const PRESENTATION_KEY_PREFIX = 'mkg:presentation:';

// A "write" in computeSessionRestore's output covers two different cases:
// putting an *edited* document's fields back (safe for any content type), and
// re-creating a document that was *deleted* during the session (current[key]
// is undefined — a genuine resurrection). For presentations specifically,
// resurrection is unsafe: handlePresentationDelete always removes the PDF's
// chunk documents in the same batch as the metadata doc, and those chunks are
// never part of db/sessionSnapshot to begin with (they're fetched from
// Firestore on demand, never bulk-loaded — see presentationPdf.js). Writing
// the metadata doc back would resurrect a card that renders and looks
// restored, but can never open — a permanently broken phantom entry, not a
// real undo. This finds those specific writes so the caller can exclude them
// and tell the admin plainly, instead of silently promising a restore that
// doesn't work.
export function splitUnrestorablePresentationDeletes(writes, current) {
  const safeWrites = [];
  const unrestorablePresentationTitles = [];
  for (const entry of writes) {
    const [key, value] = entry;
    const isResurrection = current[key] === undefined;
    if (isResurrection && key.startsWith(PRESENTATION_KEY_PREFIX)) {
      unrestorablePresentationTitles.push(value.title || 'Sans titre');
    } else {
      safeWrites.push(entry);
    }
  }
  return { safeWrites, unrestorablePresentationTitles };
}
