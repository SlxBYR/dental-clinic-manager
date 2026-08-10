import { ClinicData, Patient, GlobalAppointment, TreatmentCategory, TreatmentItem, AppointmentStatus, BackupSettings, BackupPayload, ReleaseSettings, ReleaseCheckResult, CloudSyncSettings, CloudSyncResult, TreatmentRecord, ImportPreview, ImportPreviewResult, PatientListItem, PatientListPage, PatientListQuery, PatientActivityType, PlannedTreatment, ScheduleSource, VisitType, ImportConflictResolution } from '../types';
import {
  STORAGE_KEY,
  BACKUP_SETTINGS_KEY,
  CLOUD_SYNC_SETTINGS_KEY,
  RELEASE_SETTINGS_KEY,
  DEFAULT_CATALOG,
  DATA_VERSION,
  APP_VERSION,
  DEFAULT_RELEASE_API_URL,
  IMPORT_SNAPSHOT_STORE_KEY,
  IMPORT_SNAPSHOT_BACKUP_STORE_KEY,
  IMPORT_SNAPSHOT_PRE_RESTORE_STORE_KEY,
  CLOUD_SYNC_SNAPSHOT_STORE_KEY,
  CLOUD_SYNC_SNAPSHOT_BACKUP_STORE_KEY,
  CLOUD_SYNC_SNAPSHOT_PRE_RESTORE_STORE_KEY
} from '../constants';
import { createAppointmentId, migrateClinicData, validateClinicData } from './dataMigrations';
import { ElectronSqliteStore } from './storage/electronSqliteStore';
import { LocalStorageStore } from './storage/localStorageStore';
import { CLINIC_DATA_STORE_KEY, KeyValueStore } from './storage/types';
import { formatLocalDateTime, getLocalDateKeyFromTimestamp } from '../utils/date';
import { getPatientPinyinTerms } from '../utils/patientSearch';
import { mergeConsecutiveSameDayNoteChanges } from '../utils/treatmentChangeLogs';
import { createImportFingerprint, isImportValueEqual, mergeClinicDataForImport } from './importMerge';

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizePhone = (phone: string) => phone.trim().replace(/\s/g, '');
const CLOUD_ENCRYPTION_ITERATIONS = 210000;
const SQLITE_RECOVERY_PENDING_KEY = 'dental_clinic_sqlite_recovery_pending_v1';

