import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Stethoscope } from 'lucide-react';
import { Patient, PatientListItem } from '../types';
import { Button } from '../components/Button';
import { AddPatientModal } from '../modals/AddPatientModal';
import { clinicService } from '../services/clinicService';
import { formatDateKey } from '../utils/date';

const PAGE_SIZE = 30;

export const PatientList = ({ onSelect, onRefresh }: { patients: Patient[], onSelect: (id: string) => void, onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'recent'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [items, setItems] = useState<PatientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestGenerationRef = useRef(0);
  const listScrollerRef = useRef<HTMLDivElement | null>(null);
  const today = formatDateKey(new Date());
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, total);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(search.trim());
      setCurrentPage(1);
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
  }, []);

  const loadCurrentPage = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setError('');

    try {
      const page = await clinicService.getPatientListPage({
        query,
        scope,
        today,
        offset: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      if (requestGenerationRef.current !== generation) return;

      const lastPage = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
      setTotal(page.total);
      if (currentPage > lastPage) {
        setCurrentPage(lastPage);
        return;
      }
      setItems(page.items);
    } catch (err) {
      if (requestGenerationRef.current !== generation) return;
      setItems([]);
      setError(err instanceof Error ? err.message : '患者列表加载失败。');
    } finally {
      if (requestGenerationRef.current === generation) setLoading(false);
    }
  }, [currentPage, query, scope, today]);

  useEffect(() => {
    loadCurrentPage();
  }, [loadCurrentPage, refreshToken]);

  useEffect(() => {
    listScrollerRef.current?.scrollTo({ top: 0 });
  }, [currentPage, query, scope]);

  const reloadPage = async (goToFirstPage = false) => {
    try {
      await clinicService.saveDataAsync();
    } catch {
      // saveDataAsync 已记录具体存储错误；仍刷新当前可用存储中的列表。
    }
    if (goToFirstPage) setCurrentPage(1);
    setRefreshToken(value => value + 1);
    onRefresh();
  };

  const changePage = (page: number) => {
    if (loading) return;
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  };

  const renderRow = (patient: PatientListItem) => (
    <div
      key={patient.id}
      className="grid min-h-[76px] grid-cols-[minmax(220px,1.35fr)_minmax(135px,0.8fr)_minmax(120px,0.7fr)_minmax(120px,0.75fr)_130px] items-center border-b border-slate-100 px-6 text-lg transition-colors hover:bg-teal-50/30 cursor-pointer group"
      onClick={() => onSelect(patient.id)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-lg font-bold text-teal-700">
          {patient.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{patient.name}</div>
          {patient.isTodayVisit && (
            <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {patient.todayVisitType === 'initial' ? '今日初诊' : '今日复诊'}
              {patient.lastVisitAt ? ` · ${new Date(patient.lastVisitAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          )}
          {patient.phone && patient.phoneCount > 1 && (
            <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              同号码组 {patient.phoneCount} 人
            </div>
          )}
        </div>
      </div>
      <div className="truncate text-slate-600">{patient.phone || 'none'}</div>
      <div className="truncate text-slate-600">{patient.gender}, {patient.age}岁</div>
      <div className="truncate text-base text-slate-400">{patient.lastUpdate === '0000-00-00' ? '-' : patient.lastUpdate}</div>
      <div className="flex items-center justify-end gap-2">
        {!patient.isTodayVisit && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
            onClick={async event => {
              event.stopPropagation();
              const result = clinicService.checkInPatient(patient.id, 'follow_up');
              if (!result.success) {
                window.alert(result.message);
                return;
              }
              await reloadPage();
            }}
          >
            <Stethoscope size={15} /> 复诊
          </button>
        )}
        <ChevronRight className="inline-block text-slate-300 group-hover:text-teal-500" size={24} />
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">患者库</h2>
          <div className="mt-1 text-sm text-slate-500">
            {scope === 'recent'
              ? `近七天有 ${total} 位患者产生新改动`
              : query ? `匹配 ${total} 位患者` : `共 ${total} 位患者`}
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="lg">
          <Plus size={20} className="mr-2" /> 新增患者
        </Button>
      </div>

      <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="搜索姓名、拼音首字母或电话..."
            className="w-full pl-10 pr-4 py-3 text-lg border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-shrink-0 rounded-lg bg-slate-100 p-1" role="group" aria-label="患者显示范围">
          {([
            ['all', '全部'],
            ['recent', '近七天']
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                scope === value
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setCurrentPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="grid grid-cols-[minmax(220px,1.35fr)_minmax(135px,0.8fr)_minmax(120px,0.7fr)_minmax(120px,0.75fr)_130px] bg-slate-50 px-6 py-4 text-sm font-bold uppercase tracking-wider text-slate-500">
          <div>姓名</div>
          <div>电话</div>
          <div>性别/年龄</div>
          <div>最近更新</div>
          <div className="text-right">操作</div>
        </div>

        <div ref={listScrollerRef} className="flex-1 overflow-auto">
          {error ? (
            <div className="p-10 text-center text-red-500 text-lg">{error}</div>
          ) : loading ? (
            <div className="p-10 text-center text-slate-400 text-lg">正在加载患者列表...</div>
          ) : total === 0 ? (
            <div className="p-10 text-center text-slate-500 text-lg">
              {query
                ? '未找到匹配的患者。'
                : scope === 'recent' ? '近七天暂无患者新改动。' : '暂无患者数据，请点击右上角新增。'}
            </div>
          ) : (
            items.map(renderRow)
          )}
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-3 text-sm text-slate-600">
            <div>第 {rangeStart}-{rangeEnd} 条，共 {total} 条；每页 30 条</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage === 1 || loading}
                onClick={() => changePage(1)}
              >
                首页
              </button>
              <button
                type="button"
                aria-label="上一页"
                className="rounded-md border border-slate-200 bg-white p-2 hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage === 1 || loading}
                onClick={() => changePage(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-24 text-center font-medium text-slate-700">第 {currentPage} / {totalPages} 页</span>
              <button
                type="button"
                aria-label="下一页"
                className="rounded-md border border-slate-200 bg-white p-2 hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage === totalPages || loading}
                onClick={() => changePage(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage === totalPages || loading}
                onClick={() => changePage(totalPages)}
              >
                末页
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddPatientModal
          patients={clinicService.getAllPatients()}
          onSelectPatient={patientId => {
            setShowAddModal(false);
            onSelect(patientId);
          }}
          onClose={() => setShowAddModal(false)}
          onSuccess={async () => {
            setShowAddModal(false);
            await reloadPage(true);
          }}
        />
      )}
    </div>
  );
};
