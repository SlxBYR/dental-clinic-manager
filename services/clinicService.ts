import { ClinicData, Patient, GlobalAppointment, TreatmentRecord, TreatmentCategory, TreatmentItem, AppointmentStatus } from '../types';
import { STORAGE_KEY, DEFAULT_CATALOG, DATA_VERSION } from '../constants';

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

const ensureUniqueId = (baseId: string, patients: Record<string, Patient>) => {
  if (!patients[baseId]) return baseId;
  let index = 2;
  while (patients[`${baseId}_${index}`]) index += 1;
  return `${baseId}_${index}`;
};

const createEmptyData = (): ClinicData => ({
  version: DATA_VERSION,
  patients: {},
  appointments: {},
  catalog: DEFAULT_CATALOG,
  clinicName: 'DentalClinic'
});

const migrateData = (raw: any): ClinicData => {
  const data: ClinicData = {
    version: DATA_VERSION,
    clinicName: raw?.clinicName || 'DentalClinic',
    catalog: raw?.catalog || DEFAULT_CATALOG,
    patients: {},
    appointments: {}
  };

  const phoneToId = new Map<string, string>();
  const oldPatients = raw?.patients || {};

  Object.keys(oldPatients).forEach(oldKey => {
    const oldPatient = oldPatients[oldKey] || {};
    const phone = normalizePhone(oldPatient.phone || oldKey || '');
    const name = (oldPatient.name || '').trim();
    if (!name) return;

    let id = phone ? phoneToId.get(phone) : undefined;
    if (!id) {
      id = oldPatient.id || hashPatientId(name, phone);
      id = ensureUniqueId(id, data.patients);
      if (phone) phoneToId.set(phone, id);
      data.patients[id] = {
        ...oldPatient,
        id,
        name,
        phone,
        gender: oldPatient.gender || '男',
        age: oldPatient.age || '',
        treatments: Array.isArray(oldPatient.treatments) ? oldPatient.treatments : [],
        appointments: Array.isArray(oldPatient.appointments) ? oldPatient.appointments : []
      };
      return;
    }

    const target = data.patients[id];
    target.treatments = [
      ...target.treatments,
      ...(Array.isArray(oldPatient.treatments) ? oldPatient.treatments : [])
    ];
    target.appointments = [
      ...target.appointments,
      ...(Array.isArray(oldPatient.appointments) ? oldPatient.appointments : [])
    ];
    if (!target.age && oldPatient.age) target.age = oldPatient.age;
    if (!target.social && oldPatient.social) target.social = oldPatient.social;
  });

  const oldAppointments = raw?.appointments || {};
  Object.keys(oldAppointments).forEach(dateKey => {
    const migrated = (Array.isArray(oldAppointments[dateKey]) ? oldAppointments[dateKey] : [])
      .map((appt: any) => {
        const phone = normalizePhone(appt.phone || '');
        const patientId = appt.patientId || (phone ? phoneToId.get(phone) : undefined);
        const patient = patientId ? data.patients[patientId] : undefined;
        if (!patientId || !patient) return null;
        return {
          ...appt,
          patientId,
          phone: patient.phone,
          name: patient.name,
          status: appt.status || 'pending'
        } as GlobalAppointment;
      })
      .filter(Boolean) as GlobalAppointment[];
    if (migrated.length > 0) data.appointments[dateKey] = migrated;
  });

  return data;
};

const getInitialData = (): ClinicData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const migrated = migrateData(parsed);
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

  importData(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.patients || !parsed.appointments) {
        throw new Error("Invalid format");
      }
      this.data = migrateData(parsed);
      this.saveData();
      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
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
    const existing = this.findPatientByPhone(cleanPhone);

    if (existing) {
      existing.name = existing.name || cleanName;
      existing.gender = existing.gender || patient.gender;
      existing.age = existing.age || patient.age;
      this.saveData();
      return { success: true, patientId: existing.id, merged: true };
    }

    const id = ensureUniqueId(hashPatientId(cleanName, cleanPhone), this.data.patients);
    this.data.patients[id] = {
      ...patient,
      id,
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
    this.data.patients[patientId] = {
      ...this.data.patients[patientId],
      ...updates,
      id: patientId
    };
    this.syncPatientSnapshots(patientId);
    this.saveData();
  }

  deletePatient(patientId: string) {
    if (!this.data.patients[patientId]) return;
    delete this.data.patients[patientId];
    Object.keys(this.data.appointments).forEach(dateKey => {
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

  addTreatment(patientId: string, item: TreatmentItem, price: number, teeth: string, note: string): boolean {
    const patient = this.data.patients[patientId];
    if (!patient) return false;

    const record: TreatmentRecord = {
      id: new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14),
      date: formatDateKey(new Date()),
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

  addAppointment(patientId: string, date: string, time: string) {
    const patient = this.data.patients[patientId];
    if (!patient) return false;

    if (!this.data.appointments[date]) {
      this.data.appointments[date] = [];
    }
    const appt: GlobalAppointment = {
      date,
      time,
      patientId,
      phone: patient.phone,
      name: patient.name,
      status: 'pending'
    };
    this.data.appointments[date].push(appt);
    this.data.appointments[date].sort((a, b) => a.time.localeCompare(b.time));

    patient.appointments.push({
      datetime: `${date} ${time}`,
      created_at: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });
    patient.appointments.sort((a, b) => b.datetime.localeCompare(a.datetime));

    this.saveData();
    return true;
  }

  updateAppointmentStatus(date: string, patientId: string, time: string, status: AppointmentStatus) {
    const appts = this.data.appointments[date];
    if (!appts) return;

    const appt = appts.find(a => a.patientId === patientId && a.time === time);
    if (appt) {
      appt.status = status;
      this.saveData();
    }
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
