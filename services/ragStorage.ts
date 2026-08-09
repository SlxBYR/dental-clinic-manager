import { ElectronSqliteStore } from './storage/electronSqliteStore';
import { LocalStorageStore } from './storage/localStorageStore';
import { KeyValueStore } from './storage/types';

export const RAG_KNOWLEDGE_STORE_KEY = 'ragKnowledgeEntries';
export const RAG_AI_SETTINGS_STORE_KEY = 'ragAiSettings';
export const RAG_EXTERNAL_SOURCES_STORE_KEY = 'ragExternalSources';

const RAG_STORE_KEYS = [
  RAG_KNOWLEDGE_STORE_KEY,
  RAG_AI_SETTINGS_STORE_KEY,
  RAG_EXTERNAL_SOURCES_STORE_KEY
] as const;

// RAG 的可恢复数据必须走统一存储层；Electron 下会落入由 safeStorage 加密的 SQLite。
class RagStorage {
  private readonly localStore = new LocalStorageStore();
  private store: KeyValueStore = this.localStore;
  private initPromise: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.selectStore();
    return this.initPromise;
  }

  private async selectStore() {
    const sqliteStore = new ElectronSqliteStore();
    if (!sqliteStore.isAvailable()) return;

    try {
      const status = await sqliteStore.getStatus();
      if (!status.available) return;

      for (const key of RAG_STORE_KEYS) {
        const stored = await sqliteStore.getItem(key);
        const legacy = await this.localStore.getItem(key);
        if (stored === null && legacy !== null) await sqliteStore.setItem(key, legacy);
        if (legacy !== null) localStorage.removeItem(key);
      }
      this.store = sqliteStore;
    } catch (error) {
      console.error('RAG SQLite 初始化失败，保留 localStorage 兜底。', error);
      this.store = this.localStore;
    }
  }

  async getItem(key: typeof RAG_STORE_KEYS[number]) {
    await this.initialize();
    return this.store.getItem(key);
  }

  async setItem(key: typeof RAG_STORE_KEYS[number], value: string) {
    await this.initialize();
    await this.store.setItem(key, value);
  }
}

export const ragStorage = new RagStorage();
