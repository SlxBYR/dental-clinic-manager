import { DEFAULT_CATALOG, DATA_VERSION } from '../constants';
import { Appointment, AppointmentStatus, ClinicData, GlobalAppointment, Patient, PatientActivity, PatientActivityType, PlannedTreatment, TreatmentChangeLog, TreatmentRecord, VisitType } from '../types';
import { getLocalDateKeyFromTimestamp } from '../utils/date';

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizePhone = (phone: string) => phone.trim().replace(/\s/g, '');

const hashPatientId = (name: string, phone: string) => {
  const source = `${normalizeName(name)}|${normalizePhone(phone)}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `p_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const ensureUniqueId = <T>(baseId: string, collection: Record<string, T>) => {
  if (!collection[baseId]) return baseId;
  let index = 2;
  while (collection[`${baseId}_${index}`]) index += 1;
  return `${baseId}_${index}`;
};

const getPatientGroupId = (phone: string) => {
  const cleanPhone = normalizePhone(phone);
  return cleanPhone ? `phone_${cleanPhone}` : undefined;
};

const sanitizeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '');

const stableLegacyHash = (...parts: unknown[]) => {
  const source = parts.map(part => String(part ?? '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

// 预约 id 必须跨日期唯一，后续编辑、删除、取消都依赖它定位同一条记录。
export const createAppointmentId = (date: string, time: string, patientId: string, suffix = Date.now().toString(36)) => (
  `appt_${sanitizeIdPart(date)}_${sanitizeIdPart(time)}_${sanitizeIdPart(patientId)}_${suffix}`
);

// 旧数据可能没有状态或状态值不规范，迁移时统一收敛为当前四种状态。
export const normalizeAppointmentStatus = (status: unknown): AppointmentStatus => {
  if (status === 'arrived' || status === 'completed' || status === 'cancelled' || status === 'pending') return status;
  return 'pending';
};

const normalizeVisitType = (value: unknown): VisitType | undefined => (
  value === 'initial' || value === 'follow_up' ? value : undefined
);

const PATIENT_ACTIVITY_TYPES = new Set<PatientActivityType>([
  'created',
  'profile_updated',
  'appointment_created',
  'appointment_updated',
  'appointment_status',
  'appointment_deleted',
  'initial_visit',
  'follow_up_visit',
  'treatment_created',
  'treatment_updated',
  'treatment_deleted'
]);

const normalizePatientActivity = (value: any, patientId: string, index: number): PatientActivity | null => {
  if (!PATIENT_ACTIVITY_TYPES.has(value?.type)) return null;
  if (typeof value?.occurredAt !== 'string' || !value.occurredAt.trim()) return null;
  return {
    id: typeof value?.id === 'string' && value.id.trim()
      ? value.id
      : `activity_${sanitizeIdPart(patientId)}_${index}`,
    type: value.type,
    occurredAt: value.occurredAt,
    label: typeof value?.label === 'string' && value.label.trim() ? value.label : '患者信息更新'
  };
};

const normalizePlannedTreatment = (value: any, appointmentId: string, index: number): PlannedTreatment | null => {
  const itemName = typeof value?.itemName === 'string'
    ? value.itemName.trim()
    : typeof value?.item === 'string'
      ? value.item.trim()
      : '';
  if (!itemName) return null;
  return {
    id: typeof value?.id === 'string' && value.id.trim() ? value.id : `plan_${sanitizeIdPart(appointmentId)}_${index}`,
    categoryId: typeof value?.categoryId === 'string' ? value.categoryId : undefined,
    itemId: typeof value?.itemId === 'string' ? value.itemId : undefined,
    itemName,
    price: typeof value?.price === 'number' ? value.price : Number(value?.price) || 0,
    teeth: typeof value?.teeth === 'string' ? value.teeth : '',
    note: typeof value?.note === 'string' ? value.note : ''
  };
};

const normalizeLogValueMap = (value: any): Record<string, string | number | undefined> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | number | undefined>>((result, [key, fieldValue]) => {
    if (typeof fieldValue === 'string') {
      result[key] = fieldValue;
    } else if (typeof fieldValue === 'number') {
      result[key] = fieldValue;
    } else if (fieldValue === null || fieldValue === undefined) {
      result[key] = undefined;
    } else {
      result[key] = String(fieldValue);
    }
    return result;
  }, {});
};

const normalizeTreatmentChangeLog = (log: any, treatmentId: string, index: number, fallbackChangedAt: string): TreatmentChangeLog => ({
  id: typeof log?.id === 'string' && log.id.trim()
    ? log.id
    : `tlog_${sanitizeIdPart(treatmentId)}_${index}`,
  changedAt: typeof log?.changedAt === 'string' && log.changedAt.trim() ? log.changedAt : fallbackChangedAt,
  changedFields: Array.isArray(log?.changedFields)
    ? log.changedFields.filter((field: unknown): field is string => typeof field === 'string' && field.trim().length > 0)
    : [],
  before: normalizeLogValueMap(log?.before),
  after: normalizeLogValueMap(log?.after),
  note: typeof log?.note === 'string' ? log.note : undefined
});

const normalizeTreatment = (record: any, index: number): TreatmentRecord => {
  const date = typeof record?.date === 'string' && record.date.trim()
    ? record.date
    : typeof record?.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(record.createdAt)
      ? record.createdAt.slice(0, 10)
      : '1970-01-01';
  const id = typeof record?.id === 'string' && record.id.trim()
    ? record.id
    : `treatment_legacy_${stableLegacyHash(date, record?.item, record?.price, record?.teeth, index)}`;
  const createdAt = typeof record?.createdAt === 'string' ? record.createdAt : undefined;
  const fallbackChangedAt = createdAt || `${date}T12:00:00.000Z`;

  // 处置记录迁移只补齐缺失字段，不推断旧版本没有保存过的业务信息。
  return {
    id,
    appointmentId: typeof record?.appointmentId === 'string' ? record.appointmentId : undefined,
    plannedTreatmentId: typeof record?.plannedTreatmentId === 'string' ? record.plannedTreatmentId : undefined,
    date,
    createdAt,
    categoryId: typeof record?.categoryId === 'string' ? record.categoryId : undefined,
    itemId: typeof record?.itemId === 'string' ? record.itemId : undefined,
    item: typeof record?.item === 'string' ? record.item : '未命名处置',
    price: typeof record?.price === 'number' ? record.price : Number(record?.price) || 0,
    teeth: typeof record?.teeth === 'string' ? record.teeth : '',
    note: typeof record?.note === 'string' ? record.note : '',
    changeLogs: Array.isArray(record?.changeLogs)
      ? record.changeLogs.map((log: any, logIndex: number) => normalizeTreatmentChangeLog(log, id, logIndex, fallbackChangedAt))
      : []
  };
};

const makePatientAppointment = (appt: GlobalAppointment, createdAt?: string): Appointment => ({
  id: appt.id,
  datetime: `${appt.date} ${appt.time}`,
  created_at: createdAt || `${appt.date}T${appt.time}:00`,
  status: appt.status,
  visitType: appt.visitType,
  checkedInAt: appt.checkedInAt
});

const normalizeAppointmentDeletionTombstones = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((result, [id, deletedAt]) => {
    if (id.trim() && typeof deletedAt === 'string' && deletedAt.trim()) result[id] = deletedAt;
    return result;
  }, {});
};

// 把各历史版本的数据统一迁到当前 ClinicData 结构，供启动、导入、云同步共用。
export const migrateClinicData = (raw: any): ClinicData => {
  const appointmentDeletionTombstones = normalizeAppointmentDeletionTombstones(raw?.appointmentDeletionTombstones);
  const data: ClinicData = {
    version: DATA_VERSION,
    dataVersion: DATA_VERSION,
    clinicName: typeof raw?.clinicName === 'string' && raw.clinicName.trim() ? raw.clinicName : 'DentalClinic',
    catalog: Array.isArray(raw?.catalog) ? raw.catalog : DEFAULT_CATALOG,
    patients: {},
    appointments: {},
    appointmentDeletionTombstones
  };

  const phoneToIds = new Map<string, string[]>();
  const legacyPatientIdMap = new Map<string, string>();
  const legacyAppointmentsByPatientId = new Map<string, any[]>();
  const implicitVisitsByPatientId = new Map<string, Array<{
    appointmentId: string;
    date: string;
    time: string;
    occurredAt: string;
    visitType: VisitType;
  }>>();
  const patientsWithActivityLog = new Set<string>();
  const oldPatients = raw?.patients && typeof raw.patients === 'object' ? raw.patients : {};

  // 患者以独立 id 为主键；同手机号只进入同一 patientGroupId，不再合并成同一个人。
  Object.keys(oldPatients).forEach(oldKey => {
    const oldPatient = oldPatients[oldKey] || {};
    const phone = normalizePhone(oldPatient.phone || oldKey || '');
    const name = typeof oldPatient.name === 'string' ? oldPatient.name.trim() : '';
    if (!name) return;

    const id = ensureUniqueId(oldPatient.id || hashPatientId(name, phone), data.patients);
    const patientGroupId = oldPatient.patientGroupId || getPatientGroupId(phone) || `patient_${id}`;

    data.patients[id] = {
      ...oldPatient,
      id,
      createdAt: typeof oldPatient.createdAt === 'string' && oldPatient.createdAt.trim() ? oldPatient.createdAt : undefined,
      patientGroupId,
      name,
      phone,
      gender: typeof oldPatient.gender === 'string' ? oldPatient.gender : '男',
      age: oldPatient.age !== undefined ? String(oldPatient.age) : '',
      treatments: Array.isArray(oldPatient.treatments) ? oldPatient.treatments.map(normalizeTreatment) : [],
      appointments: [],
      activityLog: Array.isArray(oldPatient.activityLog)
        ? oldPatient.activityLog
          .map((activity: any, index: number) => normalizePatientActivity(activity, id, index))
          .filter(Boolean) as PatientActivity[]
        : []
    };
    if (Array.isArray(oldPatient.activityLog)) patientsWithActivityLog.add(id);

    legacyPatientIdMap.set(oldKey, id);
    if (oldPatient.id) legacyPatientIdMap.set(oldPatient.id, id);
    legacyAppointmentsByPatientId.set(id, Array.isArray(oldPatient.appointments) ? oldPatient.appointments : []);
    if (phone) phoneToIds.set(phone, [...(phoneToIds.get(phone) || []), id]);
  });

  const usedAppointmentIds = new Set<string>();
  const oldAppointments = raw?.appointments && typeof raw.appointments === 'object' ? raw.appointments : {};

  // 全局预约表是当前事实来源，患者内的 appointments 只作为详情页历史快照。
  Object.keys(oldAppointments).forEach(dateKey => {
    const migrated = (Array.isArray(oldAppointments[dateKey]) ? oldAppointments[dateKey] : [])
      .map((appt: any, index: number) => {
        const phone = normalizePhone(appt?.phone || '');
        const patientId = (appt?.patientId ? legacyPatientIdMap.get(appt.patientId) || appt.patientId : undefined)
          || (phone ? phoneToIds.get(phone)?.[0] : undefined);
        const patient = patientId ? data.patients[patientId] : undefined;
        if (!patientId || !patient) return null;

        const date = typeof appt?.date === 'string' && appt.date.trim() ? appt.date : dateKey;
        const time = typeof appt?.time === 'string' && appt.time.trim() ? appt.time : '09:00';
        const baseId = typeof appt?.id === 'string' && appt.id.trim()
          ? appt.id
          : createAppointmentId(date, time, patientId, String(index));
        let id = baseId;
        let dedupeIndex = 2;
        while (usedAppointmentIds.has(id)) {
          id = `${baseId}_${dedupeIndex}`;
          dedupeIndex += 1;
        }
        if (appointmentDeletionTombstones[id]) return null;
        usedAppointmentIds.add(id);

        // 旧版“接诊”会隐式生成 source=walk_in 的预约。它不是用户设置的预约，迁移时
        // 转回就诊活动并写入删除标记，避免本地或云端数据再次把这条误记录带回来。
        if (appt?.source === 'walk_in') {
          const checkedInAt = typeof appt?.checkedInAt === 'string' && appt.checkedInAt.trim()
            ? appt.checkedInAt
            : `${date}T${time}:00`;
          appointmentDeletionTombstones[id] ||= checkedInAt;
          implicitVisitsByPatientId.set(patientId, [
            ...(implicitVisitsByPatientId.get(patientId) || []),
            {
              appointmentId: id,
              date,
              time,
              occurredAt: checkedInAt,
              visitType: normalizeVisitType(appt?.visitType) || 'follow_up'
            }
          ]);
          return null;
        }

        return {
          ...appt,
          id,
          date,
          time,
          patientId,
          phone: patient.phone,
          name: patient.name,
          status: normalizeAppointmentStatus(appt?.status),
          durationMinutes: Number.isFinite(Number(appt?.durationMinutes))
            ? Math.max(15, Math.min(480, Number(appt.durationMinutes)))
            : 30,
          source: appt?.source === 'walk_in' ? 'walk_in' : 'appointment',
          visitType: normalizeVisitType(appt?.visitType),
          checkedInAt: typeof appt?.checkedInAt === 'string' && appt.checkedInAt.trim() ? appt.checkedInAt : undefined,
          plannedTreatments: (Array.isArray(appt?.plannedTreatments) ? appt.plannedTreatments : [])
            .map((item: any, itemIndex: number) => normalizePlannedTreatment(item, id, itemIndex))
            .filter(Boolean) as PlannedTreatment[]
        } as GlobalAppointment;
      })
      .filter(Boolean) as GlobalAppointment[];

    migrated.forEach(appt => {
      if (!data.appointments[appt.date]) data.appointments[appt.date] = [];
      data.appointments[appt.date].push(appt);
    });
  });

  Object.keys(data.appointments).forEach(dateKey => {
    data.appointments[dateKey].sort((a, b) => a.time.localeCompare(b.time));
  });

  Object.values(data.appointments).flat().forEach(appt => {
    const patient = data.patients[appt.patientId];
    if (!patient) return;
    const oldSnapshot = legacyAppointmentsByPatientId
      .get(appt.patientId)
      ?.find((item: any) => item?.id === appt.id || item?.datetime === `${appt.date} ${appt.time}`);
    patient.appointments.push(makePatientAppointment(appt, oldSnapshot?.created_at));
  });

  // 保留旧患者档案里仅存在于快照中的预约历史，避免迁移时丢失可追溯信息。
  Object.values(data.patients).forEach(patient => {
    const snapshotsById = new Map(patient.appointments.map(appt => [appt.id, appt]));
    const legacySnapshots = legacyAppointmentsByPatientId.get(patient.id) || [];
    legacySnapshots.forEach((item: any, index: number) => {
      if (typeof item?.datetime !== 'string') return;
      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id
        : `legacy_${sanitizeIdPart(patient.id)}_${sanitizeIdPart(item.datetime)}_${index}`;
      if (appointmentDeletionTombstones[id]) return;
      if (!snapshotsById.has(id)) {
        snapshotsById.set(id, {
          id,
          datetime: item.datetime,
          created_at: typeof item.created_at === 'string' ? item.created_at : '',
          status: normalizeAppointmentStatus(item.status),
          visitType: normalizeVisitType(item.visitType),
          checkedInAt: typeof item.checkedInAt === 'string' ? item.checkedInAt : undefined
        });
      }
    });
    patient.appointments = Array.from(snapshotsById.values()).sort((a, b) => b.datetime.localeCompare(a.datetime));
  });

  // 旧版本没有活动日志时，从已有患者、预约和处置时间回填，确保月历首次启用即可查看历史更新。
  Object.values(data.patients).forEach(patient => {
    if (patientsWithActivityLog.has(patient.id)) {
      patient.activityLog = (patient.activityLog || []).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return;
    }
    const activities: PatientActivity[] = [];
    const addActivity = (id: string, type: PatientActivityType, occurredAt: string | undefined, label: string) => {
      if (!occurredAt) return;
      activities.push({ id, type, occurredAt, label });
    };
    addActivity(`activity_${patient.id}_created`, 'created', patient.createdAt, '新增患者');
    patient.treatments.forEach(treatment => {
      addActivity(
        `activity_${patient.id}_treatment_${treatment.id}`,
        'treatment_created',
        treatment.createdAt || (treatment.date ? `${treatment.date}T12:00:00` : undefined),
        `新增处置：${treatment.item}`
      );
      treatment.changeLogs.forEach(log => {
        addActivity(
          `activity_${patient.id}_treatment_log_${log.id}`,
          'treatment_updated',
          log.changedAt,
          `修改处置：${treatment.item}`
        );
      });
    });
    patient.appointments.forEach(appointment => {
      addActivity(
        `activity_${patient.id}_appointment_${appointment.id}`,
        'appointment_created',
        appointment.created_at || (appointment.datetime ? appointment.datetime.replace(' ', 'T') : undefined),
        `新增预约：${appointment.datetime}`
      );
      if (appointment.checkedInAt) {
        const type = appointment.visitType === 'initial' ? 'initial_visit' : 'follow_up_visit';
        addActivity(
          `activity_${patient.id}_visit_${appointment.id}`,
          type,
          appointment.checkedInAt,
          appointment.visitType === 'initial' ? '初诊接诊' : '复诊接诊'
        );
      }
    });
    patient.activityLog = activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  });

  // 清除隐式预约留下的“新增预约”活动，同时保留真实的初诊/复诊事实。
  Object.values(data.patients).forEach(patient => {
    const implicitVisits = implicitVisitsByPatientId.get(patient.id) || [];
    if (implicitVisits.length === 0) return;
    patient.activityLog = (patient.activityLog || []).filter(activity => !(
      activity.type === 'appointment_created'
      && implicitVisits.some(visit => activity.label === `新增预约：${visit.date} ${visit.time}`)
    ));
    implicitVisits.forEach(visit => {
      const activityType = visit.visitType === 'initial' ? 'initial_visit' : 'follow_up_visit';
      const hasVisit = patient.activityLog?.some(activity => (
        activity.type === activityType
        && getLocalDateKeyFromTimestamp(activity.occurredAt) === visit.date
      ));
      if (hasVisit) return;
      patient.activityLog?.push({
        id: `activity_${sanitizeIdPart(patient.id)}_visit_${sanitizeIdPart(visit.appointmentId)}`,
        type: activityType,
        occurredAt: visit.occurredAt,
        label: visit.visitType === 'initial' ? '初诊接诊' : '复诊接诊'
      });
    });
    patient.activityLog?.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  });

  return data;
};

// 导入、恢复和云同步写入前必须先校验，避免坏数据覆盖本机可用数据。
export const validateClinicData = (data: ClinicData): { valid: true } | { valid: false; message: string } => {
  if (!data || typeof data !== 'object') return { valid: false, message: '导入数据不是有效对象。' };
  if (!data.patients || typeof data.patients !== 'object' || Array.isArray(data.patients)) {
    return { valid: false, message: '患者列表格式不正确，应为对象结构。' };
  }
  if (!data.appointments || typeof data.appointments !== 'object' || Array.isArray(data.appointments)) {
    return { valid: false, message: '预约列表格式不正确，应按日期分组保存。' };
  }
  if (
    data.appointmentDeletionTombstones !== undefined
    && (
      typeof data.appointmentDeletionTombstones !== 'object'
      || Array.isArray(data.appointmentDeletionTombstones)
      || Object.entries(data.appointmentDeletionTombstones).some(([id, deletedAt]) => !id.trim() || typeof deletedAt !== 'string' || !deletedAt.trim())
    )
  ) {
    return { valid: false, message: '预约删除记录格式不正确。' };
  }

  for (const [patientId, patient] of Object.entries(data.patients)) {
    if (!patient.id || patient.id !== patientId) return { valid: false, message: `患者 ${patientId} 缺少有效 id。` };
    if (typeof patient.name !== 'string' || !patient.name.trim()) return { valid: false, message: `患者 ${patientId} 缺少姓名。` };
    if (typeof patient.phone !== 'string') return { valid: false, message: `患者 ${patient.name} 的电话字段类型不正确。` };
    if (!Array.isArray(patient.treatments)) return { valid: false, message: `患者 ${patient.name} 的处置记录格式不正确。` };
    if (!Array.isArray(patient.appointments)) return { valid: false, message: `患者 ${patient.name} 的预约历史格式不正确。` };
    if (!Array.isArray(patient.activityLog)) return { valid: false, message: `患者 ${patient.name} 的更新记录格式不正确。` };
    for (const activity of patient.activityLog) {
      if (typeof activity.id !== 'string' || !activity.id.trim()) return { valid: false, message: `患者 ${patient.name} 存在缺少 id 的更新记录。` };
      if (!PATIENT_ACTIVITY_TYPES.has(activity.type)) return { valid: false, message: `患者 ${patient.name} 存在未知的更新记录类型。` };
      if (typeof activity.occurredAt !== 'string' || !activity.occurredAt.trim()) return { valid: false, message: `患者 ${patient.name} 存在缺少时间的更新记录。` };
      if (typeof activity.label !== 'string' || !activity.label.trim()) return { valid: false, message: `患者 ${patient.name} 存在缺少说明的更新记录。` };
    }
    for (const treatment of patient.treatments) {
      if (typeof treatment.id !== 'string' || !treatment.id) return { valid: false, message: `患者 ${patient.name} 存在缺少 id 的处置记录。` };
      if (typeof treatment.date !== 'string' || !treatment.date) return { valid: false, message: `患者 ${patient.name} 存在缺少日期的处置记录。` };
      if (typeof treatment.item !== 'string') return { valid: false, message: `患者 ${patient.name} 的处置项目字段类型不正确。` };
      if (typeof treatment.price !== 'number') return { valid: false, message: `患者 ${patient.name} 的处置价格字段类型不正确。` };
      if (typeof treatment.teeth !== 'string') return { valid: false, message: `患者 ${patient.name} 的牙位字段类型不正确。` };
      if (!Array.isArray(treatment.changeLogs)) return { valid: false, message: `患者 ${patient.name} 的处置修改日志格式不正确。` };
      const treatmentLogIds = new Set<string>();
      for (const log of treatment.changeLogs) {
        if (typeof log.id !== 'string' || !log.id.trim()) return { valid: false, message: `处置 ${treatment.id} 存在缺少 id 的修改日志。` };
        if (treatmentLogIds.has(log.id)) return { valid: false, message: `处置 ${treatment.id} 的修改日志 id 重复：${log.id}` };
        treatmentLogIds.add(log.id);
        if (typeof log.changedAt !== 'string' || !log.changedAt.trim()) return { valid: false, message: `处置 ${treatment.id} 存在缺少修改时间的日志。` };
        if (!Array.isArray(log.changedFields) || log.changedFields.some(field => typeof field !== 'string')) {
          return { valid: false, message: `处置 ${treatment.id} 的修改字段列表格式不正确。` };
        }
        if (!log.before || typeof log.before !== 'object' || Array.isArray(log.before)) return { valid: false, message: `处置 ${treatment.id} 的修改前数据格式不正确。` };
        if (!log.after || typeof log.after !== 'object' || Array.isArray(log.after)) return { valid: false, message: `处置 ${treatment.id} 的修改后数据格式不正确。` };
      }
    }
  }

  const appointmentIds = new Set<string>();
  for (const [dateKey, appts] of Object.entries(data.appointments)) {
    if (!Array.isArray(appts)) return { valid: false, message: `${dateKey} 的预约列表格式不正确。` };
    for (const appt of appts) {
      if (typeof appt.id !== 'string' || !appt.id.trim()) return { valid: false, message: `${dateKey} 存在缺少 id 的预约。` };
      if (appointmentIds.has(appt.id)) return { valid: false, message: `预约 id 重复：${appt.id}` };
      appointmentIds.add(appt.id);
      if (typeof appt.date !== 'string' || !appt.date) return { valid: false, message: `预约 ${appt.id} 缺少日期。` };
      if (typeof appt.time !== 'string' || !appt.time) return { valid: false, message: `预约 ${appt.id} 缺少时间。` };
      if (typeof appt.patientId !== 'string' || !data.patients[appt.patientId]) return { valid: false, message: `预约 ${appt.id} 关联的患者不存在。` };
      if (!['pending', 'arrived', 'completed', 'cancelled'].includes(appt.status)) return { valid: false, message: `预约 ${appt.id} 的状态不合法。` };
      if (!Number.isFinite(appt.durationMinutes) || appt.durationMinutes < 15) return { valid: false, message: `预约 ${appt.id} 的时长不合法。` };
      if (!['appointment', 'walk_in'].includes(appt.source)) return { valid: false, message: `预约 ${appt.id} 的来源不合法。` };
      if (appt.visitType && !['initial', 'follow_up'].includes(appt.visitType)) return { valid: false, message: `预约 ${appt.id} 的接诊类型不合法。` };
      if (!Array.isArray(appt.plannedTreatments)) return { valid: false, message: `预约 ${appt.id} 的处置计划格式不正确。` };
    }
  }

  return { valid: true };
};
