import React, { useState } from 'react';
import { TreatmentForm } from '../features/treatment/TreatmentForm';
import { clinicService } from '../services/clinicService';
import { TreatmentRecord } from '../types';
import { ModalBase } from './ModalBase';

export const EditTreatmentModal = ({ phone, record, onClose, onSuccess }: { phone: string, record: TreatmentRecord, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());

  return (
    <ModalBase title="编辑处置记录" onClose={onClose} size="2xl">
      <TreatmentForm
        catalog={catalog}
        initialValue={{
          categoryId: record.categoryId,
          itemId: record.itemId,
          itemName: record.item,
          price: record.price,
          teeth: record.teeth || '',
          note: record.note
        }}
        submitLabel="保存更改"
        onCancel={onClose}
        onSubmit={value => {
          const success = clinicService.updateTreatment(phone, record.id, {
            categoryId: value.categoryId,
            itemId: value.itemId,
            item: value.itemName,
            price: value.price,
            teeth: value.teeth,
            note: value.note
          });

          if (success) {
            onSuccess();
          } else {
            alert('更新失败');
          }
        }}
      />
    </ModalBase>
  );
};
