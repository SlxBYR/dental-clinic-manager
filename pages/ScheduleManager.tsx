import React, { useMemo, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Circle, Edit2, Plus, Search, Trash2, UserCheck, XCircle } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { GlobalAppointment, Patient } from '../types';
import { addDays, formatDateKey } from '../utils/date';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { ModalBase } from '../modals/ModalBase';
import { getAppointmentStatusClass, getAppointmentStatusLabel } from '../utils/statusStyles';
import { CALENDAR_MONTH_FONT_FAMILY } from './PatientCalendar';

const SLOT_MINUTES = 30;
const START_MINUTES = 8 * 60;
const LAST_VISIBLE_SLOT_MINUTES = 20 * 60;
const END_MINUTES = LAST_VISIBLE_SLOT_MINUTES + SLOT_MINUTES;
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

const twoDigits = (value: number) => String(value).padStart(2, '0');
const formatShortDate = (date: Date) => `${twoDigits(date.getMonth() + 1)}.${twoDigits(date.getDate())}`;
const formatScheduleDateRange = (start: Date, end: Date) => {
  const startLabel = `${start.getFullYear()}.${twoDigits(start.getMonth() + 1)}.${twoDigits(start.getDate())}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${startLabel}~${end.getFullYear()}.${twoDigits(end.getMonth() + 1)}.${twoDigits(end.getDate())}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${startLabel}~${twoDigits(end.getMonth() + 1)}.${twoDigits(end.getDate())}`;
  }
  return `${startLabel}~${twoDigits(end.getDate())}`;
};
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

type PositionedAppointment = {
  appointment: GlobalAppointment;
  lane: number;
  laneCount: number;
};

