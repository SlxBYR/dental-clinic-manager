import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle, Circle, Clock, Plus, Users, XCircle } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { GlobalAppointment, Patient } from '../types';
import { View } from '../appTypes';
import { formatDateKey } from '../utils/date';
import { buildTreatmentContributionDays, getContributionColor, TreatmentContribution } from '../features/contribution/contribution';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';
import { getAppointmentStatusClass, getAppointmentStatusLabel } from '../utils/statusStyles';

export const Dashboard = ({ patients, onViewChange, onPatientClick, onRefresh }: { patients: Patient[], onViewChange: (v: View) => void, onPatientClick: (id: string) => void, onRefresh: () => void }) => {
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const today = formatDateKey(new Date());
  const todayAppts = clinicService.getAppointmentsByDate(today);
  const contribution = useMemo(() => buildTreatmentContributionDays(patients), [patients]);

  const toggleStatus = (e: React.MouseEvent, appt: GlobalAppointment) => {
    e.stopPropagation();
    if (appt.status === 'cancelled') return;
    const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
    clinicService.updateAppointmentStatus(appt.id, newStatus);
    onRefresh();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">诊所概况</h1>
        <p className="text-slate-500 mt-2 text-lg">欢迎回来，今天 {today} 的工作安排如下</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewChange('patients')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-lg">总患者数</h3>
            <Users className="text-teal-600 bg-teal-50 p-2 rounded-lg w-10 h-10" />
          </div>
          <p className="text-5xl font-bold text-slate-900">{patients.length}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewChange('schedule')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-lg">今日预约</h3>
            <Calendar className="text-blue-600 bg-blue-50 p-2 rounded-lg w-10 h-10" />
          </div>
          <p className="text-5xl font-bold text-slate-900">{todayAppts.length}</p>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white">
          <h3 className="font-medium opacity-90 mb-2 text-lg">快速操作</h3>
          <div className="space-y-3">
            <button onClick={() => onViewChange('patients')} className="w-full bg-white/20 hover:bg-white/30 text-left px-4 py-3 rounded-lg text-base transition-colors flex items-center gap-2">
              <Plus size={18} /> 新增患者
            </button>
            <button onClick={() => onViewChange('schedule')} className="w-full bg-white/20 hover:bg-white/30 text-left px-4 py-3 rounded-lg text-base transition-colors flex items-center gap-2">
              <Clock size={18} /> 查看今日日程
            </button>
          </div>
        </div>
      </div>

      <TreatmentContributionWall contribution={contribution} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-slate-800">今日预约列表</h3>
          {todayAppts.length > 0 && (
            <Button size="md" onClick={() => setShowAppointmentModal(true)}>
              <Plus size={16} className="mr-2" /> 新建预约
            </Button>
          )}
        </div>
        {todayAppts.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg text-lg">
            <p className="text-slate-400">今日暂无预约</p>
            <Button className="mt-5" size="lg" onClick={() => setShowAppointmentModal(true)}>
              <Plus size={18} className="mr-2" /> 新建预约
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-base">
                  <th className="pb-3 font-medium">时间</th>
                  <th className="pb-3 font-medium">姓名</th>
                  <th className="pb-3 font-medium">电话</th>
                  <th className="pb-3 font-medium">状态 (点击切换)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-base">
                {todayAppts.map(appt => (
                  <tr key={appt.id} className="group hover:bg-slate-50 cursor-pointer" onClick={() => onPatientClick(appt.patientId)}>
                    <td className="py-3 font-medium text-slate-700">{appt.time}</td>
                    <td className="py-3 text-slate-900 font-bold hover:text-teal-600">{appt.name}</td>
                    <td className="py-3 text-slate-500">{appt.phone || '未填写'}</td>
                    <td className="py-3">
                       <button
                         onClick={(e) => toggleStatus(e, appt)}
                         disabled={appt.status === 'cancelled'}
                         className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed ${getAppointmentStatusClass(appt.status)}`}
                       >
                         {appt.status === 'completed' ? <CheckCircle size={14}/> : appt.status === 'cancelled' ? <XCircle size={14}/> : <Circle size={14}/>}
                         {getAppointmentStatusLabel(appt.status)}
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAppointmentModal && (
        <AddAppointmentModal
          patients={patients}
          defaultDate={today}
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => { setShowAppointmentModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
};

const TreatmentContributionWall = ({ contribution }: { contribution: TreatmentContribution }) => {
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const hasActivity = contribution.total > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-800">处置完成记录</h3>
          <p className="text-sm text-slate-500 mt-1">每个格子代表一天，处置完成越多颜色越深。</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-slate-900">{contribution.total}</div>
          <div className="text-sm text-slate-500">近 26 周完成处置</div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        <div className="grid grid-rows-7 gap-1 pt-0.5 text-[11px] leading-3 text-slate-400 flex-shrink-0">
          {weekdayLabels.map((label, index) => (
            <div key={label} className="h-3 flex items-center justify-end">
              {index % 2 === 1 ? label : ''}
            </div>
          ))}
        </div>

        <div className="grid grid-flow-col grid-rows-7 gap-1 min-w-max">
          {contribution.days.map(day => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} 个处置`}
              className={`h-3 w-3 rounded-sm border ${getContributionColor(day.count, day.isFuture)}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>{hasActivity ? `单日最高 ${contribution.max} 个处置` : '暂无处置记录'}</span>
        <div className="flex items-center gap-2">
          <span>少</span>
          {[0, 1, 2, 3, 5].map(level => (
            <span key={level} className={`h-3 w-3 rounded-sm border ${getContributionColor(level, false)}`} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
};
