import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasLegacyCalendarData,
  normalizeLegacyDayNoteKey,
  parseJournalPeriodKey,
  readLegacyCalendar
} from '../src/legacy-calendar.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('zero-based legacy day-note months become ISO dates', () => {
  assert.equal(normalizeLegacyDayNoteKey('2026-0-1'), '2026-01-01');
  assert.equal(normalizeLegacyDayNoteKey('2026-11-31'), '2026-12-31');
  assert.equal(normalizeLegacyDayNoteKey('2026-1-30'), null);
});

test('journal keys support one day or a forward date range', () => {
  assert.deepEqual(parseJournalPeriodKey('2026-08-03'), {
    periodKey: '2026-08-03', startDate: '2026-08-03', endDate: null
  });
  assert.deepEqual(parseJournalPeriodKey('2026-08-03~2026-08-10'), {
    periodKey: '2026-08-03~2026-08-10', startDate: '2026-08-03', endDate: '2026-08-10'
  });
  assert.equal(parseJournalPeriodKey('2026-08-10~2026-08-03'), null);
});

test('all three existing localStorage groups are read independently', () => {
  const storage = new MemoryStorage({
    stellarNotes: JSON.stringify({ '2026-7-3': '格子内容' }),
    stellarAnnals: JSON.stringify([{ date: '2026-07-05', title: '纪念', desc: '说明' }]),
    redlineJournal: JSON.stringify({ '2026-08-03~2026-08-10': '手记' })
  });
  const data = readLegacyCalendar(storage);
  assert.deepEqual(data.dayNotes, [{ noteDate: '2026-08-03', content: '格子内容' }]);
  assert.equal(data.anniversaries.length, 1);
  assert.equal(data.journals.length, 1);
  assert.equal(hasLegacyCalendarData(data), true);
});
