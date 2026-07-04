import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { Patient, PatientListItem } from '../types';
import { Button } from '../components/Button';
import { AddPatientModal } from '../modals/AddPatientModal';
import { clinicService } from '../services/clinicService';

const PAGE_SIZE = 80;
const ROW_HEIGHT = 76;
const OVERSCAN = 8;

export const PatientList = ({ onSelect, onRefresh }: { patients: Patient[], onSelect: (id: string) => void, onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemsByIndex, setItemsByIndex] = useState<Record<number, PatientListItem>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const pendingPagesRef = useRef<Set<number>>(new Set());
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 160);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
  }, []);

  const loadPage = useCallback(async (pageIndex: number, generation = requestGenerationRef.current) => {
    if (pageIndex < 0 || loadedPagesRef.current.has(pageIndex) || pendingPagesRef.current.has(pageIndex)) return;
    pendingPagesRef.current.add(pageIndex);
    setLoading(true);
    setError('');

    try {
      const offset = pageIndex * PAGE_SIZE;
      const page = await clinicService.getPatientListPage({ query, offset, limit: PAGE_SIZE });
      if (requestGenerationRef.current !== generation) return;
      setTotal(page.total);
      setItemsByIndex(prev => {
        const next = { ...prev };
        page.items.forEach((item, index) => {
          next[page.offset + index] = item;
        });
        return next;
      });
      loadedPagesRef.current.add(pageIndex);
    } catch (err) {
      if (requestGenerationRef.current !== generation) return;
      setError(err instanceof Error ? err.message : '患者列表加载失败。');
    } finally {
      if (requestGenerationRef.current !== generation) return;
      pendingPagesRef.current.delete(pageIndex);
      setLoading(pendingPagesRef.current.size > 0);
    }
  }, [query]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    loadedPagesRef.current = new Set();
    pendingPagesRef.current = new Set();
    setItemsByIndex({});
    setTotal(0);
    setScrollTop(0);
    scrollerRef.current?.scrollTo({ top: 0 });
    loadPage(0, generation);
  }, [loadPage]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const resizeObserver = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  const visibleRange = useMemo(() => {
    if (total === 0) return { start: 0, end: 0, indices: [] as number[] };
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    return {
      start,
      end,
      indices: Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index)
    };
  }, [scrollTop, total, viewportHeight]);

  useEffect(() => {
    if (visibleRange.end <= visibleRange.start) return;
    const firstPage = Math.floor(visibleRange.start / PAGE_SIZE);
    const lastPage = Math.floor((visibleRange.end - 1) / PAGE_SIZE);
    for (let page = firstPage; page <= lastPage; page += 1) {
      loadPage(page);
    }
  }, [loadPage, visibleRange.end, visibleRange.start]);

  const renderRow = (index: number) => {
    const patient = itemsByIndex[index];
    if (!patient) {
      return (
        <div
          key={`placeholder_${index}`}
          className="absolute left-0 right-0 grid grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.9fr)_minmax(120px,0.7fr)_minmax(120px,0.7fr)_56px] items-center border-b border-slate-100 px-6"
          style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
        >
          <div className="h-4 w-36 rounded bg-slate-100" />
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="h-4 w-20 rounded bg-slate-100" />
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div />
        </div>
      );
    }

    return (
      <div
        key={patient.id}
        className="absolute left-0 right-0 grid grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.9fr)_minmax(120px,0.7fr)_minmax(120px,0.7fr)_56px] items-center border-b border-slate-100 px-6 text-lg transition-colors hover:bg-teal-50/30 cursor-pointer group"
        style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
        onClick={() => onSelect(patient.id)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-lg font-bold text-teal-700">
            {patient.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{patient.name}</div>
            {patient.phone && patient.phoneCount > 1 && (
              <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                同号码组 {patient.phoneCount} 人
              </div>
            )}
          </div>
        </div>
        <div className="truncate text-slate-600">{patient.phone || '未填写'}</div>
        <div className="truncate text-slate-600">{patient.gender}, {patient.age}岁</div>
        <div className="truncate text-base text-slate-400">{patient.lastUpdate === '0000-00-00' ? '-' : patient.lastUpdate}</div>
        <div className="text-right">
          <ChevronRight className="inline-block text-slate-300 group-hover:text-teal-500" size={24} />
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">患者库</h2>
          <div className="mt-1 text-sm text-slate-500">{query ? `匹配 ${total} 位患者` : `共 ${total} 位患者`}</div>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="lg">
          <Plus size={20} className="mr-2" /> 新增患者
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="搜索姓名、拼音首字母或电话..."
            className="w-full pl-10 pr-4 py-3 text-lg border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.9fr)_minmax(120px,0.7fr)_minmax(120px,0.7fr)_56px] bg-slate-50 px-6 py-4 text-sm font-bold uppercase tracking-wider text-slate-500">
          <div>姓名</div>
          <div>电话</div>
          <div>性别/年龄</div>
          <div>最近更新</div>
          <div />
        </div>

        <div
          ref={scrollerRef}
          className="relative flex-1 overflow-auto"
          onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
        >
          {error ? (
            <div className="p-10 text-center text-red-500 text-lg">{error}</div>
          ) : total === 0 && !loading ? (
            <div className="p-10 text-center text-slate-500 text-lg">
              {query ? '未找到匹配的患者。' : '暂无患者数据，请点击右上角新增。'}
            </div>
          ) : (
            <div className="relative" style={{ height: total * ROW_HEIGHT }}>
              {visibleRange.indices.map(renderRow)}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddPatientModal
          patients={clinicService.getAllPatients()}
          onSelectPatient={(patientId) => {
            setShowAddModal(false);
            onSelect(patientId);
          }}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadedPagesRef.current = new Set();
            pendingPagesRef.current = new Set();
            setItemsByIndex({});
            loadPage(0);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
