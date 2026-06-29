import React, { useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';

type ToothImagePoint = {
  value: string;
  label: string;
  groupKey: string;
  kind: 'permanent' | 'primary';
  arch: 'upper' | 'lower';
  left: number;
  top: number;
  size: 'md' | 'sm';
};

const TOOTH_IMAGE_POINTS: ToothImagePoint[] = [
  { value: '18', label: '8', groupKey: 'UR-8', kind: 'permanent', arch: 'upper', left: 3.3, top: 34.2, size: 'md' },
  { value: '17', label: '7', groupKey: 'UR-7', kind: 'permanent', arch: 'upper', left: 9.3, top: 34.2, size: 'md' },
  { value: '16', label: '6', groupKey: 'UR-6', kind: 'permanent', arch: 'upper', left: 15.3, top: 34.2, size: 'md' },
  { value: '15', label: '5', groupKey: 'UR-5', kind: 'permanent', arch: 'upper', left: 21.3, top: 34.2, size: 'md' },
  { value: '14', label: '4', groupKey: 'UR-4', kind: 'permanent', arch: 'upper', left: 27.3, top: 34.2, size: 'md' },
  { value: '13', label: '3', groupKey: 'UR-3', kind: 'permanent', arch: 'upper', left: 33.3, top: 34.2, size: 'md' },
  { value: '12', label: '2', groupKey: 'UR-2', kind: 'permanent', arch: 'upper', left: 39.4, top: 34.2, size: 'md' },
  { value: '11', label: '1', groupKey: 'UR-1', kind: 'permanent', arch: 'upper', left: 45.4, top: 34.2, size: 'md' },
  { value: '21', label: '1', groupKey: 'UL-1', kind: 'permanent', arch: 'upper', left: 51.9, top: 34.2, size: 'md' },
  { value: '22', label: '2', groupKey: 'UL-2', kind: 'permanent', arch: 'upper', left: 58.0, top: 34.2, size: 'md' },
  { value: '23', label: '3', groupKey: 'UL-3', kind: 'permanent', arch: 'upper', left: 64.0, top: 34.2, size: 'md' },
  { value: '24', label: '4', groupKey: 'UL-4', kind: 'permanent', arch: 'upper', left: 70.0, top: 34.2, size: 'md' },
  { value: '25', label: '5', groupKey: 'UL-5', kind: 'permanent', arch: 'upper', left: 76.0, top: 34.2, size: 'md' },
  { value: '26', label: '6', groupKey: 'UL-6', kind: 'permanent', arch: 'upper', left: 82.0, top: 34.2, size: 'md' },
  { value: '27', label: '7', groupKey: 'UL-7', kind: 'permanent', arch: 'upper', left: 88.0, top: 34.2, size: 'md' },
  { value: '28', label: '8', groupKey: 'UL-8', kind: 'permanent', arch: 'upper', left: 94.1, top: 34.2, size: 'md' },
  { value: '右上E', label: 'E', groupKey: 'UR-5', kind: 'primary', arch: 'upper', left: 21.3, top: 42.9, size: 'sm' },
  { value: '右上D', label: 'D', groupKey: 'UR-4', kind: 'primary', arch: 'upper', left: 27.3, top: 42.9, size: 'sm' },
  { value: '右上C', label: 'C', groupKey: 'UR-3', kind: 'primary', arch: 'upper', left: 33.3, top: 42.9, size: 'sm' },
  { value: '右上B', label: 'B', groupKey: 'UR-2', kind: 'primary', arch: 'upper', left: 39.4, top: 42.9, size: 'sm' },
  { value: '右上A', label: 'A', groupKey: 'UR-1', kind: 'primary', arch: 'upper', left: 45.4, top: 42.9, size: 'sm' },
  { value: '左上A', label: 'A', groupKey: 'UL-1', kind: 'primary', arch: 'upper', left: 51.9, top: 42.9, size: 'sm' },
  { value: '左上B', label: 'B', groupKey: 'UL-2', kind: 'primary', arch: 'upper', left: 58.0, top: 42.9, size: 'sm' },
  { value: '左上C', label: 'C', groupKey: 'UL-3', kind: 'primary', arch: 'upper', left: 64.0, top: 42.9, size: 'sm' },
  { value: '左上D', label: 'D', groupKey: 'UL-4', kind: 'primary', arch: 'upper', left: 70.0, top: 42.9, size: 'sm' },
  { value: '左上E', label: 'E', groupKey: 'UL-5', kind: 'primary', arch: 'upper', left: 76.0, top: 42.9, size: 'sm' },
  { value: '48', label: '8', groupKey: 'LR-8', kind: 'permanent', arch: 'lower', left: 3.3, top: 69.2, size: 'md' },
  { value: '47', label: '7', groupKey: 'LR-7', kind: 'permanent', arch: 'lower', left: 9.3, top: 69.2, size: 'md' },
  { value: '46', label: '6', groupKey: 'LR-6', kind: 'permanent', arch: 'lower', left: 15.3, top: 69.2, size: 'md' },
  { value: '45', label: '5', groupKey: 'LR-5', kind: 'permanent', arch: 'lower', left: 21.3, top: 69.2, size: 'md' },
  { value: '44', label: '4', groupKey: 'LR-4', kind: 'permanent', arch: 'lower', left: 27.3, top: 69.2, size: 'md' },
  { value: '43', label: '3', groupKey: 'LR-3', kind: 'permanent', arch: 'lower', left: 33.3, top: 69.2, size: 'md' },
  { value: '42', label: '2', groupKey: 'LR-2', kind: 'permanent', arch: 'lower', left: 39.4, top: 69.2, size: 'md' },
  { value: '41', label: '1', groupKey: 'LR-1', kind: 'permanent', arch: 'lower', left: 45.4, top: 69.2, size: 'md' },
  { value: '31', label: '1', groupKey: 'LL-1', kind: 'permanent', arch: 'lower', left: 51.9, top: 69.2, size: 'md' },
  { value: '32', label: '2', groupKey: 'LL-2', kind: 'permanent', arch: 'lower', left: 58.0, top: 69.2, size: 'md' },
  { value: '33', label: '3', groupKey: 'LL-3', kind: 'permanent', arch: 'lower', left: 64.0, top: 69.2, size: 'md' },
  { value: '34', label: '4', groupKey: 'LL-4', kind: 'permanent', arch: 'lower', left: 70.0, top: 69.2, size: 'md' },
  { value: '35', label: '5', groupKey: 'LL-5', kind: 'permanent', arch: 'lower', left: 76.0, top: 69.2, size: 'md' },
  { value: '36', label: '6', groupKey: 'LL-6', kind: 'permanent', arch: 'lower', left: 82.0, top: 69.2, size: 'md' },
  { value: '37', label: '7', groupKey: 'LL-7', kind: 'permanent', arch: 'lower', left: 88.0, top: 69.2, size: 'md' },
  { value: '38', label: '8', groupKey: 'LL-8', kind: 'permanent', arch: 'lower', left: 94.1, top: 69.2, size: 'md' },
  { value: '右下E', label: 'E', groupKey: 'LR-5', kind: 'primary', arch: 'lower', left: 21.3, top: 61.2, size: 'sm' },
  { value: '右下D', label: 'D', groupKey: 'LR-4', kind: 'primary', arch: 'lower', left: 27.3, top: 61.2, size: 'sm' },
  { value: '右下C', label: 'C', groupKey: 'LR-3', kind: 'primary', arch: 'lower', left: 33.3, top: 61.2, size: 'sm' },
  { value: '右下B', label: 'B', groupKey: 'LR-2', kind: 'primary', arch: 'lower', left: 39.4, top: 61.2, size: 'sm' },
  { value: '右下A', label: 'A', groupKey: 'LR-1', kind: 'primary', arch: 'lower', left: 45.4, top: 61.2, size: 'sm' },
  { value: '左下A', label: 'A', groupKey: 'LL-1', kind: 'primary', arch: 'lower', left: 51.9, top: 61.2, size: 'sm' },
  { value: '左下B', label: 'B', groupKey: 'LL-2', kind: 'primary', arch: 'lower', left: 58.0, top: 61.2, size: 'sm' },
  { value: '左下C', label: 'C', groupKey: 'LL-3', kind: 'primary', arch: 'lower', left: 64.0, top: 61.2, size: 'sm' },
  { value: '左下D', label: 'D', groupKey: 'LL-4', kind: 'primary', arch: 'lower', left: 70.0, top: 61.2, size: 'sm' },
  { value: '左下E', label: 'E', groupKey: 'LL-5', kind: 'primary', arch: 'lower', left: 76.0, top: 61.2, size: 'sm' },
];

const formatToothSelection = (value: string) => {
  if (value === 'ALL') return '全口';
  if (value === 'UPPER') return '上颌';
  if (value === 'LOWER') return '下颌';
  return value.split(',').filter(Boolean).join('、');
};

const ToothCrown = ({ tooth, selected }: { tooth: ToothPoint, selected: boolean }) => {
  const isMolar = tooth.type === 'molar';
  const isPremolar = tooth.type === 'premolar';
  const width = isMolar ? 44 : isPremolar ? 34 : 29;
  const height = isMolar ? 50 : isPremolar ? 39 : 34;
  const rx = isMolar ? 12 : 15;

  return (
    <g transform={`translate(${tooth.x} ${tooth.y}) rotate(${tooth.angle})`}>
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={rx}
        className={`${selected ? 'fill-teal-100 stroke-teal-600' : 'fill-white stroke-slate-500 group-hover:fill-teal-50 group-hover:stroke-teal-500'} transition-colors`}
        strokeWidth="3"
      />
      {isMolar ? (
        <>
          <path d="M-13 -10 C-4 -15 4 -15 13 -10 M-13 10 C-4 15 4 15 13 10 M-13 -10 C-18 0 -18 5 -13 10 M13 -10 C18 0 18 5 13 10" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M-12 0 H12 M0 -14 V14" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-10 -7 C-2 -14 8 -12 11 -4 C7 3 1 8 -9 9 C-13 3 -14 -2 -10 -7Z" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={isPremolar ? 'M-6 0 C0 -6 7 -3 8 5' : 'M-7 4 C0 0 5 -3 8 -9'} className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </g>
  );
};

export const ToothSelector = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const isDragging = useRef(false);
  const dragMode = useRef<'select' | 'deselect'>('select');

  const selectedTeeth = useMemo(() => {
    if (value === 'ALL') return new Set(['ALL']);
    if (value === 'UPPER') return new Set(['UPPER']);
    if (value === 'LOWER') return new Set(['LOWER']);
    return new Set(value.split(',').filter(Boolean));
  }, [value]);

  useEffect(() => {
    const handleUp = () => { isDragging.current = false; };
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, []);

  const updateSelection = (tooth: ToothImagePoint, mode: 'select' | 'deselect') => {
    const newSet = new Set(selectedTeeth);

    if (newSet.has('ALL') || newSet.has('UPPER') || newSet.has('LOWER')) {
      newSet.clear();
    }

    if (mode === 'select') {
      TOOTH_IMAGE_POINTS
        .filter(point => point.groupKey === tooth.groupKey && point.value !== tooth.value)
        .forEach(point => newSet.delete(point.value));
      newSet.add(tooth.value);
    } else {
      newSet.delete(tooth.value);
    }

    onChange(Array.from(newSet).join(','));
  };

  const handlePointerDown = (tooth: ToothImagePoint) => {
    isDragging.current = true;
    const isSelected = selectedTeeth.has(tooth.value);

    dragMode.current = isSelected ? 'deselect' : 'select';

    updateSelection(tooth, dragMode.current);
  };

  const handlePointerEnter = (tooth: ToothImagePoint) => {
    if (isDragging.current) {
      updateSelection(tooth, dragMode.current);
    }
  };

  const setSpecial = (type: string) => {
    onChange(type);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 select-none shadow-inner w-full flex flex-col items-center p-3 sm:p-4 min-w-0">
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        <button type="button" onClick={() => setSpecial('UPPER')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='UPPER' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>上颌</button>
        <button type="button" onClick={() => setSpecial('ALL')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='ALL' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>全口</button>
        <button type="button" onClick={() => setSpecial('LOWER')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='LOWER' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>下颌</button>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="relative mx-auto min-w-[760px] max-w-[920px] aspect-[1850/850] rounded-lg bg-white">
          <img
            src="./tooth-chart.png"
            alt="牙位选择图"
            className="absolute inset-0 h-full w-full rounded-lg object-contain"
            draggable={false}
          />
          {TOOTH_IMAGE_POINTS.map(tooth => {
          const selected = selectedTeeth.has(tooth.value)
            || (tooth.kind === 'permanent' && selectedTeeth.has('ALL'))
            || (tooth.kind === 'permanent' && selectedTeeth.has('UPPER') && tooth.arch === 'upper')
            || (tooth.kind === 'permanent' && selectedTeeth.has('LOWER') && tooth.arch === 'lower');
          return (
            <button
              key={tooth.value}
              type="button"
              aria-label={`选择牙位 ${tooth.value}`}
              title={`牙位 ${tooth.value}`}
              style={{ left: `${tooth.left}%`, top: `${tooth.top}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 font-bold transition-all ${
                tooth.size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
              } ${
                selected
                  ? 'border-teal-700 bg-teal-500/80 text-white shadow-md'
                  : 'border-slate-300 bg-white/85 text-slate-900 shadow-sm hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900'
              }`}
              onPointerDown={e => {
                e.preventDefault();
                handlePointerDown(tooth);
              }}
              onPointerEnter={() => handlePointerEnter(tooth)}
            >
              {tooth.label}
            </button>
          );
        })}
        </div>
      </div>

      <div className="mt-3 text-center min-h-8 max-w-full">
        {value ? (
           <div className="inline-flex max-w-full items-center gap-2 bg-teal-100 text-teal-800 px-4 py-1.5 rounded-full text-sm font-medium animate-in fade-in zoom-in duration-200 shadow-sm border border-teal-200">
             <Check size={16} className="flex-shrink-0"/> <span className="flex-shrink-0">已选择:</span> <span className="font-mono font-bold truncate">{formatToothSelection(value)}</span>
           </div>
        ) : (
          <span aria-hidden="true">&nbsp;</span>
        )}
      </div>
    </div>
  );
};
