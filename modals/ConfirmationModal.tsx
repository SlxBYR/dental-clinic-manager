import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/Button';
import { ModalBase } from './ModalBase';

export const ConfirmationModal = ({
  title,
  message,
  confirmLabel = '确认删除',
  onConfirm,
  onCancel,
  isConfirming = false,
  errorMessage
}: {
  title: string,
  message: string,
  confirmLabel?: string,
  onConfirm: () => void | Promise<void>,
  onCancel: () => void,
  isConfirming?: boolean,
  errorMessage?: string
}) => (
  <ModalBase title={title} onClose={() => { if (!isConfirming) onCancel(); }} size="md">
    <div className="space-y-6">
       <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg text-red-800 border border-red-100">
          <AlertTriangle className="flex-shrink-0 mt-1 text-red-600" size={24}/>
          <p className="text-lg leading-relaxed font-medium">{message}</p>
       </div>
       {errorMessage && (
         <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
           {errorMessage}
         </p>
       )}
       <div className="flex justify-end gap-4 pt-2">
          <Button variant="secondary" onClick={onCancel} size="lg" disabled={isConfirming}>取消</Button>
          <Button variant="danger" onClick={onConfirm} size="lg" disabled={isConfirming}>
            {isConfirming ? '正在保存…' : confirmLabel}
          </Button>
       </div>
    </div>
  </ModalBase>
);
