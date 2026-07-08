'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { AvatarInitials } from './AvatarInitials';
import { NotificationBell } from './NotificationBell';

export function Topbar() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-end gap-4 px-6 shrink-0">
      <Link
        href="/manual"
        title="Manual do Usuário"
        className="flex items-center gap-1.5 text-xs font-medium text-p-neutral hover:text-p-primary border border-slate-200 px-3 py-1.5 rounded-lg"
      >
        <BookOpen size={14} />
        Manual do Usuário
      </Link>
      <NotificationBell />
      <div className="flex items-center gap-2">
        <AvatarInitials name={user.fullName} size="sm" />
        <div className="text-sm leading-tight">
          <p className="font-medium text-p-primary-dark">{user.fullName}</p>
          <p className="text-p-neutral text-xs">{user.areaName ?? 'Administrador'}</p>
        </div>
      </div>
    </header>
  );
}
