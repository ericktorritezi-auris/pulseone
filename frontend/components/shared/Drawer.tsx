'use client';

import { X } from 'lucide-react';
import { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ open, title, onClose, children }: DrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl p-6 overflow-y-auto animate-in slide-in-from-right">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-p-primary-dark">{title}</h2>
          <button onClick={onClose} className="text-p-neutral hover:text-p-primary-dark">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
