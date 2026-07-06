'use client';

import { useAuth } from '../../../lib/auth-context';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-6">Meu Perfil</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4 mb-4">
        <AvatarInitials name={user.fullName} size="lg" />
        <div>
          <p className="text-lg font-semibold text-p-primary-dark">{user.fullName}</p>
          <p className="text-sm text-p-neutral">{user.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-p-neutral">Área</span>
          <span className="text-p-primary-dark font-medium">{user.areaName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-p-neutral">Cargo</span>
          <span className="text-p-primary-dark font-medium">{user.positionName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-p-neutral">Perfil de acesso</span>
          <span className="text-p-primary-dark font-medium">{user.role}</span>
        </div>
      </div>
    </div>
  );
}
