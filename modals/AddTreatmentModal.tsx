import React, { useState } from 'react';
import { TreatmentForm } from '../features/treatment/TreatmentForm';
import { clinicService } from '../services/clinicService';
import { ModalBase } from './ModalBase';

export const AddTreatmentModal = ({ phone, onClose, onSuccess }: { phone: string, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());

  return (
    <ModalBase title="新增处置记录" onClose={onClose} size="2xl">
      <TreatmentForm
        catalog={catalog}
        submitLabel="提交记录"
        onCancel={onClose}
        onSubmit={value => {
          if (!value.item) return;
          clinicService.addTreatment(phone, value.item, value.price, value.teeth, value.note, value.categoryId);
          onSuccess();
        }}
      />
    </ModalBase>
  );
};
