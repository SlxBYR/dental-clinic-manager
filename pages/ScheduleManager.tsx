import React, { useMemo, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Circle, Edit2, Plus, Search, Trash2, UserCheck, XCircle } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { GlobalAppointment, Patient } from '../types';
import { addDays, formatDateKey } from '../utils/date';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { getAppointmentStatusClass, getAppointmentStatusLabel } from '../utils/statusStyles';

const START_MINUTES = 0;
const END_MINUTES = 24 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 48;
const MINUTE_HEIGHT = SLOT_HEIGHT / SLOT_MINUTES;
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatShortDate = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const appointmentTone = (appointment: GlobalAppointment) => {
  if (appointment.status === 'cancelled') return 'border-slate-300 bg-slate-100 text-slate-500 opacity-70';
  if (appointment.status === 'completed') return 'border-emerald-400 bg-emerald-100 text-emerald-900';
  if (appointment.status === 'arrived') return 'border-blue-400 bg-blue-100 text-blue-900';
  return 'border-amber-400 bg-amber-100 text-amber-900';
};

export const ScheduleManager = ({ patients, onRefresh, onPatientClick }: { patients: Patient[], onRefresh: () => void, onPatientClick: (id: string) => void }) => {
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [query, setQuery] = useState('');
  const [showArrivedOnly, setShowArrivedOnly] = useState(false);
  const [newSlot, setNewSlot] = useState<{ date: string; time: string } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<GlobalAppointment | null>(null);
  const [deletingAppointment, setDeletingAppointment] = useState<GlobalAppointment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [cancellingAppointment, setCancellingAppointment] = useState<GlobalAppointment | null>(null);
  const today = formatDateKey(new Date());
  const weekStart = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const startDate = formatDateKey(days[0]);
  const endDate = formatDateKey(days[6]);
  const allAppointments = useMemo(() => clinicService.getAllAppointments(), [patients]);
  const normalizedQuery = query.trim().toLowerCase();

  const weekAppointments = useMemo(() => clinicService
    .getAppointmentsByRange(startDate, endDate)
    .filter(appointment => !showArrivedOnly || appointment.status === 'arrived' || appointment.status === 'completed')
    .filter(appointment => {
      if (!normalizedQuery) return true;
      const planned = appointment.plannedTreatments.map(item => item.itemName).join(' ');
      return `${appointment.name} ${appointment.phone} ${planned}`.toLowerCase().includes(normalizedQuery);
    }), [endDate, normalizedQuery, patients, showArrivedOnly, startDate]);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return allAppointments
      .filter(appointment => {
        const planned = appointment.plannedTreatments.map(item => item.itemName).join(' ');
        return `${appointment.name} ${appointment.phone} ${planned}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [allAppointments, normalizedQuery]);

  const slots = Array.from({ length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES }, (_, index) => START_MINUTES + index * SLOT_MINUTES);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = today >= startDate && today <= endDate && nowMinutes >= START_MINUTES && nowMinutes <= END_MINUTES;

  const advanceStatus = (event: React.MouseEvent, appointment: GlobalAppointment) => {
    event.stopPropagation();
    if (appointment.status === 'cancelled' || appointment.status === 'completed') return;
    clinicService.updateAppointmentStatus(appointment.id, appointment.status === 'pending' ? 'arrived' : 'completed');
    onRefresh();
  };

  const openSlot = (date: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const slotIndex = Math.floor(offset / SLOT_HEIGHT);
    setNewSlot({ date, time: minutesToTime(START_MINUTES + slotIndex * SLOT_MINUTES) });
  };

  const confirmDelete = async () => {
    if (!deletingAppointment) return;
    setIsDeleting(true);
    setDeleteError('');
    const result = await clinicService.deleteAppointment(deletingAppointment.id);
    setIsDeleting(false);
    if (!result.success) {
      setDeleteError(result.message);
      onRefresh();
      return;
    }
    setDeletingAppointment(null);
    onRefresh();
  };

  const confirmCancel = () => {
    if (!cancellingAppointment) return;
    clinicService.cancelAppointment(cancellingAppointment.id);
    setCancellingAppointment(null);
    onRefresh();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" onClick={() => setAnchorDate(addDays(anchorDate, -7))} aria-label="上一周"><ChevronLeft /></button>
          <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" onClick={() => setAnchorDate(addDays(anchorDate, 7))} aria-label="下一周"><ChevronRight /></button>
          <h2 className="text-2xl font-bold text-slate-900">{startDate} — {endDate}</h2>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setAnchorDate(new Date())}>回到今天</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArrivedOnly} onChange={event => setShowArrivedOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600" />
            只显示已到诊
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索患者、电话或处置项目" className="w-72 rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 outline-none focus:ring-2 focus:ring-teal-500" />
            {searchResults.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {searchResults.map(appointment => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => { setAnchorDate(new Date(`${appointment.date}T12:00:00`)); setQuery(''); setEditingAppointment(appointment); }}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-teal-50"
                  >
                    <span><span className="font-bold text-slate-800">{appointment.name}</span><span className="ml-2 text-sm text-slate-500">{appointment.plannedTreatments[0]?.itemName || '未添加处置'}</span></span>
                    <span className="font-mono text-sm text-slate-500">{appointment.date} {appointment.time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="md" onClick={() => setNewSlot({ date: today, time: '09:00' })}><Plus size={17} className="mr-2" /> 新建预约</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[980px]">
          <div className="sticky top-0 z-30 grid grid-cols-[76px_repeat(7,minmax(128px,1fr))] border-b border-slate-200 bg-white">
            <div className="border-r border-slate-200 p-3 text-center text-xs text-slate-400">时间</div>
            {days.map(day => {
              const key = formatDateKey(day);
              const isToday = key === today;
              return (
                <div key={key} className={`border-r border-slate-200 px-3 py-3 text-center last:border-r-0 ${isToday ? 'bg-rose-50' : ''}`}>
                  <span className={`font-bold ${isToday ? 'text-rose-600' : 'text-slate-700'}`}>{WEEKDAY_LABELS[day.getDay()]}{isToday ? '（今天）' : ''}</span>
                  <span className="ml-1 text-sm text-slate-400">{formatShortDate(day)}</span>
                </div>
              );
            })}
          </div>

          <div className="relative grid grid-cols-[76px_repeat(7,minmax(128px,1fr))]" style={{ height: slots.length * SLOT_HEIGHT }}>
            <div className="border-r border-slate-200 bg-white">
              {slots.map(minutes => (
                <div key={minutes} className="border-b border-slate-200 pr-3 pt-1 text-right font-mono text-xs text-slate-400" style={{ height: SLOT_HEIGHT }}>
                  {minutesToTime(minutes)}
                </div>
              ))}
            </div>
            {days.map(day => {
              const dateKey = formatDateKey(day);
              const dayAppointments = weekAppointments.filter(appointment => appointment.date === dateKey);
              return (
                <div
                  key={dateKey}
                  onClick={event => openSlot(dateKey, event)}
                  className={`relative cursor-crosshair border-r border-slate-200 last:border-r-0 ${dateKey === today ? 'bg-rose-50/30' : ''}`}
                  style={{
                    height: slots.length * SLOT_HEIGHT,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${SLOT_HEIGHT - 1}px, rgb(226 232 240) ${SLOT_HEIGHT - 1}px, rgb(226 232 240) ${SLOT_HEIGHT}px)`
                  }}
                >
                  {dayAppointments.map(appointment => {
                    const start = timeToMinutes(appointment.time);
                    if (start < START_MINUTES || start >= END_MINUTES) return null;
                    const top = (start - START_MINUTES) * MINUTE_HEIGHT;
                    const height = Math.max(38, Math.min(appointment.durationMinutes, END_MINUTES - start) * MINUTE_HEIGHT);
                    return (
                      <div
                        key={appointment.id}
                        onClick={event => { event.stopPropagation(); setEditingAppointment(appointment); }}
                        className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-xs shadow-sm transition-shadow hover:z-20 hover:shadow-md ${appointmentTone(appointment)}`}
                        style={{ top, height }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={event => { event.stopPropagation(); onPatientClick(appointment.patientId); }}>
                            <div className="truncate font-bold">{appointment.time} {appointment.name}</div>
                            <div className="truncate opacity-80">{appointment.visitType === 'initial' ? '初诊' : appointment.visitType === 'follow_up' ? '复诊' : '未标记'} · {appointment.source === 'walk_in' ? '现场' : '预约'}</div>
                            {appointment.plannedTreatments[0] && <div className="truncate opacity-80">{appointment.plannedTreatments[0].itemName}</div>}
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" title={getAppointmentStatusLabel(appointment.status)} onClick={event => advanceStatus(event, appointment)} className={`rounded p-1 ${getAppointmentStatusClass(appointment.status)}`}>
                              {appointment.status === 'completed' ? <CheckCircle size={13} /> : appointment.status === 'arrived' ? <UserCheck size={13} /> : appointment.status === 'cancelled' ? <XCircle size={13} /> : <Circle size={13} />}
                            </button>
                            <button type="button" title="编辑" onClick={event => { event.stopPropagation(); setEditingAppointment(appointment); }} className="rounded bg-white/60 p-1 hover:bg-white"><Edit2 size={13} /></button>
                            <button type="button" title="取消" disabled={appointment.status === 'cancelled'} onClick={event => { event.stopPropagation(); setCancellingAppointment(appointment); }} className="rounded bg-white/60 p-1 hover:bg-white disabled:opacity-30"><XCircle size={13} /></button>
                            <button type="button" title="删除" onClick={event => { event.stopPropagation(); setDeleteError(''); setDeletingAppointment(appointment); }} className="rounded bg-white/60 p-1 hover:bg-white"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {showNowLine && (
              <div className="pointer-events-none absolute left-[76px] right-0 z-20 border-t-2 border-rose-400" style={{ top: (nowMinutes - START_MINUTES) * MINUTE_HEIGHT }}>
                <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-rose-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {newSlot && (
        <AddAppointmentModal patients={patients} defaultDate={newSlot.date} defaultTime={newSlot.time} onClose={() => setNewSlot(null)} onSuccess={() => { setNewSlot(null); onRefresh(); }} />
      )}
      {editingAppointment && (
        <AddAppointmentModal patients={patients} appointment={editingAppointment} onClose={() => setEditingAppointment(null)} onSuccess={() => { setEditingAppointment(null); onRefresh(); }} />
      )}
      {cancellingAppointment && (
        <ConfirmationModal title="取消预约确认" message={`将取消 ${cancellingAppointment.name} 在 ${cancellingAppointment.date} ${cancellingAppointment.time} 的日程。记录会保留。`} confirmLabel="确认取消" onConfirm={confirmCancel} onCancel={() => setCancellingAppointment(null)} />
      )}
      {deletingAppointment && (
        <ConfirmationModal
          title="删除预约确认"
          message={`将永久删除 ${deletingAppointment.name} 在 ${deletingAppointment.date} ${deletingAppointment.time} 的日程及患者预约快照。`}
          confirmLabel="永久删除"
          onConfirm={confirmDelete}
          onCancel={() => { setDeleteError(''); setDeletingAppointment(null); }}
          isConfirming={isDeleting}
          errorMessage={deleteError}
        />
      )}
    </div>
  );
};
