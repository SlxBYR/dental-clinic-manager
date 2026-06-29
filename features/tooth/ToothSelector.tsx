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
  { value: '18', label: '8', groupKey: 'UR-8', kind: 'permanent', arch: 'upper', left: 6.0, top: 34.4, size: 'md' },
  { value: '17', label: '7', groupKey: 'UR-7', kind: 'permanent', arch: 'upper', left: 11.9, top: 34.4, size: 'md' },
  { value: '16', label: '6', groupKey: 'UR-6', kind: 'permanent', arch: 'upper', left: 17.9, top: 34.4, size: 'md' },
  { value: '15', label: '5', groupKey: 'UR-5', kind: 'permanent', arch: 'upper', left: 23.7, top: 34.4, size: 'md' },
  { value: '14', label: '4', groupKey: 'UR-4', kind: 'permanent', arch: 'upper', left: 29.5, top: 34.4, size: 'md' },
  { value: '13', label: '3', groupKey: 'UR-3', kind: 'permanent', arch: 'upper', left: 35.4, top: 34.4, size: 'md' },
  { value: '12', label: '2', groupKey: 'UR-2', kind: 'permanent', arch: 'upper', left: 41.2, top: 34.4, size: 'md' },
  { value: '11', label: '1', groupKey: 'UR-1', kind: 'permanent', arch: 'upper', left: 47.0, top: 34.4, size: 'md' },
  { value: '21', label: '1', groupKey: 'UL-1', kind: 'permanent', arch: 'upper', left: 53.0, top: 34.4, size: 'md' },
  { value: '22', label: '2', groupKey: 'UL-2', kind: 'permanent', arch: 'upper', left: 58.8, top: 34.4, size: 'md' },
  { value: '23', label: '3', groupKey: 'UL-3', kind: 'permanent', arch: 'upper', left: 64.6, top: 34.4, size: 'md' },
  { value: '24', label: '4', groupKey: 'UL-4', kind: 'permanent', arch: 'upper', left: 70.4, top: 34.4, size: 'md' },
  { value: '25', label: '5', groupKey: 'UL-5', kind: 'permanent', arch: 'upper', left: 76.3, top: 34.4, size: 'md' },
  { value: '26', label: '6', groupKey: 'UL-6', kind: 'permanent', arch: 'upper', left: 82.1, top: 34.4, size: 'md' },
  { value: '27', label: '7', groupKey: 'UL-7', kind: 'permanent', arch: 'upper', left: 88.0, top: 34.4, size: 'md' },
  { value: '28', label: '8', groupKey: 'UL-8', kind: 'permanent', arch: 'upper', left: 93.8, top: 34.4, size: 'md' },
  { value: '右上E', label: 'E', groupKey: 'UR-5', kind: 'primary', arch: 'upper', left: 23.7, top: 43.6, size: 'sm' },
  { value: '右上D', label: 'D', groupKey: 'UR-4', kind: 'primary', arch: 'upper', left: 29.5, top: 43.6, size: 'sm' },
  { value: '右上C', label: 'C', groupKey: 'UR-3', kind: 'primary', arch: 'upper', left: 35.4, top: 43.6, size: 'sm' },
  { value: '右上B', label: 'B', groupKey: 'UR-2', kind: 'primary', arch: 'upper', left: 41.2, top: 43.6, size: 'sm' },
  { value: '右上A', label: 'A', groupKey: 'UR-1', kind: 'primary', arch: 'upper', left: 47.0, top: 43.6, size: 'sm' },
  { value: '左上A', label: 'A', groupKey: 'UL-1', kind: 'primary', arch: 'upper', left: 53.0, top: 43.6, size: 'sm' },
  { value: '左上B', label: 'B', groupKey: 'UL-2', kind: 'primary', arch: 'upper', left: 58.8, top: 43.6, size: 'sm' },
  { value: '左上C', label: 'C', groupKey: 'UL-3', kind: 'primary', arch: 'upper', left: 64.6, top: 43.6, size: 'sm' },
  { value: '左上D', label: 'D', groupKey: 'UL-4', kind: 'primary', arch: 'upper', left: 70.4, top: 43.6, size: 'sm' },
  { value: '左上E', label: 'E', groupKey: 'UL-5', kind: 'primary', arch: 'upper', left: 76.3, top: 43.6, size: 'sm' },
  { value: '48', label: '8', groupKey: 'LR-8', kind: 'permanent', arch: 'lower', left: 6.0, top: 67.9, size: 'md' },
  { value: '47', label: '7', groupKey: 'LR-7', kind: 'permanent', arch: 'lower', left: 11.9, top: 67.9, size: 'md' },
  { value: '46', label: '6', groupKey: 'LR-6', kind: 'permanent', arch: 'lower', left: 17.9, top: 67.9, size: 'md' },
  { value: '45', label: '5', groupKey: 'LR-5', kind: 'permanent', arch: 'lower', left: 23.7, top: 67.9, size: 'md' },
  { value: '44', label: '4', groupKey: 'LR-4', kind: 'permanent', arch: 'lower', left: 29.5, top: 67.9, size: 'md' },
  { value: '43', label: '3', groupKey: 'LR-3', kind: 'permanent', arch: 'lower', left: 35.4, top: 67.9, size: 'md' },
  { value: '42', label: '2', groupKey: 'LR-2', kind: 'permanent', arch: 'lower', left: 41.2, top: 67.9, size: 'md' },
  { value: '41', label: '1', groupKey: 'LR-1', kind: 'permanent', arch: 'lower', left: 47.0, top: 67.9, size: 'md' },
  { value: '31', label: '1', groupKey: 'LL-1', kind: 'permanent', arch: 'lower', left: 53.0, top: 67.9, size: 'md' },
  { value: '32', label: '2', groupKey: 'LL-2', kind: 'permanent', arch: 'lower', left: 58.8, top: 67.9, size: 'md' },
  { value: '33', label: '3', groupKey: 'LL-3', kind: 'permanent', arch: 'lower', left: 64.6, top: 67.9, size: 'md' },
  { value: '34', label: '4', groupKey: 'LL-4', kind: 'permanent', arch: 'lower', left: 70.4, top: 67.9, size: 'md' },
  { value: '35', label: '5', groupKey: 'LL-5', kind: 'permanent', arch: 'lower', left: 76.3, top: 67.9, size: 'md' },
  { value: '36', label: '6', groupKey: 'LL-6', kind: 'permanent', arch: 'lower', left: 82.1, top: 67.9, size: 'md' },
  { value: '37', label: '7', groupKey: 'LL-7', kind: 'permanent', arch: 'lower', left: 88.0, top: 67.9, size: 'md' },
  { value: '38', label: '8', groupKey: 'LL-8', kind: 'permanent', arch: 'lower', left: 93.8, top: 67.9, size: 'md' },
  { value: '右下E', label: 'E', groupKey: 'LR-5', kind: 'primary', arch: 'lower', left: 23.7, top: 58.9, size: 'sm' },
  { value: '右下D', label: 'D', groupKey: 'LR-4', kind: 'primary', arch: 'lower', left: 29.5, top: 58.9, size: 'sm' },
  { value: '右下C', label: 'C', groupKey: 'LR-3', kind: 'primary', arch: 'lower', left: 35.4, top: 58.9, size: 'sm' },
  { value: '右下B', label: 'B', groupKey: 'LR-2', kind: 'primary', arch: 'lower', left: 41.2, top: 58.9, size: 'sm' },
  { value: '右下A', label: 'A', groupKey: 'LR-1', kind: 'primary', arch: 'lower', left: 47.0, top: 58.9, size: 'sm' },
  { value: '左下A', label: 'A', groupKey: 'LL-1', kind: 'primary', arch: 'lower', left: 53.0, top: 58.9, size: 'sm' },
  { value: '左下B', label: 'B', groupKey: 'LL-2', kind: 'primary', arch: 'lower', left: 58.8, top: 58.9, size: 'sm' },
  { value: '左下C', label: 'C', groupKey: 'LL-3', kind: 'primary', arch: 'lower', left: 64.6, top: 58.9, size: 'sm' },
  { value: '左下D', label: 'D', groupKey: 'LL-4', kind: 'primary', arch: 'lower', left: 70.4, top: 58.9, size: 'sm' },
  { value: '左下E', label: 'E', groupKey: 'LL-5', kind: 'primary', arch: 'lower', left: 76.3, top: 58.9, size: 'sm' },
];

