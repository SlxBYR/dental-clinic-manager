import {
  RagExternalDocument,
  RagExternalPullResult,
  RagExternalSourceAdapter,
  RagExternalSourceConfig,
  RagExternalSourceStatus
} from '../types';
import { ragService } from './ragService';

const EXTERNAL_SOURCES_KEY = 'ragExternalSources';

type ExternalPayload = {
  documents?: unknown[];
  items?: unknown[];
  data?: unknown[] | { documents?: unknown[]; items?: unknown[] };
  cursor?: string;
  nextCursor?: string;
};

const createId = () => `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const extractDocuments = (payload: ExternalPayload) => {
  if (Array.isArray(payload.documents)) return payload.documents;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object') {
    if (Array.isArray(payload.data.documents)) return payload.data.documents;
    if (Array.isArray(payload.data.items)) return payload.data.items;
  }
  return [];
};

const asText = (value: unknown) => value === undefined || value === null ? '' : String(value);

const toMetadata = (value: unknown): Record<string, string | number | boolean> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | number | boolean>>((result, [key, field]) => {
    if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') result[key] = field;
    return result;
  }, {});
};

const httpJsonAdapter: RagExternalSourceAdapter = {
  id: 'http-json',
  name: 'HTTP JSON',
  kind: 'http-json',

  mapDocument(raw: unknown): RagExternalDocument {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const externalId = asText(item.externalId || item.id || item.key || createId());
    const title = asText(item.title || item.name || `外部文档 ${externalId}`);
    const content = asText(item.content || item.text || item.body || item.note);
    const patientMatch = item.patientMatch && typeof item.patientMatch === 'object'
      ? item.patientMatch as RagExternalDocument['patientMatch']
      : {
        name: typeof item.patientName === 'string' ? item.patientName : undefined,
        phone: typeof item.patientPhone === 'string' ? item.patientPhone : undefined
      };

    return {
      externalId,
      title,
      content,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
      deleted: item.deleted === true,
      patientMatch,
      metadata: toMetadata(item.metadata)
    };
  },

  async testConnection(config: RagExternalSourceConfig): Promise<RagExternalSourceStatus> {
    const result = await this.pull(config, config.cursor);
    return {
      success: result.success,
      message: result.success ? `连接成功，读取到 ${result.documents.length} 条文档。` : result.message
    };
  },

  async pull(config: RagExternalSourceConfig, cursor?: string): Promise<RagExternalPullResult> {
    if (!config.endpoint.trim()) {
      return { success: false, message: '请填写外部数据源地址。', documents: [] };
    }

    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint.trim());
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Invalid protocol');
    } catch {
      return { success: false, message: '外部数据源地址格式不正确。', documents: [] };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
        },
        body: JSON.stringify({
          action: 'pull',
          sourceId: config.id,
          cursor: cursor || ''
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `外部数据源返回 ${response.status} ${response.statusText || ''}`.trim(), documents: [] };
      }

      const payload = await response.json() as ExternalPayload;
      const documents = extractDocuments(payload)
        .map(item => this.mapDocument(item))
        .filter(document => document.externalId && document.title && document.content && !document.deleted);

      return {
        success: true,
        message: `已读取 ${documents.length} 条外部文档。`,
        documents,
        cursor: payload.nextCursor || payload.cursor
      };
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? '外部数据源请求超时。'
        : '外部数据源请求失败，请检查地址、Token、CORS 和网络。';
      return { success: false, message, documents: [] };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
};

class ExternalRagSourceService {
  private adapters: Record<string, RagExternalSourceAdapter> = {
    [httpJsonAdapter.kind]: httpJsonAdapter
  };

  getSources(): RagExternalSourceConfig[] {
    const stored = localStorage.getItem(EXTERNAL_SOURCES_KEY);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(source => source?.kind === 'http-json' && typeof source.id === 'string');
    } catch {
      return [];
    }
  }

  saveSources(sources: RagExternalSourceConfig[]) {
    localStorage.setItem(EXTERNAL_SOURCES_KEY, JSON.stringify(sources));
  }

  createSource(): RagExternalSourceConfig {
    return {
      id: createId(),
      name: '外部 JSON 数据源',
      kind: 'http-json',
      endpoint: '',
      token: '',
      enabled: true
    };
  }

  upsertSource(source: RagExternalSourceConfig) {
    const cleanSource: RagExternalSourceConfig = {
      ...source,
      name: source.name.trim() || '外部 JSON 数据源',
      endpoint: source.endpoint.trim(),
      token: source.token?.trim() || ''
    };
    const sources = this.getSources();
    const index = sources.findIndex(item => item.id === cleanSource.id);
    if (index >= 0) sources[index] = cleanSource;
    else sources.unshift(cleanSource);
    this.saveSources(sources);
    return cleanSource;
  }

  deleteSource(sourceId: string) {
    this.saveSources(this.getSources().filter(source => source.id !== sourceId));
  }

  private getAdapter(source: RagExternalSourceConfig) {
    return this.adapters[source.kind];
  }

  async testConnection(source: RagExternalSourceConfig): Promise<RagExternalSourceStatus> {
    const adapter = this.getAdapter(source);
    if (!adapter) return { success: false, message: '未找到对应外部数据源 adapter。' };
    return adapter.testConnection(source);
  }

  async syncSource(source: RagExternalSourceConfig): Promise<RagExternalSourceStatus> {
    const adapter = this.getAdapter(source);
    if (!adapter) return { success: false, message: '未找到对应外部数据源 adapter。' };
    const savedSource = this.upsertSource(source);
    const result = await adapter.pull(savedSource, savedSource.cursor);
    const now = new Date().toISOString();

    const nextSource: RagExternalSourceConfig = {
      ...savedSource,
      cursor: result.cursor || savedSource.cursor,
      lastSyncedAt: result.success ? now : savedSource.lastSyncedAt,
      lastError: result.success ? '' : result.message
    };
    this.upsertSource(nextSource);

    if (!result.success) return { success: false, message: result.message };

    result.documents.forEach(document => {
      ragService.addKnowledgeEntry({
        type: 'external',
        title: document.title,
        content: document.content,
        externalSourceId: savedSource.id,
        externalSourceName: savedSource.name,
        externalId: document.externalId,
        metadata: {
          ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
          ...(document.patientMatch?.name ? { patientName: document.patientMatch.name } : {}),
          ...(document.patientMatch?.phone ? { patientPhone: document.patientMatch.phone } : {}),
          ...(document.metadata || {})
        }
      });
    });

    return {
      success: true,
      message: `同步完成，写入 ${result.documents.length} 条外部文档。`
    };
  }
}

export const externalRagSourceService = new ExternalRagSourceService();
