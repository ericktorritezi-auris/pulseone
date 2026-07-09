'use client';

import Link from 'next/link';
import { BookOpen, Menu } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { AvatarInitials } from './AvatarInitials';
import { NotificationBell } from './NotificationBell';

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between gap-4 px-4 md:px-6 shrink-0">
      {/* Botão de abrir o menu — só existe no mobile (md:hidden). No
          desktop o Sidebar já fica sempre visível, então não faz sentido
          mostrar isso lá. */}
      <button
        onClick={onMenuClick}
        className="md:hidden text-p-primary-dark shrink-0"
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>

      <div className="flex items-center justify-end gap-3 md:gap-4 flex-1 min-w-0">
        <Link
          href="/manual"
          title="Manual do Usuário"
          className="flex items-center gap-1.5 text-xs font-medium text-p-neutral hover:text-p-primary border border-slate-200 px-2.5 md:px-3 py-1.5 rounded-lg shrink-0"
        >
          <BookOpen size={14} />
          <span className="hidden sm:inline">Manual do Usuário</span>
        </Link>
        <NotificationBell />
        <div className="flex items-center gap-2 min-w-0">
          <AvatarInitials name={user.fullName} size="sm" />
          <div className="text-sm leading-tight hidden sm:block min-w-0">
            <p className="font-medium text-p-primary-dark truncate">{user.fullName}</p>
            <p className="text-p-neutral text-xs truncate">{user.areaName ?? 'Administrador'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
