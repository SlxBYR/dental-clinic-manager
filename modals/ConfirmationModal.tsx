import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/Button';
import { ModalBase } from './ModalBase';

export const ConfirmationModal = ({
  title,
  message,
  confirmLabel = '确认删除',
  onConfirm,
  onCancel
}: {
  title: string,
  message: string,
  confirmLabel?: string,
  onConfirm: () => void,
  onCancel: () => void
}) => (
  <ModalBase title={title} onClose={onCancel} size="md">
    <div className="space-y-6">
       <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg text-red-800 border border-red-100">
          <AlertTriangle className="flex-shrink-0 mt-1 text-red-600" size={24}/>
          <p className="text-lg leading-relaxed font-medium">{message}</p>
       </div>
       <div className="flex justify-end gap-4 pt-2">
          <Button variant="secondary" onClick={onCancel} size="lg">取消</Button>
          <Button variant="danger" onClick={onConfirm} size="lg">{confirmLabel}</Button>
       </div>
    </div>
  </ModalBase>
);
