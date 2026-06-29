import React, { useState } from 'react';
import { clinicService } from '../services/clinicService';
import { Button } from '../components/Button';
import { formatDateKey } from '../utils/date';
import { ModalBase } from './ModalBase';

export const AddAppointmentModal = ({ phone, defaultName, onClose, onSuccess }: { phone: string, defaultName: string, onClose: () => void, onSuccess: () => void }) => {
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [time, setTime] = useState('09:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;

    clinicService.addAppointment(phone, date, time);
    onSuccess();
  };

  return (
    <ModalBase title="新增预约" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">患者姓名</label>
           <div className="text-lg text-slate-900 font-medium px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">{defaultName}</div>
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
           <Button type="submit" size="lg">确认预约</Button>
        </div>
      </form>
    </ModalBase>
  );
};
