import React, { useState } from 'react';
import { clinicService } from '../services/clinicService';
import { Button } from '../components/Button';
import { formatDateKey } from '../utils/date';
import { ModalBase } from './ModalBase';
import { Patient } from '../types';

export const AddAppointmentModal = ({
  phone,
  defaultName,
  patients = [],
  defaultDate,
  onClose,
  onSuccess
}: {
  phone?: string;
  defaultName?: string;
  patients?: Patient[];
  defaultDate?: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState(phone || patients[0]?.id || '');
  const [date, setDate] = useState(defaultDate || formatDateKey(new Date()));
  const [time, setTime] = useState('09:00');
  const selectedPatient = selectedPatientId ? clinicService.getPatient(selectedPatientId) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !date || !time) return;

    clinicService.addAppointment(selectedPatientId, date, time);
    onSuccess();
  };

  return (
    <ModalBase title="新增预约" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">患者姓名</label>
           {phone ? (
             <div className="text-lg text-slate-900 font-medium px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">{defaultName || selectedPatient?.name || '未命名患者'}</div>
           ) : patients.length > 0 ? (
             <select
               className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px] focus:ring-2 focus:ring-teal-500"
               value={selectedPatientId}
               onChange={e => setSelectedPatientId(e.target.value)}
             >
               {patients.map(patient => (
                 <option key={patient.id} value={patient.id}>
                   {patient.name} {patient.phone ? `(${patient.phone})` : '(未填写电话)'}
                 </option>
               ))}
             </select>
           ) : (
             <div className="text-lg text-slate-500 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">请先新增患者档案</div>
           )}
        </div>
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">预约日期</label>
           <input type="date" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
             value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">预约时间</label>
           <input type="time" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
             value={time} onChange={e => setTime(e.target.value)} required />
        </div>
        <div className="pt-4 flex justify-end gap-4">
           <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
           <Button type="submit" size="lg" disabled={!selectedPatientId}>确认预约</Button>
        </div>
      </form>
    </ModalBase>
  );
};
