import { DEFAULT_SETTINGS } from '../shared/types';

// electron-store types are misaligned in v11, use runtime require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ElectronStore = require('electron-store').default;

const store = new ElectronStore({
  defaults: { settings: DEFAULT_SETTINGS },
});

export function loadSettings(): typeof DEFAULT_SETTINGS {
  return store.get('settings', DEFAULT_SETTINGS);
}

export function saveSettings(settings: any) {
  store.set('settings', settings);
}
