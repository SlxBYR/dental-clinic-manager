import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronsRight, ChevronLeft, ChevronRight, Clock3, Search, UserRound } from 'lucide-react';
import { Patient, PatientActivity } from '../types';
import { addDays, formatDateKey, getLocalDateKeyFromTimestamp } from '../utils/date';
import { patientMatchesSearch } from '../utils/patientSearch';

// 日历视觉尺寸集中在这里修改。
export const CALENDAR_CELL_SIZE_PX = 59;
export const CALENDAR_DATE_FONT_SIZE_PX = 20;
export const CALENDAR_ROW_BUTTON_WIDTH_PX = 34;
export const CALENDAR_FONT_FAMILY = '"Noto Sans Mono", monospace';
export const CALENDAR_MONTH_FONT_FAMILY = '"Century Gothic", CenturyGothic, sans-serif';

const CALENDAR_HEADER_HEIGHT_PX = 38;
const YEAR_DROPDOWN_START = 1971;
const YEAR_DROPDOWN_END = 2100;
const DEFAULT_INVALID_YEAR = 2025;
const DEFAULT_INVALID_MONTH = 10;
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type PatientDaySummary = {
  patient: Patient;
  activities: PatientActivity[];
};

const startOfCalendarGrid = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  return addDays(firstDay, -mondayOffset);
};

