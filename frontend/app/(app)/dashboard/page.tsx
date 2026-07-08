'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { api } from '../../../lib/api';
import { CollaboratorDashboard } from '../../../lib/types';
import { ScoreRing } from '../../../components/shared/ScoreRing';
import { FeedbackList } from '../../../components/shared/FeedbackList';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CollaboratorDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CollaboratorDashboard>('/dashboard/collaborator')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;
  const isAdmin = user.role === 'ADMIN';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-p-primary-dark">Olá, {user.fullName.split(' ')[0]}! 👋</h1>
        {!isAdmin && (
          <Link
            href="/feedbacks/novo"
            className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus size={16} />
            Enviar Feedback
          </Link>
        )}
      </div>
      <p className="text-sm text-p-neutral mb-6">
        Bem-vindo(a) ao seu painel PulseOne.{' '}
        {user.role === 'GESTOR' && `Você gerencia a área de ${user.areaName}.`}
        {user.role === 'ADMIN' && 'Você tem acesso administrativo completo.'}
      </p>

      {!isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4">
            <ScoreRing value={data?.score ?? 0} size={64} />
            <div>
              <p className="text-sm text-p-neutral">Meu Score Atual</p>
              <p className="text-xs text-p-neutral mt-1">
                {data?.score === null || data?.score === undefined
                  ? 'Disponível após o primeiro ciclo Pulse'
                  : ''}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-sm text-p-neutral mb-1">Área</p>
            <p className="text-lg font-semibold text-p-primary-dark">{user.areaName}</p>
            <p className="text-xs text-p-neutral mt-1">{user.positionName}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-sm text-p-neutral mb-1">Pulse Atual</p>
            {data?.pulseAtual ? (
              <>
                <p className="text-lg font-semibold text-p-primary-dark">{data.pulseAtual.label}</p>
                <p className="text-xs text-p-neutral mt-1">
                  {data.pulseAtual.total - data.pulseAtual.pendentes} de {data.pulseAtual.total} avaliações concluídas
                  {data.pulseAtual.deadline &&
                    ` • Prazo: ${new Date(data.pulseAtual.deadline).toLocaleDateString('pt-BR')}`}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold text-p-primary-dark">Nenhum ciclo aberto</p>
            )}
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-p-primary-dark mb-3">Últimos Feedbacks Recebidos</h2>
            <FeedbackList items={data?.ultimosRecebidos ?? []} direction="received" loading={loading} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-p-primary-dark mb-3">Últimos Feedbacks Dados</h2>
            <FeedbackList items={data?.ultimosEnviados ?? []} direction="sent" loading={loading} />
          </div>
        </div>
      )}

      <p className="text-xs text-p-neutral mt-8">
        {isAdmin
          ? 'O Dashboard Executivo (áreas, cargos, pessoas por área, pulsos cadastrados, pulso vigente, participação e pendências) chega na Sprint 5.'
          : 'Os widgets de score, NPS e evolução por ciclo chegam nas Sprints 3, 4 e 5.'}
      </p>
    </div>
  );
}
