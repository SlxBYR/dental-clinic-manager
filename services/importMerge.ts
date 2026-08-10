import type {
  Appointment,
  ClinicData,
  GlobalAppointment,
  ImportConflictPreview,
  ImportConflictResolution,
  ImportPreviewMetric,
  Patient,
  PatientActivity,
  PlannedTreatment,
  TreatmentCategory,
  TreatmentChangeLog,
  TreatmentItem,
  TreatmentRecord
} from '../types.ts';

type MetricKey =
  | 'patients'
  | 'treatments'
  | 'treatmentLogs'
  | 'activities'
  | 'appointments'
  | 'plannedTreatments'
  | 'catalogCategories'
  | 'catalogItems';

type MergeMeta = {
  metricKey?: MetricKey;
  entityType: string;
  entityId: string;
  label: string;
  fieldLabels?: Record<string, string>;
  incomingDeletionExplicit?: boolean;
  localDeletionExplicit?: boolean;
};

type MergeContext = {
  resolution: ImportConflictResolution;
  hasBase: boolean;
  conflicts: ImportConflictPreview[];
  metrics: Record<MetricKey, ImportPreviewMetric>;
};

export interface ClinicImportMergeResult {
  data: ClinicData;
  conflicts: ImportConflictPreview[];
  metrics: ImportPreviewMetric[];
}

const METRIC_LABELS: Record<MetricKey, string> = {
  patients: '患者档案',
  treatments: '处置记录',
  treatmentLogs: '处置修改记录',
  activities: '患者更新记录',
  appointments: '预约记录',
  plannedTreatments: '预约处置计划',
  catalogCategories: '处置分类',
  catalogItems: '目录项目'
};

const FIELD_LABELS: Record<string, string> = {
  value: '名称',
  name: '姓名或名称',
  phone: '电话',
  gender: '性别',
  age: '年龄',
  social: '备注资料',
  patientGroupId: '患者分组',
  createdAt: '创建时间',
  date: '日期',
  time: '时间',
  datetime: '日期时间',
  created_at: '创建时间',
  status: '状态',
  visitType: '就诊类型',
  checkedInAt: '接诊时间',
  durationMinutes: '预约时长',
  source: '预约来源',
  patientId: '患者',
  categoryId: '处置分类',
  itemId: '目录项目',
  item: '处置项目',
  itemName: '处置项目',
  price: '价格',
  teeth: '牙位',
  note: '备注',
  changedAt: '修改时间',
  changedFields: '修改字段',
  before: '修改前内容',
  after: '修改后内容',
  label: '说明',
  type: '记录类型',
  appointmentId: '来源预约',
  plannedTreatmentId: '来源计划'
};

const cloneValue = <T>(value: T): T => {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const fieldValue = (value as Record<string, unknown>)[key];
      if (fieldValue !== undefined) result[key] = canonicalize(fieldValue);
      return result;
    }, {});
};

export const isImportValueEqual = (left: unknown, right: unknown) => (
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
);

