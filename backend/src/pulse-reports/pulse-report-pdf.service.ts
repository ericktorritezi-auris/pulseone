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

// Corta uma frase longa demais na última PALAVRA que ainda cabe (nunca no
// meio de uma palavra) — pedido do Erick (v1.8.1): o corte no meio da
// palavra/frase "parecia cortado" na tela, feio de ver num documento pra
// Diretoria.
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const safe = lastSpace > maxLen * 0.5 ? slice.slice(0, lastSpace) : slice;
  return safe.trimEnd() + '…';
}

// v1.8.1 — pedido do Erick: 1 frase só (com corte no meio) "cortava" a
// análise demais. Agora extrai ATÉ 3 frases do parágrafo da IA (cada uma
// truncada com segurança na palavra, nunca no meio dela), pra virar 3
// pontos de destaque / 3 pontos de melhoria por colaborador, em vez de 1
// linha só. Retorna [] (não null) quando não há texto — mais fácil de
// checar `.length === 0` no template.
export function topSentences(text: string | null, maxCount = 3, maxLenEach = 90): string[] {
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const source = sentences.length > 0 ? sentences : [text.trim()];
  return source.slice(0, maxCount).map((s) => truncateAtWord(s, maxLenEach));
}

export interface OnePageColaborador {
  fullName: string;
  positionName: string | null;
  tenureLabel: string;
  score: number | null;
  scoreBand: string | null;
  // v1.8.1 — pedido do Erick: 3 pontos cada (era 1 frase truncada demais).
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

  // v1.8.0 — One Page Executiva (seção 5.60, pedido do Erick): resumo de
  // UMA PÁGINA (A4 paisagem) com todas as áreas geridas por um gestor,
  // pronto pra apresentar à Diretoria — score geral do gestor, score por
  // área, cada colaborador com score/pontos fortes/melhoria, e uma faixa
  // de sinalização pro RH (retenção, reconhecimento, desenvolvimento).
  buildOnePageHtml(data: OnePageData): string {
    const geralColor = semaforoColor(data.bandGeral);
    const geralBg = semaforoBg(data.bandGeral);

    const barsHtml = data.areas
      .map((area) => {
        const value = area.scoreArea ?? 0;
        const color = semaforoColor(area.scoreBandArea);
        const avgPct = Math.max(0, Math.min(100, data.scoreGeral ?? 0));
        return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="width:100px;font-size:9px;font-weight:600;color:#14181f;flex-shrink:0;">${escapeHtml(area.areaName)}</div>
          <div style="flex:1;height:7px;background:#e7edf7;border-radius:4px;overflow:hidden;position:relative;">
            <div style="height:100%;border-radius:4px;width:${Math.max(0, Math.min(100, value))}%;background:${color};"></div>
            <div style="position:absolute;top:-2px;bottom:-2px;width:1.5px;background:#14181f;opacity:0.35;left:${avgPct}%;"></div>
          </div>
          <div style="width:24px;text-align:right;font-size:9px;font-weight:700;flex-shrink:0;">${area.scoreArea !== null ? Math.round(area.scoreArea) : '—'}</div>
        </div>`;
      })
      .join('');

    const areaCardsHtml = data.areas
      .map((area) => {
        const areaColor = semaforoColor(area.scoreBandArea);
        const areaBg = semaforoBg(area.scoreBandArea);
        const bulletList = (items: string[], color: string) =>
          items.length > 0
            ? `<ul style="margin:1px 0 0;padding-left:9px;">${items
                .map((t) => `<li style="font-size:6.8px;line-height:1.35;color:${color};margin-bottom:0.5px;">${escapeHtml(t)}</li>`)
                .join('')}</ul>`
            : '';

        const peopleHtml = area.colaboradores
          .map((p) => {
            const color = semaforoColor(p.scoreBand);
            const hasAnalise = p.pontosForte.length > 0 || p.pontosMelhoria.length > 0;
            return `
            <div style="break-inside:avoid;border-bottom:1px dashed #dfe3ea;padding-bottom:5px;margin-bottom:5px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:4px;">
                <span style="font-size:8.8px;font-weight:700;">${escapeHtml(p.fullName)}</span>
                <span style="font-size:7px;color:#8890a2;flex-shrink:0;">${escapeHtml(p.tenureLabel)} de casa</span>
                <span style="font-size:8.8px;font-weight:800;color:${color};flex-shrink:0;">${p.score !== null ? Math.round(p.score) : '—'}</span>
              </div>
              ${p.positionName ? `<div style="font-size:6.8px;color:#8890a2;">${escapeHtml(p.positionName)}</div>` : ''}
              ${
                hasAnalise
                  ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:2px;">
                <div>
                  <div style="font-size:6.2px;font-weight:700;text-transform:uppercase;color:#1c6b1c;">Pontos fortes</div>
                  ${bulletList(p.pontosForte, '#1c6b1c') || '<span style="font-size:6.6px;color:#8890a2;">—</span>'}
                </div>
                <div>
                  <div style="font-size:6.2px;font-weight:700;text-transform:uppercase;color:#8a5c05;">A desenvolver</div>
                  ${bulletList(p.pontosMelhoria, '#8a5c05') || '<span style="font-size:6.6px;color:#8890a2;">—</span>'}
                </div>
              </div>`
                  : `<div style="font-size:6.6px;color:#8890a2;margin-top:2px;">Sem análise IA gerada para este colaborador neste ciclo.</div>`
              }
            </div>`;
          })
          .join('');

        return `
        <div style="break-inside:avoid;border:1px solid #dfe3ea;border-radius:8px;background:#fff;display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:4px 6px;background:#f6f7fa;border-bottom:1px solid #dfe3ea;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:9.5px;font-weight:800;">${escapeHtml(area.areaName)}</div>
              <div style="font-size:7px;color:#52586a;">${area.colaboradores.length} colaborador(es)</div>
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10.5px;font-weight:800;padding:1px 6px;border-radius:10px;background:${areaBg};color:${areaColor};">
              <span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${areaColor};"></span>${area.scoreArea !== null ? Math.round(area.scoreArea) : '—'}
            </div>
          </div>
          <div style="padding:5px 6px;flex:1;">${peopleHtml || '<p style="font-size:8px;color:#8890a2;">Nenhum colaborador com score neste ciclo.</p>'}</div>
        </div>`;
      })
      .join('');

