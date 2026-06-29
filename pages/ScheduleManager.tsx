import React, { useMemo, useState } from 'react';
import { CheckCircle, Circle, Plus } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { GlobalAppointment, Patient } from '../types';
import { addDays, formatDateKey } from '../utils/date';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';

export const ScheduleManager = ({ patients, onRefresh, onPatientClick }: { patients: Patient[], onRefresh: () => void, onPatientClick: (id: string) => void }) => {
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [endDate, setEndDate] = useState(formatDateKey(addDays(new Date(), 7)));
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);

  const appointments = useMemo(() => {
    if (mode === 'daily') {
      return clinicService.getAppointmentsByDate(date);
    } else {
      return clinicService.getAppointmentsByRange(date, endDate);
    }
  }, [mode, date, endDate, patients]);

  const toggleStatus = (e: React.MouseEvent, appt: GlobalAppointment) => {
    e.stopPropagation();
    const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
    clinicService.updateAppointmentStatus(appt.date, appt.patientId, appt.time, newStatus);
    onRefresh();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-slate-900">日程表管理</h2>
        <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
           <button onClick={() => setMode('daily')} className={`px-6 py-2 rounded-md text-base font-medium transition-colors ${mode === 'daily' ? 'bg-teal-100 text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>单日视图</button>
           <button onClick={() => setMode('range')} className={`px-6 py-2 rounded-md text-base font-medium transition-colors ${mode === 'range' ? 'bg-teal-100 text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>范围视图</button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm mb-8 flex items-end gap-6">
         <div className="flex-1">
            <label className="block text-base font-medium text-slate-600 mb-2">{mode === 'daily' ? '选择日期' : '开始日期'}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg text-slate-700 outline-none focus:ring-2 focus:ring-teal-500" />
         </div>
         {mode === 'range' && (
           <>
            <div className="text-slate-300 font-bold mb-5 text-xl">-</div>
            <div className="flex-1">
              <label className="block text-base font-medium text-slate-600 mb-2">结束日期</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg text-slate-700 outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
           </>
         )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
           <h3 className="font-bold text-slate-700 text-lg">
             {mode === 'daily' ? `${date} 的预约` : `${date} 至 ${endDate} 的预约`}
           </h3>
           <span className="text-sm text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">共 {appointments.length} 条</span>
        </div>
        {appointments.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-lg">
            <p>该时间段内无预约记录</p>
            <Button className="mt-5" size="lg" onClick={() => setShowAppointmentModal(true)}>
              <Plus size={18} className="mr-2" /> 新建预约
            </Button>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-sm font-bold text-slate-500 uppercase">
                 {mode === 'range' && <th className="px-8 py-4">日期</th>}
                 <th className="px-8 py-4">时间</th>
                 <th className="px-8 py-4">姓名</th>
                 <th className="px-8 py-4">电话</th>
                 <th className="px-8 py-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-lg">
              {appointments.map((appt, i) => (
                <tr key={i} className="hover:bg-teal-50/30 cursor-pointer" onClick={() => onPatientClick(appt.patientId)}>
                  {mode === 'range' && <td className="px-8 py-5 font-mono text-slate-600">{appt.date}</td>}
                  <td className="px-8 py-5 font-bold text-teal-700">{appt.time}</td>
                  <td className="px-8 py-5 text-slate-900 font-bold">{appt.name}</td>
                  <td className="px-8 py-5 text-slate-500">{appt.phone || '未填写'}</td>
                  <td className="px-8 py-5">
                       <button
                         onClick={(e) => toggleStatus(e, appt)}
                         className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                           appt.status === 'completed'
                             ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                             : 'bg-green-100 text-green-700 hover:bg-green-200'
                         }`}
                       >
                         {appt.status === 'completed' ? <CheckCircle size={14}/> : <Circle size={14}/>}
                         {appt.status === 'completed' ? '完成' : '待诊'}
                       </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAppointmentModal && (
        <AddAppointmentModal
          patients={patients}
          defaultDate={date}
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => { setShowAppointmentModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
};
