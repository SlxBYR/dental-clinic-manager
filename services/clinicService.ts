import { ClinicData, Patient, GlobalAppointment, TreatmentCategory, TreatmentItem, AppointmentStatus, BackupSettings, BackupPayload, ReleaseSettings, ReleaseCheckResult, CloudSyncSettings, CloudSyncResult } from '../types';
import { STORAGE_KEY, BACKUP_SETTINGS_KEY, CLOUD_SYNC_SETTINGS_KEY, RELEASE_SETTINGS_KEY, DEFAULT_CATALOG, DATA_VERSION, APP_VERSION, DEFAULT_RELEASE_API_URL } from '../constants';
import { createAppointmentId, migrateClinicData, validateClinicData } from './dataMigrations';

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

const getInitialData = (): ClinicData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const migrated = migrateClinicData(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      return migrated;
    } catch (e) {
      console.error("Failed to parse data", e);
    }
  }
  return createEmptyData();
};

class ClinicService {
  private data: ClinicData;

  constructor() {
    this.data = getInitialData();
  }

  saveData() {
    this.data.version = DATA_VERSION;
    this.data.dataVersion = DATA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  // --- Settings ---
  getClinicName(): string {
    return this.data.clinicName || 'DentalClinic';
  }

  updateClinicName(name: string) {
    this.data.clinicName = name;
    this.saveData();
  }

  // --- Import / Export ---

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

      const migrated = migrateClinicData(remoteData);
      const validation = validateClinicData(migrated);
      if (!validation.valid) {
        return { success: false, message: `云端数据校验失败：${validation.message}` };
      }
      this.data = migrated;
      this.saveData();
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

  importData(jsonString: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonString);
      const migrated = migrateClinicData(parsed);
      const validation = validateClinicData(migrated);
      if (!validation.valid) {
        return { success: false, message: validation.message };
      }
      localStorage.setItem(`${STORAGE_KEY}_pre_import_backup`, this.exportData());
      this.data = migrated;
      this.saveData();
      return { success: true, message: '导入成功。导入前数据已保存在本机预导入备份中。' };
    } catch (e) {
      console.error("Import failed", e);
      return { success: false, message: e instanceof Error ? `导入失败：${e.message}` : '导入失败，无法解析 JSON 文件。' };
    }
  }

  // --- Catalog Management ---

  getCatalog(): TreatmentCategory[] {
    return this.data.catalog;
  }

  updateCatalog(newCatalog: TreatmentCategory[]) {
    this.data.catalog = newCatalog;
    this.saveData();
  }

  // --- Patient Management ---

  getAllPatients(): Patient[] {
    return Object.values(this.data.patients);
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

  // --- Treatments ---

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
      note
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
        patient.treatments[index] = { ...patient.treatments[index], ...updates };
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

  // --- Appointments ---

  private findAppointmentById(appointmentId: string): { dateKey: string; appointment: GlobalAppointment } | undefined {
    for (const [dateKey, appts] of Object.entries(this.data.appointments)) {
      const appointment = appts.find(appt => appt.id === appointmentId);
      if (appointment) return { dateKey, appointment };
    }
    return undefined;
  }

  private findAppointmentConflict(date: string, time: string, excludeId?: string): GlobalAppointment | undefined {
    return (this.data.appointments[date] || []).find(appt => (
      appt.id !== excludeId
      && appt.time === time
      && appt.status !== 'cancelled'
    ));
  }

  private syncPatientAppointmentSnapshot(appt: GlobalAppointment) {
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
