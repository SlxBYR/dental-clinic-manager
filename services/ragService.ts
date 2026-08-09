import { Patient, RagChunk, RagExternalDocument, RagIndexStats, RagKnowledgeEntry, RagSearchHit } from '../types';
import { ragStorage, RAG_KNOWLEDGE_STORE_KEY } from './ragStorage';

const MAX_CHUNK_LENGTH = 900;
const CHUNK_OVERLAP = 120;

type AddKnowledgeEntryInput = {
  title: string;
  content: string;
  type: RagKnowledgeEntry['type'];
  fileName?: string;
  externalSourceId?: string;
  externalSourceName?: string;
  externalId?: string;
  metadata?: Record<string, string | number | boolean>;
};

const normalizeText = (value: string) => value
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const tokenize = (query: string) => {
  const normalized = normalizeText(query);
  const latinTerms = normalized.match(/[a-z0-9]+/g) || [];
  const chineseTerms = (normalized.match(/[\u4e00-\u9fff]+/g) || [])
    .flatMap(term => term.length === 1
      ? [term]
      : Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))
    );
  const terms = Array.from(new Set([...latinTerms, ...chineseTerms].filter(Boolean)));
  return { normalized, terms: terms.length > 0 ? terms : [normalized] };
};

const splitContent = (content: string) => {
  const normalized = content.trim();
  if (normalized.length <= MAX_CHUNK_LENGTH) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + MAX_CHUNK_LENGTH);
    chunks.push(normalized.slice(start, end).trim());
    if (end === normalized.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks.filter(Boolean);
};

const formatPatientProfile = (patient: Patient) => [
  `患者：${patient.name}`,
  `电话：${patient.phone || '未填写'}`,
  `性别：${patient.gender || '未填写'}`,
  `年龄：${patient.age || '未填写'}`,
  `处置记录数：${patient.treatments.length}`,
  `预约记录数：${patient.appointments.length}`
].join('\n');

const formatTreatment = (patient: Patient, index: number) => {
  const treatment = patient.treatments[index];
  return [
    `患者：${patient.name}`,
    `记录类型：处置记录`,
    `日期：${treatment.date}`,
    `项目：${treatment.item}`,
    `价格：${treatment.price}`,
    `牙位：${treatment.teeth || '未填写'}`,
    `备注：${treatment.note || '无'}`,
    treatment.changeLogs.length ? `修改日志数：${treatment.changeLogs.length}` : ''
  ].filter(Boolean).join('\n');
};

const formatAppointment = (patient: Patient, index: number) => {
  const appointment = patient.appointments[index];
  return [
    `患者：${patient.name}`,
    `记录类型：预约记录`,
    `时间：${appointment.datetime}`,
    `状态：${appointment.status || 'pending'}`
  ].join('\n');
};

const countMatches = (text: string, token: string) => {
  if (!token) return 0;
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
};

const buildHighlights = (content: string, tokens: string[]) => {
  const normalizedContent = normalizeText(content);
  const matched = tokens.filter(token => normalizedContent.includes(token));
  if (matched.length === 0) return [];

  const firstToken = matched[0];
  const matchIndex = normalizedContent.indexOf(firstToken);
  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(content.length, matchIndex + firstToken.length + 120);
  const excerpt = `${start > 0 ? '...' : ''}${content.slice(start, end).trim()}${end < content.length ? '...' : ''}`;
  return [excerpt];
};

class RagService {
  private entries: RagKnowledgeEntry[] = [];

  async initialize() {
    const stored = await ragStorage.getItem(RAG_KNOWLEDGE_STORE_KEY);
    this.entries = this.parseKnowledgeEntries(stored);
  }

