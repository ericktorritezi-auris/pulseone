'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, Briefcase, Users, RefreshCw, ClipboardCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { api } from '../../../lib/api';
import { CollaboratorDashboard, AdminDashboardData, ManagerDashboardData } from '../../../lib/types';
import { ScoreRing } from '../../../components/shared/ScoreRing';
import { FeedbackList } from '../../../components/shared/FeedbackList';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CollaboratorDashboard | null>(null);
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);
  const [managerData, setManagerData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const requests: Promise<any>[] = [api.get<CollaboratorDashboard>('/dashboard/collaborator').then(setData)];

    if (user.role === 'ADMIN') {
      requests.push(api.get<AdminDashboardData>('/dashboard/admin').then(setAdminData));
    }
    if (user.role === 'GESTOR') {
      requests.push(api.get<ManagerDashboardData>('/dashboard/manager').then(setManagerData));
    }

    Promise.all(requests).finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;
  const isAdmin = user.role === 'ADMIN';
  const isGestor = user.role === 'GESTOR';

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

      {/* ============ DASHBOARD EXECUTIVO DO ADMIN ============ */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <Building2 size={18} className="text-p-primary mb-2" />
              <p className="text-2xl font-semibold text-p-primary-dark">{adminData?.totalAreas ?? '—'}</p>
              <p className="text-xs text-p-neutral">Áreas cadastradas</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <Briefcase size={18} className="text-p-primary mb-2" />
              <p className="text-2xl font-semibold text-p-primary-dark">{adminData?.totalCargos ?? '—'}</p>
              <p className="text-xs text-p-neutral">Cargos cadastrados</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <RefreshCw size={18} className="text-p-primary mb-2" />
              <p className="text-2xl font-semibold text-p-primary-dark">{adminData?.totalPulsos ?? '—'}</p>
              <p className="text-xs text-p-neutral">Pulsos cadastrados</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <AlertCircle size={18} className="text-p-warning mb-2" />
              <p className="text-2xl font-semibold text-p-primary-dark">{adminData?.pendencias ?? 0}</p>
              <p className="text-xs text-p-neutral">Pendências no pulso vigente</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-p-neutral mb-1">Pulso Vigente</p>
              {adminData?.pulsoVigente ? (
                <>
                  <p className="text-lg font-semibold text-p-primary-dark">{adminData.pulsoVigente.label}</p>
                  {adminData.pulsoVigente.deadline && (
                    <p className="text-xs text-p-neutral mt-1">
                      Prazo: {new Date(adminData.pulsoVigente.deadline).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  {adminData.participacaoPercentual !== null && (
                    <p className="text-xs text-p-neutral mt-1">
                      Participação: <b className="text-p-primary-dark">{adminData.participacaoPercentual}%</b>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-lg font-semibold text-p-primary-dark">Nenhum ciclo aberto</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-p-neutral mb-3">Pessoas cadastradas por área</p>
              <div className="space-y-2">
                {adminData?.pessoasPorArea.map((a) => (
                  <div key={a.areaName} className="flex justify-between text-sm">
                    <span className="text-p-neutral">{a.areaName}</span>
                    <span className="font-medium text-p-primary-dark">{a.total}</span>
                  </div>
                ))}
                {adminData && adminData.pessoasPorArea.length === 0 && (
                  <p className="text-xs text-p-neutral">Nenhuma área com pessoas ainda.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ DASHBOARD DO GESTOR (executivo da própria equipe) ============ */}
      {isGestor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-p-neutral mb-1">Score médio da equipe</p>
            <p className="text-2xl font-semibold text-p-primary-dark">
              {managerData?.scoreMedio !== null && managerData?.scoreMedio !== undefined
                ? managerData.scoreMedio.toFixed(1)
                : '—'}
            </p>
            {managerData?.cycleLabel && <p className="text-xs text-p-neutral mt-1">{managerData.cycleLabel}</p>}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-p-neutral mb-1">NPS médio da equipe</p>
            <p className="text-2xl font-semibold text-p-primary-dark">
              {managerData?.npsMedio !== null && managerData?.npsMedio !== undefined
                ? managerData.npsMedio.toFixed(1)
                : '—'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-p-neutral mb-1">Membros da equipe</p>
            <p className="text-2xl font-semibold text-p-primary-dark">{managerData?.teamSize ?? 0}</p>
          </div>
        </div>
      )}

      {isGestor && managerData && managerData.team.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
          <p className="text-xs font-semibold text-p-neutral uppercase mb-3">Minha equipe</p>
          <div className="space-y-2">
            {managerData.team.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <AvatarInitials name={m.fullName} size="sm" />
                <div>
                  <p className="text-sm font-medium text-p-primary-dark">{m.fullName}</p>
                  <p className="text-xs text-p-neutral">{m.positionName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ WIDGETS PADRÃO (colaborador e gestor) ============ */}
      {!isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4">
            <ScoreRing value={data?.score ?? 0} size={64} />
            <div>
              <p className="text-sm text-p-neutral">Meu Score Atual</p>
              <p className="text-xs text-p-neutral mt-1">
                {data?.score === null || data?.score === undefined
                  ? 'Disponível após o primeiro ciclo Pulse'
                  : `NPS: ${data.npsRecomendacao?.toFixed(1) ?? '—'}`}
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
    </div>
  );
}
