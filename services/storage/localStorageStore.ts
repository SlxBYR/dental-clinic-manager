import { STORAGE_KEY } from '../../constants';
import { CLINIC_DATA_STORE_KEY, KeyValueStore } from './types';

const getLocalStorageKey = (key: string) => key === CLINIC_DATA_STORE_KEY ? STORAGE_KEY : key;

export class LocalStorageStore implements KeyValueStore {
  readonly name = 'localStorage';

  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(getLocalStorageKey(key));
  }

  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(getLocalStorageKey(key), value);
  }
}