export const createImportFingerprint = (value: unknown) => {
  const serialized = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${serialized.length.toString(36)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const getOrderedKeys = <T>(...maps: Array<Map<string, T>>) => {
  const keys = new Set<string>();
  maps.forEach(map => map.forEach((_, key) => keys.add(key)));
  return Array.from(keys);
};

const mapById = <T>(items: T[], getId: (item: T) => string) => (
  new Map(items.map(item => [getId(item), item]))
);

const flattenAppointments = (data: ClinicData) => Object.values(data.appointments).flat();

const countMetricItems = (data: ClinicData): Record<MetricKey, number> => {
  const patients = Object.values(data.patients);
  const treatments = patients.flatMap(patient => patient.treatments);
  const appointments = flattenAppointments(data);
  return {
    patients: patients.length,
    treatments: treatments.length,
    treatmentLogs: treatments.reduce((total, treatment) => total + treatment.changeLogs.length, 0),
    activities: patients.reduce((total, patient) => total + (patient.activityLog || []).length, 0),
    appointments: appointments.length,
    plannedTreatments: appointments.reduce((total, appointment) => total + appointment.plannedTreatments.length, 0),
    catalogCategories: data.catalog.length,
    catalogItems: data.catalog.reduce((total, category) => total + category.items.length, 0)
  };
};

const createMetrics = (local: ClinicData, incoming: ClinicData): Record<MetricKey, ImportPreviewMetric> => {
  const currentCounts = countMetricItems(local);
  const incomingCounts = countMetricItems(incoming);
  return (Object.keys(METRIC_LABELS) as MetricKey[]).reduce<Record<MetricKey, ImportPreviewMetric>>((result, key) => {
    result[key] = {
      key,
      label: METRIC_LABELS[key],
      current: currentCounts[key],
      incoming: incomingCounts[key],
      added: 0,
      updated: 0,
      removed: 0,
      conflicts: 0
    };
    return result;
  }, {} as Record<MetricKey, ImportPreviewMetric>);
};

const trackOutcome = (
  context: MergeContext,
  meta: MergeMeta,
  local: unknown,
  merged: unknown,
  hasConflict: boolean
) => {
  if (!meta.metricKey) return;
  const metric = context.metrics[meta.metricKey];
  if (hasConflict) {
    metric.conflicts += 1;
    return;
  }
  if (isImportValueEqual(local, merged)) return;
  if (local === undefined && merged !== undefined) metric.added += 1;
  else if (local !== undefined && merged === undefined) metric.removed += 1;
  else metric.updated += 1;
};

const addConflict = (
  context: MergeContext,
  meta: MergeMeta,
  fields: string[],
  reason: string
) => {
  context.conflicts.push({
    entityType: meta.entityType,
    entityId: meta.entityId,
    label: meta.label,
    fields,
    reason
  });
};

const chooseConflictValue = <T>(
  context: MergeContext,
  local: T | undefined,
  incoming: T | undefined
) => cloneValue(context.resolution === 'incoming' ? incoming : local);

const mergeRecord = <T extends object>(
  base: T | undefined,
  local: T | undefined,
  incoming: T | undefined,
  context: MergeContext,
  meta: MergeMeta
): T | undefined => {
  if (isImportValueEqual(local, incoming)) return cloneValue(local);

  // 导入文件是完整快照，但患者、处置和目录没有删除标记。文件中缺失的记录默认保留本机版本，
  // 只有预约删除墓碑才能把“缺失”解释为明确删除。
  if (incoming === undefined && local !== undefined && !meta.incomingDeletionExplicit) {
    return cloneValue(local);
  }

  if (base === undefined) {
    if (local === undefined && incoming !== undefined && meta.localDeletionExplicit) {
      const merged = chooseConflictValue(context, local, incoming);
      addConflict(context, meta, ['整条记录'], '本机已明确删除该记录，但导入文件包含同一记录');
      trackOutcome(context, meta, local, merged, true);
      return merged;
    }
    if (local === undefined) {
      const merged = cloneValue(incoming);
      trackOutcome(context, meta, local, merged, false);
      return merged;
    }
    if (incoming === undefined) {
      if (meta.incomingDeletionExplicit) {
        const merged = chooseConflictValue(context, local, incoming);
        addConflict(context, meta, ['整条记录'], '本机新增了该记录，但导入文件包含删除标记');
        trackOutcome(context, meta, local, merged, true);
        return merged;
      }
      return cloneValue(local);
    }
  } else if (local === undefined || incoming === undefined) {
    if (local === undefined && incoming !== undefined) {
      if (isImportValueEqual(incoming, base)) return undefined;
      const merged = chooseConflictValue(context, local, incoming);
      addConflict(context, meta, ['整条记录'], '本机已删除该记录，导入文件同时修改了它');
      trackOutcome(context, meta, local, merged, true);
      return merged;
    }
    if (incoming === undefined && local !== undefined && meta.incomingDeletionExplicit) {
      if (isImportValueEqual(local, base)) {
        trackOutcome(context, meta, local, undefined, false);
        return undefined;
      }
      const merged = chooseConflictValue(context, local, incoming);
      addConflict(context, meta, ['整条记录'], '导入文件已删除该记录，本机同时修改了它');
      trackOutcome(context, meta, local, merged, true);
      return merged;
    }
    return cloneValue(local);
  }

  if (!local || !incoming) return cloneValue(local || incoming);

  const merged: Record<string, unknown> = {};
  const conflictFields: string[] = [];
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local),
    ...Object.keys(incoming)
  ]);

  keys.forEach(key => {
    const baseValue = (base as Record<string, unknown> | undefined)?.[key];
    const localValue = (local as Record<string, unknown>)[key];
    const incomingValue = (incoming as Record<string, unknown>)[key];
    let value: unknown;
    if (isImportValueEqual(localValue, incomingValue)) value = localValue;
    else if (isImportValueEqual(localValue, baseValue)) value = incomingValue;
    else if (isImportValueEqual(incomingValue, baseValue)) value = localValue;
    else {
      value = context.resolution === 'incoming' ? incomingValue : localValue;
      conflictFields.push(meta.fieldLabels?.[key] || FIELD_LABELS[key] || key);
    }
    if (value !== undefined) merged[key] = cloneValue(value);
  });

  if (conflictFields.length > 0) {
    addConflict(
      context,
      meta,
      Array.from(new Set(conflictFields)),
      context.hasBase
        ? '本机和导入文件相对上一份快照修改了相同字段'
        : '首次增量导入时，同一 ID 在本机和导入文件中的内容不同'
    );
  }
  trackOutcome(context, meta, local, merged, conflictFields.length > 0);
  return merged as T;
};

