'use client';

import { useEffect, useState } from 'react';
import { X, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { DossieData } from '../../lib/types';
import { AvatarInitials } from './AvatarInitials';

const REGIME_LABELS: Record<string, string> = { CLT: 'CLT', COOPERADO: 'Cooperado', PJ: 'Pessoa Jurídica (PJ)' };
const MODALIDADE_LABELS: Record<string, string> = { PRESENCIAL: 'Presencial', REMOTO: 'Remoto', HIBRIDO: 'Híbrido' };
const DIAS_SEMANA = [
  { value: 'SEGUNDA', label: 'Segunda' },
  { value: 'TERCA', label: 'Terça' },
  { value: 'QUARTA', label: 'Quarta' },
  { value: 'QUINTA', label: 'Quinta' },
  { value: 'SEXTA', label: 'Sexta' },
];

function fmtMoney(v: number | null) {
  return v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// Datas "puras" (sem hora — início na empresa, férias, formação,
// certificação) precisam ser lidas em UTC, não no fuso de Brasília: o
// valor já representa o dia certo em UTC, e aplicar o fuso de Brasília em
// cima disso "recua" um dia (meia-noite UTC vira 21h do dia anterior em
// Brasília). Diferente de datas com HORA de verdade (criado em, login
// etc.), que continuam usando America/Sao_Paulo normalmente.
function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
}

export function DossieModal({ personId, onClose }: { personId: string | null; onClose: () => void }) {
  // personId null = "Meu Dossiê" (visão de si mesmo, v1.5.0) — rota
  // separada, nunca aceita id de outra pessoa. Confidenciais ficam
  // sempre travadas pra leitura nesse modo, e não existe botão de PDF.
  const isSelfMode = personId === null;
  const basePath = personId ? `/dossie/${personId}` : '/meu-dossie';
  const dossieRoot = personId ? '/dossie' : '/meu-dossie';

  const [dossie, setDossie] = useState<DossieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  // Formulário de edição das informações confidenciais
  const [salario, setSalario] = useState('');
  const [regime, setRegime] = useState('');
  const [modalidade, setModalidade] = useState('');
  const [hibridoDias, setHibridoDias] = useState('');
  const [hibridoDiasSemana, setHibridoDiasSemana] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState('');
  const [savingConfidencial, setSavingConfidencial] = useState(false);

  const [novoBeneficioNome, setNovoBeneficioNome] = useState('');
  const [novoBeneficioValor, setNovoBeneficioValor] = useState('');
  const [novaFeriasInicio, setNovaFeriasInicio] = useState('');
  const [novaFeriasFim, setNovaFeriasFim] = useState('');

  // Formação e Certificações (v1.5.0) — editável nos DOIS modos
  const [novaFormacaoNome, setNovaFormacaoNome] = useState('');
  const [novaFormacaoData, setNovaFormacaoData] = useState('');
  const [novaCertNome, setNovaCertNome] = useState('');
  const [novaCertData, setNovaCertData] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<DossieData>(basePath);
      setDossie(data);
      setSalario(data.confidencial.salario !== null ? String(data.confidencial.salario) : '');
      setRegime(data.confidencial.regimeContratacao ?? '');
      setModalidade(data.confidencial.modalidadeTrabalho ?? '');
      setHibridoDias(data.confidencial.hibridoDiasPresencial !== null ? String(data.confidencial.hibridoDiasPresencial) : '');
      setHibridoDiasSemana(data.confidencial.hibridoDiasSemana ?? []);
      setDataInicio(data.confidencial.dataInicioEmpresa ? data.confidencial.dataInicioEmpresa.slice(0, 10) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o dossiê.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleSaveConfidencial() {
    setSavingConfidencial(true);
    setError('');
    try {
      await api.patch(`${basePath}/confidencial`, {
        ...(salario ? { salario: Number(salario) } : {}),
        ...(regime ? { regimeContratacao: regime } : {}),
        ...(modalidade ? { modalidadeTrabalho: modalidade } : {}),
        ...(modalidade === 'HIBRIDO' && hibridoDias ? { hibridoDiasPresencial: Number(hibridoDias) } : {}),
        ...(modalidade === 'HIBRIDO' ? { hibridoDiasSemana } : {}),
        ...(dataInicio ? { dataInicioEmpresa: dataInicio } : {}),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSavingConfidencial(false);
    }
  }

  async function handleAddBeneficio() {
    if (!novoBeneficioNome.trim() || !novoBeneficioValor) return;
    await api.post(`${basePath}/beneficios`, { nome: novoBeneficioNome, valor: Number(novoBeneficioValor) });
    setNovoBeneficioNome('');
    setNovoBeneficioValor('');
    await load();
  }

  async function handleRemoveBeneficio(id: string) {
    await api.delete(`${dossieRoot}/beneficios/${id}`);
    await load();
  }

  async function handleAddFerias() {
    if (!novaFeriasInicio || !novaFeriasFim) return;
    await api.post(`${basePath}/ferias`, { startDate: novaFeriasInicio, endDate: novaFeriasFim });
    setNovaFeriasInicio('');
    setNovaFeriasFim('');
    await load();
  }

  async function handleRemoveFerias(id: string) {
    await api.delete(`${dossieRoot}/ferias/${id}`);
    await load();
  }

  async function handleAddFormacao() {
    if (!novaFormacaoNome.trim() || !novaFormacaoData) return;
    await api.post(`${basePath}/formacao`, { nome: novaFormacaoNome, dataConclusao: novaFormacaoData });
    setNovaFormacaoNome('');
    setNovaFormacaoData('');
    await load();
  }

  async function handleRemoveFormacao(id: string) {
    await api.delete(`${dossieRoot}/formacao/${id}`);
    await load();
  }

  async function handleAddCertificacao() {
    if (!novaCertNome.trim() || !novaCertData) return;
    await api.post(`${basePath}/certificacao`, { nome: novaCertNome, dataConclusao: novaCertData });
    setNovaCertNome('');
    setNovaCertData('');
    await load();
  }

  async function handleRemoveCertificacao(id: string) {
    await api.delete(`${dossieRoot}/certificacao/${id}`);
    await load();
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.getBlob(`${basePath}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar o PDF.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {dossie && <AvatarInitials name={dossie.pessoa.fullName} size="md" />}
            <div className="min-w-0">
              <p className="text-base font-bold text-p-primary-dark truncate">
                {dossie?.pessoa.fullName ?? 'Carregando...'}
              </p>
              {dossie && (
                <p className="text-xs text-p-neutral truncate">
                  {[dossie.pessoa.positionName, dossie.pessoa.areaName].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isSelfMode && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-p-neutral px-2.5 py-1 rounded-full">
                Meus dados
              </span>
            )}
            {!isSelfMode && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloading || loading}
                className="flex items-center gap-1.5 border border-slate-300 text-p-primary-dark px-3 py-1.5 rounded-lg text-xs font-medium hover:border-p-primary disabled:opacity-50"
              >
                <Download size={13} />
                {downloading ? 'Gerando...' : 'Baixar PDF'}
              </button>
            )}
            <button onClick={onClose} className="text-p-neutral hover:text-p-primary-dark" aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {loading && <p className="text-sm text-p-neutral">Carregando dossiê...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {dossie && !loading && (
            <>
              {/* Dados cadastrais */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-p-neutral mb-2">
                  Dados Cadastrais
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-p-neutral">E-mail</p>
                    <p className="text-p-primary-dark font-medium">{dossie.pessoa.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-p-neutral">Telefone</p>
                    <p className="text-p-primary-dark font-medium">{dossie.pessoa.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-p-neutral">Gestor Direto</p>
                    <p className="text-p-primary-dark font-medium">{dossie.pessoa.managerName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-p-neutral">Status</p>
                    <p className="text-p-primary-dark font-medium">{dossie.pessoa.active ? 'Ativo' : 'Inativo'}</p>
                  </div>
                </div>
              </section>

              {/* Informações confidenciais */}
              <section className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Informações Confidenciais — uso interno
                  </h3>
                  {isSelfMode ? (
                    <span className="text-[11px] text-amber-700">🔒 só leitura — edição é do gestor/admin</span>
                  ) : (
                    !editing && (
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1 text-xs font-medium text-p-primary hover:underline"
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                    )
                  )}
                </div>

                {!editing ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-p-neutral">Salário</p>
                      <p className="text-p-primary-dark font-medium">{fmtMoney(dossie.confidencial.salario)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-p-neutral">Regime de Contratação</p>
                      <p className="text-p-primary-dark font-medium">
                        {dossie.confidencial.regimeContratacao ? REGIME_LABELS[dossie.confidencial.regimeContratacao] : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-p-neutral">Modalidade</p>
                      <p className="text-p-primary-dark font-medium">
                        {dossie.confidencial.modalidadeTrabalho ? MODALIDADE_LABELS[dossie.confidencial.modalidadeTrabalho] : '—'}
                        {dossie.confidencial.modalidadeTrabalho === 'HIBRIDO' &&
                          dossie.confidencial.hibridoDiasPresencial &&
                          ` (${dossie.confidencial.hibridoDiasPresencial}x/semana)`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-p-neutral">Início na Empresa</p>
                      <p className="text-p-primary-dark font-medium">{fmtDate(dossie.confidencial.dataInicioEmpresa)}</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-xs text-p-neutral mb-1">Benefícios</p>
                      {dossie.confidencial.beneficios.length > 0 ? (
                        <div className="space-y-1">
                          {dossie.confidencial.beneficios.map((b) => (
                            <div key={b.id} className="flex justify-between text-p-primary-dark">
                              <span>{b.nome}</span>
                              <span className="font-medium">{fmtMoney(b.valor)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-p-neutral italic">Nenhum benefício cadastrado.</p>
                      )}
                    </div>

                    <div className="col-span-2">
                      <p className="text-xs text-p-neutral mb-1">Períodos de Férias</p>
                      {dossie.confidencial.periodosFerias.length > 0 ? (
                        <div className="space-y-1">
                          {dossie.confidencial.periodosFerias.map((p) => (
                            <p key={p.id} className="text-p-primary-dark">
                              {fmtDate(p.startDate)} a {fmtDate(p.endDate)}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-p-neutral italic">Nenhum período de férias cadastrado.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-p-neutral mb-1">Salário (opcional)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={salario}
                          onChange={(e) => setSalario(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-p-neutral mb-1">Regime de Contratação</label>
                        <select
                          value={regime}
                          onChange={(e) => setRegime(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                        >
                          <option value="">Não informado</option>
                          <option value="CLT">CLT</option>
                          <option value="COOPERADO">Cooperado</option>
                          <option value="PJ">Pessoa Jurídica (PJ)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-p-neutral mb-1">Modalidade de Trabalho</label>
                        <select
                          value={modalidade}
                          onChange={(e) => setModalidade(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                        >
                          <option value="">Não informado</option>
                          <option value="PRESENCIAL">Presencial</option>
                          <option value="REMOTO">Remoto</option>
                          <option value="HIBRIDO">Híbrido</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-p-neutral mb-1">Início na Empresa</label>
                        <input
                          type="date"
                          value={dataInicio}
                          onChange={(e) => setDataInicio(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    {modalidade === 'HIBRIDO' && (
                      <div className="border border-slate-200 rounded-lg p-3">
                        <label className="block text-xs text-p-neutral mb-1">Dias presenciais por semana</label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          value={hibridoDias}
                          onChange={(e) => setHibridoDias(e.target.value)}
                          className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-sm mb-2"
                        />
                        <div className="flex flex-wrap gap-3">
                          {DIAS_SEMANA.map((d) => (
                            <label key={d.value} className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={hibridoDiasSemana.includes(d.value)}
                                onChange={(e) =>
                                  setHibridoDiasSemana(
                                    e.target.checked
                                      ? [...hibridoDiasSemana, d.value]
                                      : hibridoDiasSemana.filter((v) => v !== d.value),
                                  )
                                }
                              />
                              {d.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Benefícios */}
                    <div className="border border-slate-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-p-primary-dark mb-2">Benefícios</p>
                      {dossie.confidencial.beneficios.map((b) => (
                        <div key={b.id} className="flex items-center justify-between text-sm mb-1.5">
                          <span>
                            {b.nome} — {fmtMoney(b.valor)}
                          </span>
                          <button onClick={() => handleRemoveBeneficio(b.id)} className="text-p-neutral hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <input
                          placeholder="Nome (ex: Vale Refeição)"
                          value={novoBeneficioNome}
                          onChange={(e) => setNovoBeneficioNome(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Valor"
                          value={novoBeneficioValor}
                          onChange={(e) => setNovoBeneficioValor(e.target.value)}
                          className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddBeneficio}
                          className="text-p-primary hover:bg-blue-50 px-2 rounded-lg"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Férias */}
                    <div className="border border-slate-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-p-primary-dark mb-2">Períodos de Férias</p>
                      {dossie.confidencial.periodosFerias.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm mb-1.5">
                          <span>
                            {fmtDate(p.startDate)} a {fmtDate(p.endDate)}
                          </span>
                          <button onClick={() => handleRemoveFerias(p.id)} className="text-p-neutral hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="date"
                          value={novaFeriasInicio}
                          onChange={(e) => setNovaFeriasInicio(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <input
                          type="date"
                          value={novaFeriasFim}
                          onChange={(e) => setNovaFeriasFim(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <button type="button" onClick={handleAddFerias} className="text-p-primary hover:bg-blue-50 px-2 rounded-lg">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="flex-1 border border-slate-300 text-p-primary-dark py-2 rounded-lg text-sm font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveConfidencial}
                        disabled={savingConfidencial}
                        className="flex-1 bg-p-primary text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {savingConfidencial ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Formação e Certificações — editável nos DOIS modos (v1.5.0) */}
              <section className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-p-primary mb-3">
                  Formação e Certificações
                </h3>

                <div className="mb-4">
                  <p className="text-xs font-medium text-p-primary-dark mb-1.5">Formação</p>
                  {dossie.formacaoECertificacoes.formacoes.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {dossie.formacaoECertificacoes.formacoes.map((f) => (
                        <div key={f.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5">
                          <span>
                            {f.nome} — concluído em {fmtDate(f.dataConclusao)}
                          </span>
                          <button onClick={() => handleRemoveFormacao(f.id)} className="text-p-neutral hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      placeholder="Ex: Análise de Sistemas"
                      value={novaFormacaoNome}
                      onChange={(e) => setNovaFormacaoNome(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="date"
                      value={novaFormacaoData}
                      onChange={(e) => setNovaFormacaoData(e.target.value)}
                      className="w-36 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <button type="button" onClick={handleAddFormacao} className="text-p-primary hover:bg-blue-100 px-2 rounded-lg">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-p-primary-dark mb-1.5">Certificações</p>
                  {dossie.formacaoECertificacoes.certificacoes.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {dossie.formacaoECertificacoes.certificacoes.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5">
                          <span>
                            {c.nome} — concluído em {fmtDate(c.dataConclusao)}
                          </span>
                          <button onClick={() => handleRemoveCertificacao(c.id)} className="text-p-neutral hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      placeholder="Ex: Gestão de Projetos"
                      value={novaCertNome}
                      onChange={(e) => setNovaCertNome(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="date"
                      value={novaCertData}
                      onChange={(e) => setNovaCertData(e.target.value)}
                      className="w-36 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <button type="button" onClick={handleAddCertificacao} className="text-p-primary hover:bg-blue-100 px-2 rounded-lg">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Atribuições Especialistas — só aparece se houver alguma ativa */}
              {dossie.atribuicoesEspecialistas.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-p-neutral mb-2">
                    Atribuições Especialistas
                  </h3>
                  <div className="space-y-2">
                    {dossie.atribuicoesEspecialistas.map((texto, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {texto}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Resumo Pulse */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-p-neutral mb-2">Resumo Pulse</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-p-primary-dark">{dossie.pulse.ciclosParticipados}</p>
                    <p className="text-[11px] text-p-neutral">Ciclos Participados</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-p-primary-dark">
                      {dossie.pulse.scoreAtual !== null ? dossie.pulse.scoreAtual.toFixed(1) : '—'}
                    </p>
                    <p className="text-[11px] text-p-neutral">Score Atual</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-sm font-bold text-p-primary-dark truncate">{dossie.pulse.ultimoCicloLabel ?? '—'}</p>
                    <p className="text-[11px] text-p-neutral">Último Ciclo</p>
                  </div>
                </div>

                {dossie.pulse.evolucao.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-p-neutral mb-1">Evolução</p>
                    <div className="space-y-1">
                      {dossie.pulse.evolucao.map((e, i) => (
                        <div key={i} className="flex justify-between text-xs text-p-primary-dark">
                          <span>{e.cicloLabel}</span>
                          <span className="font-medium">Score {e.finalScore.toFixed(1)} · NPS {e.npsScore.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dossie.pulse.ultimoParecer && (
                  <div className="mb-3">
                    <p className="text-xs text-p-neutral mb-1">Parecer final do gestor ({dossie.pulse.ultimoCicloLabel})</p>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{dossie.pulse.ultimoParecer}</div>
                  </div>
                )}

                {dossie.pulse.ultimosFeedbacks.length > 0 && (
                  <div>
                    <p className="text-xs text-p-neutral mb-1">Feedbacks recebidos ({dossie.pulse.ultimoCicloLabel})</p>
                    <div className="space-y-1.5">
                      {dossie.pulse.ultimosFeedbacks.map((f, i) => (
                        <div key={i} className="border-l-2 border-blue-100 bg-slate-50 rounded-r-lg pl-3 pr-2 py-1.5">
                          <p className="text-[11px] font-semibold text-p-primary">{f.autor}</p>
                          <p className="text-xs text-p-primary-dark">{f.texto}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Últimos feedbacks avulsos (Feedback Contínuo) */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-p-neutral mb-2">
                  Últimos Feedbacks Recebidos (Avulsos)
                </h3>
                {dossie.feedbacksAvulsos.length > 0 ? (
                  <div className="space-y-1.5">
                    {dossie.feedbacksAvulsos.map((f, i) => (
                      <div key={i} className="border-l-2 border-blue-100 bg-slate-50 rounded-r-lg pl-3 pr-2 py-1.5">
                        <p className="text-[11px] font-semibold text-p-primary">
                          {f.autor} — {new Date(f.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </p>
                        <p className="text-xs text-p-primary-dark">{f.texto}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-p-neutral italic">Ainda não recebeu nenhum feedback avulso.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
