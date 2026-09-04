import { describe, it, expect } from 'vitest';
import { computeSessionRestore, splitUnrestorablePresentationDeletes } from './sessionUndo.js';

describe('computeSessionRestore', () => {
  it('returns nothing to do when nothing changed', () => {
    const db = { 'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 } };
    expect(computeSessionRestore(db, { ...db })).toEqual({ writes: [], deletes: [] });
  });

  it('restores an edited document to its snapshot value', () => {
    const snapshot = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40', value: '7 500' } };
    const current = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40', value: '9 999' } };
    expect(computeSessionRestore(snapshot, current)).toEqual({
      writes: [['mkg:market:w1:i1', { id: 'i1', name: 'CAC 40', value: '7 500' }]],
      deletes: [],
    });
  });

  it('deletes a document that did not exist at snapshot time (an add to undo)', () => {
    const snapshot = {};
    const current = { 'mkg:market:w1:new': { id: 'new', name: 'Nouvel indice' } };
    expect(computeSessionRestore(snapshot, current)).toEqual({
      writes: [],
      deletes: ['mkg:market:w1:new'],
    });
  });

  it('re-writes a document that was deleted during the session (a delete to undo)', () => {
    const snapshot = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40' } };
    const current = {};
    expect(computeSessionRestore(snapshot, current)).toEqual({
      writes: [['mkg:market:w1:i1', { id: 'i1', name: 'CAC 40' }]],
      deletes: [],
    });
  });

  it('handles edits, adds, and deletes together in one session', () => {
    const snapshot = {
      'mkg:market:w1:edited': { id: 'edited', value: 'avant' },
      'mkg:market:w1:removed': { id: 'removed', value: 'existait' },
      'mkg:market:w1:untouched': { id: 'untouched', value: 'stable' },
    };
    const current = {
      'mkg:market:w1:edited': { id: 'edited', value: 'après' },
      'mkg:market:w1:untouched': { id: 'untouched', value: 'stable' },
      'mkg:market:w1:added': { id: 'added', value: 'nouveau' },
    };
    const result = computeSessionRestore(snapshot, current);
    expect(result.writes.sort()).toEqual([
      ['mkg:market:w1:edited', { id: 'edited', value: 'avant' }],
      ['mkg:market:w1:removed', { id: 'removed', value: 'existait' }],
    ].sort());
    expect(result.deletes).toEqual(['mkg:market:w1:added']);
  });

  it('never includes an untouched document in either list', () => {
    const snapshot = { a: { v: 1 }, b: { v: 2 } };
    const current = { a: { v: 1 }, b: { v: 99 } };
    const result = computeSessionRestore(snapshot, current);
    expect(result.writes).toEqual([['b', { v: 2 }]]);
    expect(result.deletes).toEqual([]);
  });

  it('detects a nested change (not just a top-level field)', () => {
    const snapshot = { c: { id: 'c', bullets: ['un', 'deux'] } };
    const current = { c: { id: 'c', bullets: ['un', 'deux', 'trois'] } };
    expect(computeSessionRestore(snapshot, current).writes).toEqual([
      ['c', { id: 'c', bullets: ['un', 'deux'] }],
    ]);
  });

  it('returns snapshot values by reference-independent copy semantics (mutating the result does not corrupt the snapshot)', () => {
    const snapshot = { a: { id: 'a', value: 'original' } };
    const current = { a: { id: 'a', value: 'modifié' } };
    const result = computeSessionRestore(snapshot, current);
    result.writes[0][1].value = 'muté';
    expect(snapshot.a.value).toBe('original');
  });
});

describe('splitUnrestorablePresentationDeletes', () => {
  it('excludes a deleted presentation from safeWrites and reports its title', () => {
    const writes = [['mkg:presentation:p1', { id: 'p1', title: 'Deck A' }]];
    const current = {}; // deleted during the session — key absent from current
    const result = splitUnrestorablePresentationDeletes(writes, current);
    expect(result.safeWrites).toEqual([]);
    expect(result.unrestorablePresentationTitles).toEqual(['Deck A']);
  });

  it('falls back to "Sans titre" when the deleted presentation had no title', () => {
    const writes = [['mkg:presentation:p1', { id: 'p1' }]];
    const result = splitUnrestorablePresentationDeletes(writes, {});
    expect(result.unrestorablePresentationTitles).toEqual(['Sans titre']);
  });

  it('keeps an edited (still-existing) presentation in safeWrites — only deletions are unrestorable', () => {
    const writes = [['mkg:presentation:p1', { id: 'p1', title: 'Titre original' }]];
    const current = { 'mkg:presentation:p1': { id: 'p1', title: 'Titre modifié' } };
    const result = splitUnrestorablePresentationDeletes(writes, current);
    expect(result.safeWrites).toEqual(writes);
    expect(result.unrestorablePresentationTitles).toEqual([]);
  });

  it('leaves every non-presentation write untouched, deleted or not', () => {
    const writes = [
      ['mkg:market:w1:i1', { id: 'i1', value: '100' }],
      ['mkg:content:entreprises:w1:c1', { id: 'c1', name: 'Reliance' }],
    ];
    const result = splitUnrestorablePresentationDeletes(writes, {});
    expect(result.safeWrites).toEqual(writes);
    expect(result.unrestorablePresentationTitles).toEqual([]);
  });

  it('handles a mix of a restorable presentation edit, an unrestorable presentation delete, and an unrelated write in one call', () => {
    const writes = [
      ['mkg:presentation:edited', { id: 'edited', title: 'Toujours là' }],
      ['mkg:presentation:deleted', { id: 'deleted', title: 'Disparu' }],
      ['mkg:market:w1:i1', { id: 'i1', value: '100' }],
    ];
    const current = { 'mkg:presentation:edited': { id: 'edited', title: 'Modifié' }, 'mkg:market:w1:i1': { id: 'i1', value: '999' } };
    const result = splitUnrestorablePresentationDeletes(writes, current);
    expect(result.safeWrites).toEqual([
      ['mkg:presentation:edited', { id: 'edited', title: 'Toujours là' }],
      ['mkg:market:w1:i1', { id: 'i1', value: '100' }],
    ]);
    expect(result.unrestorablePresentationTitles).toEqual(['Disparu']);
  });
});
