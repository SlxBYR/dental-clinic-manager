import React, { useEffect, useState } from 'react';
import { Smile } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { Button } from '../components/Button';
import { ToothSelector } from '../features/tooth/ToothSelector';
import { ModalBase } from './ModalBase';

export const AddTreatmentModal = ({ phone, onClose, onSuccess }: { phone: string, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());
  const [selectedCatId, setSelectedCatId] = useState(catalog.length > 0 ? catalog[0].id : '');
  const [selectedItemId, setSelectedItemId] = useState('');

  const [price, setPrice] = useState(0);
  const [teeth, setTeeth] = useState('');
  const [note, setNote] = useState('');

  // 分类变化时重置为该分类首个项目，确保默认价格来自最新目录。
  useEffect(() => {
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat && cat.items.length > 0) {
      setSelectedItemId(cat.items[0].id);
      setPrice(cat.items[0].price);
    } else {
      setSelectedItemId('');
      setPrice(0);
    }
  }, [selectedCatId, catalog]);

  // 项目变化时同步目录默认价格，用户仍可手工改价。
  useEffect(() => {
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat) {
      const item = cat.items.find(i => i.id === selectedItemId);
      if (item) {
        setPrice(item.price);
      }
    }
  }, [selectedItemId, selectedCatId, catalog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cat = catalog.find(c => c.id === selectedCatId);
    const item = cat?.items.find(i => i.id === selectedItemId);

    if (item) {
      clinicService.addTreatment(phone, item, price, teeth.trim(), note.trim(), selectedCatId);
      onSuccess();
    }
  };

  const currentCategory = catalog.find(c => c.id === selectedCatId);

  return (
    <ModalBase title="新增处置记录" onClose={onClose} size="2xl">
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
           <Button type="submit" size="lg">提交记录</Button>
        </div>
      </form>
    </ModalBase>
  );
};
