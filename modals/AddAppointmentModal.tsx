import React, { useState, useRef, useEffect, useMemo } from 'react';
import { clinicService } from '../services/clinicService';
import { Button } from '../components/Button';
import { formatDateKey } from '../utils/date';
import { ModalBase } from './ModalBase';
import { GlobalAppointment, Patient } from '../types';
import { Search, X } from 'lucide-react';

export const AddAppointmentModal = ({
  phone,
  defaultName,
  patients = [],
  defaultDate,
  appointment,
  onClose,
  onSuccess
}: {
  phone?: string;
  defaultName?: string;
  patients?: Patient[];
  defaultDate?: string;
  appointment?: GlobalAppointment;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState(
    appointment?.patientId || phone || ''
  );
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [date, setDate] = useState(
    appointment?.date || defaultDate || formatDateKey(new Date())
  );
  const [time, setTime] = useState(appointment?.time || '09:00');
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const isEditing = Boolean(appointment);

  // 编辑模式下，初始化显示已选患者的名字
  useEffect(() => {
    if (appointment) {
      const patient = clinicService.getPatient(appointment.patientId);
      if (patient) setQuery(patient.name);
    }
  }, [appointment]);

  // 根据输入过滤患者，名字或电话匹配
  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
    );
  }, [patients, query]);

  // 下拉列表滚动跟随高亮项
  useEffect(() => {
    if (dropdownRef.current) {
      const item = dropdownRef.current.children[highlightIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const selectedPatient = selectedPatientId
    ? clinicService.getPatient(selectedPatientId)
    : undefined;

  const selectPatient = (patient: Patient) => {
    setSelectedPatientId(patient.id);
    setQuery(patient.name);
    setShowDropdown(false);
    setError('');
  };

  const clearSelection = () => {
    setSelectedPatientId('');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredPatients.length === 0) {
      if (e.key === 'ArrowDown') setShowDropdown(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(i => (i + 1) % filteredPatients.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(i => (i - 1 + filteredPatients.length) % filteredPatients.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredPatients[highlightIndex]) {
          selectPatient(filteredPatients[highlightIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setError('请选择患者后再保存预约。');
      return;
    }
    if (!date || !time) {
      setError('请选择预约日期和时间。');
      return;
    }

    const result = appointment
      ? clinicService.updateAppointment(appointment.id, {
          patientId: selectedPatientId,
          date,
          time,
        })
      : clinicService.addAppointment(selectedPatientId, date, time);

    if (!result.success) {
      setError(result.message);
      return;
    }
    onSuccess();
  };

  return (
    <ModalBase
      title={isEditing ? '编辑预约' : '新增预约'}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
            {error}
          </div>
        )}

        {/* === 患者搜索区 === */}
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">
            患者姓名
          </label>

          {/* 按电话快捷定位：不可编辑，只展示 */}
          {phone && !appointment ? (
            <div className="text-lg text-slate-900 font-medium px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
              {defaultName || selectedPatient?.name || '未命名患者'}
            </div>
          ) : patients.length > 0 ? (
            <div className="relative">
              {/* 搜索输入框 */}
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full border border-slate-300 rounded-lg pl-10 pr-10 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="输入姓名或电话搜索患者…"
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setShowDropdown(true);
                    setHighlightIndex(0);
                    // 如果文字和当前选中患者不一致，清除选中
                    if (selectedPatient && e.target.value !== selectedPatient.name) {
                      setSelectedPatientId('');
                    }
                  }}
                  onFocus={() => {
                    if (filteredPatients.length > 0) setShowDropdown(true);
                  }}
                  onBlur={() => {
                    // 延迟关闭，让点击事件先触发
                    setTimeout(() => setShowDropdown(false), 150);
                  }}
                  onKeyDown={handleKeyDown}
                />
                {query && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={clearSelection}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* 已选中患者提示 */}
              {selectedPatient && !showDropdown && (
                <p className="mt-1 text-sm text-teal-600 font-medium">
                  已选：{selectedPatient.name}
                  {selectedPatient.phone ? ` — ${selectedPatient.phone}` : ''}
                </p>
              )}

              {/* 下拉匹配列表 */}
              {showDropdown && filteredPatients.length > 0 && (
                <ul
                  ref={dropdownRef}
                  className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  {filteredPatients.map((patient, index) => (
                    <li
                      key={patient.id}
                      className={`px-4 py-3 text-base cursor-pointer flex justify-between items-center ${
                        index === highlightIndex
                          ? 'bg-teal-50 text-teal-900'
                          : 'hover:bg-slate-50'
                      }`}
                      onMouseDown={() => selectPatient(patient)}
                      onMouseEnter={() => setHighlightIndex(index)}
                    >
                      <span className="font-medium">{patient.name}</span>
                      <span className="text-slate-500 text-sm ml-4">
                        {patient.phone || '未填写电话'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* 无匹配结果 */}
              {showDropdown && query && filteredPatients.length === 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg px-4 py-3 text-base text-slate-500">
                  未找到匹配的患者
                </div>
              )}
            </div>
          ) : (
            <div className="text-lg text-slate-500 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
              请先新增患者档案
            </div>
          )}
        </div>

        {/* 日期 & 时间 */}
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">
            预约日期
          </label>
          <input
            type="date"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
            value={date}
            onChange={e => {
              setError('');
              setDate(e.target.value);
            }}
            required
          />
        </div>
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">
            预约时间
          </label>
          <input
            type="time"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
            value={time}
            onChange={e => {
              setError('');
              setTime(e.target.value);
            }}
            required
          />
        </div>

        <div className="pt-4 flex justify-end gap-4 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            size="lg"
          >
            取消
          </Button>
          <Button type="submit" size="lg" disabled={!selectedPatientId}>
            {isEditing ? '保存预约' : '确认预约'}
          </Button>
        </div>
      </form>
    </ModalBase>
  );
};
