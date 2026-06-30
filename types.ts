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
}

export interface Patient {
  id: string; // Hidden unique ID
  patientGroupId?: string; // 同号码患者组；同一电话可对应多个独立患者
  name: string;
  phone: string;
  gender: string;
  age: string;
  social?: string; // Legacy field preserved during migration/export, no longer shown in UI
  treatments: TreatmentRecord[];
  appointments: Appointment[];
}

export interface PatientListItem {
  id: string;
  name: string;
  phone: string;
  gender: string;
  age: string;
  lastUpdate: string;
  phoneCount: number;
}

export interface PatientListQuery {
  query?: string;
  offset: number;
  limit: number;
}

export interface PatientListPage {
  items: PatientListItem[];
  total: number;
  offset: number;
  limit: number;
}

export type AppointmentStatus = 'pending' | 'completed' | 'cancelled';

export interface GlobalAppointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  patientId: string;
  phone: string;
  name: string;
  status: AppointmentStatus;
}

// Data structure for persistence
export interface ClinicData {
  version?: number;
  dataVersion?: number;
  clinicName?: string; // Customizable title
  patients: Record<string, Patient>;
  appointments: Record<string, GlobalAppointment[]>;
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
