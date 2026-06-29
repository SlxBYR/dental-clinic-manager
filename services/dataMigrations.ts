import { DEFAULT_CATALOG, DATA_VERSION } from '../constants';
import { Appointment, AppointmentStatus, ClinicData, GlobalAppointment, Patient, TreatmentRecord } from '../types';

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

export const createAppointmentId = (date: string, time: string, patientId: string, suffix = Date.now().toString(36)) => (
  `appt_${sanitizeIdPart(date)}_${sanitizeIdPart(time)}_${sanitizeIdPart(patientId)}_${suffix}`
);

export const normalizeAppointmentStatus = (status: unknown): AppointmentStatus => {
  if (status === 'completed' || status === 'cancelled' || status === 'pending') return status;
  return 'pending';
};

const normalizeTreatment = (record: any, index: number): TreatmentRecord => ({
  id: typeof record?.id === 'string' && record.id.trim() ? record.id : `treatment_${Date.now()}_${index}`,
  date: typeof record?.date === 'string' && record.date.trim() ? record.date : new Date().toISOString().slice(0, 10),
  createdAt: typeof record?.createdAt === 'string' ? record.createdAt : undefined,
  categoryId: typeof record?.categoryId === 'string' ? record.categoryId : undefined,
  itemId: typeof record?.itemId === 'string' ? record.itemId : undefined,
  item: typeof record?.item === 'string' ? record.item : '未命名处置',
  price: typeof record?.price === 'number' ? record.price : Number(record?.price) || 0,
  teeth: typeof record?.teeth === 'string' ? record.teeth : '',
  note: typeof record?.note === 'string' ? record.note : ''
});

const makePatientAppointment = (appt: GlobalAppointment, createdAt?: string): Appointment => ({
  id: appt.id,
  datetime: `${appt.date} ${appt.time}`,
  created_at: createdAt || new Date().toISOString().slice(0, 16).replace('T', ' '),
  status: appt.status
});

export const migrateClinicData = (raw: any): ClinicData => {
  const data: ClinicData = {
    version: DATA_VERSION,
    dataVersion: DATA_VERSION,
    clinicName: typeof raw?.clinicName === 'string' && raw.clinicName.trim() ? raw.clinicName : 'DentalClinic',
    catalog: Array.isArray(raw?.catalog) ? raw.catalog : DEFAULT_CATALOG,
    patients: {},
    appointments: {}
  };

  const phoneToIds = new Map<string, string[]>();
  const legacyPatientIdMap = new Map<string, string>();
  const legacyAppointmentsByPatientId = new Map<string, any[]>();
  const oldPatients = raw?.patients && typeof raw.patients === 'object' ? raw.patients : {};

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
      patientGroupId,
      name,
      phone,
      gender: typeof oldPatient.gender === 'string' ? oldPatient.gender : '男',
      age: oldPatient.age !== undefined ? String(oldPatient.age) : '',
      treatments: Array.isArray(oldPatient.treatments) ? oldPatient.treatments.map(normalizeTreatment) : [],
      appointments: []
    };

    legacyPatientIdMap.set(oldKey, id);
    if (oldPatient.id) legacyPatientIdMap.set(oldPatient.id, id);
    legacyAppointmentsByPatientId.set(id, Array.isArray(oldPatient.appointments) ? oldPatient.appointments : []);
    if (phone) phoneToIds.set(phone, [...(phoneToIds.get(phone) || []), id]);
  });

  const usedAppointmentIds = new Set<string>();
  const oldAppointments = raw?.appointments && typeof raw.appointments === 'object' ? raw.appointments : {};

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
        usedAppointmentIds.add(id);

        return {
          ...appt,
          id,
          date,
          time,
          patientId,
          phone: patient.phone,
          name: patient.name,
          status: normalizeAppointmentStatus(appt?.status)
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

  Object.values(data.patients).forEach(patient => {
    const snapshotsById = new Map(patient.appointments.map(appt => [appt.id, appt]));
    const legacySnapshots = legacyAppointmentsByPatientId.get(patient.id) || [];
    legacySnapshots.forEach((item: any, index: number) => {
      if (typeof item?.datetime !== 'string') return;
      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id
        : `legacy_${sanitizeIdPart(patient.id)}_${sanitizeIdPart(item.datetime)}_${index}`;
      if (!snapshotsById.has(id)) {
        snapshotsById.set(id, {
          id,
          datetime: item.datetime,
          created_at: typeof item.created_at === 'string' ? item.created_at : '',
          status: normalizeAppointmentStatus(item.status)
        });
      }
    });
    patient.appointments = Array.from(snapshotsById.values()).sort((a, b) => b.datetime.localeCompare(a.datetime));
  });

  return data;
};

export const validateClinicData = (data: ClinicData): { valid: true } | { valid: false; message: string } => {
  if (!data || typeof data !== 'object') return { valid: false, message: '导入数据不是有效对象。' };
  if (!data.patients || typeof data.patients !== 'object' || Array.isArray(data.patients)) {
    return { valid: false, message: '患者列表格式不正确，应为对象结构。' };
  }
  if (!data.appointments || typeof data.appointments !== 'object' || Array.isArray(data.appointments)) {
    return { valid: false, message: '预约列表格式不正确，应按日期分组保存。' };
  }

  for (const [patientId, patient] of Object.entries(data.patients)) {
    if (!patient.id || patient.id !== patientId) return { valid: false, message: `患者 ${patientId} 缺少有效 id。` };
    if (typeof patient.name !== 'string' || !patient.name.trim()) return { valid: false, message: `患者 ${patientId} 缺少姓名。` };
    if (typeof patient.phone !== 'string') return { valid: false, message: `患者 ${patient.name} 的电话字段类型不正确。` };
    if (!Array.isArray(patient.treatments)) return { valid: false, message: `患者 ${patient.name} 的处置记录格式不正确。` };
    if (!Array.isArray(patient.appointments)) return { valid: false, message: `患者 ${patient.name} 的预约历史格式不正确。` };
    for (const treatment of patient.treatments) {
      if (typeof treatment.id !== 'string' || !treatment.id) return { valid: false, message: `患者 ${patient.name} 存在缺少 id 的处置记录。` };
      if (typeof treatment.date !== 'string' || !treatment.date) return { valid: false, message: `患者 ${patient.name} 存在缺少日期的处置记录。` };
      if (typeof treatment.item !== 'string') return { valid: false, message: `患者 ${patient.name} 的处置项目字段类型不正确。` };
      if (typeof treatment.price !== 'number') return { valid: false, message: `患者 ${patient.name} 的处置价格字段类型不正确。` };
      if (typeof treatment.teeth !== 'string') return { valid: false, message: `患者 ${patient.name} 的牙位字段类型不正确。` };
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
      if (!['pending', 'completed', 'cancelled'].includes(appt.status)) return { valid: false, message: `预约 ${appt.id} 的状态不合法。` };
    }
  }

  return { valid: true };
};
