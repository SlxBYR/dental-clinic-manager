import { Patient } from '../../types';
import { formatDateKey } from '../../utils/date';

// 将所有患者处置记录聚合为日期维度，供首页贡献墙着色。
const getTreatmentCountByDate = (patients: Patient[]) => {
  const counts = new Map<string, number>();
  patients.forEach(patient => {
    patient.treatments.forEach(treatment => {
      counts.set(treatment.date, (counts.get(treatment.date) || 0) + 1);
    });
  });
  return counts;
};

export const buildTreatmentContributionDays = (patients: Patient[], weekCount = 26) => {
  const counts = getTreatmentCountByDate(patients);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(today.getDate() + (6 - today.getDay()));

  const start = new Date(end);
  start.setDate(end.getDate() - weekCount * 7 + 1);

  const days = Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = formatDateKey(date);
    return {
      date: dateKey,
      count: counts.get(dateKey) || 0,
      isFuture: date > today,
    };
  });

  return {
    days,
    total: days.reduce((sum, day) => sum + day.count, 0),
    max: days.reduce((max, day) => Math.max(max, day.count), 0),
  };
};

export type TreatmentContribution = ReturnType<typeof buildTreatmentContributionDays>;

export const getContributionColor = (count: number, isFuture: boolean) => {
  if (isFuture) return 'bg-slate-50 border-slate-100';
  if (count >= 5) return 'bg-teal-800 border-teal-800';
  if (count >= 3) return 'bg-teal-600 border-teal-600';
  if (count >= 2) return 'bg-teal-400 border-teal-400';
  if (count >= 1) return 'bg-teal-200 border-teal-200';
  return 'bg-slate-100 border-slate-200';
};