const formatToothSelection = (value: string) => {
  if (value === 'ALL') return '全口';
  if (value === 'UPPER') return '上颌';
  if (value === 'LOWER') return '下颌';
  return value.split(',').filter(Boolean).join('、');
};

const getToothButtonStyle = (tooth: ToothImagePoint) => {
  const isPrimary = tooth.size === 'sm';

  return {
    hitSize: isPrimary ? '4.1%' : '4.5%',
    visualSize: isPrimary ? '78%' : '76%',
    fontSize: isPrimary ? 'clamp(13px, 1.15vw, 20px)' : 'clamp(14px, 1.3vw, 23px)',
  };
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
        <div className="relative mx-auto min-w-[760px] max-w-[920px] aspect-[1756/895] rounded-lg bg-white">
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
            const buttonStyle = getToothButtonStyle(tooth);

            return (
              <button
                key={tooth.value}
                type="button"
                aria-label={`选择牙位 ${tooth.value}`}
                title={`牙位 ${tooth.value}`}
                style={{
                  left: `${tooth.left}%`,
                  top: `${tooth.top}%`,
                  width: buttonStyle.hitSize,
                  aspectRatio: '1 / 1',
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
                onPointerDown={e => {
                  e.preventDefault();
                  handlePointerDown(tooth);
                }}
                onPointerEnter={() => handlePointerEnter(tooth)}
              >
                <span
                  style={{
                    width: buttonStyle.visualSize,
                    aspectRatio: '1 / 1',
                    fontSize: buttonStyle.fontSize,
                  }}
                  className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-bold leading-none transition-all ${
                    selected
                      ? 'border-teal-700 bg-teal-500/75 text-white shadow-sm'
                      : 'border-transparent bg-transparent text-transparent hover:border-teal-500/80 hover:bg-teal-100/50 hover:text-teal-900'
                  }`}
                >
                  {selected ? tooth.label : ''}
                </span>
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