const activityTone = (activity: PatientActivity) => {
  if (activity.type === 'created') return 'bg-violet-50 text-violet-700';
  if (activity.type === 'initial_visit') return 'bg-emerald-50 text-emerald-700';
  if (activity.type === 'follow_up_visit') return 'bg-blue-50 text-blue-700';
  if (activity.type.startsWith('appointment')) return 'bg-amber-50 text-amber-700';
  if (activity.type.startsWith('treatment')) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const formatActivityTime = (value: string, includeDate: boolean) => {
  const date = new Date(value);
  const time = Number.isNaN(date.getTime())
    ? value.slice(11, 16)
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return includeDate ? `${getLocalDateKeyFromTimestamp(value)} ${time}` : time;
};

const normalizeYearInput = (value: string) => (
  /^\d{4}$/.test(value) && Number(value) > 1970 ? Number(value) : DEFAULT_INVALID_YEAR
);

const normalizeMonthInput = (value: string) => (
  /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 12
    ? Number(value)
    : DEFAULT_INVALID_MONTH
);

export const PatientCalendar = ({
  patients,
  onPatientClick
}: {
  patients: Patient[];
  onPatientClick: (id: string) => void;
}) => {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set([todayKey]));
  const [isEditingMonth, setIsEditingMonth] = useState(false);
  const [yearInput, setYearInput] = useState(String(today.getFullYear()));
  const [monthInput, setMonthInput] = useState(String(today.getMonth() + 1));
  const [patientSearch, setPatientSearch] = useState('');
  const monthEditorRef = useRef<HTMLDivElement>(null);
  const selectedYearOptionRef = useRef<HTMLButtonElement>(null);

  const activityByDate = useMemo(() => {
    const result: Record<string, Map<string, PatientDaySummary>> = {};
    patients.forEach(patient => {
      (patient.activityLog || []).forEach(activity => {
        const dateKey = getLocalDateKeyFromTimestamp(activity.occurredAt);
        if (!dateKey) return;
        result[dateKey] ||= new Map();
        const current = result[dateKey].get(patient.id) || { patient, activities: [] };
        current.activities.push(activity);
        result[dateKey].set(patient.id, current);
      });
    });
    return Object.fromEntries(
      Object.entries(result).map(([dateKey, patientMap]) => [
        dateKey,
        Array.from(patientMap.values())
          .map(summary => ({
            ...summary,
            activities: summary.activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          }))
          .sort((a, b) => b.activities[0].occurredAt.localeCompare(a.activities[0].occurredAt))
      ])
    ) as Record<string, PatientDaySummary[]>;
  }, [patients]);

  const gridDays = useMemo(() => {
    const start = startOfCalendarGrid(month);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);

  const calendarRows = useMemo(() => Array.from(
    { length: 6 },
    (_, rowIndex) => gridDays.slice(rowIndex * 7, rowIndex * 7 + 7)
  ), [gridDays]);

  const selectedPatients = useMemo(() => {
    const summariesByPatient = new Map<string, PatientDaySummary>();
    selectedDates.forEach(dateKey => {
      (activityByDate[dateKey] || []).forEach(summary => {
        const current = summariesByPatient.get(summary.patient.id) || { patient: summary.patient, activities: [] };
        current.activities.push(...summary.activities);
        summariesByPatient.set(summary.patient.id, current);
      });
    });
    return Array.from(summariesByPatient.values())
      .map(summary => ({
        ...summary,
        activities: summary.activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      }))
      .sort((a, b) => b.activities[0].occurredAt.localeCompare(a.activities[0].occurredAt));
  }, [activityByDate, selectedDates]);
  const visibleSelectedPatients = useMemo(() => selectedPatients.filter(summary => (
    patientMatchesSearch(summary.patient, patientSearch)
  )), [patientSearch, selectedPatients]);
  const dropdownYears = useMemo(() => Array.from(
    { length: YEAR_DROPDOWN_END - YEAR_DROPDOWN_START + 1 },
    (_, index) => YEAR_DROPDOWN_START + index
  ), []);

  const commitMonthEditor = useCallback(() => {
    const year = normalizeYearInput(yearInput.trim());
    const monthNumber = normalizeMonthInput(monthInput.trim());
    const next = new Date(year, monthNumber - 1, 1);
    setYearInput(String(year));
    setMonthInput(String(monthNumber));
    setMonth(next);
    setSelectedDates(new Set([formatDateKey(next)]));
    setIsEditingMonth(false);
  }, [monthInput, yearInput]);

  useEffect(() => {
    if (!isEditingMonth) return;
    selectedYearOptionRef.current?.scrollIntoView({ block: 'center' });
    const handlePointerDown = (event: PointerEvent) => {
      if (!monthEditorRef.current?.contains(event.target as Node)) commitMonthEditor();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape') commitMonthEditor();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [commitMonthEditor, isEditingMonth]);

  const openMonthEditor = () => {
    setYearInput(String(month.getFullYear()));
    setMonthInput(String(month.getMonth() + 1));
    setIsEditingMonth(true);
  };

  const changeMonth = (offset: number) => {
    setMonth(current => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      setSelectedDates(new Set([formatDateKey(next)]));
      return next;
    });
  };

  const returnToToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDates(new Set([todayKey]));
  };

  const selectDate = (dateKey: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!event.metaKey && !event.ctrlKey) {
      setSelectedDates(new Set([dateKey]));
      return;
    }
    setSelectedDates(current => {
      const next = new Set(current);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const selectRow = (row: Date[], event: React.MouseEvent<HTMLButtonElement>) => {
    const rowDateKeys = row.map(formatDateKey);
    if (!event.metaKey && !event.ctrlKey) {
      setSelectedDates(new Set(rowDateKeys));
      return;
    }
    setSelectedDates(current => {
      const next = new Set(current);
      const removeRow = rowDateKeys.every(dateKey => next.has(dateKey));
      rowDateKeys.forEach(dateKey => removeRow ? next.delete(dateKey) : next.add(dateKey));
      return next;
    });
  };

  const calendarGridColumns = `${CALENDAR_ROW_BUTTON_WIDTH_PX}px repeat(7, ${CALENDAR_CELL_SIZE_PX}px)`;
  const monthLabel = `${String(month.getFullYear()).padStart(4, '0')}.${String(month.getMonth() + 1).padStart(2, '0')}`;
  const calendarNavigation = (
    <div className="flex items-center justify-center gap-2">
      <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
        <ChevronLeft size={20} />
      </button>
      <div ref={monthEditorRef} className="relative">
        <button
          type="button"
          aria-label="编辑日历年月"
          aria-expanded={isEditingMonth}
          onClick={openMonthEditor}
          className="min-w-36 rounded-lg border border-transparent px-3 py-1.5 text-center text-xl font-bold tracking-wide text-slate-800 hover:border-slate-200 hover:bg-white"
          style={{ fontFamily: CALENDAR_MONTH_FONT_FAMILY }}
        >
          {monthLabel}
        </button>
        {isEditingMonth && (
          <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="grid w-full grid-cols-[minmax(0,1fr)_88px] gap-2" style={{ fontFamily: CALENDAR_MONTH_FONT_FAMILY }}>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                maxLength={4}
                aria-label="输入四位年份"
                value={yearInput}
                onChange={event => setYearInput(event.target.value)}
                onFocus={event => event.currentTarget.select()}
                className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="YYYY"
              />
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                aria-label="输入月份"
                value={monthInput}
                onChange={event => setMonthInput(event.target.value)}
                onFocus={event => event.currentTarget.select()}
                className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="MM"
              />
            </div>
            <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_88px] gap-2" style={{ fontFamily: CALENDAR_MONTH_FONT_FAMILY }}>
              <div className="h-48 min-w-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
                {dropdownYears.map(year => (
                  <button
                    key={year}
                    ref={year === Number(yearInput) ? selectedYearOptionRef : undefined}
                    type="button"
                    onClick={() => setYearInput(String(year))}
                    className={`block w-full rounded px-2 py-1 text-center text-sm ${year === Number(yearInput) ? 'bg-teal-100 font-bold text-teal-800' : 'text-slate-600 hover:bg-white'}`}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <div className="grid h-48 min-w-0 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                {Array.from({ length: 12 }, (_, index) => index + 1).map(monthNumber => (
                  <button
                    key={monthNumber}
                    type="button"
                    onClick={() => setMonthInput(String(monthNumber))}
                    className={`rounded py-1 text-sm ${monthNumber === Number(monthInput) ? 'bg-teal-100 font-bold text-teal-800' : 'text-slate-600 hover:bg-white'}`}
                  >
                    {String(monthNumber).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <button type="button" aria-label="下个月" onClick={() => changeMonth(1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
        <ChevronRight size={20} />
      </button>
      <button type="button" onClick={returnToToday} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
        回到今天
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col p-6">
      <div className="mb-5">
        <h2 className="text-3xl font-bold text-slate-900">患者更新日历</h2>
        <p className="mt-1 text-sm text-slate-500">新增、预约、初诊、复诊、资料和处置变更都会记录在对应日期。</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[max-content_minmax(320px,1fr)]">
        <div className="flex flex-col gap-3">
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: calendarGridColumns }}>
            <div className="flex items-center justify-center border-r border-slate-200 text-slate-300" style={{ height: CALENDAR_HEADER_HEIGHT_PX }}>
              <ChevronsRight size={14} />
            </div>
            {WEEKDAYS.map(weekday => (
              <div
                key={weekday}
                className="flex items-center justify-center border-r border-slate-200 text-xs font-bold text-slate-500 last:border-r-0"
                style={{ height: CALENDAR_HEADER_HEIGHT_PX, fontFamily: CALENDAR_FONT_FAMILY }}
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: calendarGridColumns }}>
            {calendarRows.flatMap((row, rowIndex) => {
              const rowDateKeys = row.map(formatDateKey);
              const rowSelected = rowDateKeys.every(dateKey => selectedDates.has(dateKey));
              return [
                <button
                  key={`row-${rowIndex}`}
                  type="button"
                  aria-label={`选择第 ${rowIndex + 1} 排日期`}
                  aria-pressed={rowSelected}
                  title="选择本排；按 Command 或 Ctrl 可叠加/取消整排"
                  onClick={event => selectRow(row, event)}
                  className={`flex items-center justify-center border-b border-r border-slate-200 transition-colors ${rowSelected ? 'bg-teal-100 text-teal-700' : 'bg-slate-50 text-slate-400 hover:bg-teal-50 hover:text-teal-600'}`}
                  style={{ width: CALENDAR_ROW_BUTTON_WIDTH_PX, height: CALENDAR_CELL_SIZE_PX }}
                >
                  <ChevronsRight size={16} />
                </button>,
                ...row.map(day => {
                  const dateKey = formatDateKey(day);
                  const summaries = activityByDate[dateKey] || [];
                  const inCurrentMonth = day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear();
                  const selected = selectedDates.has(dateKey);
                  const isToday = dateKey === todayKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      aria-label={`${dateKey}${summaries.length ? `，${summaries.length} 位患者` : ''}`}
                      aria-pressed={selected}
                      title={`${dateKey}${summaries.length ? ` · ${summaries.length} 位患者` : ''}`}
                      onClick={event => selectDate(dateKey, event)}
                      className={`relative flex items-center justify-center border-b border-r border-slate-200 transition-colors hover:bg-teal-50/70 ${
                        selected ? 'z-10 bg-teal-50 ring-2 ring-inset ring-teal-500' : inCurrentMonth ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                      style={{
                        width: CALENDAR_CELL_SIZE_PX,
                        height: CALENDAR_CELL_SIZE_PX,
                        fontFamily: CALENDAR_FONT_FAMILY,
                        fontSize: CALENDAR_DATE_FONT_SIZE_PX,
                        ...(isToday ? { backgroundColor: '#29BBF0' } : {})
                      }}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full font-bold leading-none ${
                        isToday ? 'text-white' : inCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        {String(day.getDate()).padStart(2, '0')}
                      </span>
                      {summaries.length > 0 && (
                        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold leading-none text-white">
                          {summaries.length}
                        </span>
                      )}
                    </button>
                  );
                })
              ];
            })}
          </div>
        </div>
        {calendarNavigation}
        </div>

        <aside className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                value={patientSearch}
                onChange={event => setPatientSearch(event.target.value)}
                placeholder="搜索姓名、拼音首字母或电话..."
                aria-label="搜索日历患者"
                className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-4 text-lg outline-none focus:border-transparent focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="h-full overflow-auto pb-20">
            {selectedDates.size === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center text-slate-400">
                <CalendarDays size={38} className="mb-3 text-slate-300" />
                请在日历中选择日期
              </div>
            ) : selectedPatients.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center text-slate-400">
                <CalendarDays size={38} className="mb-3 text-slate-300" />
                所选日期没有患者信息更新
              </div>
            ) : visibleSelectedPatients.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center text-slate-400">
                <Search size={38} className="mb-3 text-slate-300" />
                未找到匹配的患者
              </div>
            ) : (
              visibleSelectedPatients.map(summary => (
                <button
                  key={summary.patient.id}
                  type="button"
                  onClick={() => onPatientClick(summary.patient.id)}
                  className="block w-full border-b border-slate-100 px-5 py-4 text-left hover:bg-teal-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-700">
                      {summary.patient.name.charAt(0) || <UserRound size={17} />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{summary.patient.name}</div>
                      <div className="truncate text-xs text-slate-400">{summary.patient.phone || '未填写电话'}</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {summary.activities.map(activity => (
                      <div key={activity.id} className="flex items-start justify-between gap-3 text-sm">
                        <span className={`rounded-md px-2 py-1 ${activityTone(activity)}`}>{activity.label}</span>
                        <span className="mt-1 flex shrink-0 items-center gap-1 text-xs text-slate-400">
                          <Clock3 size={12} /> {formatActivityTime(activity.occurredAt, selectedDates.size > 1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
