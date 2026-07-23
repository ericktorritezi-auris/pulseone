'use client';

import { useEffect, useState } from 'react';
import { Rocket, Users } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { SystemNpsCampaignStatus, SystemNpsSummary } from '../../../lib/types';

export default function SystemNpsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SystemNpsCampaignStatus | null>(null);
  const [summary, setSummary] = useState<SystemNpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [statusRes, summaryRes] = await Promise.all([
        api.get<SystemNpsCampaignStatus>('/system-nps/campaign-status'),
        api.get<SystemNpsSummary>('/system-nps/summary'),
      ]);
      setStatus(statusRes);
      setSummary(summaryRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva do administrador.</p>;
  }

  async function handleTrigger() {
    if (
      !confirm(
        'Disparar uma nova pesquisa de NPS? Todo mundo (exceto admin) vai ver o modal no próximo login, até responder. Quem ainda não respondeu a pesquisa anterior deixa de ser cobrado por ela.',
      )
    ) {
      return;
    }
    setTriggering(true);
    try {
      await api.post('/system-nps/trigger');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao disparar a pesquisa.');
    } finally {
      setTriggering(false);
    }
  }

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  const promotersPct = summary && summary.total > 0 ? Math.round((summary.promoters / summary.total) * 100) : 0;
  const passivesPct = summary && summary.total > 0 ? Math.round((summary.passives / summary.total) * 100) : 0;
  const detractorsPct = summary && summary.total > 0 ? Math.round((summary.detractors / summary.total) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">NPS do Sistema</h1>
      <p className="text-sm text-p-neutral mb-6">
        O quanto as pessoas recomendam o PulseOne — respostas 100% anônimas, coletadas depois do
        login. O administrador nunca participa.
      </p>

      {/* Campanha atual */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-p-primary/10 text-p-primary flex items-center justify-center shrink-0">
            <Users size={18} />
          </div>
          <div>
            {status?.active ? (
              <>
                <p className="text-sm font-semibold text-p-primary-dark">
                  Campanha disparada em{' '}
                  {status.createdAt && new Date(status.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
                <p className="text-xs text-p-neutral">
                  {status.totalResponderam} de {status.totalElegiveis} pessoas já responderam
                </p>
              </>
            ) : (
              <p className="text-sm text-p-neutral">Nenhuma pesquisa disparada ainda.</p>
            )}
          </div>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 shrink-0"
        >
          <Rocket size={16} />
          {triggering ? 'Disparando...' : 'Disparar pesquisa NPS'}
        </button>
      </div>

      {/* Score + barras */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-8 flex-wrap">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center shrink-0 relative"
            style={{
              background: `conic-gradient(#10B981 0% ${promotersPct}%, #F59E0B ${promotersPct}% ${
                promotersPct + passivesPct
              }%, #EF4444 ${promotersPct + passivesPct}% 100%)`,
            }}
          >
            <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-p-primary-dark">{summary?.npsScore ?? 0}</span>
              <span className="text-[10px] text-p-neutral">NPS</span>
            </div>
          </div>

          <div className="flex-1 min-w-[220px] space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-p-neutral">Promotores (9-10)</span>
                <span className="font-medium text-p-primary-dark">{promotersPct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-p-success rounded-full" style={{ width: `${promotersPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-p-neutral">Neutros (7-8)</span>
                <span className="font-medium text-p-primary-dark">{passivesPct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-p-warning rounded-full" style={{ width: `${passivesPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-p-neutral">Detratores (0-6)</span>
                <span className="font-medium text-p-primary-dark">{detractorsPct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${detractorsPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-6">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-p-primary-dark">{summary?.total ?? 0}</p>
            <p className="text-xs text-p-neutral">Respostas totais</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-p-success">{summary?.promoters ?? 0}</p>
            <p className="text-xs text-p-neutral">Promotores</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-p-warning">{summary?.passives ?? 0}</p>
            <p className="text-xs text-p-neutral">Neutros</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-red-500">{summary?.detractors ?? 0}</p>
            <p className="text-xs text-p-neutral">Detratores</p>
          </div>
        </div>
      </div>

      {/* Comentários */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-p-primary-dark mb-4">Comentários (anônimos)</h2>
        {!summary || summary.comments.length === 0 ? (
          <p className="text-sm text-p-neutral">Nenhum comentário ainda.</p>
        ) : (
          <div className="space-y-3">
            {summary.comments.map((c) => {
              const borderClass = c.score >= 9 ? 'border-p-success' : c.score >= 7 ? 'border-p-warning' : 'border-red-500';
              return (
                <div key={c.id} className={`border-l-2 pl-3 ${borderClass}`}>
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${
                      c.score >= 9
                        ? 'bg-green-100 text-p-success'
                        : c.score >= 7
                          ? 'bg-amber-100 text-p-warning'
                          : 'bg-red-100 text-red-500'
                    }`}
                  >
                    Nota {c.score}
                  </span>
                  <p className="text-sm text-p-primary-dark">{c.comment}</p>
                  <p className="text-xs text-p-neutral mt-0.5">
                    {new Date(c.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
