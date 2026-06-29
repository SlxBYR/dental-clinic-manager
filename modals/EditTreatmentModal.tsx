import React, { useEffect, useState } from 'react';
import { Smile } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { TreatmentRecord } from '../types';
import { Button } from '../components/Button';
import { ToothSelector } from '../features/tooth/ToothSelector';
import { ModalBase } from './ModalBase';

export const EditTreatmentModal = ({ phone, record, onClose, onSuccess }: { phone: string, record: TreatmentRecord, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  const [price, setPrice] = useState(record.price);
  const [teeth, setTeeth] = useState(record.teeth);
  const [note, setNote] = useState(record.note);
  const [initialLoad, setInitialLoad] = useState(true);

  // 优先用 itemId 匹配现有目录，旧数据则退回到项目名称匹配。
  useEffect(() => {
    let foundCatId = '';
    let foundItemId = '';

    // Try to find the item in current catalog
    for (const cat of catalog) {
      const foundItem = cat.items.find(i => i.id === record.itemId || i.name === record.item);
      if (foundItem) {
        foundCatId = cat.id;
        foundItemId = foundItem.id;
        break;
      }
    }

    // If found, select it. If not (maybe catalog changed), default to first to avoid empty state,
    // or we could keep it empty but for simplicity let's default to first if existing is invalid.
    if (foundCatId && foundItemId) {
      setSelectedCatId(foundCatId);
      setSelectedItemId(foundItemId);
    } else if (catalog.length > 0) {
      setSelectedCatId(catalog[0].id);
      if (catalog[0].items.length > 0) setSelectedItemId(catalog[0].items[0].id);
    }

    // Disable initial load flag after a short delay to allow 'price' effect to be skipped once
    setTimeout(() => setInitialLoad(false), 50);
  }, [record, catalog]);

  // 用户切换分类后，价格回到新分类默认项目价格。
  useEffect(() => {
    if (initialLoad) return;
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat && cat.items.length > 0) {
      setSelectedItemId(cat.items[0].id);
      // Also update price to default when category changes manually
      setPrice(cat.items[0].price);
    } else {
      setSelectedItemId('');
      setPrice(0);
    }
  }, [selectedCatId, catalog, initialLoad]);

  // 用户切换项目后同步目录默认价。
  useEffect(() => {
    if (initialLoad) return;
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat) {
      const item = cat.items.find(i => i.id === selectedItemId);
      if (item) {
        setPrice(item.price);
      }
    }
  }, [selectedItemId, selectedCatId, catalog, initialLoad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!teeth) {
      alert("请选择牙位");
      return;
    }
    const cat = catalog.find(c => c.id === selectedCatId);
    const item = cat?.items.find(i => i.id === selectedItemId);

    // We use the selected item name, or fallback to record.item if something is wrong (shouldn't happen with valid catalog)
    const itemName = item ? item.name : record.item;

    const success = clinicService.updateTreatment(phone, record.id, {
      categoryId: selectedCatId,
      itemId: item?.id,
      item: itemName,
      price: price,
      teeth: teeth,
      note: note.trim()
    });

    if (success) {
      onSuccess();
    } else {
      alert("更新失败");
    }
  };

  const currentCategory = catalog.find(c => c.id === selectedCatId);

  return (
    <ModalBase title="编辑处置记录" onClose={onClose} size="2xl">
      <form onSubmit={handleSubmit} className="space-y-6 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_220px_minmax(260px,0.9fr)] gap-4 lg:gap-6 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">分类</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedCatId} onChange={e => setSelectedCatId(e.target.value)}>
                 {catalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">项目</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                 {currentCategory?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
               </select>
            </div>
          </div>

          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">价格 (¥)</label>
            <input type="number" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none font-mono h-[54px]"
              value={price} onChange={e => setPrice(parseFloat(e.target.value))} />
            <p className="text-sm text-slate-400 mt-2">原价: ¥{currentCategory?.items.find(i => i.id === selectedItemId)?.price || 0}</p>
          </div>

          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">备注 (可选)</label>
            <textarea className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none min-h-[54px] h-[54px] lg:h-[92px] resize-none"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col min-w-0">
           <label className="block text-base font-bold text-slate-700 mb-4 flex flex-wrap items-center gap-2">
             <Smile size={20} className="text-teal-600"/>
             选择牙位
           </label>
           <div className="flex-1 flex items-center justify-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-2 sm:p-4 min-w-0">
             <ToothSelector value={teeth} onChange={setTeeth} />
           </div>
        </div>

        <div className="pt-2 flex flex-wrap justify-end gap-3">
           <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
           <Button type="submit" size="lg">保存更改</Button>
        </div>
      </form>
    </ModalBase>
  );
};
