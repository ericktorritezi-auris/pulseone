'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ManualSection({
  icon: Icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50"
      >
        <div className="w-10 h-10 rounded-lg bg-p-primary/10 text-p-primary flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-p-primary-dark">{title}</p>
          {subtitle && <p className="text-xs text-p-neutral">{subtitle}</p>}
        </div>
        <ChevronDown
          size={18}
          className={`text-p-neutral transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-5 pt-1 border-t border-slate-100 text-sm text-p-primary-dark space-y-3">{children}</div>}
    </div>
  );
}

// Diagrama ilustrativo simples (não é um print de tela real) — usado pra
// dar uma referência visual de onde as coisas ficam, já que não temos
// como capturar screenshots reais do sistema em produção aqui.
export function MockScreen({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-lg bg-slate-50 p-4 flex items-center gap-3">
      <div className="w-16 h-12 rounded bg-p-primary-dark shrink-0 flex items-center justify-center">
        <div className="w-8 h-1.5 bg-white/40 rounded" />
      </div>
      <div className="flex-1">
        <div className="h-2 w-2/3 bg-slate-300 rounded mb-1.5" />
        <div className="h-2 w-1/2 bg-slate-200 rounded" />
      </div>
      <span className="text-[10px] text-p-neutral shrink-0">ilustração — {label}</span>
    </div>
  );
}
