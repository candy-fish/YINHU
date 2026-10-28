import { request } from '../api-client.js';

const types = {
  calendar_day_notes: 'day-notes',
  calendar_anniversaries: 'anniversaries',
  calendar_journal_entries: 'journals'
};
const save = (type, values) => request(`/api/calendar/${type}${values.id ? `/${values.id}` : ''}`, {
  method: values.id ? 'PATCH' : 'POST', body: values
});
const remove = (type, values) => request(`/api/calendar/${type}/${values.id}`, {
  method: 'DELETE', body: { version: values.version }
});
export const calendarService = Object.freeze({
  loadAll: ({ includeDeleted = false } = {}) => request(`/api/calendar${includeDeleted ? '?includeDeleted=true' : ''}`),
  saveDayNote: values => save('day-notes', values),
  saveAnniversary: values => save('anniversaries', values),
  saveJournal: values => save('journals', values),
  softDeleteDayNote: values => remove('day-notes', values),
  softDeleteAnniversary: values => remove('anniversaries', values),
  softDeleteJournal: values => remove('journals', values),
  restore(table, values) {
    if (!Object.hasOwn(types, table)) throw new Error('不支持恢复该数据类型。');
    return request(`/api/calendar/${types[table]}/${values.id}/restore`, {
      method: 'POST', body: { version: values.version }
    });
  }
});