type EncryptedCloudPayload = {
  encrypted: true;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

type AppointmentInputOptions = {
  durationMinutes?: number;
  source?: ScheduleSource;
  visitType?: VisitType;
  status?: AppointmentStatus;
  checkedInAt?: string;
  plannedTreatments?: Array<Omit<PlannedTreatment, 'id'> & { id?: string }>;
};

const normalizeDuration = (value?: number) => Math.max(15, Math.min(480, Number(value) || 30));
const MAX_CONCURRENT_APPOINTMENTS = 3;

const normalizePlannedTreatments = (
  appointmentId: string,
  items: AppointmentInputOptions['plannedTreatments'] = []
): PlannedTreatment[] => items
  .filter(item => item.itemName?.trim())
  .map((item, index) => ({
    id: item.id || `plan_${appointmentId}_${index}_${Date.now().toString(36)}`,
    categoryId: item.categoryId,
    itemId: item.itemId,
    itemName: item.itemName.trim(),
    price: Number.isFinite(item.price) ? item.price : 0,
    teeth: item.teeth?.trim() || '',
    note: item.note?.trim() || ''
  }));

const hashPatientId = (name: string, phone: string) => {
  const source = `${normalizeName(name)}|${normalizePhone(phone)}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `p_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const getPatientGroupId = (phone: string) => {
  const cleanPhone = normalizePhone(phone);
  return cleanPhone ? `phone_${cleanPhone}` : undefined;
};

const normalizeVersion = (version: string) => version.trim().replace(/^v/i, '');

const compareVersions = (a: string, b: string) => {
  const left = normalizeVersion(a).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const deriveCloudCryptoKey = async (passphrase: string, salt: Uint8Array, iterations = CLOUD_ENCRYPTION_ITERATIONS) => {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptCloudPayload = async (payload: unknown, passphrase: string): Promise<EncryptedCloudPayload> => {
  if (!crypto?.subtle) throw new Error('当前环境不支持 Web Crypto，无法加密云端备份。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCloudCryptoKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    encrypted: true,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: CLOUD_ENCRYPTION_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
};

const isEncryptedCloudPayload = (payload: unknown): payload is EncryptedCloudPayload => (
  Boolean(payload)
  && typeof payload === 'object'
  && (payload as EncryptedCloudPayload).encrypted === true
  && (payload as EncryptedCloudPayload).algorithm === 'AES-GCM'
  && typeof (payload as EncryptedCloudPayload).salt === 'string'
  && typeof (payload as EncryptedCloudPayload).iv === 'string'
  && typeof (payload as EncryptedCloudPayload).ciphertext === 'string'
);

const decryptCloudPayload = async (payload: EncryptedCloudPayload, passphrase: string): Promise<unknown> => {
  if (!crypto?.subtle) throw new Error('当前环境不支持 Web Crypto，无法解密云端备份。');
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await deriveCloudCryptoKey(passphrase, salt, payload.iterations || CLOUD_ENCRYPTION_ITERATIONS);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
};

const extractClinicDataPayload = (payload: unknown): ClinicData | undefined => {
  const candidate = payload as { data?: ClinicData; payload?: { data?: ClinicData }; patients?: unknown; appointments?: unknown };
  if (candidate?.data?.patients && candidate.data.appointments) return candidate.data;
  if (candidate?.payload?.data?.patients && candidate.payload.data.appointments) return candidate.payload.data;
  if (candidate?.patients && candidate.appointments) return candidate as ClinicData;
  return undefined;
};

const TREATMENT_LOG_FIELDS: Array<keyof Pick<TreatmentRecord, 'categoryId' | 'itemId' | 'item' | 'price' | 'teeth' | 'note'>> = [
  'categoryId',
  'itemId',
  'item',
  'price',
  'teeth',
  'note'
];

const createTreatmentLogId = (recordId: string) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `tlog_${recordId}_${Date.now().toString(36)}_${suffix}`;
};

const ensureUniqueId = (baseId: string, patients: Record<string, Patient>) => {
  if (!patients[baseId]) return baseId;
  let index = 2;
  while (patients[`${baseId}_${index}`]) index += 1;
  return `${baseId}_${index}`;
};

const createEmptyData = (): ClinicData => ({
  version: DATA_VERSION,
  dataVersion: DATA_VERSION,
  patients: {},
  appointments: {},
  appointmentDeletionTombstones: {},
  catalog: DEFAULT_CATALOG,
  clinicName: 'DentalClinic'
});

// 所有外部 JSON 入口统一走迁移和校验，避免导入、恢复、云同步各自处理出差异。
const parseAndValidateClinicData = (rawJson: string): ClinicData => {
  const parsed = JSON.parse(rawJson);
  const migrated = migrateClinicData(parsed);
  const validation = validateClinicData(migrated);
  if (validation.valid === false) throw new Error(validation.message);
  return migrated;
};

type StoredImportSnapshot = {
  schemaVersion: 1;
  savedAt: string;
  data: ClinicData;
};

type IncrementalUpdateSource = 'file' | 'cloud';

const parseStoredImportSnapshot = (rawValue: string): StoredImportSnapshot => {
  const parsed = JSON.parse(rawValue);
  if (parsed?.schemaVersion !== 1 || typeof parsed?.savedAt !== 'string' || !parsed?.data) {
    throw new Error('更新快照格式不正确。');
  }
  return {
    schemaVersion: 1,
    savedAt: parsed.savedAt,
    data: parseAndValidateClinicData(JSON.stringify(parsed.data))
  };
};

const serializeStoredImportSnapshot = (snapshot: StoredImportSnapshot | null) => (
  snapshot ? JSON.stringify(snapshot) : ''
);

const flattenAppointments = (data: ClinicData) => Object.values(data.appointments).flat();

const countTreatments = (data: ClinicData) => Object.values(data.patients)
  .reduce((total, patient) => total + patient.treatments.length, 0);

const patientLabel = (patient?: Patient) => {
  if (!patient) return '';
  return `${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`;
};

const getPatientLastChangedAt = (patient: Patient) => {
  const timestamps = [
    patient.createdAt,
    ...(patient.activityLog || []).map(activity => activity.occurredAt),
    ...patient.treatments.flatMap(treatment => [
      treatment.createdAt,
      ...treatment.changeLogs.map(log => log.changedAt)
    ]),
    ...patient.appointments.flatMap(appointment => [appointment.created_at, appointment.checkedInAt])
  ];
  const latest = timestamps.reduce((max, value) => {
    if (!value) return max;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : undefined;
};

const getPatientLastUpdate = (patient: Patient) => {
  const lastChangedAt = getPatientLastChangedAt(patient);
  return lastChangedAt ? getLocalDateKeyFromTimestamp(lastChangedAt) : '0000-00-00';
};

const getPatientLastChangedTime = (patient: PatientListItem) => {
  if (!patient.lastChangedAt) return 0;
  const timestamp = new Date(patient.lastChangedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const comparePatientListItems = (a: PatientListItem, b: PatientListItem) => {
  if (a.isTodayVisit !== b.isTodayVisit) return a.isTodayVisit ? -1 : 1;
  if (a.isTodayVisit && b.isTodayVisit) {
    const visitSort = (b.lastVisitAt || '').localeCompare(a.lastVisitAt || '');
    if (visitSort) return visitSort;
  }
  const changedSort = getPatientLastChangedTime(b) - getPatientLastChangedTime(a);
  return changedSort || b.lastUpdate.localeCompare(a.lastUpdate) || a.name.localeCompare(b.name);
};

const isAttendedAppointment = (appointment: GlobalAppointment) => (
  Boolean(appointment.checkedInAt)
  && (appointment.status === 'arrived' || appointment.status === 'completed')
);

const getPatientVisitMetadata = (patient: Patient, appointments: GlobalAppointment[], today: string) => {
  const appointmentVisits = appointments
    .filter(appointment => appointment.patientId === patient.id && isAttendedAppointment(appointment))
    .map(appointment => ({
      occurredAt: appointment.checkedInAt || '',
      visitType: appointment.visitType
    }));
  const activityVisits = (patient.activityLog || [])
    .filter(activity => activity.type === 'initial_visit' || activity.type === 'follow_up_visit')
    .map(activity => ({
      occurredAt: activity.occurredAt,
      visitType: activity.type === 'initial_visit' ? 'initial' as const : 'follow_up' as const
    }));
  const visits = [...activityVisits, ...appointmentVisits]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const latest = visits[0];
  const todayVisit = visits.find(visit => getLocalDateKeyFromTimestamp(visit.occurredAt) === today);
  return {
    isTodayVisit: Boolean(todayVisit),
    lastVisitAt: latest?.occurredAt,
    todayVisitType: todayVisit?.visitType
  };
};

class ClinicService {
  private data: ClinicData = createEmptyData();
  private store: KeyValueStore = new LocalStorageStore();
  private localStore = new LocalStorageStore();
  private sqliteStore: ElectronSqliteStore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private lastImportSnapshot: StoredImportSnapshot | null = null;
  private lastCloudSyncSnapshot: StoredImportSnapshot | null = null;
  private storageStatus = {
    primary: 'localStorage',
    message: '正在初始化本地存储。'
  };

  // 初始化优先使用 Electron 暴露的 SQLite；失败时保留 localStorage 兜底，保证浏览器预览也能运行。
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.loadInitialData().then(() => this.loadUpdateSnapshots());
    return this.initPromise;
  }

  private async loadStoredSnapshot(storeKey: string, label: string): Promise<StoredImportSnapshot | null> {
    try {
      let stored = await this.store.getItem(storeKey);
      if (!stored && this.store.name !== this.localStore.name) {
        const fallbackSnapshot = await this.localStore.getItem(storeKey);
        if (fallbackSnapshot) {
          await this.store.setItem(storeKey, fallbackSnapshot);
          localStorage.removeItem(storeKey);
          stored = fallbackSnapshot;
        }
      }
      return stored ? parseStoredImportSnapshot(stored) : null;
    } catch (error) {
      console.error(`${label}快照无法读取，本次将按首次增量更新处理。`, error);
      return null;
    }
  }

  private async loadUpdateSnapshots() {
    const [fileSnapshot, cloudSnapshot] = await Promise.all([
      this.loadStoredSnapshot(IMPORT_SNAPSHOT_STORE_KEY, '上一份导入'),
      this.loadStoredSnapshot(CLOUD_SYNC_SNAPSHOT_STORE_KEY, '上一份云端同步')
    ]);
    this.lastImportSnapshot = fileSnapshot;
    this.lastCloudSyncSnapshot = cloudSnapshot;
  }

  private getUpdateSnapshot(source: IncrementalUpdateSource) {
    return source === 'cloud' ? this.lastCloudSyncSnapshot : this.lastImportSnapshot;
  }

  private getUpdateSnapshotStoreKey(source: IncrementalUpdateSource) {
    return source === 'cloud' ? CLOUD_SYNC_SNAPSHOT_STORE_KEY : IMPORT_SNAPSHOT_STORE_KEY;
  }

  private async persistUpdateSnapshot(source: IncrementalUpdateSource, snapshot: StoredImportSnapshot | null) {
    await this.store.setItem(this.getUpdateSnapshotStoreKey(source), serializeStoredImportSnapshot(snapshot));
    if (source === 'cloud') this.lastCloudSyncSnapshot = snapshot;
    else this.lastImportSnapshot = snapshot;
  }

  private async loadInitialData() {
    const sqliteStore = new ElectronSqliteStore();
    if (sqliteStore.isAvailable()) {
      const status = await sqliteStore.getStatus();
      if (status.available) {
        try {
          if (localStorage.getItem(SQLITE_RECOVERY_PENDING_KEY) === '1') {
            const recoveryValue = await this.localStore.getItem(CLINIC_DATA_STORE_KEY);
            if (recoveryValue) {
              this.data = parseAndValidateClinicData(recoveryValue);
              this.store = sqliteStore;
              this.sqliteStore = sqliteStore;
              this.storageStatus = {
                primary: 'sqlite',
                message: '已将 SQLite 写入失败期间的最新备用数据恢复到 SQLite。'
              };
              await this.saveDataAsync();
              this.initialized = true;
              return;
            }
            localStorage.removeItem(SQLITE_RECOVERY_PENDING_KEY);
          }

          const sqliteValue = await sqliteStore.getItem(CLINIC_DATA_STORE_KEY);
          if (sqliteValue) {
            this.data = parseAndValidateClinicData(sqliteValue);
            this.store = sqliteStore;
            this.sqliteStore = sqliteStore;
            this.storageStatus = {
              primary: 'sqlite',
              message: status.dbPath ? `SQLite 数据库：${status.dbPath}` : 'SQLite 数据库已启用。'
            };
            await this.saveDataAsync();
            this.initialized = true;
            return;
          }

          const legacyValue = await this.localStore.getItem(CLINIC_DATA_STORE_KEY);
          if (legacyValue) {
            this.data = parseAndValidateClinicData(legacyValue);
            this.store = sqliteStore;
            this.sqliteStore = sqliteStore;
            this.storageStatus = {
              primary: 'sqlite',
              message: '已从旧 localStorage 迁移到加密 SQLite，旧明文主数据已清除。'
            };
            await this.saveDataAsync();
            this.initialized = true;
            return;
          }

          this.data = createEmptyData();
          this.store = sqliteStore;
          this.sqliteStore = sqliteStore;
          this.storageStatus = {
            primary: 'sqlite',
            message: status.dbPath ? `SQLite 数据库：${status.dbPath}` : 'SQLite 数据库已启用。'
          };
          await this.saveDataAsync();
          this.initialized = true;
          return;
        } catch (error) {
          console.error('SQLite 数据读取失败，回退 localStorage。', error);
          this.storageStatus = {
            primary: 'localStorage',
            message: `SQLite 数据读取失败，已回退 localStorage：${error instanceof Error ? error.message : String(error)}`
          };
        }
      } else if (status.error) {
        this.storageStatus = {
          primary: 'localStorage',
          message: `SQLite 初始化失败，已回退 localStorage：${status.error}`
        };
      }
    }

    await this.loadFromLocalStorageFallback();
    this.initialized = true;
  }

  private async loadFromLocalStorageFallback() {
    const stored = await this.localStore.getItem(CLINIC_DATA_STORE_KEY);
    if (stored) {
      try {
        this.data = parseAndValidateClinicData(stored);
        this.store = this.localStore;
        await this.saveDataAsync();
        return;
      } catch (error) {
        console.error('localStorage 数据读取失败，使用空数据。', error);
        this.storageStatus = {
          primary: 'localStorage',
          message: `localStorage 数据读取失败，已使用空数据：${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    this.data = createEmptyData();
    this.store = this.localStore;
    await this.saveDataAsync();
  }

  private ensureInitialized() {
    if (!this.initialized) {
      console.warn('clinicService 尚未完成初始化，当前使用内存中的默认数据。');
    }
  }

  async saveDataAsync() {
    // 保存时始终刷新数据版本，避免旧导入数据继续带着历史 version 写回。
    this.data.version = DATA_VERSION;
    this.data.dataVersion = DATA_VERSION;
    const serialized = JSON.stringify(this.data);
    const operation = this.saveQueue.then(async () => {
      if (this.store.name === this.localStore.name) {
        await this.localStore.setItem(CLINIC_DATA_STORE_KEY, serialized);
        return;
      }
      try {
        await this.store.setItem(CLINIC_DATA_STORE_KEY, serialized);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SQLITE_RECOVERY_PENDING_KEY);
      } catch (error) {
        this.store = this.localStore;
        this.sqliteStore = null;
        this.storageStatus = {
          primary: 'localStorage',
          message: `SQLite 写入失败，已回退 localStorage：${error instanceof Error ? error.message : String(error)}`
        };
        // 回退不能只切换指针；必须把本次最新快照真正写入备用存储。
        await this.localStore.setItem(CLINIC_DATA_STORE_KEY, serialized);
        localStorage.setItem(SQLITE_RECOVERY_PENDING_KEY, '1');
      }
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation;
  }

  saveData() {
    this.saveDataAsync().catch(error => {
      console.error('保存数据失败。', error);
    });
  }

  getStorageStatus() {
    return this.storageStatus;
  }

  // --- 设置 ---
  getClinicName(): string {
    return this.data.clinicName || 'DentalClinic';
  }

  updateClinicName(name: string) {
    this.data.clinicName = name;
    this.saveData();
  }

  // --- 导入 / 导出 ---

  exportData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  createBackupPayload(): BackupPayload {
    return {
      app: 'DentalClinicManager',
      generatedAt: new Date().toISOString(),
      clinicName: this.getClinicName(),
      version: this.data.version,
      data: this.data
    };
  }

  getBackupSettings(): BackupSettings {
    const stored = localStorage.getItem(BACKUP_SETTINGS_KEY);
    if (!stored) return { endpoint: '', token: '' };
    try {
      const parsed = JSON.parse(stored);
      return {
        endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : '',
        token: typeof parsed.token === 'string' ? parsed.token : ''
      };
    } catch (e) {
      console.error('Failed to parse backup settings', e);
      return { endpoint: '', token: '' };
    }
  }

  updateBackupSettings(settings: BackupSettings) {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify({
      endpoint: settings.endpoint.trim(),
      token: settings.token?.trim() || ''
    }));
  }

  getCloudSyncSettings(): CloudSyncSettings {
    const stored = localStorage.getItem(CLOUD_SYNC_SETTINGS_KEY);
    if (!stored) return { endpoint: '', key: '' };
    try {
      const parsed = JSON.parse(stored);
      return {
        endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : '',
        key: typeof parsed.key === 'string' ? parsed.key : ''
      };
    } catch (e) {
      console.error('Failed to parse cloud sync settings', e);
      return { endpoint: '', key: '' };
    }
  }

  updateCloudSyncSettings(settings: CloudSyncSettings) {
    localStorage.setItem(CLOUD_SYNC_SETTINGS_KEY, JSON.stringify({
      endpoint: settings.endpoint.trim(),
      key: settings.key.trim()
    }));
  }

  // 云端同步通过 Bearer Key 鉴权；请求体只发送同步动作和加密后的业务载荷。
  private validateCloudSyncSettings(settings: CloudSyncSettings): { endpoint?: URL; key?: string; error?: string } {
    const rawEndpoint = settings.endpoint.trim();
    const key = settings.key.trim();
    if (!rawEndpoint || !key) return { error: '请填写同步接口和同步 Key。' };

    try {
      const endpoint = new URL(rawEndpoint);
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Invalid protocol');
      return { endpoint, key };
    } catch {
      return { error: '同步接口地址格式不正确。' };
    }
  }

  async pullCloudData(settings: CloudSyncSettings): Promise<CloudSyncResult> {
    const validation = this.validateCloudSyncSettings(settings);
    if (validation.error || !validation.endpoint || !validation.key) {
      return { success: false, message: validation.error || '同步配置不可用。' };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(validation.endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validation.key}`
        },
        body: JSON.stringify({
          app: 'DentalClinicManager',
          action: 'pull'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      const payload = await response.json();
      const remotePayload = payload?.data || payload?.payload || payload;
      const decryptedPayload = isEncryptedCloudPayload(remotePayload)
        ? await decryptCloudPayload(remotePayload, validation.key)
        : remotePayload;
      const remoteData = extractClinicDataPayload(decryptedPayload);
      if (!remoteData?.patients || !remoteData?.appointments) {
        return { success: false, message: '云端数据格式不正确。' };
      }

      // 只下载并生成预览；真正写入必须复用文件导入的三方增量合并与冲突确认。
      const importContent = JSON.stringify(remoteData);
      const previewResult = this.createImportPreview(importContent, 'local', 'cloud');
      if (!previewResult.success || !previewResult.preview) {
        return { success: false, message: previewResult.message };
      }
      return {
        success: true,
        message: '云端数据已下载，请在增量同步预览中确认冲突处理方式。',
        importContent,
        preview: previewResult.preview
      };
    } catch (e) {
      const message = e instanceof DOMException && e.name === 'AbortError'
        ? '云端同步超时，请稍后再试。'
        : '云端同步失败，请检查接口、Key、CORS 和网络连接。';
      return { success: false, message };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async pushCloudData(settings: CloudSyncSettings): Promise<CloudSyncResult> {
    const validation = this.validateCloudSyncSettings(settings);
    if (validation.error || !validation.endpoint || !validation.key) {
      return { success: false, message: validation.error || '同步配置不可用。' };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const encryptedPayload = await encryptCloudPayload(this.createBackupPayload(), validation.key);
      const response = await fetch(validation.endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validation.key}`
        },
        body: JSON.stringify({
          app: 'DentalClinicManager',
          action: 'push',
          payload: encryptedPayload
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      const nextSnapshot: StoredImportSnapshot = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        // 上传成功后，本机与云端共同基线就是本次上传的完整本机数据。
        data: parseAndValidateClinicData(JSON.stringify(this.data))
      };
      try {
        await this.persistUpdateSnapshot('cloud', nextSnapshot);
      } catch (snapshotError) {
        return {
          success: false,
          message: `云端数据已经上传，但本机同步快照保存失败；请再次上传以重建快照：${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`
        };
      }

      return { success: true, message: '本机数据已加密上传到云端，并保存为下一次增量同步基线。' };
    } catch (e) {
      const message = e instanceof DOMException && e.name === 'AbortError'
        ? '云端上传超时，请稍后再试。'
        : '云端上传失败，请检查接口、Key、CORS 和网络连接。';
      return { success: false, message };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  getReleaseSettings(): ReleaseSettings {
    const stored = localStorage.getItem(RELEASE_SETTINGS_KEY);
    if (!stored) return { endpoint: DEFAULT_RELEASE_API_URL, autoCheck: true };
    try {
      const parsed = JSON.parse(stored);
      return {
        endpoint: typeof parsed.endpoint === 'string' && parsed.endpoint.trim() ? parsed.endpoint : DEFAULT_RELEASE_API_URL,
        autoCheck: typeof parsed.autoCheck === 'boolean' ? parsed.autoCheck : true
      };
    } catch (e) {
      console.error('Failed to parse release settings', e);
      return { endpoint: DEFAULT_RELEASE_API_URL, autoCheck: true };
    }
  }

  updateReleaseSettings(settings: ReleaseSettings) {
    localStorage.setItem(RELEASE_SETTINGS_KEY, JSON.stringify({
      endpoint: settings.endpoint.trim() || DEFAULT_RELEASE_API_URL,
      autoCheck: settings.autoCheck
    }));
  }

  async checkLatestRelease(settings: ReleaseSettings): Promise<ReleaseCheckResult> {
    const endpoint = settings.endpoint.trim();
    if (!endpoint) {
      return {
        success: false,
        updateAvailable: false,
        currentVersion: APP_VERSION,
        message: '请先填写 GitHub Release 接口地址。'
      };
    }

    let url: URL;
    try {
      url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    } catch {
      return {
        success: false,
        updateAvailable: false,
        currentVersion: APP_VERSION,
        message: 'Release 接口地址格式不正确。'
      };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          success: false,
          updateAvailable: false,
          currentVersion: APP_VERSION,
          message: `GitHub 返回 ${response.status} ${response.statusText || ''}`.trim()
        };
      }

      const release = await response.json();
      const latestVersion = normalizeVersion(release?.tag_name || release?.name || '');
      if (!latestVersion) {
        return {
          success: false,
          updateAvailable: false,
          currentVersion: APP_VERSION,
          message: '未能从 Release 响应中读取版本号。'
        };
      }

      const updateAvailable = compareVersions(latestVersion, APP_VERSION) > 0;
      return {
        success: true,
        updateAvailable,
        currentVersion: APP_VERSION,
        latestVersion,
        releaseName: release?.name || release?.tag_name,
        releaseUrl: release?.html_url,
        publishedAt: release?.published_at,
        message: updateAvailable ? `发现新版本 v${latestVersion}` : '当前已是最新版本。'
      };
    } catch (e) {
      const message = e instanceof DOMException && e.name === 'AbortError'
        ? '检查超时，请稍后再试。'
        : '检查失败，请确认网络、接口地址和 GitHub 访问。';
      return {
        success: false,
        updateAvailable: false,
        currentVersion: APP_VERSION,
        message
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async sendBackupToServer(settings: BackupSettings): Promise<{ success: boolean; message: string }> {
    const endpoint = settings.endpoint.trim();
    if (!endpoint) {
      return { success: false, message: '请先填写备份服务器接口地址。' };
    }

    let url: URL;
    try {
      url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    } catch {
      return { success: false, message: '接口地址格式不正确，应以 http:// 或 https:// 开头。' };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      const token = settings.token?.trim();
      if (!token) return { success: false, message: '加密备份需要填写 Token；该 Token 会用于派生加密密钥，避免服务器明文保存患者信息。' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const encryptedPayload = await encryptCloudPayload(this.createBackupPayload(), token);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app: 'DentalClinicManager',
          generatedAt: new Date().toISOString(),
          encryptedPayload
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      return { success: true, message: '加密备份已发送到服务器。' };
    } catch (e) {
      const message = e instanceof DOMException && e.name === 'AbortError'
        ? '发送超时，请检查服务器地址或网络。'
        : '发送失败，请检查接口地址、CORS 和网络连接。';
      return { success: false, message };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  hasPreImportBackup(): boolean {
    return Boolean(localStorage.getItem(`${STORAGE_KEY}_pre_import_backup`));
  }

  async restorePreImportBackup(): Promise<{ success: boolean; message: string }> {
    const backup = localStorage.getItem(`${STORAGE_KEY}_pre_import_backup`);
    if (!backup) return { success: false, message: '暂无导入前备份可恢复。' };

    const previousData = this.data;
    const previousImportSnapshot = this.lastImportSnapshot;
    const previousCloudSnapshot = this.lastCloudSyncSnapshot;
    try {
      const migrated = parseAndValidateClinicData(backup);
      const [importSnapshotBackupValue, cloudSnapshotBackupValue] = await Promise.all([
        this.store.getItem(IMPORT_SNAPSHOT_BACKUP_STORE_KEY),
        this.store.getItem(CLOUD_SYNC_SNAPSHOT_BACKUP_STORE_KEY)
      ]);
      const restoredImportSnapshot = importSnapshotBackupValue ? parseStoredImportSnapshot(importSnapshotBackupValue) : null;
      const restoredCloudSnapshot = cloudSnapshotBackupValue ? parseStoredImportSnapshot(cloudSnapshotBackupValue) : null;
      localStorage.setItem(`${STORAGE_KEY}_pre_restore_backup`, this.exportData());
      await Promise.all([
        this.store.setItem(IMPORT_SNAPSHOT_PRE_RESTORE_STORE_KEY, serializeStoredImportSnapshot(previousImportSnapshot)),
        this.store.setItem(CLOUD_SYNC_SNAPSHOT_PRE_RESTORE_STORE_KEY, serializeStoredImportSnapshot(previousCloudSnapshot))
      ]);
      this.data = migrated;
      await this.saveDataAsync();
      await this.persistUpdateSnapshot('file', restoredImportSnapshot);
      await this.persistUpdateSnapshot('cloud', restoredCloudSnapshot);
      return { success: true, message: '已恢复增量更新前数据，以及文件导入和云端同步快照。恢复前数据已保存在本机恢复前备份中。' };
    } catch (error) {
      this.data = previousData;
      try {
        await this.saveDataAsync();
        await this.persistUpdateSnapshot('file', previousImportSnapshot);
        await this.persistUpdateSnapshot('cloud', previousCloudSnapshot);
      } catch (rollbackError) {
        console.error('恢复失败后的数据回滚未完整保存。', rollbackError);
      }
      return { success: false, message: error instanceof Error ? `恢复失败：${error.message}` : '恢复失败，备份数据无法解析。' };
    }
  }

  async importData(
    jsonString: string,
    conflictResolution: ImportConflictResolution = 'local',
    expectedLocalFingerprint?: string,
    source: IncrementalUpdateSource = 'file'
  ): Promise<{ success: boolean; message: string }> {
    const previousData = this.data;
    const previousImportSnapshot = this.lastImportSnapshot;
    const previousCloudSnapshot = this.lastCloudSyncSnapshot;
    const previousSourceSnapshot = this.getUpdateSnapshot(source);
    let didMutateData = false;
    try {
      if (expectedLocalFingerprint && createImportFingerprint(this.data) !== expectedLocalFingerprint) {
        return { success: false, message: '预览后本机数据发生了变化，请重新获取数据并生成最新预览。' };
      }

      const incoming = parseAndValidateClinicData(jsonString);
      const mergeResult = mergeClinicDataForImport(
        previousSourceSnapshot?.data || null,
        this.data,
        incoming,
        conflictResolution
      );
      const merged = migrateClinicData(mergeResult.data);
      const validation = validateClinicData(merged);
      if (validation.valid === false) throw new Error(`增量合并结果校验失败：${validation.message}`);

      localStorage.setItem(`${STORAGE_KEY}_pre_import_backup`, this.exportData());
      await Promise.all([
        this.store.setItem(IMPORT_SNAPSHOT_BACKUP_STORE_KEY, serializeStoredImportSnapshot(previousImportSnapshot)),
        this.store.setItem(CLOUD_SYNC_SNAPSHOT_BACKUP_STORE_KEY, serializeStoredImportSnapshot(previousCloudSnapshot))
      ]);

      this.data = merged;
      didMutateData = true;
      await this.saveDataAsync();
      const nextSnapshot: StoredImportSnapshot = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        // 三方合并的共同基线必须是“上一次收到的导入文件”，不能是合并结果；
        // 否则本机独有记录会在下次导入时被误认为来自导入源。
        data: incoming
      };
      try {
        await this.persistUpdateSnapshot(source, nextSnapshot);
      } catch (snapshotError) {
        this.data = previousData;
        await this.saveDataAsync();
        await this.persistUpdateSnapshot('file', previousImportSnapshot);
        await this.persistUpdateSnapshot('cloud', previousCloudSnapshot);
        throw new Error(`更新快照保存失败，已恢复导入前数据：${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`);
      }

      const totals = mergeResult.metrics.reduce((summary, metric) => ({
        added: summary.added + metric.added,
        updated: summary.updated + metric.updated,
        removed: summary.removed + metric.removed
      }), { added: 0, updated: 0, removed: 0 });
      const conflictMessage = mergeResult.conflicts.length > 0
        ? `，${mergeResult.conflicts.length} 项冲突已${conflictResolution === 'incoming' ? `采用${source === 'cloud' ? '云端' : '导入文件'}内容` : '保留本机内容'}`
        : '';
      const actionLabel = source === 'cloud' ? '云端增量同步' : '增量导入';
      return {
        success: true,
        message: `${actionLabel}成功：新增 ${totals.added} 项、更新 ${totals.updated} 项、删除 ${totals.removed} 项${conflictMessage}。更新前数据及上一份快照均已备份。`
      };
    } catch (e) {
      console.error("Import failed", e);
      if (didMutateData && this.data !== previousData) {
        this.data = previousData;
        try {
          await this.saveDataAsync();
          await this.persistUpdateSnapshot('file', previousImportSnapshot);
          await this.persistUpdateSnapshot('cloud', previousCloudSnapshot);
        } catch (rollbackError) {
          console.error('增量更新失败后的回滚未完整保存。', rollbackError);
        }
      }
      const actionLabel = source === 'cloud' ? '云端增量同步' : '增量导入';
      return { success: false, message: e instanceof Error ? `${actionLabel}失败：${e.message}` : `${actionLabel}失败，数据无法解析。` };
    }
  }

  createImportPreview(
    jsonString: string,
    conflictResolution: ImportConflictResolution = 'local',
    source: IncrementalUpdateSource = 'file'
  ): ImportPreviewResult {
    try {
      const incoming = parseAndValidateClinicData(jsonString);
      const sourceSnapshot = this.getUpdateSnapshot(source);
      const currentPatients = Object.values(this.data.patients);
      const incomingPatients = Object.values(incoming.patients);
      const incomingAppointments = flattenAppointments(incoming);
      const mergeResult = mergeClinicDataForImport(
        sourceSnapshot?.data || null,
        this.data,
        incoming,
        conflictResolution
      );

      const currentPatientMap = new Map(currentPatients.map(patient => [patient.id, patient]));
      const incomingPatientMap = new Map(incomingPatients.map(patient => [patient.id, patient]));
      const addedPatients: string[] = [];
      const updatedPatients: string[] = [];
      const removedPatients: string[] = [];

      incomingPatientMap.forEach((patient, id) => {
        const current = currentPatientMap.get(id);
        if (!current) {
          addedPatients.push(patientLabel(patient));
          return;
        }
        if (!isImportValueEqual(current, patient)) updatedPatients.push(patientLabel(patient));
      });

      const explicitlyDeletedAppointmentIds = new Set(Object.keys(incoming.appointmentDeletionTombstones || {}));
      flattenAppointments(this.data).forEach(appointment => {
        if (explicitlyDeletedAppointmentIds.has(appointment.id)) {
          removedPatients.push(`${appointment.name} · ${appointment.date} ${appointment.time}`);
        }
      });

      const warnings: string[] = [
        sourceSnapshot
          ? `冲突判断基于 ${formatLocalDateTime(new Date(sourceSnapshot.savedAt))} 保存的上一份${source === 'cloud' ? '云端同步' : '文件导入'}快照。`
          : `尚无上一份${source === 'cloud' ? '云端同步' : '文件导入'}快照：本次将安全并集数据，相同 ID 的不同内容会列为冲突，来源中缺失的普通记录不会删除本机数据。`,
        `本机独有记录会保留；只有${source === 'cloud' ? '云端数据' : '导入文件'}中带有明确删除标记的预约才会执行删除。`,
        '系统会先保存更新前数据及两类旧快照，可在设置页恢复最近一次增量更新前状态。'
      ];
      if ((this.data.clinicName || 'DentalClinic') !== (incoming.clinicName || 'DentalClinic')) {
        warnings.push(`诊所名称不同；若它构成冲突，将按所选冲突处理方式决定。`);
      }
      if ((incoming.dataVersion || incoming.version || 0) < DATA_VERSION) {
        warnings.push(`${source === 'cloud' ? '云端' : '导入文件'}数据版本较旧，已预览迁移到当前数据版本 ${DATA_VERSION} 后的结果。`);
      }

      const preview: ImportPreview = {
        currentClinicName: this.data.clinicName || 'DentalClinic',
        incomingClinicName: incoming.clinicName || 'DentalClinic',
        dataVersion: incoming.dataVersion || incoming.version,
        previousSnapshotAt: sourceSnapshot?.savedAt,
        localFingerprint: createImportFingerprint(this.data),
        conflictCount: mergeResult.conflicts.length,
        conflicts: mergeResult.conflicts,
        metrics: mergeResult.metrics,
        warnings,
        samples: {
          addedPatients: addedPatients.slice(0, 5),
          updatedPatients: updatedPatients.slice(0, 5),
          removedPatients: removedPatients.slice(0, 5)
        }
      };

      return {
        success: true,
        message: `${source === 'cloud' ? '云端增量同步' : '增量导入'}预览已生成：来源包含 ${incomingPatients.length} 位患者、${incomingAppointments.length} 条预约、${countTreatments(incoming)} 条处置记录；发现 ${mergeResult.conflicts.length} 项冲突。`,
        preview
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? `预览失败：${e.message}` : '预览失败，无法解析 JSON 文件。' };
    }
  }

  // --- 处置目录管理 ---

  getCatalog(): TreatmentCategory[] {
    return this.data.catalog;
  }

  updateCatalog(newCatalog: TreatmentCategory[]) {
    this.data.catalog = newCatalog;
    this.saveData();
  }

  // --- 患者管理 ---

  getAllPatients(): Patient[] {
    return Object.values(this.data.patients);
  }

  private getPatientListPageFromMemory(query: PatientListQuery): PatientListPage {
    const offset = Math.max(0, Number(query.offset) || 0);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 30));
    const q = (query.query || '').trim().toLowerCase();
    const today = query.today || formatDateKey(new Date());
    const recentStartDate = new Date(`${today}T00:00:00`);
    recentStartDate.setDate(recentStartDate.getDate() - 6);
    const recentStart = query.recentStart || formatDateKey(recentStartDate);
    const scope = query.scope || 'all';
    const appointments = flattenAppointments(this.data);
    const phoneCounts = Object.values(this.data.patients).reduce<Record<string, number>>((counts, patient) => {
      if (patient.phone) counts[patient.phone] = (counts[patient.phone] || 0) + 1;
      return counts;
    }, {});

    const items = Object.values(this.data.patients)
      .filter(patient => {
        if (!q) return true;
        const searchText = [
          patient.name,
          patient.phone,
          patient.gender,
          patient.age,
          getPatientPinyinTerms(patient.name)
        ].join(' ').toLowerCase();
        return searchText.includes(q);
      })
      .map<PatientListItem>(patient => {
        const visit = getPatientVisitMetadata(patient, appointments, today);
        const lastChangedAt = getPatientLastChangedAt(patient);
        return {
          id: patient.id,
          createdAt: patient.createdAt,
          lastChangedAt,
          name: patient.name,
          phone: patient.phone,
          gender: patient.gender,
          age: patient.age,
          lastUpdate: getPatientLastUpdate(patient),
          phoneCount: patient.phone ? phoneCounts[patient.phone] || 0 : 0,
          ...visit
        };
      })
      .filter(patient => {
        if (scope === 'today') return patient.isTodayVisit;
        if (scope === 'recent') {
          const changedDate = getLocalDateKeyFromTimestamp(patient.lastChangedAt);
          return changedDate >= recentStart && changedDate <= today;
        }
        return true;
      })
      .sort((a, b) => scope === 'today'
        ? (b.lastVisitAt || '').localeCompare(a.lastVisitAt || '') || a.name.localeCompare(b.name)
        : comparePatientListItems(a, b));

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      offset,
      limit
    };
  }

  async getPatientListPage(query: PatientListQuery): Promise<PatientListPage> {
    this.ensureInitialized();
    if (this.sqliteStore && this.storageStatus.primary === 'sqlite') {
      try {
        return await this.sqliteStore.listPatients(query);
      } catch (error) {
        console.error('SQLite 患者分页查询失败，回退内存过滤。', error);
      }
    }
    return this.getPatientListPageFromMemory(query);
  }

  getPatient(patientId: string): Patient | undefined {
    return this.data.patients[patientId];
  }

  findPatientByPhone(phone: string): Patient | undefined {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return undefined;
    return Object.values(this.data.patients).find(patient => patient.phone === cleanPhone);
  }

  private recordPatientActivity(
    patientId: string,
    type: PatientActivityType,
    label: string,
    occurredAt = new Date().toISOString()
  ) {
    const patient = this.data.patients[patientId];
    if (!patient) return;
    patient.activityLog ||= [];
    patient.activityLog.unshift({
      id: `activity_${patientId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      occurredAt,
      label
    });
  }

  addPatient(patient: Omit<Patient, 'id'>): { success: boolean; patientId: string; merged: boolean } {
    const cleanName = patient.name.trim();
    const cleanPhone = normalizePhone(patient.phone);

    const id = ensureUniqueId(hashPatientId(cleanName, cleanPhone), this.data.patients);
    this.data.patients[id] = {
      ...patient,
      id,
      createdAt: patient.createdAt || new Date().toISOString(),
      patientGroupId: patient.patientGroupId || getPatientGroupId(cleanPhone) || `patient_${id}`,
      name: cleanName,
      phone: cleanPhone,
      treatments: patient.treatments || [],
      appointments: patient.appointments || [],
      activityLog: patient.activityLog || []
    };
    this.recordPatientActivity(id, 'created', '新增患者', this.data.patients[id].createdAt);
    this.saveData();
    return { success: true, patientId: id, merged: false };
  }

  addPatientAndCheckIn(patient: Omit<Patient, 'id'>): { success: boolean; patientId: string; merged: boolean; message: string } {
    const added = this.addPatient(patient);
    const checkedIn = this.checkInPatient(added.patientId, 'initial');
    if (!checkedIn.success) {
      this.deletePatient(added.patientId);
      return { ...added, success: false, message: checkedIn.message };
    }
    return { ...added, message: checkedIn.message };
  }

  updatePatient(patientId: string, updates: Partial<Patient>) {
    if (!this.data.patients[patientId]) return;
    const cleanUpdates = {
      ...updates,
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.phone !== undefined ? {
        phone: normalizePhone(updates.phone),
        patientGroupId: getPatientGroupId(updates.phone) || `patient_${patientId}`
      } : {})
    };
    this.data.patients[patientId] = {
      ...this.data.patients[patientId],
      ...cleanUpdates,
      id: patientId
    };
    this.syncPatientSnapshots(patientId);
    this.recordPatientActivity(patientId, 'profile_updated', '修改患者资料');
    this.saveData();
  }

  deletePatient(patientId: string) {
    if (!this.data.patients[patientId]) return;
    delete this.data.patients[patientId];
    Object.keys(this.data.appointments).forEach(dateKey => {
      // 预约以 patientId 关联；同号码患者可能是不同家属，不能按 phone 删除。
      this.data.appointments[dateKey] = this.data.appointments[dateKey].filter(appt => appt.patientId !== patientId);
      if (this.data.appointments[dateKey].length === 0) delete this.data.appointments[dateKey];
    });
    this.saveData();
  }

  private syncPatientSnapshots(patientId: string) {
    const patient = this.data.patients[patientId];
    if (!patient) return;
    Object.values(this.data.appointments).forEach(appts => {
      appts.forEach(appt => {
        if (appt.patientId === patientId) {
          appt.name = patient.name;
          appt.phone = patient.phone;
        }
      });
    });
  }

  // --- 处置记录 ---

  addTreatment(patientId: string, item: TreatmentItem, price: number, teeth: string, note: string, categoryId?: string): boolean {
    const patient = this.data.patients[patientId];
    if (!patient) return false;

    const record: TreatmentRecord = {
      id: new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14),
      date: formatDateKey(new Date()),
      createdAt: new Date().toISOString(),
      categoryId,
      itemId: item.id,
      item: item.name,
      price: price,
      teeth,
      note,
      changeLogs: []
    };

    patient.treatments.push(record);
    this.recordPatientActivity(patientId, 'treatment_created', `新增处置：${record.item}`, record.createdAt);
    this.saveData();
    return true;
  }

  updateTreatment(patientId: string, recordId: string, updates: Partial<TreatmentRecord>): boolean {
    const patient = this.data.patients[patientId];
    if (patient) {
      const index = patient.treatments.findIndex(t => t.id === recordId);
      if (index !== -1) {
        const current = patient.treatments[index];
        const before: Record<string, string | number | undefined> = {};
        const after: Record<string, string | number | undefined> = {};
        const changedFields: string[] = [];

        // 修改日志只记录真正变化的字段，避免保存按钮产生空审计记录。
        TREATMENT_LOG_FIELDS.forEach(field => {
          if (!(field in updates)) return;
          const oldValue = current[field] as string | number | undefined;
          const newValue = updates[field] as string | number | undefined;
          if (!Object.is(oldValue, newValue)) {
            before[field] = oldValue;
            after[field] = newValue;
            changedFields.push(field);
          }
        });

        if (changedFields.length === 0) return true;

        const changeLogs = mergeConsecutiveSameDayNoteChanges([
          ...(Array.isArray(current.changeLogs) ? current.changeLogs : []),
          {
            id: createTreatmentLogId(recordId),
            changedAt: new Date().toISOString(),
            changedFields,
            before,
            after
          }
        ]);

        patient.treatments[index] = {
          ...current,
          ...updates,
          changeLogs
        };
        this.recordPatientActivity(patientId, 'treatment_updated', `修改处置：${patient.treatments[index].item}`);
        this.saveData();
        return true;
      }
    }
    return false;
  }

  deleteTreatment(patientId: string, recordId: string): boolean {
    const patient = this.data.patients[patientId];
    if (patient) {
      const deleted = patient.treatments.find(t => t.id === recordId);
      const initialLength = patient.treatments.length;
      patient.treatments = patient.treatments.filter(t => t.id !== recordId);
      if (patient.treatments.length !== initialLength) {
        this.recordPatientActivity(patientId, 'treatment_deleted', `删除处置：${deleted?.item || '未命名处置'}`);
        this.saveData();
        return true;
      }
    }
    return false;
  }

  // --- 预约管理 ---

  private findAppointmentById(appointmentId: string): { dateKey: string; appointment: GlobalAppointment } | undefined {
    for (const [dateKey, appts] of Object.entries(this.data.appointments)) {
      const appointment = appts.find(appt => appt.id === appointmentId);
      if (appointment) return { dateKey, appointment };
    }
    return undefined;
  }

  private findAppointmentCapacityConflict(date: string, time: string, durationMinutes = 30, excludeId?: string): GlobalAppointment[] {
    const start = timeToMinutes(time);
    const end = start + normalizeDuration(durationMinutes);
    const activeAppointments = (this.data.appointments[date] || []).filter(appt => (
      appt.id !== excludeId
      && appt.status !== 'cancelled'
      && start < timeToMinutes(appt.time) + normalizeDuration(appt.durationMinutes)
      && end > timeToMinutes(appt.time)
    ));
    const checkpoints = [
      start,
      ...activeAppointments.map(appt => Math.max(start, timeToMinutes(appt.time)))
    ];
    for (const checkpoint of checkpoints) {
      if (checkpoint >= end) continue;
      const overlapping = activeAppointments.filter(appt => {
        const appointmentStart = timeToMinutes(appt.time);
        const appointmentEnd = appointmentStart + normalizeDuration(appt.durationMinutes);
        return appointmentStart <= checkpoint && appointmentEnd > checkpoint;
      });
      if (overlapping.length >= MAX_CONCURRENT_APPOINTMENTS) return overlapping;
    }
    return [];
  }

  private syncPatientAppointmentSnapshot(appt: GlobalAppointment) {
    // 患者详情中的预约历史是全局预约的展示快照，状态和时间要跟随全局记录同步。
    const patient = this.data.patients[appt.patientId];
    if (!patient) return;
    const snapshot = patient.appointments.find(item => item.id === appt.id);
    if (snapshot) {
      snapshot.datetime = `${appt.date} ${appt.time}`;
      snapshot.status = appt.status;
      snapshot.visitType = appt.visitType;
      snapshot.checkedInAt = appt.checkedInAt;
    } else {
      patient.appointments.push({
        id: appt.id,
        datetime: `${appt.date} ${appt.time}`,
        created_at: formatLocalDateTime(new Date()),
        status: appt.status,
        visitType: appt.visitType,
        checkedInAt: appt.checkedInAt
      });
    }
    patient.appointments.sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  private removePatientAppointmentSnapshot(patientId: string, appointmentId: string) {
    const patient = this.data.patients[patientId];
    if (!patient) return;
    patient.appointments = patient.appointments.filter(appt => appt.id !== appointmentId);
  }

  addAppointment(
    patientId: string,
    date: string,
    time: string,
    options: AppointmentInputOptions = {}
  ): { success: boolean; message: string; appointmentId?: string } {
    const patient = this.data.patients[patientId];
    if (!patient) return { success: false, message: '患者不存在，无法创建预约。' };

    const durationMinutes = normalizeDuration(options.durationMinutes);
    const conflicts = this.findAppointmentCapacityConflict(date, time, durationMinutes);
    if (conflicts.length >= MAX_CONCURRENT_APPOINTMENTS) {
      return {
        success: false,
        message: `${date} ${time} 所在时段已有 ${MAX_CONCURRENT_APPOINTMENTS} 个预约，该时段最多允许 ${MAX_CONCURRENT_APPOINTMENTS} 个预约。`
      };
    }

    if (!this.data.appointments[date]) {
      this.data.appointments[date] = [];
    }
    const id = createAppointmentId(date, time, patientId);
    const appt: GlobalAppointment = {
      id,
      date,
      time,
      patientId,
      phone: patient.phone,
      name: patient.name,
      status: options.status || 'pending',
      durationMinutes,
      source: options.source || 'appointment',
      visitType: options.visitType,
      checkedInAt: options.checkedInAt,
      plannedTreatments: normalizePlannedTreatments(id, options.plannedTreatments)
    };
    this.data.appointments[date].push(appt);
    this.data.appointments[date].sort((a, b) => a.time.localeCompare(b.time));

    this.syncPatientAppointmentSnapshot(appt);
    this.recordPatientActivity(patientId, 'appointment_created', `新增预约：${date} ${time}`);

    this.saveData();
    return { success: true, message: '预约已创建。', appointmentId: id };
  }

  updateAppointment(
    appointmentId: string,
    updates: { patientId: string; date: string; time: string } & AppointmentInputOptions
  ): { success: boolean; message: string } {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    const patient = this.data.patients[updates.patientId];
    if (!patient) return { success: false, message: '目标患者不存在，无法修改预约。' };

    const durationMinutes = normalizeDuration(updates.durationMinutes ?? found.appointment.durationMinutes);
    const conflicts = this.findAppointmentCapacityConflict(updates.date, updates.time, durationMinutes, appointmentId);
    if (conflicts.length >= MAX_CONCURRENT_APPOINTMENTS) {
      return {
        success: false,
        message: `${updates.date} ${updates.time} 所在时段已有 ${MAX_CONCURRENT_APPOINTMENTS} 个预约，该时段最多允许 ${MAX_CONCURRENT_APPOINTMENTS} 个预约。`
      };
    }

    const appts = this.data.appointments[found.dateKey] || [];
    this.data.appointments[found.dateKey] = appts.filter(appt => appt.id !== appointmentId);
    if (this.data.appointments[found.dateKey].length === 0) delete this.data.appointments[found.dateKey];

    if (found.appointment.patientId !== updates.patientId) {
      this.removePatientAppointmentSnapshot(found.appointment.patientId, appointmentId);
      this.recordPatientActivity(found.appointment.patientId, 'appointment_updated', `预约已调整至其他患者：${updates.date} ${updates.time}`);
    }

    const next: GlobalAppointment = {
      ...found.appointment,
      date: updates.date,
      time: updates.time,
      patientId: updates.patientId,
      phone: patient.phone,
      name: patient.name,
      durationMinutes,
      source: updates.source || found.appointment.source,
      visitType: updates.visitType,
      plannedTreatments: updates.plannedTreatments
        ? normalizePlannedTreatments(appointmentId, updates.plannedTreatments)
        : found.appointment.plannedTreatments
    };

    if (!this.data.appointments[updates.date]) this.data.appointments[updates.date] = [];
    this.data.appointments[updates.date].push(next);
    this.data.appointments[updates.date].sort((a, b) => a.time.localeCompare(b.time));
    this.syncPatientAppointmentSnapshot(next);
    this.recordPatientActivity(updates.patientId, 'appointment_updated', `修改预约：${updates.date} ${updates.time}`);
    this.saveData();
    return { success: true, message: '预约已更新。' };
  }

  updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): { success: boolean; message: string } {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    found.appointment.status = status;
    if ((status === 'arrived' || status === 'completed') && !found.appointment.checkedInAt) {
      found.appointment.checkedInAt = new Date().toISOString();
      found.appointment.visitType ||= 'follow_up';
    }
    if (status === 'pending') found.appointment.checkedInAt = undefined;
    if (status === 'completed') this.materializeAppointmentTreatments(found.appointment);
    this.syncPatientAppointmentSnapshot(found.appointment);
    const statusLabel: Record<AppointmentStatus, string> = {
      pending: '预约状态改为待诊',
      arrived: '患者已到诊',
      completed: '预约已完成',
      cancelled: '预约已取消'
    };
    if (status === 'arrived') {
      const visitType = found.appointment.visitType === 'initial' ? 'initial_visit' : 'follow_up_visit';
      this.recordPatientActivity(
        found.appointment.patientId,
        visitType,
        found.appointment.visitType === 'initial' ? '初诊接诊' : '复诊接诊',
        found.appointment.checkedInAt
      );
    } else {
      this.recordPatientActivity(found.appointment.patientId, 'appointment_status', statusLabel[status]);
    }
    this.saveData();
    return { success: true, message: '预约状态已更新。' };
  }

  private materializeAppointmentTreatments(appointment: GlobalAppointment) {
    const patient = this.data.patients[appointment.patientId];
    if (!patient) return;
    appointment.plannedTreatments.forEach((plan, index) => {
      if (patient.treatments.some(record => record.appointmentId === appointment.id && record.plannedTreatmentId === plan.id)) return;
      patient.treatments.push({
        id: `treatment_${Date.now().toString(36)}_${index}`,
        appointmentId: appointment.id,
        plannedTreatmentId: plan.id,
        date: getLocalDateKeyFromTimestamp(appointment.checkedInAt) || appointment.date,
        createdAt: new Date().toISOString(),
        categoryId: plan.categoryId,
        itemId: plan.itemId,
        item: plan.itemName,
        price: plan.price,
        teeth: plan.teeth,
        note: plan.note,
        changeLogs: []
      });
      this.recordPatientActivity(appointment.patientId, 'treatment_created', `新增处置：${plan.itemName}`);
    });
  }

  checkInPatient(patientId: string, visitType: VisitType): { success: boolean; message: string; appointmentId?: string } {
    const patient = this.data.patients[patientId];
    if (!patient) return { success: false, message: '患者不存在，无法接诊。' };
    const now = new Date();
    const today = formatDateKey(now);
    const existing = (this.data.appointments[today] || []).find(appt => (
      appt.patientId === patientId && appt.status !== 'cancelled'
    ));
    if (existing) {
      if (isAttendedAppointment(existing)) {
        return { success: true, message: '该患者今日已接诊。', appointmentId: existing.id };
      }
      existing.status = 'arrived';
      existing.visitType = visitType;
      existing.checkedInAt = new Date().toISOString();
      this.syncPatientAppointmentSnapshot(existing);
      this.recordPatientActivity(
        patientId,
        visitType === 'initial' ? 'initial_visit' : 'follow_up_visit',
        visitType === 'initial' ? '初诊接诊' : '复诊接诊',
        existing.checkedInAt
      );
      this.saveData();
      return { success: true, message: '患者已接诊。', appointmentId: existing.id };
    }
    const todayVisit = (patient.activityLog || []).find(activity => (
      (activity.type === 'initial_visit' || activity.type === 'follow_up_visit')
      && getLocalDateKeyFromTimestamp(activity.occurredAt) === today
    ));
    if (todayVisit) return { success: true, message: '该患者今日已接诊。' };

    // 接诊和预约是两类独立事实：患者没有预约时只记录本次就诊，不能隐式生成预约。
    this.recordPatientActivity(
      patientId,
      visitType === 'initial' ? 'initial_visit' : 'follow_up_visit',
      visitType === 'initial' ? '初诊接诊' : '复诊接诊',
      now.toISOString()
    );
    this.saveData();
    return {
      success: true,
      message: visitType === 'initial' ? '初诊接诊已登记。' : '复诊接诊已登记。'
    };
  }

  cancelAppointment(appointmentId: string): { success: boolean; message: string } {
    return this.updateAppointmentStatus(appointmentId, 'cancelled');
  }

  async deleteAppointment(appointmentId: string): Promise<{ success: boolean; message: string }> {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    const previousDateAppointments = [...this.data.appointments[found.dateKey]];
    const patient = this.data.patients[found.appointment.patientId];
    const previousPatientAppointments = patient ? [...patient.appointments] : undefined;
    const previousPatientActivities = patient ? [...(patient.activityLog || [])] : undefined;
    const previousDeletedAt = this.data.appointmentDeletionTombstones?.[appointmentId];
    this.data.appointments[found.dateKey] = this.data.appointments[found.dateKey].filter(appt => appt.id !== appointmentId);
    if (this.data.appointments[found.dateKey].length === 0) delete this.data.appointments[found.dateKey];
    this.removePatientAppointmentSnapshot(found.appointment.patientId, appointmentId);
    this.recordPatientActivity(found.appointment.patientId, 'appointment_deleted', `删除预约：${found.appointment.date} ${found.appointment.time}`);
    this.data.appointmentDeletionTombstones ||= {};
    this.data.appointmentDeletionTombstones[appointmentId] = new Date().toISOString();
    try {
      await this.saveDataAsync();
      return { success: true, message: '预约已删除。' };
    } catch (error) {
      this.data.appointments[found.dateKey] = previousDateAppointments;
      if (patient && previousPatientAppointments) patient.appointments = previousPatientAppointments;
      if (patient && previousPatientActivities) patient.activityLog = previousPatientActivities;
      if (previousDeletedAt) {
        this.data.appointmentDeletionTombstones[appointmentId] = previousDeletedAt;
      } else {
        delete this.data.appointmentDeletionTombstones[appointmentId];
      }
      return {
        success: false,
        message: `预约删除未能保存，已恢复原记录：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  getAppointmentsByDate(date: string): GlobalAppointment[] {
    return this.data.appointments[date] || [];
  }

  getAllAppointments(): GlobalAppointment[] {
    return Object.values(this.data.appointments).flat().sort((a, b) => (
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
    ));
  }

  getAppointmentsByRange(startDate: string, endDate: string): GlobalAppointment[] {
    const results: GlobalAppointment[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    Object.keys(this.data.appointments).forEach(dateKey => {
      const current = new Date(dateKey);
      if (current >= start && current <= end) {
        results.push(...this.data.appointments[dateKey]);
      }
    });

    results.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

    return results;
  }
}

export const clinicService = new ClinicService();
