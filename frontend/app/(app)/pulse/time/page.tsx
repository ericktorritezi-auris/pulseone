'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { TeamMemberProgress } from '../../../../lib/types';
import { AvatarInitials } from '../../../../components/shared/AvatarInitials';
import { ProgressBar } from '../../../../components/shared/ProgressBar';
import { useAuth } from '../../../../lib/auth-context';

interface CycleTeamGroup {
  cycle: { id: string; label: string; areaName: string };
  team: TeamMemberProgress[];
}

export default function AvaliacaoDoTimePage() {
  const [groups, setGroups] = useState<CycleTeamGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CycleTeamGroup[]>('/pulse-team/current')
      .then(setGroups)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  if (groups.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Avaliação do Time</h1>
        <p className="text-sm text-p-neutral">Nenhum ciclo Pulse aberto no momento.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Avaliação do Time</h1>
      <p className="text-sm text-p-neutral mb-6">
        Acompanhamento individual de conclusão, ciclo por ciclo. Use isso pra cobrar quem estiver
        atrasado; você não vê o conteúdo das respostas de ninguém aqui.
      </p>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.cycle.id}>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold text-p-primary-dark">{group.cycle.label}</p>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-p-primary px-2 py-0.5 rounded-full">
                {group.cycle.areaName}
              </span>
            </div>
            <div className="space-y-3">
              {group.team.map((member) => (
                <div key={member.userId} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <AvatarInitials name={member.fullName} size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-p-primary-dark">{member.fullName}</p>
                      <p className="text-xs text-p-neutral">
                        {member.finalizados} de {member.total} avaliações concluídas
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-p-primary-dark">{member.percentual}%</span>
                  </div>
                  <ProgressBar value={member.percentual} showLabel={false} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
