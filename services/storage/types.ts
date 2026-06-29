export const CLINIC_DATA_STORE_KEY = 'clinicData';

export type StorageReadResult = {
  success: boolean;
  value?: string | null;
  error?: string;
};

export type StorageWriteResult = {
  success: boolean;
  error?: string;
};

export type StorageStatusResult = {
  success: boolean;
  available: boolean;
  dbPath?: string;
  error?: string;
};

export interface KeyValueStore {
  readonly name: string;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ElectronSqliteStoreBridge {
  get(key: string): Promise<StorageReadResult>;
  set(key: string, value: string): Promise<StorageWriteResult>;
  status(): Promise<StorageStatusResult>;
}

declare global {
  interface Window {
    electronSqliteStore?: ElectronSqliteStoreBridge;
  }
}

