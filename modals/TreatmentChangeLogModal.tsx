import React from 'react';
import { Clock3 } from 'lucide-react';
import { Button } from '../components/Button';
import { TreatmentChangeLog, TreatmentRecord } from '../types';
import { mergeConsecutiveSameDayNoteChanges } from '../utils/treatmentChangeLogs';
import { ModalBase } from './ModalBase';

const FIELD_LABELS: Record<string, string> = {
  categoryId: '处置分类',
  itemId: '处置项目',
  item: '项目名称',
  price: '价格',
  teeth: '牙位',
  note: '备注'
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const formatValue = (value: string | number | undefined) => {
  if (value === undefined || value === '') return '空';
  return String(value);
};

const getFieldLabel = (field: string) => FIELD_LABELS[field] || field;

const renderChangedField = (log: TreatmentChangeLog, field: string) => (
  <div key={field} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-white px-4 py-3 sm:grid-cols-[96px_1fr]">
    <div className="text-sm font-bold text-slate-600">{getFieldLabel(field)}</div>
    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
        <span className="mr-2 text-xs font-bold text-red-400">修改前</span>
        {formatValue(log.before[field])}
      </div>
      <div className="rounded-md bg-green-50 px-3 py-2 text-green-700">
        <span className="mr-2 text-xs font-bold text-green-500">修改后</span>
        {formatValue(log.after[field])}
      </div>
    </div>
  </div>
);

export const TreatmentChangeLogModal = ({
  record,
  onClose
}: {
  record: TreatmentRecord;
  onClose: () => void;
}) => {
  const logs = mergeConsecutiveSameDayNoteChanges(record.changeLogs || []).reverse();

  return (
    <ModalBase title="处置修改记录" onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-4">
          <div className="text-sm font-bold text-slate-400">处置项目</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-lg font-bold text-slate-800">{record.item}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-mono text-slate-600">ID: {record.id}</span>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
            暂无修改记录
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map(log => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Clock3 size={16} className="text-blue-500" />
                    {formatDateTime(log.changedAt)}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">{log.id}</div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {log.changedFields.map(field => (
                    <span key={field} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {getFieldLabel(field)}
                    </span>
                  ))}
                </div>
                <div className="space-y-2">
                  {log.changedFields.map(field => renderChangedField(log, field))}
                </div>
                {log.note && (
                  <div className="mt-3 rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
                    {log.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </ModalBase>
  );
};
