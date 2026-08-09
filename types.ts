export interface TreatmentItem {
  id: string; // unique ID for the catalog item
  name: string;
  price: number;
}

export interface TreatmentCategory {
  id: string;
  name: string;
  items: TreatmentItem[];
}

export interface TreatmentChangeLog {
  id: string;
  changedAt: string;
  changedFields: string[];
  before: Record<string, string | number | undefined>;
  after: Record<string, string | number | undefined>;
  note?: string;
}

export interface TreatmentRecord {
  id: string;
  appointmentId?: string; // 来源预约；用于把预约处置计划幂等地转成正式处置。
  plannedTreatmentId?: string;
  date: string;
  createdAt?: string;
  categoryId?: string;
  itemId?: string;
  item: string; // Name of the item
  price: number; // Charged price
  teeth: string; // 可为空；也可为具体牙位、ALL、UPPER、LOWER 等。
  note: string;
  changeLogs: TreatmentChangeLog[]; // 处置编辑审计日志；旧数据迁移时补齐为空数组。
}

export interface Appointment {
  id: string;
  datetime: string; // Format: YYYY-MM-DD HH:mm
  created_at: string;
  status?: AppointmentStatus;
  visitType?: VisitType;
  checkedInAt?: string;
}

export type PatientActivityType =
  | 'created'
  | 'profile_updated'
  | 'appointment_created'
  | 'appointment_updated'
  | 'appointment_status'
  | 'appointment_deleted'
  | 'initial_visit'
  | 'follow_up_visit'
  | 'treatment_created'
  | 'treatment_updated'
  | 'treatment_deleted';

export interface PatientActivity {
  id: string;
  type: PatientActivityType;
  occurredAt: string;
  label: string;
}

export interface Patient {
  id: string; // Hidden unique ID
  createdAt?: string; // ISO timestamp when this patient record was created; legacy imports may not have it.
  patientGroupId?: string; // 同号码患者组；同一电话可对应多个独立患者
  name: string;
  phone: string;
  gender: string;
  age: string;
  social?: string; // Legacy field preserved during migration/export, no longer shown in UI
  treatments: TreatmentRecord[];
  appointments: Appointment[];
  activityLog?: PatientActivity[];
}

export interface PatientListItem {
  id: string;
  createdAt?: string;
  name: string;
  phone: string;
  gender: string;
  age: string;
  lastUpdate: string;
  phoneCount: number;
  isTodayVisit: boolean;
  lastVisitAt?: string;
  todayVisitType?: VisitType;
}

export type PatientListScope = 'today' | 'recent' | 'all';

export interface PatientListQuery {
  query?: string;
  scope?: PatientListScope;
  today?: string;
  recentStart?: string;
  offset: number;
  limit: number;
}

export interface PatientListPage {
  items: PatientListItem[];
  total: number;
  offset: number;
  limit: number;
}

export type AppointmentStatus = 'pending' | 'arrived' | 'completed' | 'cancelled';
export type VisitType = 'initial' | 'follow_up';
export type ScheduleSource = 'appointment' | 'walk_in';

export interface PlannedTreatment {
  id: string;
  categoryId?: string;
  itemId?: string;
  itemName: string;
  price: number;
  teeth: string;
  note: string;
}

export interface GlobalAppointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  patientId: string;
  phone: string;
  name: string;
  status: AppointmentStatus;
  durationMinutes: number;
  source: ScheduleSource;
  visitType?: VisitType;
  checkedInAt?: string;
  plannedTreatments: PlannedTreatment[];
}

// Data structure for persistence
export interface ClinicData {
  version?: number;
  dataVersion?: number;
  clinicName?: string; // Customizable title
  patients: Record<string, Patient>;
  appointments: Record<string, GlobalAppointment[]>;
  appointmentDeletionTombstones?: Record<string, string>; // appointment id -> deleted-at ISO timestamp
  catalog: TreatmentCategory[];
}

export interface BackupSettings {
  endpoint: string;
  token?: string;
}

export interface CloudSyncSettings {
  endpoint: string;
  key: string;
}

export interface CloudSyncResult {
  success: boolean;
  message: string;
}

export interface ReleaseSettings {
  endpoint: string;
  autoCheck: boolean;
}

export interface ReleaseCheckResult {
  success: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  publishedAt?: string;
  message: string;
}

export interface ImportPreviewMetric {
  label: string;
  current: number;
  incoming: number;
  added: number;
  overwritten: number;
  removed: number;
}

export interface ImportPreview {
  currentClinicName: string;
  incomingClinicName: string;
  dataVersion?: number;
  metrics: ImportPreviewMetric[];
  warnings: string[];
  samples: {
    addedPatients: string[];
    overwrittenPatients: string[];
    removedPatients: string[];
  };
}

export interface ImportPreviewResult {
  success: boolean;
  message: string;
  preview?: ImportPreview;
}

export interface BackupPayload {
  app: 'DentalClinicManager';
  generatedAt: string;
  clinicName: string;
  version?: number;
  data: ClinicData;
}

export type RagSourceType = 'patient' | 'manual' | 'file' | 'external';

export interface RagKnowledgeEntry {
  id: string;
  type: Exclude<RagSourceType, 'patient'>;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  externalSourceId?: string;
  externalSourceName?: string;
  externalId?: string;
  metadata?: Record<string, string | number | boolean>;
  // 外部源删除时保留审计记录，但不再参与检索。
  isDeleted?: boolean;
}

export interface RagChunk {
  id: string;
  sourceType: RagSourceType;
  sourceId: string;
  title: string;
  content: string;
  patientId?: string;
  patientName?: string;
  createdAt?: string;
  externalSourceName?: string;
  externalId?: string;
}

export interface RagSearchHit extends RagChunk {
  score: number;
  highlights: string[];
}

export interface RagIndexStats {
  patientCount: number;
  knowledgeEntryCount: number;
  chunkCount: number;
  updatedAt: string;
}

export type AiProvider = 'openai-compatible';
export type AiRedactionMode = 'off' | 'basic' | 'strict';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  sendPatientInfo: boolean;
  redactionMode: AiRedactionMode;
  maxContextChunks: number;
}

export interface AiAnswerCitation {
  index: number;
  chunkId: string;
  sourceType: RagSourceType;
  title: string;
  patientId?: string;
  patientName?: string;
  externalSourceName?: string;
  externalId?: string;
}

export interface AiAnswerResult {
  success: boolean;
  message: string;
  answer?: string;
  citations?: AiAnswerCitation[];
}

export type RagExternalSourceKind = 'http-json';

export interface RagExternalSourceConfig {
  id: string;
  name: string;
  kind: RagExternalSourceKind;
  endpoint: string;
  token?: string;
  enabled: boolean;
  cursor?: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface RagExternalSourceStatus {
  success: boolean;
  message: string;
}

export interface RagExternalDocument {
  externalId: string;
  title: string;
  content: string;
  updatedAt?: string;
  deleted?: boolean;
  patientMatch?: {
    patientId?: string;
    name?: string;
    phone?: string;
  };
  metadata?: Record<string, string | number | boolean>;
}

export interface RagExternalPullResult {
  success: boolean;
  message: string;
  documents: RagExternalDocument[];
  cursor?: string;
}

export interface RagExternalSourceAdapter {
  id: string;
  name: string;
  kind: RagExternalSourceKind;
  testConnection(config: RagExternalSourceConfig): Promise<RagExternalSourceStatus>;
  pull(config: RagExternalSourceConfig, cursor?: string): Promise<RagExternalPullResult>;
  mapDocument(raw: unknown): RagExternalDocument;
}