const positionOverlappingAppointments = (appointments: GlobalAppointment[]): PositionedAppointment[] => {
  const sorted = appointments
    .map(appointment => ({
      appointment,
      start: timeToMinutes(appointment.time),
      end: timeToMinutes(appointment.time) + appointment.durationMinutes
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.appointment.name.localeCompare(b.appointment.name));
  const clusters: typeof sorted[] = [];
  let currentCluster: typeof sorted = [];
  let clusterEnd = -1;

  sorted.forEach(item => {
    if (currentCluster.length > 0 && item.start >= clusterEnd) {
      clusters.push(currentCluster);
      currentCluster = [];
      clusterEnd = -1;
    }
    currentCluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  if (currentCluster.length > 0) clusters.push(currentCluster);

  return clusters.flatMap(cluster => {
    const laneEnds: number[] = [];
    const withLanes = cluster.map(item => {
      let lane = laneEnds.findIndex(end => end <= item.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      return { appointment: item.appointment, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    return withLanes.map(item => ({ ...item, laneCount }));
  });
};

export const ScheduleManager = ({ patients, onRefresh, onPatientClick }: { patients: Patient[], onRefresh: () => void, onPatientClick: (id: string) => void }) => {
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [query, setQuery] = useState('');
  const [showArrivedOnly, setShowArrivedOnly] = useState(false);
  const [newSlot, setNewSlot] = useState<{ date: string; time: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<GlobalAppointment | null>(null);
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
  const dateRangeLabel = formatScheduleDateRange(days[0], days[6]);
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
  const showNowLine = today >= startDate && today <= endDate && nowMinutes >= START_MINUTES && nowMinutes <= LAST_VISIBLE_SLOT_MINUTES;

  const advanceStatus = (appointment: GlobalAppointment) => {
    if (appointment.status === 'cancelled' || appointment.status === 'completed') return;
    clinicService.updateAppointmentStatus(appointment.id, appointment.status === 'pending' ? 'arrived' : 'completed');
    setSelectedAppointment({ ...appointment });
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
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: CALENDAR_MONTH_FONT_FAMILY }}>{dateRangeLabel}</h2>
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
                    onClick={() => { setAnchorDate(new Date(`${appointment.date}T12:00:00`)); setQuery(''); setSelectedAppointment(appointment); }}
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
              const dayAppointments = positionOverlappingAppointments(
                weekAppointments.filter(appointment => {
                  const start = timeToMinutes(appointment.time);
                  return appointment.date === dateKey && start >= START_MINUTES && start < END_MINUTES;
                })
              );
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
                  {dayAppointments.map(({ appointment, lane, laneCount }) => {
                    const start = timeToMinutes(appointment.time);
                    const top = (start - START_MINUTES) * MINUTE_HEIGHT;
                    const height = Math.max(38, Math.min(appointment.durationMinutes, END_MINUTES - start) * MINUTE_HEIGHT);
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        aria-label={`打开 ${appointment.name} 的预约菜单`}
                        title={appointment.name}
                        onClick={event => { event.stopPropagation(); setSelectedAppointment(appointment); }}
                        className={`absolute z-10 flex items-center overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition-shadow hover:z-20 hover:shadow-md ${appointmentTone(appointment)}`}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane * 100) / laneCount}% + 2px)`,
                          width: `calc(${100 / laneCount}% - 4px)`
                        }}
                      >
                        <span className="block w-full truncate font-bold">{appointment.name}</span>
                      </button>
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

      {selectedAppointment && (
        <ModalBase title="预约操作" onClose={() => setSelectedAppointment(null)} size="md">
          <div className="space-y-5" aria-label="预约二级菜单">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-xl font-bold text-slate-900">{selectedAppointment.name}</div>
                  <div className="mt-2 font-mono text-sm text-slate-500">{selectedAppointment.date} {selectedAppointment.time}</div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${getAppointmentStatusClass(selectedAppointment.status)}`}>
                  {getAppointmentStatusLabel(selectedAppointment.status)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white px-3 py-2 text-slate-600">
                  <div className="text-xs text-slate-400">就诊类型</div>
                  <div className="mt-1 font-medium">
                    {selectedAppointment.visitType === 'initial' ? '初诊' : selectedAppointment.visitType === 'follow_up' ? '复诊' : '未标记'}
                  </div>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-slate-600">
                  <div className="text-xs text-slate-400">预约来源</div>
                  <div className="mt-1 font-medium">{selectedAppointment.source === 'walk_in' ? '现场' : '预约'}</div>
                </div>
              </div>
              {selectedAppointment.plannedTreatments.length > 0 && (
                <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
                  <div className="text-xs text-slate-400">预约处置</div>
                  <div className="mt-1 font-medium">{selectedAppointment.plannedTreatments.map(item => item.itemName).join('、')}</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  const patientId = selectedAppointment.patientId;
                  setSelectedAppointment(null);
                  onPatientClick(patientId);
                }}
              >
                <UserCheck size={16} className="mr-2" /> 查看患者
              </Button>
              <Button
                disabled={selectedAppointment.status === 'cancelled' || selectedAppointment.status === 'completed'}
                onClick={() => advanceStatus(selectedAppointment)}
              >
                {selectedAppointment.status === 'arrived' ? <CheckCircle size={16} className="mr-2" /> : <Circle size={16} className="mr-2" />}
                {selectedAppointment.status === 'pending'
                  ? '标记已到诊'
                  : selectedAppointment.status === 'arrived' ? '标记已完成' : getAppointmentStatusLabel(selectedAppointment.status)}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingAppointment(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                <Edit2 size={16} className="mr-2" /> 编辑预约
              </Button>
              <Button
                variant="secondary"
                disabled={selectedAppointment.status === 'cancelled'}
                onClick={() => {
                  setCancellingAppointment(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                <XCircle size={16} className="mr-2" /> 取消预约
              </Button>
              <Button
                variant="danger"
                className="col-span-2"
                onClick={() => {
                  setDeleteError('');
                  setDeletingAppointment(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                <Trash2 size={16} className="mr-2" /> 删除预约
              </Button>
            </div>
          </div>
        </ModalBase>
      )}

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
