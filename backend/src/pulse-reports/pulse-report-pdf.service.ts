import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

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

@Injectable()
export class PulseReportPdfService {
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

  async generatePdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
