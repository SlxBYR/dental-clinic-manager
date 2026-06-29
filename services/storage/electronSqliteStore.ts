import { KeyValueStore, StorageStatusResult } from './types';

export class ElectronSqliteStore implements KeyValueStore {
  readonly name = 'sqlite';

  isAvailable() {
    return Boolean(window.electronSqliteStore);
  }

  async getStatus(): Promise<StorageStatusResult> {
    if (!window.electronSqliteStore) {
      return { success: false, available: false, error: '当前环境未提供 SQLite 存储接口。' };
    }
    return window.electronSqliteStore.status();
  }

  async getItem(key: string): Promise<string | null> {
    if (!window.electronSqliteStore) throw new Error('当前环境未提供 SQLite 存储接口。');
    const result = await window.electronSqliteStore.get(key);
    if (!result.success) throw new Error(result.error || 'SQLite 读取失败。');
    return result.value ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!window.electronSqliteStore) throw new Error('当前环境未提供 SQLite 存储接口。');
    const result = await window.electronSqliteStore.set(key, value);
    if (!result.success) throw new Error(result.error || 'SQLite 写入失败。');
  }
}
