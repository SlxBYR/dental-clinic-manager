import React from 'react';
import { X } from 'lucide-react';

export const ModalBase = ({ title, children, onClose, size = 'md' }: { title: string, children?: React.ReactNode, onClose: () => void, size?: 'md' | 'lg' | 'xl' | '2xl' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] animate-in fade-in zoom-in duration-200
      ${size === 'md' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-[min(1280px,calc(100vw-2rem))]'}`}>
      <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 flex-shrink-0 gap-4">
        <h3 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded hover:bg-slate-200"><X size={24}/></button>
      </div>
      <div className="p-4 sm:p-6 lg:p-8 overflow-auto min-h-0">
        {children}
      </div>
    </div>
  </div>
);
