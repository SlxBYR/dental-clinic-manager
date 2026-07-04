import { Patient, RagChunk, RagIndexStats, RagKnowledgeEntry, RagSearchHit } from '../types';

const RAG_KNOWLEDGE_KEY = 'ragKnowledgeEntries';
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
  const wordTokens = normalized.match(/[a-z0-9]+|[\u4e00-\u9fff]/g) || [];
  const phraseTokens = normalized.length >= 2 ? [normalized] : [];
  return Array.from(new Set([...phraseTokens, ...wordTokens].filter(token => token.length > 0)));
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
  getKnowledgeEntries(): RagKnowledgeEntry[] {
    const stored = localStorage.getItem(RAG_KNOWLEDGE_KEY);
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

  private saveKnowledgeEntries(entries: RagKnowledgeEntry[]) {
    localStorage.setItem(RAG_KNOWLEDGE_KEY, JSON.stringify(entries));
  }

  addKnowledgeEntry(input: AddKnowledgeEntryInput): RagKnowledgeEntry {
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
    this.saveKnowledgeEntries(entries);
    return entry;
  }

  deleteKnowledgeEntry(entryId: string) {
    this.saveKnowledgeEntries(this.getKnowledgeEntries().filter(entry => entry.id !== entryId));
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

    this.getKnowledgeEntries().forEach(entry => {
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
    const entries = this.getKnowledgeEntries();
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
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    return this.buildChunks(patients)
      .map(chunk => {
        const normalizedTitle = normalizeText(chunk.title);
        const normalizedContent = normalizeText(chunk.content);
        const normalizedPatient = normalizeText(chunk.patientName || '');
        const score = tokens.reduce((total, token) => {
          const titleScore = countMatches(normalizedTitle, token) * 8;
          const patientScore = countMatches(normalizedPatient, token) * 6;
          const contentScore = countMatches(normalizedContent, token) * 2;
          return total + titleScore + patientScore + contentScore;
        }, 0);
        return {
          ...chunk,
          score,
          highlights: buildHighlights(chunk.content, tokens)
        };
      })
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, limit);
  }
}

export const ragService = new RagService();
