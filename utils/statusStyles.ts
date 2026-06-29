import { AppointmentStatus } from '../types';

export const getAppointmentStatusLabel = (status: AppointmentStatus) => {
  if (status === 'completed') return '完成';
  if (status === 'cancelled') return '已取消';
  return '待诊';
};

export const getAppointmentStatusClass = (status: AppointmentStatus) => {
  if (status === 'completed') return 'bg-green-100 text-green-700 hover:bg-green-200';
  if (status === 'cancelled') return 'bg-rose-100 text-rose-700 hover:bg-rose-200';
  return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
};

export const getInfoStatusClass = () => 'border-slate-200 bg-slate-50 text-slate-700';
export const getSuccessStatusClass = () => 'border-green-200 bg-green-50 text-green-700';
export const getErrorStatusClass = () => 'border-red-200 bg-red-50 text-red-700';