type PatientProfile = Omit<Patient, 'treatments' | 'appointments' | 'activityLog'>;
type TreatmentCore = Omit<TreatmentRecord, 'changeLogs'>;
type AppointmentCore = Omit<GlobalAppointment, 'plannedTreatments' | 'name' | 'phone'>;
type CategoryCore = Omit<TreatmentCategory, 'items'>;

const getPatientProfile = (patient?: Patient): PatientProfile | undefined => {
  if (!patient) return undefined;
  const { treatments: _treatments, appointments: _appointments, activityLog: _activityLog, ...profile } = patient;
  return profile;
};

const getTreatmentCore = (treatment?: TreatmentRecord): TreatmentCore | undefined => {
  if (!treatment) return undefined;
  const { changeLogs: _changeLogs, ...core } = treatment;
  return core;
};

const getAppointmentCore = (appointment?: GlobalAppointment): AppointmentCore | undefined => {
  if (!appointment) return undefined;
  const { plannedTreatments: _plannedTreatments, name: _name, phone: _phone, ...core } = appointment;
  return core;
};

const getCategoryCore = (category?: TreatmentCategory): CategoryCore | undefined => {
  if (!category) return undefined;
  const { items: _items, ...core } = category;
  return core;
};

const mergeSimpleMap = <T extends object>(
  baseItems: T[],
  localItems: T[],
  incomingItems: T[],
  getId: (item: T) => string,
  context: MergeContext,
  getMeta: (id: string, base?: T, local?: T, incoming?: T) => MergeMeta
) => {
  const baseMap = mapById(baseItems, getId);
  const localMap = mapById(localItems, getId);
  const incomingMap = mapById(incomingItems, getId);
  return getOrderedKeys(localMap, incomingMap, baseMap)
    .map(id => mergeRecord(baseMap.get(id), localMap.get(id), incomingMap.get(id), context, getMeta(
      id,
      baseMap.get(id),
      localMap.get(id),
      incomingMap.get(id)
    )))
    .filter((item): item is T => Boolean(item));
};

