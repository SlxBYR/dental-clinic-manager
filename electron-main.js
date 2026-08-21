import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CLINIC_DATA_STORE_KEY = 'clinicData';
const SQLITE_SCHEMA_VERSION = '2';
const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';
const RETIRED_AI_STORE_KEYS = ['ragKnowledgeEntries', 'ragAiSettings', 'ragExternalSources'];
let tinyPinyin = null;

try {
  tinyPinyin = require('tiny-pinyin');
} catch (_) {
  tinyPinyin = null;
}

// Windows: 设置应用身份 ID，让系统和 NSIS 安装器正确识别进程
if (process.platform === 'win32') {
  app.setAppUserModelId('com.dental.clinic');
}

// 单实例锁：防止多开，同时让 NSIS 安装器能正确检测/关闭应用
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let sqliteDb = null;
let sqliteDbPath = '';
let sqliteInitError = '';

const asText = (value) => (value === undefined || value === null ? '' : String(value));
const isEncryptedValue = (value) => typeof value === 'string' && value.startsWith(ENCRYPTED_VALUE_PREFIX);

function encryptText(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法加密患者数据。');
  }
  return `${ENCRYPTED_VALUE_PREFIX}${safeStorage.encryptString(value).toString('base64')}`;
}

function decryptText(value) {
  if (!isEncryptedValue(value)) return value;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法解密患者数据。');
  }
  const encrypted = Buffer.from(value.slice(ENCRYPTED_VALUE_PREFIX.length), 'base64');
  return safeStorage.decryptString(encrypted);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildNameSearch(name) {
  const lowerName = asText(name).trim().toLowerCase();
  if (!lowerName || !tinyPinyin || typeof tinyPinyin.convertToPinyin !== 'function') {
    return { nameLower: lowerName, pinyinFull: '', pinyinCompact: '', pinyinInitials: '' };
  }

  try {
    const pinyinFull = tinyPinyin.convertToPinyin(lowerName, ' ', true).toLowerCase();
    const parts = pinyinFull.split(/\s+/).filter(Boolean);
    return {
      nameLower: lowerName,
      pinyinFull,
      pinyinCompact: parts.join(''),
      pinyinInitials: parts.map((part) => part[0] || '').join('')
    };
  } catch (_) {
    return { nameLower: lowerName, pinyinFull: '', pinyinCompact: '', pinyinInitials: '' };
  }
}

