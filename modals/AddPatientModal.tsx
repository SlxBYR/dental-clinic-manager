import React, { useMemo, useState } from 'react';
// @ts-ignore tiny-pinyin 没有完整类型声明，运行时由依赖提供。
import * as pinyin from 'tiny-pinyin';
import { clinicService } from '../services/clinicService';
import { Patient } from '../types';
import { Button } from '../components/Button';
import { ModalBase } from './ModalBase';

export const AddPatientModal = ({ patients, onSelectPatient, onClose, onSuccess }: { patients: Patient[], onSelectPatient: (id: string) => void, onClose: () => void, onSuccess: () => void }) => {
  const [form, setForm] = useState({ name: '', phone: '', gender: '男', age: '' });
  const [error, setError] = useState('');
  const nameQuery = form.name.trim().toLowerCase();
  const phoneQuery = form.phone.trim();

  const similarPatients = useMemo(() => {
    if (!nameQuery) return [];
    return patients
      .filter(patient => {
        const name = patient.name.toLowerCase();
        if (name.includes(nameQuery) || nameQuery.includes(name)) return true;
        if (/^[a-zA-Z]+$/.test(nameQuery) && pinyin && typeof pinyin.convertToPinyin === 'function') {
          const fullPinyin = pinyin.convertToPinyin(patient.name, ' ', true);
          const initials = fullPinyin.split(' ').map((s: string) => s[0]).join('');
          return fullPinyin.replace(/\s/g, '').includes(nameQuery) || initials.includes(nameQuery);
        }
        return false;
      })
      .slice(0, 5);
  }, [patients, nameQuery]);

  const samePhonePatients = useMemo(() => {
    if (!phoneQuery) return [];
    return patients.filter(patient => patient.phone === phoneQuery);
  }, [patients, phoneQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = form.name.trim();
    const cleanPhone = form.phone.trim();

    if (!cleanName) {
      setError('姓名是必填项');
      return;
    }
    const result = clinicService.addPatient({
      ...form,
      name: cleanName,
      phone: cleanPhone,
      age: form.age.trim(),
      treatments: [],
      appointments: []
    });

    if (!result.success) {
      setError('保存患者失败');
      return;
    }
    onSuccess();
  };

  return (
    <ModalBase title="新增患者档案" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 bg-red-50 text-red-600 text-base rounded-lg border border-red-100">{error}</div>}
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">姓名</label>
          <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none"
            value={form.name} onChange={e => { setError(''); setForm({...form, name: e.target.value}); }} autoFocus />
          {similarPatients.length > 0 && (
            <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 overflow-hidden">
              <div className="px-4 py-2 text-sm font-medium text-teal-800 border-b border-teal-100">
                已有相似患者，点击可直接查看档案
              </div>
              <div className="divide-y divide-teal-100">
                {similarPatients.map(patient => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => onSelectPatient(patient.id)}
                    className="w-full px-4 py-3 text-left hover:bg-white transition-colors flex items-center justify-between gap-4"
                  >
                    <span className="font-bold text-slate-800">{patient.name}</span>
                    <span className="text-sm font-mono text-slate-500">{patient.phone || '未填写电话'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">电话 (可选)</label>
          <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none"
            value={form.phone} onChange={e => setForm({...form, phone: e.target.value.replace(/\s/g, '')})} />
          {samePhonePatients.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              该电话已有 {samePhonePatients.length} 位患者，新档案会归入同号码患者组，并保留为独立患者。
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">性别</label>
            <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
              value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">年龄</label>
            <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none h-[54px]" type="number"
              value={form.age} onChange={e => setForm({...form, age: e.target.value})} />
          </div>
        </div>
        <div className="pt-6 flex justify-end gap-4">
          <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
          <Button type="submit" size="lg">保存患者</Button>
        </div>
      </form>
    </ModalBase>
  );
};
