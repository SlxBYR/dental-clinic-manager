import { ClinicData, Patient, GlobalAppointment, TreatmentCategory, TreatmentItem, AppointmentStatus, BackupSettings, BackupPayload, ReleaseSettings, ReleaseCheckResult, CloudSyncSettings, CloudSyncResult, TreatmentRecord, ImportPreview, ImportPreviewMetric, ImportPreviewResult, PatientListItem, PatientListPage, PatientListQuery } from '../types';
import { STORAGE_KEY, BACKUP_SETTINGS_KEY, CLOUD_SYNC_SETTINGS_KEY, RELEASE_SETTINGS_KEY, DEFAULT_CATALOG, DATA_VERSION, APP_VERSION, DEFAULT_RELEASE_API_URL } from '../constants';
import { createAppointmentId, migrateClinicData, validateClinicData } from './dataMigrations';
import { ElectronSqliteStore } from './storage/electronSqliteStore';
import { LocalStorageStore } from './storage/localStorageStore';
import { CLINIC_DATA_STORE_KEY, KeyValueStore } from './storage/types';
// @ts-ignore tiny-pinyin 没有完整类型声明，浏览器兜底搜索需要运行时能力。
import * as pinyin from 'tiny-pinyin';

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizePhone = (phone: string) => phone.trim().replace(/\s/g, '');
const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  catalog: DEFAULT_CATALOG,
  clinicName: 'DentalClinic'
});

// 所有外部 JSON 入口统一走迁移和校验，避免导入、恢复、云同步各自处理出差异。
const parseAndValidateClinicData = (rawJson: string): ClinicData => {
  const parsed = JSON.parse(rawJson);
  const migrated = migrateClinicData(parsed);
  const validation = validateClinicData(migrated);
  if (!validation.valid) throw new Error(validation.message);
  return migrated;
};

const flattenAppointments = (data: ClinicData) => Object.values(data.appointments).flat();

const countTreatments = (data: ClinicData) => Object.values(data.patients)
  .reduce((total, patient) => total + patient.treatments.length, 0);

const countCatalogItems = (data: ClinicData) => data.catalog
  .reduce((total, category) => total + category.items.length, 0);

const patientLabel = (patient?: Patient) => {
  if (!patient) return '';
  return `${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`;
};

const getPatientLastUpdate = (patient: Patient) => {
  let last = '0000-00-00';
  patient.treatments.forEach(treatment => {
    if (treatment.date > last) last = treatment.date;
  });
  patient.appointments.forEach(appointment => {
    const date = appointment.datetime.split(' ')[0];
    if (date > last) last = date;
  });
  return last;
};

const getPatientPinyinTerms = (name: string) => {
  if (!pinyin || typeof pinyin.convertToPinyin !== 'function') return '';
  try {
    const fullPinyin = pinyin.convertToPinyin(name, ' ', true);
    const parts = fullPinyin.split(/\s+/).filter(Boolean);
    return `${fullPinyin} ${parts.join('')} ${parts.map((part: string) => part[0]).join('')}`.toLowerCase();
  } catch {
    return '';
  }
};

const createDiffMetric = <T>(
  label: string,
  currentItems: T[],
  incomingItems: T[],
  getId: (item: T) => string
): ImportPreviewMetric => {
  const currentMap = new Map(currentItems.map(item => [getId(item), item]));
  const incomingMap = new Map(incomingItems.map(item => [getId(item), item]));
  let added = 0;
  let overwritten = 0;
  let removed = 0;

  incomingMap.forEach((incoming, id) => {
    const current = currentMap.get(id);
    if (!current) {
      added += 1;
      return;
    }
    if (JSON.stringify(current) !== JSON.stringify(incoming)) overwritten += 1;
  });

  currentMap.forEach((_, id) => {
    if (!incomingMap.has(id)) removed += 1;
  });

  return {
    label,
    current: currentItems.length,
    incoming: incomingItems.length,
    added,
    overwritten,
    removed
  };
};

class ClinicService {
  private data: ClinicData = createEmptyData();
  private store: KeyValueStore = new LocalStorageStore();
  private localStore = new LocalStorageStore();
  private sqliteStore: ElectronSqliteStore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private storageStatus = {
    primary: 'localStorage',
    message: '正在初始化本地存储。'
  };