const mergeTreatment = (
  patientId: string,
  base: TreatmentRecord | undefined,
  local: TreatmentRecord | undefined,
  incoming: TreatmentRecord | undefined,
  context: MergeContext
): TreatmentRecord | undefined => {
  const meta: MergeMeta = {
    metricKey: 'treatments',
    entityType: '处置记录',
    entityId: `${patientId}:${local?.id || incoming?.id || base?.id || ''}`,
    label: local?.item || incoming?.item || base?.item || '未命名处置'
  };
  if (base && (!local || !incoming)) {
    return mergeRecord(base as unknown as Record<string, unknown>, local as unknown as Record<string, unknown> | undefined, incoming as unknown as Record<string, unknown> | undefined, context, meta) as unknown as TreatmentRecord | undefined;
  }
  const core = mergeRecord(
    getTreatmentCore(base) as unknown as Record<string, unknown> | undefined,
    getTreatmentCore(local) as unknown as Record<string, unknown> | undefined,
    getTreatmentCore(incoming) as unknown as Record<string, unknown> | undefined,
    context,
    meta
  ) as unknown as TreatmentCore | undefined;
  if (!core) return undefined;
  const logs = mergeSimpleMap<TreatmentChangeLog>(
    base?.changeLogs || [],
    local?.changeLogs || [],
    incoming?.changeLogs || [],
    log => log.id,
    context,
    (id, baseLog, localLog, incomingLog) => ({
      metricKey: 'treatmentLogs',
      entityType: '处置修改记录',
      entityId: `${patientId}:${core.id}:${id}`,
      label: `${core.item} · ${localLog?.changedAt || incomingLog?.changedAt || baseLog?.changedAt || id}`
    })
  );
  return { ...core, changeLogs: logs };
};

const mergeTreatments = (
  patientId: string,
  base: TreatmentRecord[],
  local: TreatmentRecord[],
  incoming: TreatmentRecord[],
  context: MergeContext
) => {
  const baseMap = mapById(base, item => item.id);
  const localMap = mapById(local, item => item.id);
  const incomingMap = mapById(incoming, item => item.id);
  return getOrderedKeys(localMap, incomingMap, baseMap)
    .map(id => mergeTreatment(patientId, baseMap.get(id), localMap.get(id), incomingMap.get(id), context))
    .filter((item): item is TreatmentRecord => Boolean(item));
};

const mergePatient = (
  id: string,
  base: Patient | undefined,
  local: Patient | undefined,
  incoming: Patient | undefined,
  context: MergeContext,
  activeAppointmentIds: Set<string>
): Patient | undefined => {
  const meta: MergeMeta = {
    metricKey: 'patients',
    entityType: '患者档案',
    entityId: id,
    label: local?.name || incoming?.name || base?.name || id
  };

  // 一侧删除整位患者时，要用包含子记录的完整患者判断是否为“删除对修改”冲突。
  if (base && (!local || !incoming)) {
    return mergeRecord(base as unknown as Record<string, unknown>, local as unknown as Record<string, unknown> | undefined, incoming as unknown as Record<string, unknown> | undefined, context, meta) as unknown as Patient | undefined;
  }

  const profile = mergeRecord(
    getPatientProfile(base) as unknown as Record<string, unknown> | undefined,
    getPatientProfile(local) as unknown as Record<string, unknown> | undefined,
    getPatientProfile(incoming) as unknown as Record<string, unknown> | undefined,
    context,
    meta
  ) as unknown as PatientProfile | undefined;
  if (!profile) return undefined;

  const treatments = mergeTreatments(id, base?.treatments || [], local?.treatments || [], incoming?.treatments || [], context);
  const activityLog = mergeSimpleMap<PatientActivity>(
    base?.activityLog || [],
    local?.activityLog || [],
    incoming?.activityLog || [],
    activity => activity.id,
    context,
    (activityId, baseActivity, localActivity, incomingActivity) => ({
      metricKey: 'activities',
      entityType: '患者更新记录',
      entityId: `${id}:${activityId}`,
      label: localActivity?.label || incomingActivity?.label || baseActivity?.label || activityId
    })
  ).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  // 全局预约表是事实来源。这里只并集保留不再存在于全局表中的旧历史快照；
  // 当前预约的患者快照会在合并全局预约后统一重建。
  const legacySnapshots = [
    ...(local?.appointments || []),
    ...(incoming?.appointments || []),
    ...(base?.appointments || [])
  ].reduce<Map<string, Appointment>>((result, snapshot) => {
    if (!activeAppointmentIds.has(snapshot.id) && !result.has(snapshot.id)) result.set(snapshot.id, cloneValue(snapshot));
    return result;
  }, new Map());

  return {
    ...profile,
    treatments,
    appointments: Array.from(legacySnapshots.values()).sort((left, right) => right.datetime.localeCompare(left.datetime)),
    activityLog
  };
};

