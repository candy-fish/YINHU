import './viewport.js';
import { calendarService } from './services/calendar-service.js';
import { mediaService, storageAdapter } from './services/media-service.js';
import { workspaceService } from './services/workspace-service.js';
import {
  importLegacyCalendar,
  legacyImportPending,
  readLegacyCalendar
} from './legacy-calendar.js';
import { sharedCloudEnabled } from './api-url.js';

const api = Object.freeze({
  workspace: workspaceService,
  calendar: calendarService,
  media: mediaService,
  storage: storageAdapter,
  legacyCalendar: Object.freeze({
    import: (storage = localStorage) => {
      if (sharedCloudEnabled()) throw new Error('此部署不导入本地浏览器数据。');
      return importLegacyCalendar(calendarService, storage);
    },
    pending: (storage = localStorage) => sharedCloudEnabled() ? false : legacyImportPending(storage),
    read: (storage = localStorage) => sharedCloudEnabled() ? { dayNotes: [], anniversaries: [], journals: [] } : readLegacyCalendar(storage)
  })
});

globalThis.BlackDoor = api;
globalThis.BlackDoorReady = Promise.resolve(api);

export default api;
