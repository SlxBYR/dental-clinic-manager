import React, { useMemo, useState } from 'react';
import { CheckCircle, Circle, Edit2, Plus, Trash2, XCircle } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { GlobalAppointment, Patient } from '../types';
import { addDays, formatDateKey } from '../utils/date';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { getAppointmentStatusClass, getAppointmentStatusLabel } from '../utils/statusStyles';

export const ScheduleManager = ({ patients, onRefresh, onPatientClick }: { patients: Patient[], onRefresh: () => void, onPatientClick: (id: string) => void }) => {
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [endDate, setEndDate] = useState(formatDateKey(addDays(new Date(), 7)));
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<GlobalAppointment | null>(null);
  const [deletingAppointment, setDeletingAppointment] = useState<GlobalAppointment | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<GlobalAppointment | null>(null);

  const appointments = useMemo(() => {
    if (mode === 'daily') {
      return clinicService.getAppointmentsByDate(date);
    } else {
      return clinicService.getAppointmentsByRange(date, endDate);
    }
  }, [mode, date, endDate, patients]);

  const toggleStatus = (e: React.MouseEvent, appt: GlobalAppointment) => {
    e.stopPropagation();
    if (appt.status === 'cancelled') return;
    const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
    clinicService.updateAppointmentStatus(appt.id, newStatus);
    onRefresh();
  };

  const confirmDeleteAppointment = () => {
    if (!deletingAppointment) return;
    clinicService.deleteAppointment(deletingAppointment.id);
    setDeletingAppointment(null);
    onRefresh();
  };

  const confirmCancelAppointment = () => {
    if (!cancellingAppointment) return;
    clinicService.cancelAppointment(cancellingAppointment.id);
    setCancellingAppointment(null);
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
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-3">
           <h3 className="font-bold text-slate-700 text-lg">
             {mode === 'daily' ? `${date} 的预约` : `${date} 至 ${endDate} 的预约`}
           </h3>
           <div className="flex items-center gap-3">
             <span className="text-sm text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">共 {appointments.length} 条</span>
             {appointments.length > 0 && (
               <Button size="md" onClick={() => setShowAppointmentModal(true)}>
                 <Plus size={16} className="mr-2" /> 新建预约
               </Button>
             )}
           </div>
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
                 <th className="px-8 py-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-lg">
              {appointments.map(appt => (
                <tr key={appt.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onPatientClick(appt.patientId)}>
                  {mode === 'range' && <td className="px-8 py-5 font-mono text-slate-600">{appt.date}</td>}
                  <td className="px-8 py-5 font-bold text-blue-700">{appt.time}</td>
                  <td className="px-8 py-5 text-slate-900 font-bold">{appt.name}</td>
                  <td className="px-8 py-5 text-slate-500">{appt.phone || '未填写'}</td>
                  <td className="px-8 py-5">
                       <button
                         onClick={(e) => toggleStatus(e, appt)}
                         disabled={appt.status === 'cancelled'}
                         className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed ${getAppointmentStatusClass(appt.status)}`}
                       >
                         {appt.status === 'completed' ? <CheckCircle size={14}/> : appt.status === 'cancelled' ? <XCircle size={14}/> : <Circle size={14}/>}
                         {getAppointmentStatusLabel(appt.status)}
                       </button>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingAppointment(appt); }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑预约"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setCancellingAppointment(appt); }}
                        disabled={appt.status === 'cancelled'}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="取消预约"
                      >
                        <XCircle size={18} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeletingAppointment(appt); }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除预约"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
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

      {editingAppointment && (
        <AddAppointmentModal
          patients={patients}
          appointment={editingAppointment}
          onClose={() => setEditingAppointment(null)}
          onSuccess={() => { setEditingAppointment(null); onRefresh(); }}
        />
      )}

      {cancellingAppointment && (
        <ConfirmationModal
          title="取消预约确认"
          message={`将取消 ${cancellingAppointment.name} 在 ${cancellingAppointment.date} ${cancellingAppointment.time} 的预约。记录会保留在系统中，状态变为“已取消”。`}
          confirmLabel="确认取消预约"
          onConfirm={confirmCancelAppointment}
          onCancel={() => setCancellingAppointment(null)}
        />
      )}

      {deletingAppointment && (
        <ConfirmationModal
          title="删除预约确认"
          message={`将永久删除 ${deletingAppointment.name} 在 ${deletingAppointment.date} ${deletingAppointment.time} 的预约记录，并从该患者预约历史中移除。此操作不可恢复。`}
          confirmLabel="永久删除预约"
          onConfirm={confirmDeleteAppointment}
          onCancel={() => setDeletingAppointment(null)}
        />
      )}
    </div>
  );
};