const mergeAppointment = (
  id: string,
  base: GlobalAppointment | undefined,
  local: GlobalAppointment | undefined,
  incoming: GlobalAppointment | undefined,
  context: MergeContext,
  localTombstones: Record<string, string>,
  incomingTombstones: Record<string, string>
): GlobalAppointment | undefined => {
  const meta: MergeMeta = {
    metricKey: 'appointments',
    entityType: '预约记录',
    entityId: id,
    label: `${local?.name || incoming?.name || base?.name || '未知患者'} · ${local?.date || incoming?.date || base?.date || ''} ${local?.time || incoming?.time || base?.time || ''}`.trim(),
    localDeletionExplicit: Boolean(localTombstones[id]),
    incomingDeletionExplicit: Boolean(incomingTombstones[id])
  };
  if (base && (!local || !incoming)) {
    return mergeRecord(base as unknown as Record<string, unknown>, local as unknown as Record<string, unknown> | undefined, incoming as unknown as Record<string, unknown> | undefined, context, meta) as unknown as GlobalAppointment | undefined;
  }
  const core = mergeRecord(
    getAppointmentCore(base) as unknown as Record<string, unknown> | undefined,
    getAppointmentCore(local) as unknown as Record<string, unknown> | undefined,
    getAppointmentCore(incoming) as unknown as Record<string, unknown> | undefined,
    context,
    meta
  ) as unknown as AppointmentCore | undefined;
  if (!core) return undefined;
  const plannedTreatments = mergeSimpleMap<PlannedTreatment>(
    base?.plannedTreatments || [],
    local?.plannedTreatments || [],
    incoming?.plannedTreatments || [],
    plan => plan.id,
    context,
    (planId, basePlan, localPlan, incomingPlan) => ({
      metricKey: 'plannedTreatments',
      entityType: '预约处置计划',
      entityId: `${id}:${planId}`,
      label: localPlan?.itemName || incomingPlan?.itemName || basePlan?.itemName || planId
    })
  );
  return {
    ...core,
    name: local?.name || incoming?.name || base?.name || '',
    phone: local?.phone || incoming?.phone || base?.phone || '',
    plannedTreatments
  };
};

const mergeCategory = (
  id: string,
  base: TreatmentCategory | undefined,
  local: TreatmentCategory | undefined,
  incoming: TreatmentCategory | undefined,
  context: MergeContext
): TreatmentCategory | undefined => {
  const meta: MergeMeta = {
    metricKey: 'catalogCategories',
    entityType: '处置分类',
    entityId: id,
    label: local?.name || incoming?.name || base?.name || id
  };
  if (base && (!local || !incoming)) {
    return mergeRecord(base as unknown as Record<string, unknown>, local as unknown as Record<string, unknown> | undefined, incoming as unknown as Record<string, unknown> | undefined, context, meta) as unknown as TreatmentCategory | undefined;
  }
  const core = mergeRecord(
    getCategoryCore(base) as unknown as Record<string, unknown> | undefined,
    getCategoryCore(local) as unknown as Record<string, unknown> | undefined,
    getCategoryCore(incoming) as unknown as Record<string, unknown> | undefined,
    context,
    meta
  ) as unknown as CategoryCore | undefined;
  if (!core) return undefined;
  const items = mergeSimpleMap<TreatmentItem>(
    base?.items || [],
    local?.items || [],
    incoming?.items || [],
    item => item.id,
    context,
    (itemId, baseItem, localItem, incomingItem) => ({
      metricKey: 'catalogItems',
      entityType: '目录项目',
      entityId: `${id}:${itemId}`,
      label: localItem?.name || incomingItem?.name || baseItem?.name || itemId
    })
  );
  return { ...core, items };
};