function getPatientLastChangedAt(patient) {
  const treatments = Array.isArray(patient?.treatments) ? patient.treatments : [];
  const appointments = Array.isArray(patient?.appointments) ? patient.appointments : [];
  const activities = Array.isArray(patient?.activityLog) ? patient.activityLog : [];
  const timestamps = [
    patient?.createdAt || patient?.created_at,
    ...activities.map((activity) => activity?.occurredAt),
    ...treatments.flatMap((treatment) => [
      treatment?.createdAt,
      ...(Array.isArray(treatment?.changeLogs) ? treatment.changeLogs.map((log) => log?.changedAt) : [])
    ]),
    ...appointments.flatMap((appointment) => [appointment?.created_at, appointment?.checkedInAt])
  ];
  const latest = timestamps.reduce((max, value) => {
    const timestamp = Date.parse(asText(value));
    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : '';
}

function getPatientLastUpdate(patient) {
  const lastChangedAt = getPatientLastChangedAt(patient);
  return lastChangedAt ? getLocalDateKeyFromTimestamp(lastChangedAt) : '0000-00-00';
}

function getPatientLastChangedTime(patient) {
  const timestamp = Date.parse(asText(patient?.lastChangedAt));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function comparePatientListItems(a, b) {
  if (a.isTodayVisit !== b.isTodayVisit) return a.isTodayVisit ? -1 : 1;
  if (a.isTodayVisit && b.isTodayVisit) {
    const visitSort = asText(b.lastVisitAt).localeCompare(asText(a.lastVisitAt));
    if (visitSort) return visitSort;
  }
  const changedSort = getPatientLastChangedTime(b) - getPatientLastChangedTime(a);
  return changedSort || b.lastUpdate.localeCompare(a.lastUpdate) || a.name.localeCompare(b.name);
}

function isAttendedAppointment(appointment) {
  return Boolean(appointment?.checkedInAt)
    && (appointment.status === 'arrived' || appointment.status === 'completed');
}

function getLocalDateKeyFromTimestamp(value) {
  const date = new Date(asText(value));
  if (!Number.isFinite(date.getTime())) return asText(value).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPatientVisitMetadata(appointments, patient, today) {
  const patientId = asText(patient?.id);
  const appointmentVisits = appointments
    .filter((appointment) => asText(appointment?.patientId) === patientId && isAttendedAppointment(appointment))
    .map((appointment) => ({
      occurredAt: asText(appointment?.checkedInAt),
      visitType: appointment?.visitType
    }));
  const activityVisits = (Array.isArray(patient?.activityLog) ? patient.activityLog : [])
    .filter((activity) => activity?.type === 'initial_visit' || activity?.type === 'follow_up_visit')
    .map((activity) => ({
      occurredAt: asText(activity?.occurredAt),
      visitType: activity?.type === 'initial_visit' ? 'initial' : 'follow_up'
    }));
  const visits = [...activityVisits, ...appointmentVisits]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const latest = visits[0];
  const todayVisit = visits.find((visit) => getLocalDateKeyFromTimestamp(visit.occurredAt) === today);
  return {
    isTodayVisit: Boolean(todayVisit),
    lastVisitAt: asText(latest?.occurredAt) || undefined,
    todayVisitType: todayVisit?.visitType
  };
}

function ensureSqliteSchema() {
  sqliteDb.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      created_at TEXT,
      patient_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT NOT NULL,
      age TEXT NOT NULL,
      social TEXT,
      last_update TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patient_search (
      patient_id TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
      name_lower TEXT NOT NULL,
      phone TEXT NOT NULL,
      pinyin_full TEXT NOT NULL,
      pinyin_compact TEXT NOT NULL,
      pinyin_initials TEXT NOT NULL,
      search_blob TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT,
      category_id TEXT,
      item_id TEXT,
      item TEXT NOT NULL,
      price REAL NOT NULL,
      teeth TEXT NOT NULL,
      note TEXT NOT NULL,
      appointment_id TEXT,
      planned_treatment_id TEXT,
      PRIMARY KEY (patient_id, id)
    );

    CREATE TABLE IF NOT EXISTS treatment_change_logs (
      id TEXT NOT NULL,
      treatment_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      changed_at TEXT NOT NULL,
      changed_fields_json TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      note TEXT,
      PRIMARY KEY (patient_id, treatment_id, id),
      FOREIGN KEY (patient_id, treatment_id) REFERENCES treatments(patient_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      source TEXT NOT NULL DEFAULT 'appointment',
      visit_type TEXT,
      checked_in_at TEXT,
      planned_treatments_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS patient_appointment_snapshots (
      id TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      datetime TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      visit_type TEXT,
      checked_in_at TEXT,
      PRIMARY KEY (patient_id, id)
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (category_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
    CREATE INDEX IF NOT EXISTS idx_patients_last_update ON patients(last_update DESC);
    CREATE INDEX IF NOT EXISTS idx_patient_search_name ON patient_search(name_lower);
    CREATE INDEX IF NOT EXISTS idx_patient_search_phone ON patient_search(phone);
    CREATE INDEX IF NOT EXISTS idx_patient_search_pinyin_full ON patient_search(pinyin_full);
    CREATE INDEX IF NOT EXISTS idx_patient_search_pinyin_compact ON patient_search(pinyin_compact);
    CREATE INDEX IF NOT EXISTS idx_patient_search_pinyin_initials ON patient_search(pinyin_initials);
    CREATE INDEX IF NOT EXISTS idx_treatments_patient_date ON treatments(patient_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(date, time);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
  `);

  const patientColumns = sqliteDb.prepare('PRAGMA table_info(patients)').all().map((column) => column.name);
  if (!patientColumns.includes('created_at')) {
    sqliteDb.exec('ALTER TABLE patients ADD COLUMN created_at TEXT');
  }
  const appointmentColumns = sqliteDb.prepare('PRAGMA table_info(appointments)').all().map((column) => column.name);
  if (!appointmentColumns.includes('duration_minutes')) sqliteDb.exec("ALTER TABLE appointments ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 30");
  if (!appointmentColumns.includes('source')) sqliteDb.exec("ALTER TABLE appointments ADD COLUMN source TEXT NOT NULL DEFAULT 'appointment'");
  if (!appointmentColumns.includes('visit_type')) sqliteDb.exec('ALTER TABLE appointments ADD COLUMN visit_type TEXT');
  if (!appointmentColumns.includes('checked_in_at')) sqliteDb.exec('ALTER TABLE appointments ADD COLUMN checked_in_at TEXT');
  if (!appointmentColumns.includes('planned_treatments_json')) sqliteDb.exec("ALTER TABLE appointments ADD COLUMN planned_treatments_json TEXT NOT NULL DEFAULT '[]'");
  const treatmentColumns = sqliteDb.prepare('PRAGMA table_info(treatments)').all().map((column) => column.name);
  if (!treatmentColumns.includes('appointment_id')) sqliteDb.exec('ALTER TABLE treatments ADD COLUMN appointment_id TEXT');
  if (!treatmentColumns.includes('planned_treatment_id')) sqliteDb.exec('ALTER TABLE treatments ADD COLUMN planned_treatment_id TEXT');
  const snapshotColumns = sqliteDb.prepare('PRAGMA table_info(patient_appointment_snapshots)').all().map((column) => column.name);
  if (!snapshotColumns.includes('visit_type')) sqliteDb.exec('ALTER TABLE patient_appointment_snapshots ADD COLUMN visit_type TEXT');
  if (!snapshotColumns.includes('checked_in_at')) sqliteDb.exec('ALTER TABLE patient_appointment_snapshots ADD COLUMN checked_in_at TEXT');
  sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at DESC);');
}

function setMeta(key, value) {
  sqliteDb.prepare(`
    INSERT INTO app_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(value), new Date().toISOString());
}

function hasNormalizedClinicData() {
  return sqliteDb.prepare('SELECT value FROM app_meta WHERE key = ?').get('normalizedReady')?.value === '1';
}

function clearNormalizedClinicData() {
  sqliteDb.exec(`
    DELETE FROM treatment_change_logs;
    DELETE FROM treatments;
    DELETE FROM appointments;
    DELETE FROM patient_appointment_snapshots;
    DELETE FROM patient_search;
    DELETE FROM patients;
    DELETE FROM catalog_items;
    DELETE FROM catalog_categories;
    DELETE FROM settings;
  `);
}

function replaceEncryptedClinicData(data, serialized) {
  const now = new Date().toISOString();
  const encrypted = encryptText(serialized);

  sqliteDb.exec('BEGIN IMMEDIATE');
  try {
    sqliteDb.prepare(`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(CLINIC_DATA_STORE_KEY, encrypted, now);

    clearNormalizedClinicData();
    sqliteDb.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('clinicName', asText(data?.clinicName || 'DentalClinic'), now);

    setMeta('schemaVersion', SQLITE_SCHEMA_VERSION);
    setMeta('dataVersion', asText(data?.dataVersion || data?.version || ''));
    setMeta('normalizedReady', '0');
    setMeta('encryptedAtRest', '1');
    sqliteDb.exec('COMMIT');
  } catch (error) {
    sqliteDb.exec('ROLLBACK');
    throw error;
  }
}

function readJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function buildClinicDataFromTables() {
  const clinicName = sqliteDb.prepare('SELECT value FROM settings WHERE key = ?').get('clinicName')?.value || 'DentalClinic';
  const dataVersion = Number(sqliteDb.prepare('SELECT value FROM app_meta WHERE key = ?').get('dataVersion')?.value) || undefined;
  const data = {
    version: dataVersion,
    dataVersion,
    clinicName,
    patients: {},
    appointments: {},
    catalog: []
  };

  const patientRows = sqliteDb.prepare(`
    SELECT id, created_at, patient_group_id, name, phone, gender, age, social
    FROM patients
    ORDER BY name COLLATE NOCASE ASC
  `).all();
  patientRows.forEach((row) => {
    data.patients[row.id] = {
      id: row.id,
      ...(row.created_at === null ? {} : { createdAt: row.created_at }),
      patientGroupId: row.patient_group_id,
      name: row.name,
      phone: row.phone,
      gender: row.gender,
      age: row.age,
      ...(row.social === null ? {} : { social: row.social }),
      treatments: [],
      appointments: []
    };
  });

  const treatmentRows = sqliteDb.prepare(`
    SELECT id, patient_id, date, created_at, category_id, item_id, item, price, teeth, note, appointment_id, planned_treatment_id
    FROM treatments
    ORDER BY patient_id, position
  `).all();
  const treatmentsByKey = new Map();
  treatmentRows.forEach((row) => {
    const patient = data.patients[row.patient_id];
    if (!patient) return;
    const treatment = {
      id: row.id,
      ...(row.appointment_id === null ? {} : { appointmentId: row.appointment_id }),
      ...(row.planned_treatment_id === null ? {} : { plannedTreatmentId: row.planned_treatment_id }),
      date: row.date,
      ...(row.created_at === null ? {} : { createdAt: row.created_at }),
      ...(row.category_id === null ? {} : { categoryId: row.category_id }),
      ...(row.item_id === null ? {} : { itemId: row.item_id }),
      item: row.item,
      price: Number(row.price) || 0,
      teeth: row.teeth,
      note: row.note,
      changeLogs: []
    };
    patient.treatments.push(treatment);
    treatmentsByKey.set(`${row.patient_id}:${row.id}`, treatment);
  });

  sqliteDb.prepare(`
    SELECT id, treatment_id, patient_id, changed_at, changed_fields_json, before_json, after_json, note
    FROM treatment_change_logs
    ORDER BY patient_id, treatment_id, position
  `).all().forEach((row) => {
    const treatment = treatmentsByKey.get(`${row.patient_id}:${row.treatment_id}`);
    if (!treatment) return;
    treatment.changeLogs.push({
      id: row.id,
      changedAt: row.changed_at,
      changedFields: readJson(row.changed_fields_json, []),
      before: readJson(row.before_json, {}),
      after: readJson(row.after_json, {}),
      ...(row.note === null ? {} : { note: row.note })
    });
  });

  sqliteDb.prepare(`
    SELECT id, patient_id, datetime, created_at, status, visit_type, checked_in_at
    FROM patient_appointment_snapshots
    ORDER BY patient_id, position
  `).all().forEach((row) => {
    const patient = data.patients[row.patient_id];
    if (!patient) return;
    patient.appointments.push({
      id: row.id,
      datetime: row.datetime,
      created_at: row.created_at,
      status: row.status,
      ...(row.visit_type === null ? {} : { visitType: row.visit_type }),
      ...(row.checked_in_at === null ? {} : { checkedInAt: row.checked_in_at })
    });
  });

  sqliteDb.prepare(`
    SELECT id, date, time, patient_id, phone, name, status, duration_minutes, source, visit_type, checked_in_at, planned_treatments_json
    FROM appointments
    ORDER BY date, time
  `).all().forEach((row) => {
    if (!data.appointments[row.date]) data.appointments[row.date] = [];
    data.appointments[row.date].push({
      id: row.id,
      date: row.date,
      time: row.time,
      patientId: row.patient_id,
      phone: row.phone,
      name: row.name,
      status: row.status,
      durationMinutes: Number(row.duration_minutes) || 30,
      source: row.source || 'appointment',
      ...(row.visit_type === null ? {} : { visitType: row.visit_type }),
      ...(row.checked_in_at === null ? {} : { checkedInAt: row.checked_in_at }),
      plannedTreatments: readJson(row.planned_treatments_json, [])
    });
  });

  const categoriesById = new Map();
  sqliteDb.prepare(`
    SELECT id, name
    FROM catalog_categories
    ORDER BY position
  `).all().forEach((row) => {
    const category = { id: row.id, name: row.name, items: [] };
    categoriesById.set(row.id, category);
    data.catalog.push(category);
  });

  sqliteDb.prepare(`
    SELECT id, category_id, name, price
    FROM catalog_items
    ORDER BY category_id, position
  `).all().forEach((row) => {
    const category = categoriesById.get(row.category_id);
    if (!category) return;
    category.items.push({
      id: row.id,
      name: row.name,
      price: Number(row.price) || 0
    });
  });

  return data;
}

function readStoredClinicDataJson() {
  const row = sqliteDb.prepare('SELECT value FROM kv_store WHERE key = ?').get(CLINIC_DATA_STORE_KEY);
  if (row?.value) return decryptText(row.value);
  if (hasNormalizedClinicData()) return JSON.stringify(buildClinicDataFromTables());
  return null;
}

function ensureEncryptedClinicDataAtRest() {
  const row = sqliteDb.prepare('SELECT value FROM kv_store WHERE key = ?').get(CLINIC_DATA_STORE_KEY);
  if (row?.value) {
    const serialized = decryptText(row.value);
    if (!isEncryptedValue(row.value) || hasNormalizedClinicData()) {
      replaceEncryptedClinicData(JSON.parse(serialized), serialized);
    }
    return;
  }

  if (hasNormalizedClinicData()) {
    const serialized = JSON.stringify(buildClinicDataFromTables());
    replaceEncryptedClinicData(JSON.parse(serialized), serialized);
  }
}

function removeRetiredAiData() {
  const placeholders = RETIRED_AI_STORE_KEYS.map(() => '?').join(', ');
  sqliteDb.prepare(`DELETE FROM kv_store WHERE key IN (${placeholders})`).run(...RETIRED_AI_STORE_KEYS);
}

function buildPatientListFromData(data, query = {}) {
  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 30));
  const rawQuery = asText(query.query).trim().toLowerCase();
  const today = asText(query.today) || new Date().toLocaleDateString('sv-SE');
  const recentDate = new Date(`${today}T00:00:00`);
  recentDate.setDate(recentDate.getDate() - 6);
  const recentStart = asText(query.recentStart) || recentDate.toLocaleDateString('sv-SE');
  const scope = ['today', 'recent'].includes(query.scope) ? query.scope : 'all';
  const patients = data?.patients && typeof data.patients === 'object' ? Object.values(data.patients) : [];
  const appointments = data?.appointments && typeof data.appointments === 'object'
    ? Object.values(data.appointments).flatMap((items) => Array.isArray(items) ? items : [])
    : [];
  const phoneCounts = patients.reduce((counts, patient) => {
    const phone = asText(patient?.phone);
    if (phone) counts[phone] = (counts[phone] || 0) + 1;
    return counts;
  }, {});

  const items = patients
    .filter((patient) => {
      if (!rawQuery) return true;
      const search = buildNameSearch(patient?.name);
      const searchText = [
        search.nameLower,
        asText(patient?.phone),
        asText(patient?.gender).toLowerCase(),
        asText(patient?.age).toLowerCase(),
        search.pinyinFull,
        search.pinyinCompact,
        search.pinyinInitials
      ].join(' ');
      return searchText.includes(rawQuery);
    })
    .map((patient) => {
      const id = asText(patient?.id);
      const lastChangedAt = getPatientLastChangedAt(patient);
      return {
        id,
        createdAt: asText(patient?.createdAt),
        lastChangedAt,
        name: asText(patient?.name),
        phone: asText(patient?.phone),
        gender: asText(patient?.gender),
        age: asText(patient?.age),
        lastUpdate: getPatientLastUpdate(patient),
        phoneCount: phoneCounts[asText(patient?.phone)] || 0,
        ...getPatientVisitMetadata(appointments, patient, today)
      };
    })
    .filter((patient) => patient.id)
    .filter((patient) => {
      if (scope === 'today') return patient.isTodayVisit;
      if (scope === 'recent') {
        const changedDate = getLocalDateKeyFromTimestamp(patient.lastChangedAt);
        return changedDate >= recentStart && changedDate <= today;
      }
      return true;
    })
    .sort((a, b) => scope === 'today'
      ? asText(b.lastVisitAt).localeCompare(asText(a.lastVisitAt)) || a.name.localeCompare(b.name)
      : comparePatientListItems(a, b));

  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    limit
  };
}

function listPatients(query = {}) {
  const serialized = readStoredClinicDataJson();
  if (serialized) return buildPatientListFromData(JSON.parse(serialized), query);
  if (hasNormalizedClinicData()) return buildPatientListFromData(buildClinicDataFromTables(), query);

  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 30));
  const rawQuery = asText(query.query).trim().toLowerCase();
  const today = asText(query.today) || new Date().toLocaleDateString('sv-SE');
  const recentDate = new Date(`${today}T00:00:00`);
  recentDate.setDate(recentDate.getDate() - 6);
  const recentStart = asText(query.recentStart) || recentDate.toLocaleDateString('sv-SE');
  const scope = query.scope === 'recent' ? 'recent' : 'all';
  const clauses = [];
  const params = [];

  if (rawQuery) {
    const escaped = escapeLike(rawQuery);
    const prefix = `${escaped}%`;
    const any = `%${escaped}%`;
    clauses.push(`(
        s.name_lower LIKE ? ESCAPE '\\'
        OR s.phone LIKE ? ESCAPE '\\'
        OR s.pinyin_full LIKE ? ESCAPE '\\'
        OR s.pinyin_compact LIKE ? ESCAPE '\\'
        OR s.pinyin_initials LIKE ? ESCAPE '\\'
        OR s.search_blob LIKE ? ESCAPE '\\'
      )`);
    params.push(any, `${escaped}%`, prefix, prefix, prefix, any);
  }
  if (scope === 'recent') {
    clauses.push('p.last_update >= ? AND p.last_update <= ?');
    params.push(recentStart, today);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = sqliteDb.prepare(`
    SELECT COUNT(*) AS total
    FROM patients p
    JOIN patient_search s ON s.patient_id = p.id
    ${where}
  `).get(...params).total;

  const items = sqliteDb.prepare(`
    WITH phone_counts AS (
      SELECT phone, COUNT(*) AS phone_count
      FROM patients
      WHERE phone <> ''
      GROUP BY phone
    )
    SELECT
      p.id,
      p.created_at AS createdAt,
      p.last_update AS lastChangedAt,
      p.name,
      p.phone,
      p.gender,
      p.age,
      p.last_update AS lastUpdate,
      COALESCE(phone_counts.phone_count, 0) AS phoneCount
    FROM patients p
    JOIN patient_search s ON s.patient_id = p.id
    LEFT JOIN phone_counts ON phone_counts.phone = p.phone
    ${where}
    ORDER BY
      p.last_update DESC,
      p.name COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { items, total, offset, limit };
}

async function initSqliteStore() {
  sqliteDbPath = path.join(app.getPath('userData'), 'clinic-data.sqlite');
  try {
    fs.mkdirSync(path.dirname(sqliteDbPath), { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    sqliteDb = new DatabaseSync(sqliteDbPath);
    ensureSqliteSchema();
    ensureEncryptedClinicDataAtRest();
    removeRetiredAiData();
    sqliteInitError = '';
  } catch (error) {
    sqliteDb = null;
    sqliteInitError = error instanceof Error ? error.message : String(error);
    console.error('SQLite 初始化失败，渲染层会回退 localStorage。', sqliteInitError);
  }
}

function registerSqliteHandlers() {
  ipcMain.handle('sqlite-store:status', () => ({
    success: !sqliteInitError,
    available: Boolean(sqliteDb),
    dbPath: sqliteDbPath,
    error: sqliteInitError || undefined
  }));

  ipcMain.handle('sqlite-store:get', (_event, key) => {
    if (!sqliteDb) {
      return { success: false, value: null, error: sqliteInitError || 'SQLite 未初始化。' };
    }
    try {
      if (key === CLINIC_DATA_STORE_KEY) {
        return { success: true, value: readStoredClinicDataJson() };
      }
      const row = sqliteDb.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
      return { success: true, value: row?.value ? decryptText(row.value) : null };
    } catch (error) {
      return { success: false, value: null, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('sqlite-store:set', (_event, key, value) => {
    if (!sqliteDb) {
      return { success: false, error: sqliteInitError || 'SQLite 未初始化。' };
    }
    try {
      if (key === CLINIC_DATA_STORE_KEY) {
        replaceEncryptedClinicData(JSON.parse(value), value);
        return { success: true };
      }
      const encrypted = encryptText(value);
      sqliteDb.prepare(`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(key, encrypted, new Date().toISOString());
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('sqlite-store:list-patients', (_event, query) => {
    if (!sqliteDb) {
      return { success: false, items: [], total: 0, offset: 0, limit: 0, error: sqliteInitError || 'SQLite 未初始化。' };
    }
    try {
      return { success: true, ...listPatients(query) };
    } catch (error) {
      return {
        success: false,
        items: [],
        total: 0,
        offset: Number(query?.offset) || 0,
        limit: Number(query?.limit) || 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 720,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    titleBarStyle: 'default'
  });
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'dist/index.html')}`;
  mainWindow.loadURL(startUrl);
}

app.on('ready', async () => {
  await initSqliteStore();
  registerSqliteHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (sqliteDb) {
    try { sqliteDb.close(); } catch (_) { /* ignore */ }
    sqliteDb = null;
  }
});

app.on('activate', () => { createWindow(); });