    // v1.8.1 — pedido do Erick: pra quem é "valorização", mostra 3 pontos
    // de POR QUE valorizar primeiro, e SÓ DEPOIS a defasagem salarial —
    // nunca o contrário (o salário é a consequência, não a manchete).
    const rhItemsHtml = data.rhAlertas
      .map((r) => {
        const flagStyle = RH_FLAG_CLASS[r.flagKind];
        const body =
          r.flagKind === 'valorizacao'
            ? `
          ${
            r.destaques && r.destaques.length > 0
              ? `<ul style="margin:2px 0 0;padding-left:10px;">${r.destaques.map((d) => `<li style="margin-bottom:1px;">${escapeHtml(d)}</li>`).join('')}</ul>`
              : ''
          }
          ${r.salarioLinha ? `<div style="margin-top:3px;padding-top:3px;border-top:1px dashed #f0d9d0;font-weight:600;">${escapeHtml(r.salarioLinha)}</div>` : ''}`
            : `<div style="margin-top:2px;">${escapeHtml(r.motivo ?? '')}</div>`;

        return `
        <div style="break-inside:avoid;background:#fff;border:1px solid #f0d9d0;border-radius:6px;padding:5px 7px;font-size:7.4px;line-height:1.4;">
          <b style="font-size:8.2px;">${escapeHtml(r.fullName)}</b> — ${escapeHtml(r.areaName)}
          ${body}
          <div><span style="display:inline-block;font-size:6.4px;font-weight:700;padding:0.5px 5px;border-radius:6px;margin-top:3px;background:${flagStyle.bg};color:${flagStyle.color};">${escapeHtml(r.flagLabel)}</span></div>
        </div>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
  body { margin: 0; padding: 12px 16px; color: #14181f; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1c3faa; padding-bottom:6px; margin-bottom:8px; }
  .brand-name { font-size:15px; font-weight:800; color:#1c3faa; }
  .doc-title { font-size:9.5px; color:#52586a; margin-top:1px; }
  .header-meta { text-align:right; font-size:8.5px; color:#52586a; line-height:1.5; }
  .confidential { display:inline-block; margin-top:2px; font-size:7.5px; font-weight:700; color:#8a1f1f; background:#fbe7e7; border:1px solid #f0bcbc; padding:1px 6px; border-radius:10px; }
  .manager-strip { display:flex; align-items:center; justify-content:space-between; background:#f6f7fa; border:1px solid #dfe3ea; border-radius:8px; padding:6px 10px; margin-bottom:8px; }
  .manager-name { font-size:12.5px; font-weight:700; }
  .manager-role { font-size:8.5px; color:#52586a; }
  .stats-row { display:grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap:8px; margin-bottom:8px; }
  .tile { border:1px solid #dfe3ea; border-radius:8px; padding:6px 10px; display:flex; align-items:center; gap:8px; }
  .ring { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; color:#fff; flex-shrink:0; }
  .tile-label { font-size:7.5px; color:#52586a; text-transform:uppercase; }
  .tile-value { font-size:14px; font-weight:800; line-height:1.1; }
  .chart-card { border:1px solid #dfe3ea; border-radius:8px; padding:6px 10px; margin-bottom:8px; }
  .chart-title { font-size:8px; font-weight:700; color:#52586a; text-transform:uppercase; margin-bottom:5px; }
  /* v1.8.1: flex-wrap em vez de grid de colunas fixas — com 3 pontos de
     força/melhoria por pessoa, o card de cada área ficou mais alto e
     variável; grid fixo cortava/espremia mal quando o conteúdo excede uma
     página. Flex-wrap deixa cada área virar bloco próprio (com
     break-inside:avoid inline), que o Chromium consegue empurrar pra
     página seguinte inteiro quando não cabe, em vez de cortar no meio. */
  .areas-grid { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
  .areas-grid > div { flex: 1 1 ${Math.floor(100 / Math.max(1, Math.min(4, data.areas.length)))}%; min-width:210px; }
  .rh-band { border:1px solid #f0c8c8; border-radius:8px; background:#fff8f5; padding:6px 10px; display:grid; grid-template-columns: 1fr 3fr; gap:10px; align-items:center; }
  .rh-title { font-size:9px; font-weight:800; color:#8a1f1f; }
  .rh-sub { font-size:7px; color:#7a4a30; margin-top:1px; }
  .rh-items { display:flex; flex-wrap:wrap; gap:6px; }
  .rh-items > div { flex: 1 1 30%; min-width:200px; }
  .footer { display:flex; justify-content:space-between; font-size:6.6px; color:#8890a2; border-top:1px solid #dfe3ea; padding-top:4px; margin-top:8px; }
</style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand-name">Pulse<span style="color:#2a78d6;">One</span></div>
      <div class="doc-title">One Page Executiva — Consolidado de Gestão</div>
    </div>
    <div class="header-meta">
      <div>${escapeHtml(data.cicloResumo)}</div>
      <div>Gerado em: <b>${escapeHtml(data.geradoEm)}</b></div>
      <div class="confidential">CONFIDENCIAL — USO INTERNO / DIRETORIA</div>
    </div>
  </div>

  <div class="manager-strip">
    <div>
      <div class="manager-name">${escapeHtml(data.gestor.fullName)}</div>
      <div class="manager-role">${data.gestor.positionName ? escapeHtml(data.gestor.positionName) + ' · ' : ''}${data.totalAreas} área(s) gerida(s)</div>
    </div>
    <div style="font-size:7.8px;color:#52586a;text-align:right;max-width:320px;">
      Resumo em uma página da atuação do gestor nas áreas sob sua responsabilidade neste ciclo.
    </div>
  </div>

  <div class="stats-row">
    <div class="tile" style="background:${geralBg};border-color:${geralColor}33;">
      <div class="ring" style="background:${geralColor};">${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'}</div>
      <div>
        <div class="tile-label">Score Geral do Gestor</div>
        <div class="tile-value">${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'} / 100</div>
        <span style="font-size:7.5px;font-weight:700;color:${geralColor};">${data.bandGeral ?? '—'}</span>
      </div>
    </div>
    <div class="tile">
      <div class="ring" style="background:#2a78d6;">${data.totalColaboradores}</div>
      <div><div class="tile-label">Colaboradores</div><div class="tile-value">${data.totalColaboradores} pessoas</div></div>
    </div>
    <div class="tile">
      <div class="ring" style="background:#0ca30c;">${data.areasEmZonaVerde}</div>
      <div><div class="tile-label">Áreas em zona verde</div><div class="tile-value">${data.areasEmZonaVerde} de ${data.totalAreas}</div></div>
    </div>
    <div class="tile">
      <div class="ring" style="background:${data.rhAlertas.length > 0 ? '#c23030' : '#0ca30c'};">${data.rhAlertas.length}</div>
      <div><div class="tile-label">Pontos de atenção RH</div><div class="tile-value">${data.rhAlertas.length} sinalizado(s)</div></div>
    </div>
  </div>

  <div class="chart-card">
    <div class="chart-title">Score médio por área (linha = média geral do gestor · ${data.scoreGeral !== null ? Math.round(data.scoreGeral) : '—'})</div>
    ${barsHtml}
  </div>

  <div class="areas-grid">${
    areaCardsHtml ||
    '<p style="font-size:9px;color:#8890a2;grid-column:1/-1;">Nenhuma área gerida tem um ciclo finalizado/arquivado ainda — feche e consolide um ciclo pra essa área aparecer aqui.</p>'
  }</div>

  ${
    data.rhAlertas.length > 0
      ? `
  <div class="rh-band">
    <div>
      <div class="rh-title">⚠ Pontos de Atenção para o RH</div>
      <div class="rh-sub">Cruzamento de score, tempo de casa e faixa salarial do mesmo cargo entre as áreas geridas.</div>
    </div>
    <div class="rh-items">${rhItemsHtml}</div>
  </div>`
      : ''
  }

  <div class="footer">
    <span>PulseOne · Documento gerado automaticamente a partir dos dados do ciclo · Uso interno e confidencial</span>
    <span>One Page Executiva</span>
  </div>

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