const getSnapshotByAppointmentId = (...datasets: ClinicData[]) => {
  const snapshots = new Map<string, Appointment>();
  datasets.forEach(data => Object.values(data.patients).forEach(patient => {
    patient.appointments.forEach(snapshot => {
      if (!snapshots.has(snapshot.id)) snapshots.set(snapshot.id, snapshot);
    });
  }));
  return snapshots;
};

const maxDeletedAt = (...values: Array<string | undefined>) => (
  values.filter((value): value is string => Boolean(value)).sort().at(-1)
);

const appointmentTimeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const staysWithinAppointmentCapacity = (appointments: GlobalAppointment[]) => {
  const events = appointments
    .filter(appointment => appointment.status !== 'cancelled')
    .flatMap(appointment => {
      const start = appointmentTimeToMinutes(appointment.time);
      return [
        { minute: start, delta: 1 },
        { minute: start + appointment.durationMinutes, delta: -1 }
      ];
    })
    .sort((left, right) => left.minute - right.minute || left.delta - right.delta);
  let concurrent = 0;
  return events.every(event => {
    concurrent += event.delta;
    return concurrent <= 3;
  });
};

const applyAppointmentCapacity = (
  appointments: GlobalAppointment[],
  preferredIds: Set<string>,
  context: MergeContext
) => {
  const selected: GlobalAppointment[] = [];
  [...appointments]
    .sort((left, right) => {
      const preference = Number(preferredIds.has(right.id)) - Number(preferredIds.has(left.id));
      return preference || left.date.localeCompare(right.date) || left.time.localeCompare(right.time) || left.id.localeCompare(right.id);
    })
    .forEach(appointment => {
      const sameDay = selected.filter(item => item.date === appointment.date);
      if (staysWithinAppointmentCapacity([...sameDay, appointment])) {
        selected.push(appointment);
        return;
      }
      context.metrics.appointments.conflicts += 1;
      addConflict(
        context,
        {
          entityType: '预约容量',
          entityId: appointment.id,
          label: `${appointment.name} · ${appointment.date} ${appointment.time}`
        },
        ['日期', '时间', '预约时长'],
        '两边预约合并后同一时段超过 3 个，已按冲突处理方式优先保留一侧预约'
      );
    });
  return selected;
};

