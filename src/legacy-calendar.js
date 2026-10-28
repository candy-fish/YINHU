const DAY_NOTE_KEY = 'stellarNotes';
const ANNIVERSARY_KEY = 'stellarAnnals';
const JOURNAL_KEY = 'redlineJournal';
const IMPORT_MARKER = 'blackdoor:calendar-imported:v1';

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function normalizeLegacyDayNoteKey(key) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(key));
  if (!match) return null;
  const year = Number(match[1]);
  const zeroBasedMonth = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || zeroBasedMonth < 0 || zeroBasedMonth > 11) return null;
  const date = new Date(Date.UTC(year, zeroBasedMonth, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== zeroBasedMonth || date.getUTCDate() !== day) return null;
  return `${year}-${String(zeroBasedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseJournalPeriodKey(key) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:~(\d{4}-\d{2}-\d{2}))?$/.exec(String(key));
  if (!match) return null;
  const [startDate, endDate = null] = match.slice(1);
  const valid = value => {
    if (!value) return true;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  if (!valid(startDate) || !valid(endDate) || (endDate && endDate <= startDate)) return null;
  return { periodKey: key, startDate, endDate };
}

export function readLegacyCalendar(storage = localStorage) {
  const rawNotes = readJson(storage, DAY_NOTE_KEY, {});
  const rawAnniversaries = readJson(storage, ANNIVERSARY_KEY, []);
  const rawJournals = readJson(storage, JOURNAL_KEY, {});

  const dayNotes = Object.entries(rawNotes).flatMap(([key, content]) => {
    const noteDate = normalizeLegacyDayNoteKey(key);
    return noteDate && typeof content === 'string' && content.trim()
      ? [{ noteDate, content }]
      : [];
  });

  const anniversaries = Array.isArray(rawAnniversaries)
    ? rawAnniversaries.flatMap(item => {
        if (!item || typeof item.date !== 'string' || typeof item.title !== 'string' || !item.title.trim()) return [];
        return [{ eventDate: item.date, title: item.title, description: String(item.desc || '') }];
      })
    : [];

  const journals = Object.entries(rawJournals).flatMap(([key, content]) => {
    const period = parseJournalPeriodKey(key);
    return period && typeof content === 'string' && content.trim()
      ? [{ ...period, content }]
      : [];
  });

  return { dayNotes, anniversaries, journals };
}

export function hasLegacyCalendarData(data) {
  return data.dayNotes.length + data.anniversaries.length + data.journals.length > 0;
}

export async function importLegacyCalendar(calendarService, storage = localStorage) {
  const legacy = readLegacyCalendar(storage);
  const remote = await calendarService.loadAll({ includeDeleted: true });
  const remoteNotes = new Set(remote.dayNotes.map(row => row.note_date));
  const remoteAnniversaries = new Set(remote.anniversaries.map(row => `${row.event_date}\u0000${row.title}\u0000${row.description}`));
  const remoteJournals = new Set(remote.journals.map(row => row.period_key));
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] };

  const run = async action => {
    try {
      await action();
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(error);
    }
  };

  for (const note of legacy.dayNotes) {
    if (remoteNotes.has(note.noteDate)) result.skipped += 1;
    else await run(() => calendarService.saveDayNote(note));
  }
  for (const annal of legacy.anniversaries) {
    const key = `${annal.eventDate}\u0000${annal.title}\u0000${annal.description}`;
    if (remoteAnniversaries.has(key)) result.skipped += 1;
    else await run(() => calendarService.saveAnniversary(annal));
  }
  for (const journal of legacy.journals) {
    if (remoteJournals.has(journal.periodKey)) result.skipped += 1;
    else await run(() => calendarService.saveJournal(journal));
  }

  if (result.failed === 0) {
    storage.setItem(IMPORT_MARKER, JSON.stringify({ importedAt: new Date().toISOString(), ...result }));
  }
  return result;
}

export function legacyImportPending(storage = localStorage) {
  return !storage.getItem(IMPORT_MARKER) && hasLegacyCalendarData(readLegacyCalendar(storage));
}
