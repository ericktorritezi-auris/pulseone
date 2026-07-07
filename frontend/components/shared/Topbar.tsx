'use client';

import { useAuth } from '../../lib/auth-context';
import { AvatarInitials } from './AvatarInitials';
import { NotificationBell } from './NotificationBell';

export function Topbar() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-end gap-4 px-6 shrink-0">
      <NotificationBell />
      <div className="flex items-center gap-2">
        <AvatarInitials name={user.fullName} size="sm" />
        <div className="text-sm leading-tight">
          <p className="font-medium text-p-primary-dark">{user.fullName}</p>
          <p className="text-p-neutral text-xs">{user.areaName}</p>
        </div>
      </div>
    </header>
  );
}
