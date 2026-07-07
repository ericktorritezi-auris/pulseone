'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { ReportDetail } from '../../../../lib/types';
import { ScoreRing } from '../../../../components/shared/ScoreRing';
import { ScoreBars } from '../../../../components/shared/ScoreBars';
import { StatusBadge } from '../../../../components/shared/StatusBadge';
import { AvatarInitials } from '../../../../components/shared/AvatarInitials';

export default function RelatorioDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [opinion, setOpinion] = useState('');
  const [savingOpinion, setSavingOpinion] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<ReportDetail>(`/pulse-reports/${params.id}`);
      setReport(data);
      setOpinion(data.managerFinalOpinion ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!report) return null;

  // Quem pode consolidar (gerar IA / escrever parecer / finalizar): gestor
  // direto do dono, ou admin. O próprio dono só visualiza (nunca edita o
  // próprio relatório, mesmo que seja gestor de outra pessoa).
  const canConsolidate = (user?.role === 'ADMIN' || user?.role === 'GESTOR') && user.id !== report.owner.id;
  const isFinalized = report.status === 'FINALIZADO';

  async function handleGenerateAi() {
    setGeneratingAi(true);
    setError('');
    try {
      await api.patch(`/pulse-reports/${params.id}/ai-analysis`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar análise.');
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleSaveOpinion() {
    setSavingOpinion(true);
    setError('');
    try {
      await api.patch(`/pulse-reports/${params.id}/opinion`, { opinion });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar parecer.');
    } finally {
      setSavingOpinion(false);
    }
  }

  async function handleFinalize() {
    if (!confirm('Finalizar este relatório? Depois disso não é mais possível editar, e a pessoa passa a poder ver o resultado.')) return;
    setFinalizing(true);
    setError('');
    try {
      // Manda o parecer atual junto — não depende de um clique anterior em
      // "Salvar rascunho" (era exatamente isso que causava o erro reportado).
      await api.patch(`/pulse-reports/${params.id}/finalize`, { opinion });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar.');
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-p-neutral hover:text-p-primary mb-4"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      {/* Capa */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <AvatarInitials name={report.owner.fullName} size="lg" />
            <div>
              <p className="text-lg font-semibold text-p-primary-dark">{report.owner.fullName}</p>
              <p className="text-sm text-p-neutral">
                {report.owner.areaName} • {report.owner.positionName}
              </p>
              <p className="text-xs text-p-neutral mt-1">{report.cycle.label}</p>
            </div>
          </div>
          <StatusBadge status={report.status} />
        </div>

        {report.score && (
          <div className="flex items-center gap-8 mt-6 pt-6 border-t border-slate-100">
            <ScoreRing value={report.score.finalScore} size={90} label={report.score.scoreBand} />
            <div className="flex-1">
              <p className="text-xs text-p-neutral mb-1">NPS (Recomendação)</p>
              <p className="text-2xl font-semibold text-p-primary-dark">{report.score.npsScore.toFixed(1)}</p>
            </div>
            <div className="flex-1">
              <ScoreBars
                items={[
                  { label: 'Equipe (60%)', value: report.score.teamScore },
                  { label: 'Gestor (40%)', value: report.score.managerScore },
                  { label: 'Autoavaliação (informativo)', value: report.score.selfScore },
                ]}
              />
            </div>
          </div>
        )}

        {!report.score && (
          <p className="text-sm text-p-neutral mt-4">
            Score ainda não calculado — o ciclo precisa ser consolidado primeiro.
          </p>
        )}
      </div>

      {/* Comentários recebidos */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-p-primary-dark mb-4">Feedbacks Recebidos</h2>
        {report.comentarios.length === 0 ? (
          <p className="text-sm text-p-neutral">Nenhum feedback finalizado ainda.</p>
        ) : (
          <div className="space-y-4">
            {report.comentarios.map((c, i) => (
              <div key={i} className="border-l-2 border-p-primary/20 pl-3">
                <p className="text-xs font-medium text-p-neutral">{c.autor}</p>
                <p className="text-sm text-p-primary-dark mt-0.5">{c.texto}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Análise de IA — só quem consolida vê/gera */}
      {canConsolidate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-p-primary-dark">Análise de IA</h2>
            {!isFinalized && (
              <button
                onClick={handleGenerateAi}
                disabled={generatingAi || !report.score}
                className="flex items-center gap-1.5 text-xs font-medium bg-p-primary/10 text-p-primary px-3 py-1.5 rounded-lg hover:bg-p-primary/20 disabled:opacity-50"
              >
                <Sparkles size={14} />
                {generatingAi ? 'Gerando...' : report.aiAnalysis ? 'Regenerar análise' : 'Gerar análise IA'}
              </button>
            )}
          </div>

          {!report.aiAnalysis && <p className="text-sm text-p-neutral">Análise ainda não gerada.</p>}

          {report.aiAnalysis && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-p-neutral">Pontos fortes</p>
                <p className="text-p-primary-dark">{report.aiAnalysis.strengths}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-p-neutral">Pontos de melhoria</p>
                <p className="text-p-primary-dark">{report.aiAnalysis.improvements}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-p-neutral">Tendências</p>
                <p className="text-p-primary-dark">{report.aiAnalysis.trends}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-p-neutral">Resumo</p>
                <p className="text-p-primary-dark">{report.aiAnalysis.summary}</p>
              </div>
              {report.aiAnalysis.suggestedOpinion && !isFinalized && (
                <button
                  onClick={() => setOpinion(report.aiAnalysis!.suggestedOpinion)}
                  className="text-xs text-p-primary hover:underline"
                >
                  Usar parecer sugerido pela IA como ponto de partida →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Parecer final do gestor — não se aplica a quem está no topo da
          hierarquia (sem gestor direto). Essa pessoa só precisa ver as
          avaliações recebidas, sem depender de um parecer escrito. */}
      {report.requiresOpinion ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-p-primary-dark mb-3">Parecer Final do Gestor</h2>

          {canConsolidate && !isFinalized ? (
            <>
              <textarea
                rows={6}
                value={opinion}
                onChange={(e) => setOpinion(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
                placeholder="Escreva o parecer final sobre o desempenho desta pessoa no ciclo..."
              />
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleSaveOpinion}
                  disabled={savingOpinion || !opinion.trim()}
                  className="px-4 py-2 border border-slate-300 text-p-primary-dark rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {savingOpinion ? 'Salvando...' : 'Salvar rascunho'}
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing || !opinion.trim()}
                  className="px-4 py-2 bg-p-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {finalizing ? 'Finalizando...' : 'Finalizar Relatório'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-p-primary-dark whitespace-pre-wrap">
                {report.managerFinalOpinion || 'Parecer ainda não escrito.'}
              </p>
              {report.finalizedAt && (
                <p className="text-xs text-p-neutral mt-3">
                  Finalizado em {new Date(report.finalizedAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-p-neutral">
            Como não há ninguém acima na hierarquia pra escrever um parecer, este relatório é
            liberado automaticamente com base nas avaliações recebidas — sem parecer final.
          </p>
        </div>
      )}
    </div>
  );
}
