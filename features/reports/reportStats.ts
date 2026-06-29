import { Patient, TreatmentRecord } from '../../types';
import { formatDateKey } from '../../utils/date';

export type RankedStat = {
  name: string;
  count: number;
  revenue: number;
};

export type ActivePatientStat = {
  patientId: string;
  name: string;
  phone: string;
  treatmentCount: number;
  revenue: number;
  lastTreatmentDate: string;
};

export type ReportStats = {
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  last30TreatmentCount: number;
  last30Revenue: number;
  itemRevenueRank: RankedStat[];
  itemCountRank: RankedStat[];
  activePatients: ActivePatientStat[];
};

type TreatmentWithPatient = {
  patient: Patient;
  treatment: TreatmentRecord;
};

const toNumber = (value: number) => Number.isFinite(value) ? value : 0;

const getLast30Start = (today: Date) => {
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  return formatDateKey(start);
};

const flattenTreatments = (patients: Patient[]) => patients.flatMap(patient => (
  patient.treatments.map(treatment => ({ patient, treatment }))
));

const buildRank = (treatments: TreatmentWithPatient[]) => {
  const map = new Map<string, RankedStat>();
  treatments.forEach(({ treatment }) => {
    const name = treatment.item || '未命名处置';
    const current = map.get(name) || { name, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += toNumber(treatment.price);
    map.set(name, current);
  });
  return Array.from(map.values());
};

export const buildReportStats = (patients: Patient[], now = new Date()): ReportStats => {
  const today = formatDateKey(now);
  const currentMonth = today.slice(0, 7);
  const last30Start = getLast30Start(now);
  const treatments = flattenTreatments(patients);
  const last30Treatments = treatments.filter(({ treatment }) => treatment.date >= last30Start && treatment.date <= today);
  const rankedItems = buildRank(treatments);

  const activePatients = patients
    .map(patient => {
      const revenue = patient.treatments.reduce((sum, treatment) => sum + toNumber(treatment.price), 0);
      const lastTreatmentDate = patient.treatments.reduce((latest, treatment) => (
        treatment.date > latest ? treatment.date : latest
      ), '');
      return {
        patientId: patient.id,
        name: patient.name,
        phone: patient.phone,
        treatmentCount: patient.treatments.length,
        revenue,
        lastTreatmentDate
      };
    })
    .filter(patient => patient.treatmentCount > 0)
    .sort((a, b) => {
      if (b.treatmentCount !== a.treatmentCount) return b.treatmentCount - a.treatmentCount;
      return b.revenue - a.revenue;
    })
    .slice(0, 10);

  return {
    totalRevenue: treatments.reduce((sum, item) => sum + toNumber(item.treatment.price), 0),
    todayRevenue: treatments
      .filter(({ treatment }) => treatment.date === today)
      .reduce((sum, item) => sum + toNumber(item.treatment.price), 0),
    monthRevenue: treatments
      .filter(({ treatment }) => treatment.date.startsWith(currentMonth))
      .reduce((sum, item) => sum + toNumber(item.treatment.price), 0),
    last30TreatmentCount: last30Treatments.length,
    last30Revenue: last30Treatments.reduce((sum, item) => sum + toNumber(item.treatment.price), 0),
    itemRevenueRank: [...rankedItems].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    itemCountRank: [...rankedItems].sort((a, b) => b.count - a.count).slice(0, 10),
    activePatients
  };
};

