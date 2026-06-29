import React, { useState } from 'react';
import { ChevronRight, Plus, Search } from 'lucide-react';
// @ts-ignore tiny-pinyin 没有完整类型声明，保留运行时能力即可。
import * as pinyin from 'tiny-pinyin';
import { Patient } from '../types';
import { Button } from '../components/Button';
import { AddPatientModal } from '../modals/AddPatientModal';

export const PatientList = ({ patients, onSelect, onRefresh }: { patients: Patient[], onSelect: (id: string) => void, onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // 中文姓名、电话和拼音首字母统一在列表层过滤。
  const isMatch = (p: Patient, query: string) => {
    const q = query.toLowerCase();
    if (!q) return true;

    // 1. Standard name/phone match
    if (p.name.toLowerCase().includes(q) || p.phone.includes(q)) return true;

    // 2. Pinyin Initials match (if query is alphabetic)
    if (pinyin && /^[a-zA-Z]+$/.test(q)) {
      if (typeof pinyin.convertToPinyin === 'function') {
        const fullPinyin = pinyin.convertToPinyin(p.name, ' ', true); // returns "zhang san" if lowerCase is true
        const initials = fullPinyin.split(' ').map((s: string) => s[0]).join('');
        if (initials.includes(q)) return true;
      }
    }

    return false;
  };

  // 使用最近处置或预约日期排序，方便前台快速找到活跃患者。
  const getLastUpdate = (p: Patient) => {
     // Check appointments created_at and treatments date
     let last = '0000-00-00';
     // Most recent treatment
     if (p.treatments.length > 0) {
       const tDate = p.treatments[p.treatments.length - 1].date;
       if (tDate > last) last = tDate;
     }
     // Most recent appointment creation
     if (p.appointments.length > 0) {
       const aDate = p.appointments[0].datetime.split(' ')[0];
       if (aDate > last) last = aDate;
     }
     return last;
  };

  const filtered = patients.filter(p => isMatch(p, search));

  // Sort descending by last update
  filtered.sort((a, b) => getLastUpdate(b).localeCompare(getLastUpdate(a)));

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-900">患者库</h2>
        <Button onClick={() => setShowAddModal(true)} size="lg">
          <Plus size={20} className="mr-2" /> 新增患者
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="搜索姓名、拼音首字母或电话..."
            className="w-full pl-10 pr-4 py-3 text-lg border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-lg">
            {patients.length === 0 ? "暂无患者数据，请点击右上角新增。" : "未找到匹配的患者。"}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">电话</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">性别/年龄</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">最近更新</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-lg">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-teal-50/30 transition-colors group cursor-pointer" onClick={() => onSelect(p.id)}>
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg">
                      {p.name.charAt(0)}
                    </div>
                    {p.name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{p.phone || '未填写'}</td>
                  <td className="px-6 py-4 text-slate-600">{p.gender}, {p.age}岁</td>
                  <td className="px-6 py-4 text-slate-400 text-base">
                    {getLastUpdate(p) === '0000-00-00' ? '-' : getLastUpdate(p)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="inline-block text-slate-300 group-hover:text-teal-500" size={24} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddPatientModal
          patients={patients}
          onSelectPatient={(patientId) => {
            setShowAddModal(false);
            onSelect(patientId);
          }}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
};
