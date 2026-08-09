import { Patient } from '../types';
// @ts-ignore tiny-pinyin 没有完整类型声明，运行时由依赖提供。
import * as pinyin from 'tiny-pinyin';

export const getPatientPinyinTerms = (name: string) => {
  if (!pinyin || typeof pinyin.convertToPinyin !== 'function') return '';
  try {
    const fullPinyin = pinyin.convertToPinyin(name, ' ', true);
    const parts = fullPinyin.split(/\s+/).filter(Boolean);
    return `${fullPinyin} ${parts.join('')} ${parts.map((part: string) => part[0]).join('')}`.toLowerCase();
  } catch {
    return '';
  }
};

export const patientMatchesSearch = (patient: Pick<Patient, 'name' | 'phone' | 'gender' | 'age'>, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    patient.name,
    patient.phone,
    patient.gender,
    patient.age,
    getPatientPinyinTerms(patient.name)
  ].join(' ').toLowerCase().includes(normalizedQuery);
};
