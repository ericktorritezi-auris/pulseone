import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface ReportForPdf {
  status: string;
  managerFinalOpinion: string | null;
  finalizedAt: string | Date | null;
  requiresOpinion: boolean;
  owner: { fullName: string; areaName: string; positionName: string };
  cycle: { label: string };
  score: {
    teamScore: number;
    managerScore: number;
    selfScore: number;
    finalScore: number;
    npsScore: number;
    scoreBand: string;
  } | null;
  comentarios: { tipo: string; autor: string; texto: string | null }[];
}

const SCORE_COLOR: Record<string, string> = {
  Excepcional: '#10B981',
  Excelente: '#10B981',
  'Muito Bom': '#2563EB',
  Adequado: '#0EA5E9',
  Atenção: '#F59E0B',
  Crítico: '#EF4444',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function scoreBar(label: string, value: number): string {
  const pct = Math.max(0, Math.min(100, value));
  return `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748B;margin-bottom:3px;">
        <span>${label}</span><span style="font-weight:600;color:#0F172A;">${value.toFixed(1)}</span>
      </div>
      <div style="width:100%;height:6px;background:#E2E8F0;border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:#2563EB;"></div>
      </div>
    </div>`;
}

const TIPO_LABELS: Record<string, string> = {
  AUTOAVALIACAO: 'Autoavaliação',
  AVALIACAO_EQUIPE: 'Avaliação da Equipe',
  AVALIACAO_GESTOR: 'Avaliação do Gestor Direto',
  COLEGA: 'Avaliação de Colegas',
};

// v1.8.0 — One Page Executiva (seção 5.60, pedido do Erick): semáforo de
// 3 cores pra leitura rápida pela Diretoria, derivado da MESMA banda de
// texto (`scoreBand`) que o resto do sistema já usa e mostra (relatório
// individual, dashboards) — nunca um limiar numérico paralelo e
// potencialmente inconsistente.
const SEMAFORO_COLOR: Record<string, string> = {
  Excepcional: '#0ca30c',
  Excelente: '#0ca30c',
  'Muito Bom': '#0ca30c',
  Adequado: '#b8790a',
  Atenção: '#b8790a',
  Crítico: '#c23030',
};
const SEMAFORO_BG: Record<string, string> = {
  Excepcional: '#e6f6e6',
  Excelente: '#e6f6e6',
  'Muito Bom': '#e6f6e6',
  Adequado: '#fef2df',
  Atenção: '#fef2df',
  Crítico: '#fbe7e7',
};
function semaforoColor(band: string | null): string {
  return band ? (SEMAFORO_COLOR[band] ?? '#64748B') : '#94A3B8';
}
function semaforoBg(band: string | null): string {
  return band ? (SEMAFORO_BG[band] ?? '#F1F5F9') : '#F1F5F9';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OnePageColaborador {
  fullName: string;
  positionName: string | null;
  tenureLabel: string;
  score: number | null;
  scoreBand: string | null;
  // v1.8.2 — pedido do Erick: itens curtos (palavra/expressão), não frase
  // truncada. Vêm prontos de `PulseAiAnalysis.strengthsItems`/
  // `improvementItems`, gerados pela IA junto da Análise Preditiva.
  pontosForte: string[];
  pontosMelhoria: string[];
}

export interface OnePageArea {
  areaName: string;
  scoreArea: number | null;
  scoreBandArea: string | null;
  colaboradores: OnePageColaborador[];
}

// v1.8.1 — pedido do Erick: "reconhecimento pendente" e "risco de retenção"
// viraram um único sinalizador "valorização" — 3 pontos de POR QUE o RH
// deveria valorizar essa pessoa, e só DEPOIS a defasagem salarial (não o
// contrário). "Plano de desenvolvimento" continua separado (é sobre
// desempenho a corrigir agora, não sobre valorizar).
export interface OnePageRhAlerta {
  fullName: string;
  areaName: string;
  flagLabel: string;
  flagKind: 'valorizacao' | 'desenvolvimento';
  // Preenchido só quando flagKind === 'valorizacao'.
  destaques?: string[];
  salarioLinha?: string;
  // Preenchido só quando flagKind === 'desenvolvimento'.
  motivo?: string;
}

export interface OnePageData {
  gestor: { fullName: string; positionName: string | null };
  cicloResumo: string;
  geradoEm: string;
  scoreGeral: number | null;
  bandGeral: string | null;
  totalColaboradores: number;
  totalAreas: number;
  areasEmZonaVerde: number;
  areas: OnePageArea[];
  rhAlertas: OnePageRhAlerta[];
}

const RH_FLAG_CLASS: Record<OnePageRhAlerta['flagKind'], { bg: string; color: string }> = {
  valorizacao: { bg: '#e6f6e6', color: '#1c6b1c' },
  desenvolvimento: { bg: '#fef2df', color: '#8a5c05' },
};

@Injectable()
export class PulseReportPdfService {
  private readonly logger = new Logger(PulseReportPdfService.name);

  buildHtml(report: ReportForPdf): string {
    const scoreColor = report.score ? SCORE_COLOR[report.score.scoreBand] ?? '#2563EB' : '#94A3B8';
    const comentariosHtml = report.comentarios
      .map(
        (c) => `
        <div style="border-left:3px solid #DBEAFE;padding:8px 12px;margin-bottom:10px;">
          <p style="font-size:10px;color:#64748B;margin:0 0 3px;font-weight:600;">${TIPO_LABELS[c.tipo] ?? c.tipo} — ${c.autor}</p>
          <p style="font-size:12px;color:#0F172A;margin:0;">${c.texto ?? ''}</p>
        </div>`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
  body { margin: 0; padding: 40px; color: #0F172A; }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0F172A; padding-bottom:16px; margin-bottom:24px; }
  .brand { font-size:22px; font-weight:700; }
  .brand span { color:#2563EB; }
  .cycle-label { font-size:12px; color:#64748B; text-align:right; }
  .cover { display:flex; align-items:center; gap:16px; margin-bottom:24px; }
  .avatar { width:56px; height:56px; border-radius:50%; background:#2563EB; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; }
  .owner-name { font-size:18px; font-weight:700; margin:0; }
  .owner-meta { font-size:12px; color:#64748B; margin:2px 0 0; }
  .score-row { display:flex; gap:24px; margin-bottom:24px; }
  .score-ring { width:90px; height:90px; border-radius:50%; border:8px solid ${scoreColor}; display:flex; align-items:center; justify-content:center; flex-direction:column; }
  .score-ring b { font-size:20px; }
  .score-ring small { font-size:9px; color:#64748B; }
  .section-title { font-size:13px; font-weight:700; margin:20px 0 10px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; }
  .opinion-box { background:#F8FAFC; border-radius:8px; padding:16px; font-size:12px; white-space:pre-wrap; }
  .footer { margin-top:36px; padding-top:12px; border-top:1px solid #E2E8F0; font-size:10px; color:#64748B; text-align:center; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Pulse<span>One</span></div>
    <div class="cycle-label">Relatório de Avaliação 360°<br/>${report.cycle.label}</div>
  </div>

  <div class="cover">
    <div class="avatar">${initials(report.owner.fullName)}</div>
    <div>
      <p class="owner-name">${report.owner.fullName}</p>
      <p class="owner-meta">${report.owner.areaName} • ${report.owner.positionName}</p>
    </div>
  </div>

  ${
    report.score
      ? `
  <div class="score-row">
    <div class="score-ring"><b>${report.score.finalScore.toFixed(0)}</b><small>${report.score.scoreBand}</small></div>
    <div style="flex:1;">
      <p style="font-size:11px;color:#64748B;margin:0 0 8px;">NPS (Recomendação): <b style="color:#0F172A;">${report.score.npsScore.toFixed(1)}</b></p>
      ${scoreBar('Equipe (60%)', report.score.teamScore)}
      ${scoreBar('Gestor (40%)', report.score.managerScore)}
      ${scoreBar('Autoavaliação (informativo)', report.score.selfScore)}
    </div>
  </div>`
      : '<p style="font-size:12px;color:#64748B;">Score ainda não calculado para este ciclo.</p>'
  }

  <div class="section-title">Feedbacks Recebidos</div>
  ${comentariosHtml || '<p style="font-size:12px;color:#64748B;">Nenhum feedback registrado.</p>'}

  <div class="section-title">Parecer Final do Gestor</div>
  ${
    report.requiresOpinion
      ? `<div class="opinion-box">${report.managerFinalOpinion ?? 'Parecer não escrito.'}</div>
         ${
           report.finalizedAt
             ? `<p style="font-size:10px;color:#64748B;margin-top:8px;">Assinado eletronicamente — finalizado em ${new Date(report.finalizedAt).toLocaleString('pt-BR')}</p>`
             : ''
         }`
      : `<p style="font-size:12px;color:#64748B;">Não aplicável — este cargo está no topo da hierarquia e não possui um gestor direto para escrever parecer.</p>`
  }

  <div class="footer">Versão 1.0.0 • Desenvolvido por BellePlanner</div>
</body>
</html>`;
  }

  // v1.8.0 — One Page Executiva (seção 5.60, pedido do Erick): resumo
  // consolidado de todas as áreas geridas por um gestor, pronto pra
  // apresentar à Diretoria — score geral do gestor, score por área, cada
  // colaborador com score/pontos fortes/melhoria, e uma página de
  // sinalização pro RH (valorização, desenvolvimento).
  //
  // v1.8.2 (pedido do Erick) — deixou de ser "uma página só espremida":
  // agora é um RELATÓRIO EXECUTIVO de várias páginas — capa com o resumo
  // geral, DEPOIS uma página inteira por área (cabeçalho próprio + espaço
  // de sobra pros colaboradores) e uma página final de RH. Cada página é
  // um bloco `.page` com `page-break-after: always` (menos a última), e
  // os pontos fortes/melhoria/valorização são ITENS CURTOS (uma
  // palavra/expressão, nunca frase longa) — vêm prontos da Análise IA
  // (`strengthsItems`/`improvementItems`/`valuationItems`), sem truncar
  // nada aqui.
  buildOnePageHtml(data: OnePageData): string {
    const geralColor = semaforoColor(data.bandGeral);
    const geralBg = semaforoBg(data.bandGeral);
    const totalPages = 1 + data.areas.length + (data.rhAlertas.length > 0 ? 1 : 0);

    // Itens curtos (pontos fortes/melhoria/valorização) — renderizados como
    // "chips"/tags, não bullets de frase, já que agora são palavras/expressões
    // curtas (pedido explícito do Erick: "eu quero que a gente condense num
    // bullet com três pontos... pode ser uma frase, pode ser uma composição,
    // mas [não] frase inteira").
    const chipList = (items: string[], bg: string, color: string) =>
      items.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">${items
            .map(
              (t) =>
                `<span style="display:inline-block;font-size:9px;font-weight:600;padding:2px 8px;border-radius:10px;background:${bg};color:${color};white-space:nowrap;">${escapeHtml(t)}</span>`,
            )
            .join('')}</div>`
        : '';

    const barsHtml = data.areas
      .map((area) => {
        const value = area.scoreArea ?? 0;
        const color = semaforoColor(area.scoreBandArea);
        const avgPct = Math.max(0, Math.min(100, data.scoreGeral ?? 0));
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <div style="width:130px;font-size:11px;font-weight:600;color:#14181f;flex-shrink:0;">${escapeHtml(area.areaName)}</div>
          <div style="flex:1;height:9px;background:#e7edf7;border-radius:5px;overflow:hidden;position:relative;">
            <div style="height:100%;border-radius:5px;width:${Math.max(0, Math.min(100, value))}%;background:${color};"></div>
            <div style="position:absolute;top:-2px;bottom:-2px;width:1.5px;background:#14181f;opacity:0.35;left:${avgPct}%;"></div>
          </div>
          <div style="width:28px;text-align:right;font-size:11px;font-weight:700;flex-shrink:0;">${area.scoreArea !== null ? Math.round(area.scoreArea) : '—'}</div>
        </div>`;
      })
      .join('');

    // Cabeçalho compacto, repetido no topo de toda página que não seja a
    // capa — mantém o documento identificável mesmo passando várias
    // páginas na Diretoria.
    const pageHeader = (pageLabel: string, pageNum: number) => `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1c3faa;padding-bottom:6px;margin-bottom:12px;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span style="font-size:13px;font-weight:800;color:#1c3faa;">Pulse<span style="color:#2a78d6;">One</span></span>
          <span style="font-size:10px;color:#52586a;">${escapeHtml(pageLabel)}</span>
        </div>
        <div style="font-size:8.5px;color:#8890a2;">${escapeHtml(data.gestor.fullName)} · Página ${pageNum} de ${totalPages}</div>
      </div>`;

    const footer = `
      <div style="position:absolute;bottom:14px;left:22px;right:22px;display:flex;justify-content:space-between;font-size:7.5px;color:#8890a2;border-top:1px solid #dfe3ea;padding-top:5px;">
        <span>PulseOne · Documento gerado automaticamente a partir dos dados do ciclo · Uso interno e confidencial</span>
        <span>Relatório Executivo de Gestão</span>
      </div>`;

    // ---- Página 1: capa / resumo geral ----
    const indexItems = [
      'Visão Geral',
      ...data.areas.map((a) => a.areaName),
      ...(data.rhAlertas.length > 0 ? ['Pontos de Atenção para o RH'] : []),
    ];

    const coverPage = `
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c3faa;padding-bottom:8px;margin-bottom:12px;">
        <div>
          <div style="font-size:19px;font-weight:800;color:#1c3faa;">Pulse<span style="color:#2a78d6;">One</span></div>
          <div style="font-size:11px;color:#52586a;margin-top:2px;">Relatório Executivo de Gestão — Consolidado por Área</div>
        </div>
        <div style="text-align:right;font-size:9.5px;color:#52586a;line-height:1.6;">
          <div>${escapeHtml(data.cicloResumo)}</div>
          <div>Gerado em: <b>${escapeHtml(data.geradoEm)}</b></div>
          <div style="display:inline-block;margin-top:3px;font-size:8px;font-weight:700;color:#8a1f1f;background:#fbe7e7;border:1px solid #f0bcbc;padding:2px 8px;border-radius:10px;">CONFIDENCIAL — USO INTERNO / DIRETORIA</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;background:#f6f7fa;border:1px solid #dfe3ea;border-radius:9px;padding:10px 14px;margin-bottom:12px;">
        <div>
          <div style="font-size:16px;font-weight:700;">${escapeHtml(data.gestor.fullName)}</div>
          <div style="font-size:10px;color:#52586a;">${data.gestor.positionName ? escapeHtml(data.gestor.positionName) + ' · ' : ''}${data.totalAreas} área(s) gerida(s)</div>
        </div>
        <div style="font-size:9px;color:#52586a;text-align:right;max-width:340px;">
          Resumo executivo da atuação do gestor em todas as áreas sob sua responsabilidade neste ciclo.
        </div>
      </div>

      <div style="display:grid;grid-template-columns: 1.3fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
        <div style="border:1px solid #dfe3ea;border-radius:9px;padding:8px 12px;display:flex;align-items:center;gap:10px;background:${geralBg};border-color:${geralColor}33;">
          <div style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0;background:${geralColor};">${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'}</div>
          <div>
            <div style="font-size:8.5px;color:#52586a;text-transform:uppercase;">Score Geral do Gestor</div>
            <div style="font-size:16px;font-weight:800;line-height:1.1;">${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'} / 100</div>
            <span style="font-size:8.5px;font-weight:700;color:${geralColor};">${data.bandGeral ?? '—'}</span>
          </div>
        </div>
        <div style="border:1px solid #dfe3ea;border-radius:9px;padding:8px 12px;display:flex;align-items:center;gap:10px;">
          <div style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0;background:#2a78d6;">${data.totalColaboradores}</div>
          <div><div style="font-size:8.5px;color:#52586a;text-transform:uppercase;">Colaboradores</div><div style="font-size:16px;font-weight:800;">${data.totalColaboradores} pessoas</div></div>
        </div>
        <div style="border:1px solid #dfe3ea;border-radius:9px;padding:8px 12px;display:flex;align-items:center;gap:10px;">
          <div style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0;background:#0ca30c;">${data.areasEmZonaVerde}</div>
          <div><div style="font-size:8.5px;color:#52586a;text-transform:uppercase;">Áreas em zona verde</div><div style="font-size:16px;font-weight:800;">${data.areasEmZonaVerde} de ${data.totalAreas}</div></div>
        </div>
        <div style="border:1px solid #dfe3ea;border-radius:9px;padding:8px 12px;display:flex;align-items:center;gap:10px;">
          <div style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0;background:${data.rhAlertas.length > 0 ? '#c23030' : '#0ca30c'};">${data.rhAlertas.length}</div>
          <div><div style="font-size:8.5px;color:#52586a;text-transform:uppercase;">Pontos de atenção RH</div><div style="font-size:16px;font-weight:800;">${data.rhAlertas.length} sinalizado(s)</div></div>
        </div>
      </div>

      <div style="border:1px solid #dfe3ea;border-radius:9px;padding:10px 14px;margin-bottom:12px;">
        <div style="font-size:9.5px;font-weight:700;color:#52586a;text-transform:uppercase;margin-bottom:8px;">Score médio por área (linha = média geral do gestor · ${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'})</div>
        ${barsHtml || '<p style="font-size:10px;color:#8890a2;">Nenhuma área gerida tem um ciclo finalizado/arquivado ainda.</p>'}
      </div>

      <div style="border:1px solid #dfe3ea;border-radius:9px;padding:10px 14px;">
        <div style="font-size:9.5px;font-weight:700;color:#52586a;text-transform:uppercase;margin-bottom:6px;">Neste relatório</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${indexItems.map((label, i) => `<span style="font-size:9px;font-weight:600;padding:3px 10px;border-radius:10px;background:#eef1f8;color:#1c3faa;">${i + 1}. ${escapeHtml(label)}</span>`).join('')}
        </div>
      </div>

      ${footer}
    </div>`;

    // ---- Uma página por área ----
    const areaPages = data.areas
      .map((area, idx) => {
        const areaColor = semaforoColor(area.scoreBandArea);
        const areaBg = semaforoBg(area.scoreBandArea);

        const peopleHtml = area.colaboradores
          .map((p) => {
            const color = semaforoColor(p.scoreBand);
            const hasAnalise = p.pontosForte.length > 0 || p.pontosMelhoria.length > 0;
            return `
            <div style="break-inside:avoid;border:1px solid #e7eaf0;border-radius:8px;padding:9px 12px;margin-bottom:9px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                <span style="font-size:12px;font-weight:700;">${escapeHtml(p.fullName)}</span>
                <span style="font-size:9px;color:#8890a2;flex-shrink:0;">${escapeHtml(p.tenureLabel)} de casa</span>
                <span style="font-size:12px;font-weight:800;color:${color};flex-shrink:0;">${p.score !== null ? Math.round(p.score) : '—'}</span>
              </div>
              ${p.positionName ? `<div style="font-size:9px;color:#8890a2;margin-top:1px;">${escapeHtml(p.positionName)}</div>` : ''}
              ${
                hasAnalise
                  ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;">
                <div>
                  <div style="font-size:7.8px;font-weight:700;text-transform:uppercase;color:#1c6b1c;">Pontos fortes</div>
                  ${chipList(p.pontosForte, '#e6f6e6', '#1c6b1c') || '<span style="font-size:8.5px;color:#8890a2;">—</span>'}
                </div>
                <div>
                  <div style="font-size:7.8px;font-weight:700;text-transform:uppercase;color:#8a5c05;">A desenvolver</div>
                  ${chipList(p.pontosMelhoria, '#fef2df', '#8a5c05') || '<span style="font-size:8.5px;color:#8890a2;">—</span>'}
                </div>
              </div>`
                  : `<div style="font-size:8.5px;color:#8890a2;margin-top:5px;">Sem análise IA gerada para este colaborador neste ciclo.</div>`
              }
            </div>`;
          })
          .join('');

        return `
        <div class="page">
          ${pageHeader(`Área — ${area.areaName}`, idx + 2)}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <div style="font-size:17px;font-weight:800;">${escapeHtml(area.areaName)}</div>
              <div style="font-size:10px;color:#52586a;">${area.colaboradores.length} colaborador(es) neste ciclo</div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;font-size:15px;font-weight:800;padding:3px 12px;border-radius:12px;background:${areaBg};color:${areaColor};">
              <span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${areaColor};"></span>${area.scoreArea !== null ? Math.round(area.scoreArea) : '—'}
            </div>
          </div>
          <div>${peopleHtml || '<p style="font-size:10px;color:#8890a2;">Nenhum colaborador com score neste ciclo.</p>'}</div>
          ${footer}
        </div>`;
      })
      .join('');

    // ---- Página final: Pontos de Atenção para o RH ----
    // v1.8.1 — pra quem é "valorização", mostra os motivos primeiro, e SÓ
    // DEPOIS a defasagem salarial (nunca o contrário — o salário é a
    // consequência, não a manchete).
    const rhPage =
      data.rhAlertas.length > 0
        ? `
    <div class="page">
      ${pageHeader('Pontos de Atenção para o RH', totalPages)}
      <div style="border:1px solid #f0c8c8;border-radius:9px;background:#fff8f5;padding:10px 14px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;color:#8a1f1f;">⚠ Pontos de Atenção para o RH</div>
        <div style="font-size:9.5px;color:#7a4a30;margin-top:2px;">Cruzamento de score, tempo de casa e faixa salarial do mesmo cargo entre as áreas geridas.</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${data.rhAlertas
          .map((r) => {
            const flagStyle = RH_FLAG_CLASS[r.flagKind];
            const body =
              r.flagKind === 'valorizacao'
                ? `
              ${chipList(r.destaques ?? [], '#e6f6e6', '#1c6b1c')}
              ${r.salarioLinha ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #f0d9d0;font-weight:600;font-size:9.5px;">${escapeHtml(r.salarioLinha)}</div>` : ''}`
                : `<div style="margin-top:4px;font-size:9.5px;">${escapeHtml(r.motivo ?? '')}</div>`;

            return `
            <div style="break-inside:avoid;flex:1 1 30%;min-width:230px;background:#fff;border:1px solid #f0d9d0;border-radius:8px;padding:9px 12px;font-size:9.5px;line-height:1.4;">
              <b style="font-size:11px;">${escapeHtml(r.fullName)}</b> — ${escapeHtml(r.areaName)}
              ${body}
              <div><span style="display:inline-block;font-size:8px;font-weight:700;padding:2px 8px;border-radius:8px;margin-top:6px;background:${flagStyle.bg};color:${flagStyle.color};">${escapeHtml(r.flagLabel)}</span></div>
            </div>`;
          })
          .join('')}
      </div>
      ${footer}
    </div>`
        : '';

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
  body { margin: 0; color: #14181f; }
  .page { position:relative; padding: 18px 22px 44px; page-break-after: always; min-height: 780px; }
  .page:last-of-type { page-break-after: auto; }
  @media print { .page { page-break-after: always; } .page:last-of-type { page-break-after: auto; } }
</style>
</head>
<body>
  ${coverPage}
  ${areaPages}
  ${rhPage}
</body>
</html>`;
  }

  // Margem opcional (v1.4.0, Dossiê): quem não passar nada recebe
  // EXATAMENTE a margem de sempre (20px em tudo) — Relatórios e Auditoria
  // continuam idênticos, sem precisar mudar a chamada deles.
  async generatePdf(
    html: string,
    margin: { top: string; bottom: string; left: string; right: string } = {
      top: '20px',
      bottom: '20px',
      left: '20px',
      right: '20px',
    },
    // v1.8.0 — One Page Executiva (seção 5.60): precisa de A4 PAISAGEM pra
    // caber tudo numa página só. Opcional e default `false` de propósito —
    // o relatório individual (retrato) continua chamando exatamente igual,
    // sem passar esse parâmetro.
    options: { landscape?: boolean } = {},
  ): Promise<Buffer> {
    // Estratégia combinada, depois de vários diagnósticos em produção:
    // - O Chromium do SISTEMA (instalado via apt, ver railpack.json) resolveu
    //   as bibliotecas que faltavam (libnss3 etc.), mas o binário em si não é
    //   garantidamente compatível com o protocolo que o Puppeteer espera —
    //   causava um crash quase instantâneo (~100ms) sem mensagem clara.
    // - Por isso usamos o "puppeteer" completo (não puppeteer-core): ele
    //   baixa e usa o PRÓPRIO Chromium, testado e casado com essa versão
    //   exata do Puppeteer — e já encontra as bibliotecas de sistema
    //   instaladas pelo apt (elas são compartilhadas, não exclusivas do
    //   Chromium do apt).
    let browser;
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-pulseone-'));

    try {
      browser = await puppeteer.launch({
        headless: true,
        timeout: 60_000, // ambiente com CPU limitada pode demorar mais que os 30s padrão
        dumpio: true, // ecoa a saída do Chromium em tempo real no log do servidor (diagnóstico)
        userDataDir: profileDir, // único por chamada — evita conflito entre PDFs gerados em paralelo
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--no-first-run',
          '--no-zygote',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad', // desativa o crashpad — é o que gerava os erros de /sys/devices
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--password-store=basic',
          '--use-mock-keychain',
        ],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        margin,
      });
      return Buffer.from(pdf);
    } catch (err) {
      // Loga o erro real no servidor (visível no log do Railway) — sem
      // isso, o erro vira só um 500 genérico e não dá pra diagnosticar.
      this.logger.error(`Falha ao gerar PDF via Puppeteer: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    } finally {
      if (browser) await browser.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
}