  private parseKnowledgeEntries(stored: string | null): RagKnowledgeEntry[] {
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(entry => (
        entry
        && typeof entry.id === 'string'
        && (entry.type === 'manual' || entry.type === 'file' || entry.type === 'external')
        && typeof entry.title === 'string'
        && typeof entry.content === 'string'
      ));
    } catch {
      return [];
    }
  }

  getKnowledgeEntries(): RagKnowledgeEntry[] {
    return this.entries;
  }

  private async saveKnowledgeEntries(entries: RagKnowledgeEntry[]) {
    this.entries = entries;
    await ragStorage.setItem(RAG_KNOWLEDGE_STORE_KEY, JSON.stringify(entries));
  }

  async addKnowledgeEntry(input: AddKnowledgeEntryInput): Promise<RagKnowledgeEntry> {
    const now = new Date().toISOString();
    const entry: RagKnowledgeEntry = {
      id: createId(input.type),
      type: input.type,
      title: input.title.trim() || (input.type === 'file' ? input.fileName || '未命名文件' : '未命名知识条目'),
      content: input.content.trim(),
      createdAt: now,
      updatedAt: now,
      ...(input.fileName ? { fileName: input.fileName } : {}),
      ...(input.externalSourceId ? { externalSourceId: input.externalSourceId } : {}),
      ...(input.externalSourceName ? { externalSourceName: input.externalSourceName } : {}),
      ...(input.externalId ? { externalId: input.externalId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    const entries = [
      entry,
      ...this.getKnowledgeEntries().filter(existing => (
        !input.externalSourceId
        || !input.externalId
        || existing.externalSourceId !== input.externalSourceId
        || existing.externalId !== input.externalId
      ))
    ];
    await this.saveKnowledgeEntries(entries);
    return entry;
  }

  async syncExternalDocuments(
    source: Pick<AddKnowledgeEntryInput, 'externalSourceId' | 'externalSourceName'>,
    documents: RagExternalDocument[]
  ) {
    if (!source.externalSourceId || !source.externalSourceName) {
      throw new Error('外部数据源缺少标识或名称。');
    }

    const now = new Date().toISOString();
    const entries = this.getKnowledgeEntries();
    const entryIndexes = new Map(entries.map((entry, index) => [
      `${entry.externalSourceId || ''}:${entry.externalId || ''}`,
      index
    ]));
    let upserted = 0;
    let markedDeleted = 0;

    documents.forEach(document => {
      const externalId = document.externalId.trim();
      if (!externalId) return;

      const key = `${source.externalSourceId}:${externalId}`;
      const existingIndex = entryIndexes.get(key);
      const existing = existingIndex === undefined ? undefined : entries[existingIndex];

      if (document.deleted) {
        if (existing && !existing.isDeleted) {
          entries[existingIndex as number] = {
            ...existing,
            isDeleted: true,
            updatedAt: document.updatedAt || now
          };
          markedDeleted += 1;
        }
        return;
      }

      const content = document.content.trim();
      const title = document.title.trim();
      if (!content || !title) return;

      const metadata = {
        ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
        ...(document.patientMatch?.name ? { patientName: document.patientMatch.name } : {}),
        ...(document.patientMatch?.phone ? { patientPhone: document.patientMatch.phone } : {}),
        ...(document.metadata || {})
      };
      const nextEntry: RagKnowledgeEntry = {
        id: existing?.id || createId('external'),
        type: 'external',
        title,
        content,
        createdAt: existing?.createdAt || now,
        updatedAt: document.updatedAt || now,
        externalSourceId: source.externalSourceId,
        externalSourceName: source.externalSourceName,
        externalId,
        metadata,
        isDeleted: false
      };

      if (existingIndex === undefined) {
        entries.unshift(nextEntry);
        entryIndexes.forEach((index, entryKey) => entryIndexes.set(entryKey, index + 1));
        entryIndexes.set(key, 0);
      } else {
        entries[existingIndex] = nextEntry;
      }
      upserted += 1;
    });

    await this.saveKnowledgeEntries(entries);
    return { upserted, markedDeleted };
  }

  async deleteKnowledgeEntry(entryId: string) {
    await this.saveKnowledgeEntries(this.getKnowledgeEntries().filter(entry => entry.id !== entryId));
  }

  buildChunks(patients: Patient[]): RagChunk[] {
    const chunks: RagChunk[] = [];

    patients.forEach(patient => {
      chunks.push({
        id: `patient_${patient.id}_profile`,
        sourceType: 'patient',
        sourceId: patient.id,
        patientId: patient.id,
        patientName: patient.name,
        title: `${patient.name} 的患者档案`,
        content: formatPatientProfile(patient)
      });

      patient.treatments.forEach((treatment, index) => {
        chunks.push({
          id: `patient_${patient.id}_treatment_${treatment.id || index}`,
          sourceType: 'patient',
          sourceId: treatment.id || patient.id,
          patientId: patient.id,
          patientName: patient.name,
          title: `${patient.name} ${treatment.date} ${treatment.item}`,
          content: formatTreatment(patient, index),
          createdAt: treatment.createdAt || treatment.date
        });
      });

      patient.appointments.forEach((appointment, index) => {
        chunks.push({
          id: `patient_${patient.id}_appointment_${appointment.id || index}`,
          sourceType: 'patient',
          sourceId: appointment.id || patient.id,
          patientId: patient.id,
          patientName: patient.name,
          title: `${patient.name} ${appointment.datetime} 预约`,
          content: formatAppointment(patient, index),
          createdAt: appointment.created_at || appointment.datetime
        });
      });
    });

    this.getKnowledgeEntries().filter(entry => !entry.isDeleted).forEach(entry => {
      splitContent(entry.content).forEach((content, index) => {
        chunks.push({
          id: `${entry.id}_${index}`,
          sourceType: entry.type,
          sourceId: entry.id,
          title: entry.title,
          content,
          createdAt: entry.updatedAt,
          externalSourceName: entry.externalSourceName,
          externalId: entry.externalId
        });
      });
    });

    return chunks;
  }

  getStats(patients: Patient[]): RagIndexStats {
    const entries = this.getKnowledgeEntries().filter(entry => !entry.isDeleted);
    const patientChunkCount = patients.reduce((total, patient) => (
      total + 1 + patient.treatments.length + patient.appointments.length
    ), 0);
    const entryChunkCount = entries.reduce((total, entry) => total + splitContent(entry.content).length, 0);
    return {
      patientCount: patients.length,
      knowledgeEntryCount: entries.length,
      chunkCount: patientChunkCount + entryChunkCount,
      updatedAt: new Date().toISOString()
    };
  }

  search(query: string, patients: Patient[], limit = 30): RagSearchHit[] {
    const { normalized: normalizedQuery, terms } = tokenize(query);
    if (!normalizedQuery) return [];
    const minimumMatchedTerms = terms.length === 1 ? 1 : Math.ceil(terms.length * 0.6);
    const isSingleCharacterQuery = normalizedQuery.length === 1;

    return this.buildChunks(patients)
      .map(chunk => {
        const normalizedTitle = normalizeText(chunk.title);
        const normalizedContent = normalizeText(chunk.content);
        const normalizedPatient = normalizeText(chunk.patientName || '');
        const searchableContent = isSingleCharacterQuery ? '' : normalizedContent;
        const matchedTerms = terms.filter(token => (
          normalizedTitle.includes(token)
          || normalizedPatient.includes(token)
          || searchableContent.includes(token)
        ));
        const phraseMatched = normalizedTitle.includes(normalizedQuery)
          || normalizedPatient.includes(normalizedQuery)
          || searchableContent.includes(normalizedQuery);
        const tokenScore = matchedTerms.reduce((total, token) => {
          const titleScore = countMatches(normalizedTitle, token) * 8;
          const patientScore = countMatches(normalizedPatient, token) * 6;
          const contentScore = countMatches(searchableContent, token) * 2;
          return total + titleScore + patientScore + contentScore;
        }, 0);
        return {
          ...chunk,
          score: tokenScore + (phraseMatched ? 18 : 0),
          highlights: buildHighlights(chunk.content, [normalizedQuery, ...terms]),
          isRelevant: phraseMatched || matchedTerms.length >= minimumMatchedTerms
        };
      })
      .filter(hit => hit.score > 0 && hit.isRelevant)
      .sort((a, b) => b.score - a.score || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, limit)
      .map(({ isRelevant: _isRelevant, ...hit }) => hit);
  }
}

export const ragService = new RagService();
