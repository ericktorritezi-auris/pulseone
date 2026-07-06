'use client';

import { useAuth } from '../../../lib/auth-context';
import { ScoreRing } from '../../../components/shared/ScoreRing';

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Olá, {user.fullName.split(' ')[0]}! 👋</h1>
      <p className="text-sm text-p-neutral mb-6">
        Bem-vindo(a) ao seu painel PulseOne.{' '}
        {user.role === 'GESTOR' && `Você gerencia a área de ${user.areaName}.`}
        {user.role === 'ADMIN' && 'Você tem acesso administrativo completo.'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4">
          <ScoreRing value={0} size={64} />
          <div>
            <p className="text-sm text-p-neutral">Meu Score Atual</p>
            <p className="text-xs text-p-neutral mt-1">Disponível após o primeiro ciclo Pulse</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-p-neutral mb-1">Área</p>
          <p className="text-lg font-semibold text-p-primary-dark">{user.areaName}</p>
          <p className="text-xs text-p-neutral mt-1">{user.positionName}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-p-neutral mb-1">Pulse Atual</p>
          <p className="text-lg font-semibold text-p-primary-dark">Nenhum ciclo aberto</p>
        </div>
      </div>

      <p className="text-xs text-p-neutral mt-8">
        Os widgets completos de feedback, evolução e consolidação chegam nas próximas sprints (2, 3, 4 e 5).
      </p>
    </div>
  );
}
