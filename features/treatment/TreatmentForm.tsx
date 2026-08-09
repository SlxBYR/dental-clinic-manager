import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '../../components/Button';
import { TreatmentCategory, TreatmentItem } from '../../types';
import { ToothSelector } from '../tooth/ToothSelector';

export type TreatmentFormSubmitValue = {
  categoryId: string;
  itemId?: string;
  itemName: string;
  item?: TreatmentItem;
  price: number;
  teeth: string;
  note: string;
};

type TreatmentFormInitialValue = {
  categoryId?: string;
  itemId?: string;
  itemName?: string;
  price?: number;
  teeth?: string;
  note?: string;
};

type TreatmentFormProps = {
  catalog: TreatmentCategory[];
  initialValue?: TreatmentFormInitialValue;
  submitLabel: string;
  onSubmit: (value: TreatmentFormSubmitValue) => void;
  onCancel: () => void;
  showActions?: boolean;
  onChange?: (value: TreatmentFormSubmitValue) => void;
};

const findCatalogSelection = (catalog: TreatmentCategory[], initialValue?: TreatmentFormInitialValue) => {
  for (const category of catalog) {
    const item = category.items.find(candidate => (
      candidate.id === initialValue?.itemId || candidate.name === initialValue?.itemName
    ));
    if (item) return { category, item };
  }

  const category = catalog.find(candidate => candidate.items.length > 0) || catalog[0];
  const item = category?.items[0];
  return { category, item };
};

export const TreatmentForm = ({ catalog, initialValue, submitLabel, onSubmit, onCancel, showActions = true, onChange }: TreatmentFormProps) => {
  const initialSelection = useMemo(() => findCatalogSelection(catalog, initialValue), [catalog, initialValue]);
  const [selectedCatId, setSelectedCatId] = useState(initialSelection.category?.id || '');
  const [selectedItemId, setSelectedItemId] = useState(initialSelection.item?.id || '');
  const [price, setPrice] = useState(
    typeof initialValue?.price === 'number' ? initialValue.price : initialSelection.item?.price || 0
  );
  const [teeth, setTeeth] = useState(initialValue?.teeth || '');
  const [note, setNote] = useState(initialValue?.note || '');
  const previousCategoryId = useRef(selectedCatId);
  const previousItemId = useRef(selectedItemId);

  const currentCategory = catalog.find(category => category.id === selectedCatId);
  const currentItem = currentCategory?.items.find(item => item.id === selectedItemId);

  // 切换分类时自动选中该分类首个项目，并把价格恢复为目录默认价。
  useEffect(() => {
    if (previousCategoryId.current === selectedCatId) return;
    previousCategoryId.current = selectedCatId;
    const category = catalog.find(candidate => candidate.id === selectedCatId);
    const firstItem = category?.items[0];
    setSelectedItemId(firstItem?.id || '');
    setPrice(firstItem?.price || 0);
  }, [selectedCatId, catalog]);

  // 切换项目时同步目录默认价；编辑弹窗首次载入时保留原成交价。
  useEffect(() => {
    if (previousItemId.current === selectedItemId) return;
    previousItemId.current = selectedItemId;
    const category = catalog.find(candidate => candidate.id === selectedCatId);
    const item = category?.items.find(candidate => candidate.id === selectedItemId);
    if (item) setPrice(item.price);
  }, [selectedItemId, selectedCatId, catalog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      categoryId: selectedCatId,
      itemId: currentItem?.id,
      itemName: currentItem?.name || initialValue?.itemName || '',
      item: currentItem,
      price: Number.isFinite(price) ? price : 0,
      teeth: teeth.trim(),
      note: note.trim()
    });
  };

  const originalPrice = currentItem?.price || 0;
  const canSubmit = Boolean(currentItem || initialValue?.itemName);
  const currentValue: TreatmentFormSubmitValue = {
    categoryId: selectedCatId,
    itemId: currentItem?.id,
    itemName: currentItem?.name || initialValue?.itemName || '',
    item: currentItem,
    price: Number.isFinite(price) ? price : 0,
    teeth: teeth.trim(),
    note: note.trim()
  };

  useEffect(() => {
    onChange?.(currentValue);
  }, [currentValue.categoryId, currentValue.itemId, currentValue.itemName, currentValue.price, currentValue.teeth, currentValue.note, onChange]);

  const fields = (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_220px_minmax(260px,0.9fr)] gap-4 lg:gap-6 items-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">分类</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
              value={selectedCatId}
              onChange={e => setSelectedCatId(e.target.value)}
            >
              {catalog.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">项目</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
            >
              {currentCategory?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">价格 (¥)</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none font-mono h-[54px]"
            value={Number.isFinite(price) ? price : 0}
            onChange={e => setPrice(Number.parseFloat(e.target.value))}
          />
          <p className="text-sm text-slate-400 mt-2">原价: ¥{originalPrice}</p>
        </div>

        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">备注 (可选)</label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none min-h-[54px] h-[54px] lg:h-[92px] resize-none"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col min-w-0">
        <label className="block text-base font-bold text-slate-700 mb-4 flex flex-wrap items-center gap-2">
          <Smile size={20} className="text-teal-600" />
          选择牙位
        </label>
        <div className="flex-1 flex items-center justify-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-2 sm:p-4 min-w-0">
          <ToothSelector value={teeth} onChange={setTeeth} />
        </div>
      </div>

    </>
  );

  if (!showActions) return <div className="space-y-6 min-h-0">{fields}</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 min-h-0">
      {fields}
      <div className="pt-2 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} size="lg">取消</Button>
        <Button type="submit" size="lg" disabled={!canSubmit}>{submitLabel}</Button>
      </div>
    </form>
  );
};