export const mergeClinicDataForImport = (
  base: ClinicData | null,
  local: ClinicData,
  incoming: ClinicData,
  resolution: ImportConflictResolution,
  mergedAt = new Date().toISOString()
): ClinicImportMergeResult => {
  const context: MergeContext = {
    resolution,
    hasBase: Boolean(base),
    conflicts: [],
    metrics: createMetrics(local, incoming)
  };

  const clinicNameRecord = mergeRecord(
    base ? { value: base.clinicName || 'DentalClinic' } : undefined,
    { value: local.clinicName || 'DentalClinic' },
    { value: incoming.clinicName || 'DentalClinic' },
    context,
    { entityType: '诊所设置', entityId: 'clinicName', label: '诊所名称', fieldLabels: { value: '诊所名称' } }
  );

  const baseAppointments = mapById(base ? flattenAppointments(base) : [], appointment => appointment.id);
  const localAppointments = mapById(flattenAppointments(local), appointment => appointment.id);
  const incomingAppointments = mapById(flattenAppointments(incoming), appointment => appointment.id);
  const activeAppointmentIds = new Set(getOrderedKeys(localAppointments, incomingAppointments, baseAppointments));

  const basePatients = new Map(Object.entries(base?.patients || {}));
  const localPatients = new Map(Object.entries(local.patients));
  const incomingPatients = new Map(Object.entries(incoming.patients));
  const patients = getOrderedKeys(localPatients, incomingPatients, basePatients).reduce<Record<string, Patient>>((result, id) => {
    const patient = mergePatient(
      id,
      basePatients.get(id),
      localPatients.get(id),
      incomingPatients.get(id),
      context,
      activeAppointmentIds
    );
    if (patient) result[id] = patient;
    return result;
  }, {});

  const localTombstones = local.appointmentDeletionTombstones || {};
  const incomingTombstones = incoming.appointmentDeletionTombstones || {};
  const mergedAppointmentCandidates = getOrderedKeys(localAppointments, incomingAppointments, baseAppointments)
    .map(id => mergeAppointment(
      id,
      baseAppointments.get(id),
      localAppointments.get(id),
      incomingAppointments.get(id),
      context,
      localTombstones,
      incomingTombstones
    ))
    .filter((appointment): appointment is GlobalAppointment => Boolean(appointment))
    .filter(appointment => Boolean(patients[appointment.patientId]));

  const preferredAppointmentIds = new Set(
    Array.from(resolution === 'incoming' ? incomingAppointments.keys() : localAppointments.keys())
  );
  const mergedAppointments = applyAppointmentCapacity(mergedAppointmentCandidates, preferredAppointmentIds, context);

  mergedAppointments.forEach(appointment => {
    const patient = patients[appointment.patientId];
    appointment.name = patient.name;
    appointment.phone = patient.phone;
  });

  const appointments = mergedAppointments.reduce<Record<string, GlobalAppointment[]>>((result, appointment) => {
    result[appointment.date] ||= [];
    result[appointment.date].push(appointment);
    return result;
  }, {});
  Object.values(appointments).forEach(items => items.sort((left, right) => left.time.localeCompare(right.time)));

  const snapshotByAppointmentId = getSnapshotByAppointmentId(local, incoming, ...(base ? [base] : []));
  mergedAppointments.forEach(appointment => {
    const patient = patients[appointment.patientId];
    if (!patient) return;
    const previous = snapshotByAppointmentId.get(appointment.id);
    patient.appointments.push({
      id: appointment.id,
      datetime: `${appointment.date} ${appointment.time}`,
      created_at: previous?.created_at || mergedAt,
      status: appointment.status,
      visitType: appointment.visitType,
      checkedInAt: appointment.checkedInAt
    });
    patient.appointments.sort((left, right) => right.datetime.localeCompare(left.datetime));
  });

  const baseCategories = mapById(base?.catalog || [], category => category.id);
  const localCategories = mapById(local.catalog, category => category.id);
  const incomingCategories = mapById(incoming.catalog, category => category.id);
  const catalog = getOrderedKeys(localCategories, incomingCategories, baseCategories)
    .map(id => mergeCategory(id, baseCategories.get(id), localCategories.get(id), incomingCategories.get(id), context))
    .filter((category): category is TreatmentCategory => Boolean(category));

  const mergedAppointmentIds = new Set(mergedAppointments.map(appointment => appointment.id));
  const allTombstoneIds = new Set([
    ...Object.keys(base?.appointmentDeletionTombstones || {}),
    ...Object.keys(localTombstones),
    ...Object.keys(incomingTombstones)
  ]);
  const appointmentDeletionTombstones: Record<string, string> = {};
  allTombstoneIds.forEach(id => {
    if (mergedAppointmentIds.has(id)) return;
    appointmentDeletionTombstones[id] = maxDeletedAt(
      base?.appointmentDeletionTombstones?.[id],
      localTombstones[id],
      incomingTombstones[id]
    ) || mergedAt;
  });

  const data: ClinicData = {
    version: incoming.version || local.version,
    dataVersion: incoming.dataVersion || local.dataVersion,
    clinicName: typeof clinicNameRecord?.value === 'string' ? clinicNameRecord.value : local.clinicName,
    patients,
    appointments,
    appointmentDeletionTombstones,
    catalog
  };

  return {
    data,
    conflicts: context.conflicts,
    metrics: (Object.keys(METRIC_LABELS) as MetricKey[])
      .map(key => context.metrics[key])
      .filter(metric => metric.current > 0 || metric.incoming > 0 || metric.added > 0 || metric.updated > 0 || metric.removed > 0 || metric.conflicts > 0)
  };
};
