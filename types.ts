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

export interface TreatmentRecord {
  id: string;
  date: string;
  categoryId?: string;
  itemId?: string;
  item: string; // Name of the item
  price: number; // Charged price
  teeth: string; // 可为空；也可为具体牙位、ALL、UPPER、LOWER 等。
  note: string;
}

export interface Appointment {
  datetime: string; // Format: YYYY-MM-DD HH:mm
  created_at: string;
}

export interface Patient {
  id: string; // Hidden unique ID
  name: string;
  phone: string;
  gender: string;
  age: string;
  social?: string; // Legacy field preserved during migration/export, no longer shown in UI
  treatments: TreatmentRecord[];
  appointments: Appointment[];
}

export type AppointmentStatus = 'pending' | 'completed' | 'cancelled';

export interface GlobalAppointment {
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

export interface BackupPayload {
  app: 'DentalClinicManager';
  generatedAt: string;
  clinicName: string;
  version?: number;
  data: ClinicData;
}