  // 初始化优先使用 Electron 暴露的 SQLite；失败时保留 localStorage 兜底，保证浏览器预览也能运行。
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.loadInitialData();
    return this.initPromise;
  }

  private async loadInitialData() {
    const sqliteStore = new ElectronSqliteStore();
    if (sqliteStore.isAvailable()) {
      const status = await sqliteStore.getStatus();
      if (status.available) {
        try {
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
              message: '已从旧 localStorage 迁移到 SQLite，旧数据仍保留作为兜底。'
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
    await this.localStore.setItem(CLINIC_DATA_STORE_KEY, serialized);
    if (this.store.name === this.localStore.name) return;
    try {
      await this.store.setItem(CLINIC_DATA_STORE_KEY, serialized);
    } catch (error) {
      this.store = this.localStore;
      this.sqliteStore = null;
      this.storageStatus = {
        primary: 'localStorage',
        message: `SQLite 写入失败，已回退 localStorage：${error instanceof Error ? error.message : String(error)}`
      };
      throw error;
    }
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

  // 云端同步只约定前端请求格式；key 到具体仓库/对象路径的映射由服务器实现。
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
          action: 'pull',
          key: validation.key
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      const payload = await response.json();
      const remoteData = payload?.data || payload?.payload?.data || payload;
      if (!remoteData?.patients || !remoteData?.appointments) {
        return { success: false, message: '云端数据格式不正确。' };
      }

      // 云端拉取是覆盖式写入，所以必须先迁移并校验完整数据结构。
      const migrated = migrateClinicData(remoteData);
      const validation = validateClinicData(migrated);
      if (!validation.valid) {
        return { success: false, message: `云端数据校验失败：${validation.message}` };
      }
      this.data = migrated;
      await this.saveDataAsync();
      return { success: true, message: '已从云端同步数据。' };
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
      const response = await fetch(validation.endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validation.key}`
        },
        body: JSON.stringify({
          app: 'DentalClinicManager',
          action: 'push',
          key: validation.key,
          payload: this.createBackupPayload()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      return { success: true, message: '本机数据已上传到云端。' };
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
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(this.createBackupPayload()),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `服务器返回 ${response.status} ${response.statusText || ''}`.trim() };
      }

      return { success: true, message: '备份已发送到服务器。' };
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

    try {
      const migrated = parseAndValidateClinicData(backup);
      localStorage.setItem(`${STORAGE_KEY}_pre_restore_backup`, this.exportData());
      this.data = migrated;
      await this.saveDataAsync();
      return { success: true, message: '已恢复导入前备份。恢复前数据已保存在本机恢复前备份中。' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? `恢复失败：${error.message}` : '恢复失败，备份数据无法解析。' };
    }
  }

  async importData(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const migrated = parseAndValidateClinicData(jsonString);
      localStorage.setItem(`${STORAGE_KEY}_pre_import_backup`, this.exportData());
      this.data = migrated;
      await this.saveDataAsync();
      return { success: true, message: '导入成功。导入前数据已保存在本机预导入备份中。' };
    } catch (e) {
      console.error("Import failed", e);
      return { success: false, message: e instanceof Error ? `导入失败：${e.message}` : '导入失败，无法解析 JSON 文件。' };
    }
  }

  createImportPreview(jsonString: string): ImportPreviewResult {
    try {
      const incoming = parseAndValidateClinicData(jsonString);
      const currentPatients = Object.values(this.data.patients);
      const incomingPatients = Object.values(incoming.patients);
      const currentAppointments = flattenAppointments(this.data);
      const incomingAppointments = flattenAppointments(incoming);
      const currentTreatments = currentPatients.flatMap(patient => (
        patient.treatments.map(treatment => ({ patientId: patient.id, treatment }))
      ));
      const incomingTreatments = incomingPatients.flatMap(patient => (
        patient.treatments.map(treatment => ({ patientId: patient.id, treatment }))
      ));
      const currentCatalogCategories = this.data.catalog;
      const incomingCatalogCategories = incoming.catalog;
      const currentCatalogItems = this.data.catalog.flatMap(category => (
        category.items.map(item => ({ categoryId: category.id, item }))
      ));
      const incomingCatalogItems = incoming.catalog.flatMap(category => (
        category.items.map(item => ({ categoryId: category.id, item }))
      ));

      const currentPatientMap = new Map(currentPatients.map(patient => [patient.id, patient]));
      const incomingPatientMap = new Map(incomingPatients.map(patient => [patient.id, patient]));
      const addedPatients: string[] = [];
      const overwrittenPatients: string[] = [];
      const removedPatients: string[] = [];

      incomingPatientMap.forEach((patient, id) => {
        const current = currentPatientMap.get(id);
        if (!current) {
          addedPatients.push(patientLabel(patient));
          return;
        }
        if (JSON.stringify(current) !== JSON.stringify(patient)) overwrittenPatients.push(patientLabel(patient));
      });
      currentPatientMap.forEach((patient, id) => {
        if (!incomingPatientMap.has(id)) removedPatients.push(patientLabel(patient));
      });

      const warnings: string[] = [
        '确认导入后，当前本机主数据会被导入文件整体覆盖。',
        '系统会先保存一份导入前备份，可在设置页恢复最近一次导入前状态。'
      ];
      if ((this.data.clinicName || 'DentalClinic') !== (incoming.clinicName || 'DentalClinic')) {
        warnings.push(`诊所名称将从“${this.data.clinicName || 'DentalClinic'}”变为“${incoming.clinicName || 'DentalClinic'}”。`);
      }
      if ((incoming.dataVersion || incoming.version || 0) < DATA_VERSION) {
        warnings.push(`导入文件数据版本较旧，已预览迁移到当前数据版本 ${DATA_VERSION} 后的结果。`);
      }
      if (removedPatients.length > 0) {
        warnings.push(`导入文件中缺少 ${removedPatients.length} 位当前患者，确认后这些患者会从本机主数据中移除。`);
      }

      const preview: ImportPreview = {
        currentClinicName: this.data.clinicName || 'DentalClinic',
        incomingClinicName: incoming.clinicName || 'DentalClinic',
        dataVersion: incoming.dataVersion || incoming.version,
        metrics: [
          createDiffMetric('患者档案', currentPatients, incomingPatients, patient => patient.id),
          createDiffMetric('预约记录', currentAppointments, incomingAppointments, appointment => appointment.id),
          createDiffMetric('处置记录', currentTreatments, incomingTreatments, item => `${item.patientId}:${item.treatment.id}`),
          createDiffMetric('处置分类', currentCatalogCategories, incomingCatalogCategories, category => category.id),
          createDiffMetric('目录项目', currentCatalogItems, incomingCatalogItems, item => `${item.categoryId}:${item.item.id}`)
        ],
        warnings,
        samples: {
          addedPatients: addedPatients.slice(0, 5),
          overwrittenPatients: overwrittenPatients.slice(0, 5),
          removedPatients: removedPatients.slice(0, 5)
        }
      };

      return {
        success: true,
        message: `导入预览已生成：${incomingPatients.length} 位患者、${incomingAppointments.length} 条预约、${countTreatments(incoming)} 条处置记录、${countCatalogItems(incoming)} 个目录项目。`,
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
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 80));
    const q = (query.query || '').trim().toLowerCase();
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
      .map<PatientListItem>(patient => ({
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        gender: patient.gender,
        age: patient.age,
        lastUpdate: getPatientLastUpdate(patient),
        phoneCount: patient.phone ? phoneCounts[patient.phone] || 0 : 0
      }))
      .sort((a, b) => {
        const dateSort = b.lastUpdate.localeCompare(a.lastUpdate);
        return dateSort || a.name.localeCompare(b.name);
      });

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

  addPatient(patient: Omit<Patient, 'id'>): { success: boolean; patientId: string; merged: boolean } {
    const cleanName = patient.name.trim();
    const cleanPhone = normalizePhone(patient.phone);

    const id = ensureUniqueId(hashPatientId(cleanName, cleanPhone), this.data.patients);
    this.data.patients[id] = {
      ...patient,
      id,
      patientGroupId: patient.patientGroupId || getPatientGroupId(cleanPhone) || `patient_${id}`,
      name: cleanName,
      phone: cleanPhone,
      treatments: patient.treatments || [],
      appointments: patient.appointments || []
    };
    this.saveData();
    return { success: true, patientId: id, merged: false };
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

        patient.treatments[index] = {
          ...current,
          ...updates,
          changeLogs: [
            ...(Array.isArray(current.changeLogs) ? current.changeLogs : []),
            {
              id: createTreatmentLogId(recordId),
              changedAt: new Date().toISOString(),
              changedFields,
              before,
              after
            }
          ]
        };
        this.saveData();
        return true;
      }
    }
    return false;
  }

  deleteTreatment(patientId: string, recordId: string): boolean {
    const patient = this.data.patients[patientId];
    if (patient) {
      const initialLength = patient.treatments.length;
      patient.treatments = patient.treatments.filter(t => t.id !== recordId);
      if (patient.treatments.length !== initialLength) {
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

  private findAppointmentConflict(date: string, time: string, excludeId?: string): GlobalAppointment | undefined {
    // 当前尚未建模医生/椅位资源，因此冲突范围是同一天同一时间的未取消预约。
    return (this.data.appointments[date] || []).find(appt => (
      appt.id !== excludeId
      && appt.time === time
      && appt.status !== 'cancelled'
    ));
  }

  private syncPatientAppointmentSnapshot(appt: GlobalAppointment) {
    // 患者详情中的预约历史是全局预约的展示快照，状态和时间要跟随全局记录同步。
    const patient = this.data.patients[appt.patientId];
    if (!patient) return;
    const snapshot = patient.appointments.find(item => item.id === appt.id);
    if (snapshot) {
      snapshot.datetime = `${appt.date} ${appt.time}`;
      snapshot.status = appt.status;
    } else {
      patient.appointments.push({
        id: appt.id,
        datetime: `${appt.date} ${appt.time}`,
        created_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
        status: appt.status
      });
    }
    patient.appointments.sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  private removePatientAppointmentSnapshot(patientId: string, appointmentId: string) {
    const patient = this.data.patients[patientId];
    if (!patient) return;
    patient.appointments = patient.appointments.filter(appt => appt.id !== appointmentId);
  }

  addAppointment(patientId: string, date: string, time: string): { success: boolean; message: string; appointmentId?: string } {
    const patient = this.data.patients[patientId];
    if (!patient) return { success: false, message: '患者不存在，无法创建预约。' };

    const conflict = this.findAppointmentConflict(date, time);
    if (conflict) {
      return {
        success: false,
        message: `${date} ${time} 已有 ${conflict.name} 的预约，请选择其他时间。`
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
      status: 'pending'
    };
    this.data.appointments[date].push(appt);
    this.data.appointments[date].sort((a, b) => a.time.localeCompare(b.time));

    this.syncPatientAppointmentSnapshot(appt);

    this.saveData();
    return { success: true, message: '预约已创建。', appointmentId: id };
  }

  updateAppointment(
    appointmentId: string,
    updates: { patientId: string; date: string; time: string }
  ): { success: boolean; message: string } {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    const patient = this.data.patients[updates.patientId];
    if (!patient) return { success: false, message: '目标患者不存在，无法修改预约。' };

    const conflict = this.findAppointmentConflict(updates.date, updates.time, appointmentId);
    if (conflict) {
      return {
        success: false,
        message: `${updates.date} ${updates.time} 已有 ${conflict.name} 的预约，请选择其他时间。`
      };
    }

    const appts = this.data.appointments[found.dateKey] || [];
    this.data.appointments[found.dateKey] = appts.filter(appt => appt.id !== appointmentId);
    if (this.data.appointments[found.dateKey].length === 0) delete this.data.appointments[found.dateKey];

    if (found.appointment.patientId !== updates.patientId) {
      this.removePatientAppointmentSnapshot(found.appointment.patientId, appointmentId);
    }

    const next: GlobalAppointment = {
      ...found.appointment,
      date: updates.date,
      time: updates.time,
      patientId: updates.patientId,
      phone: patient.phone,
      name: patient.name
    };

    if (!this.data.appointments[updates.date]) this.data.appointments[updates.date] = [];
    this.data.appointments[updates.date].push(next);
    this.data.appointments[updates.date].sort((a, b) => a.time.localeCompare(b.time));
    this.syncPatientAppointmentSnapshot(next);
    this.saveData();
    return { success: true, message: '预约已更新。' };
  }

  updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): { success: boolean; message: string } {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    found.appointment.status = status;
    this.syncPatientAppointmentSnapshot(found.appointment);
    this.saveData();
    return { success: true, message: '预约状态已更新。' };
  }

  cancelAppointment(appointmentId: string): { success: boolean; message: string } {
    return this.updateAppointmentStatus(appointmentId, 'cancelled');
  }

  deleteAppointment(appointmentId: string): { success: boolean; message: string } {
    const found = this.findAppointmentById(appointmentId);
    if (!found) return { success: false, message: '预约不存在，可能已被删除。' };
    this.data.appointments[found.dateKey] = this.data.appointments[found.dateKey].filter(appt => appt.id !== appointmentId);
    if (this.data.appointments[found.dateKey].length === 0) delete this.data.appointments[found.dateKey];
    this.removePatientAppointmentSnapshot(found.appointment.patientId, appointmentId);
    this.saveData();
    return { success: true, message: '预约已删除。' };
  }

  getAppointmentsByDate(date: string): GlobalAppointment[] {
    return this.data.appointments[date] || [];
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
