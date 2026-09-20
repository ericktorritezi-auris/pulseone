import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseCycleStatus, PulseEvaluationStatus, PulseEvaluationType, PulseReportStatus, UserRole, AuditAction } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { AnthropicService } from '../anthropic/anthropic.service';
import {
  PulseReportPdfService,
  OnePageData,
  OnePageArea,
  OnePageColaborador,
  OnePageRhAlerta,
} from './pulse-report-pdf.service';
import { areaGroupWhere } from '../common/cycle-area.util';
import type { Response } from 'express';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class SetOpinionDto {
  @IsString()
  @MinLength(1)
  opinion: string;
}

class FinalizeDto {
  @IsOptional()
  @IsString()
  opinion?: string;
}

@Injectable()
export class PulseReportsService {
  constructor(
    private prisma: PrismaService,
    private anthropic: AnthropicService,
  ) {}

  /**
   * REGRA DE VISIBILIDADE (seção 5.6 + ajuste pedido pelo Erick): colaborador
   * só vê o PRÓPRIO relatório, e só depois que TODA a área estiver com os
   * relatórios finalizados — não basta o dele estar pronto. Isso evita que
   * alguém veja o resultado antes de outros da mesma área e troque
   * informação enquanto o restante ainda está em consolidação. Gestor vê
   * os relatórios dos seus liderados DIRETOS em qualquer status (precisa,
   * pra poder consolidar). Admin vê tudo, sempre.
   */
  private async isAreaFullyConsolidated(cycleId: string, areaId: string): Promise<boolean> {
    const [total, finalizados] = await Promise.all([
      this.prisma.pulseReport.count({ where: { cycleId, owner: { areaId } } }),
      this.prisma.pulseReport.count({
        where: { cycleId, owner: { areaId }, status: PulseReportStatus.FINALIZADO },
      }),
    ]);
    return total > 0 && total === finalizados;
  }

  private async assertCanAccessReport(
    report: { ownerId: string; cycleId: string; status: PulseReportStatus; owner: { managerId: string | null; areaId: string | null } },
    requester: AuthUser,
  ) {
    if (requester.role === UserRole.ADMIN) return;

    const isOwner = report.ownerId === requester.id;

    if (requester.role === UserRole.GESTOR) {
      const isDirectReport = report.owner.managerId === requester.id;
      // Consolidando o relatório de um liderado direto: acesso liberado em
      // qualquer status, precisa pra poder escrever o parecer.
      if (isDirectReport) return;
      // Vendo o PRÓPRIO relatório (o gestor também é avaliado por alguém
      // acima, ou está no topo): aplica exatamente a mesma trava do
      // colaborador — NUNCA libera automaticamente só por ser "dono".
      // Esse era o bug: antes bastava isOwner=true pra liberar sem checar nada.
      if (isOwner) {
        await this.assertSelfViewReady(report);
        return;
      }
      throw new ForbiddenException('Você só pode acessar relatórios dos seus liderados diretos.');
    }

    // COLABORADOR
    if (!isOwner) {
      throw new ForbiddenException('Você só pode acessar o próprio relatório.');
    }
    await this.assertSelfViewReady(report);
  }

  // Trava real de auto-visualização, usada tanto por COLABORADOR quanto por
  // GESTOR vendo o PRÓPRIO relatório: exige o relatório FINALIZADO e a área
  // inteira consolidada — sem exceção pra quem está no topo da hierarquia
  // (o relatório dele já finaliza sozinho, mas ainda espera a área toda).
  private async assertSelfViewReady(report: {
    cycleId: string;
    status: PulseReportStatus;
    owner: { areaId: string | null };
  }) {
    if (report.status !== PulseReportStatus.FINALIZADO) {
      throw new ForbiddenException('Seu relatório ainda não foi finalizado.');
    }
    if (!report.owner.areaId) {
      // Não deveria acontecer na prática (donos de relatório sempre têm
      // área — admin nunca participa do Pulse), mas mantém o TS seguro.
      throw new ForbiddenException('Não foi possível verificar a consolidação da área.');
    }
    const areaReady = await this.isAreaFullyConsolidated(report.cycleId, report.owner.areaId);
    if (!areaReady) {
      throw new ForbiddenException(
        'Seu relatório está pronto, mas ainda aguarda a finalização dos relatórios de toda a sua área antes de ser liberado.',
      );
    }
  }

  // Relatórios dos liderados diretos do gestor logado — é a tela de consolidação.
  async findForManager(requesterId: string) {
    return this.prisma.pulseReport.findMany({
      where: { owner: { managerId: requesterId } },
      include: {
        owner: { select: { id: true, fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin() {
    return this.prisma.pulseReport.findMany({
      include: {
        owner: { select: { id: true, fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Meus próprios relatórios, de qualquer papel — usado pela tela de
  // Histórico. Mostra também os ainda não finalizados (com status visível),
  // mas o detalhe completo (findOne) só libera de verdade quando FINALIZADO.
  async findMine(requesterId: string) {
    return this.prisma.pulseReport.findMany({
      where: { ownerId: requesterId },
      include: { cycle: { select: { label: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester: AuthUser) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } },
        cycle: { select: { label: true, status: true } },
        aiAnalysis: true,
      },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado.');
    await this.assertCanAccessReport(report, requester);

    // REGRA DE ANONIMATO (PRD seção 19): quem está vendo o PRÓPRIO relatório
    // (o dono) vê colegas como "Colega 1/2/3" e liderados como "Liderado 1/2/3"
    // — só o gestor direto aparece com nome real. Gestor/Admin veem todo
    // mundo com nome real (precisam pra consolidar de verdade).
    const viewingAsOwner = requester.id === report.ownerId && requester.role !== UserRole.ADMIN;

    return this.buildReportDetail(report, viewingAsOwner);
  }

  /**
   * Usado só pelo arquivamento automático de ciclo (PulseCyclesModule) pra
   * montar o PDF final que vai por e-mail — sem checagem de permissão de
   * usuário porque não existe um "requester" HTTP aqui (é uma ação em lote
   * disparada internamente, já protegida por ser exclusiva do admin no
   * @Roles(ADMIN) da rota de arquivar). Sempre monta como se fosse o
   * próprio dono vendo (anonimato aplicado), já que é o PDF que essa
   * pessoa recebe de verdade.
   */
  async getReportForArchiveEmail(id: string) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } },
        cycle: { select: { label: true, status: true } },
        aiAnalysis: true,
      },
    });
    if (!report) return null;
    return this.buildReportDetail(report, true);
  }

  /**
   * CORREÇÃO URGENTE (pedido do Erick — seção 5.58): usado pela rota
   * "Baixar PDF" (`GET /pulse-reports/:id/pdf`), que o GESTOR aciona pra
   * gerar o PDF que vai ser enviado ao colaborador. Antes, essa rota
   * reaproveitava `findOne()` — que calcula o anonimato baseado em QUEM
   * está pedindo (`viewingAsOwner = requester.id === report.ownerId`).
   * Como quem clica em "Baixar PDF" é o GESTOR (não o dono), isso resultava
   * em `viewingAsOwner = false`, e o PDF saía com o NOME REAL de cada
   * colega avaliador — exatamente o documento que vai pro colaborador ler.
   *
   * O PDF é sempre destinado ao DONO do relatório, não importa quem o
   * gerou — então aqui a checagem de permissão continua a mesma de sempre
   * (`assertCanAccessReport`, sem exigir ciclo fechado — o gestor já podia
   * baixar o PDF de um relatório finalizado de qualquer status), mas a
   * montagem do conteúdo sempre usa `viewingAsOwner: true`, igual ao
   * e-mail de arquivamento automático acima. O gestor continua vendo tudo
   * com nome real DENTRO do sistema (tela de detalhe, via `findOne`) —
   * isso não muda; só o PDF gerado pra envio é que nunca expõe nome de
   * colega, nem quando é o gestor quem clicou em gerar.
   */
  async getForPdf(id: string, requester: AuthUser) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } },
        cycle: { select: { label: true, status: true } },
        aiAnalysis: true,
      },
    });
    if (!report) throw new NotFoundException('Relatório não encontrado.');
    await this.assertCanAccessReport(report, requester);
    return this.buildReportDetail(report, true);
  }

  private async buildReportDetail(
    report: {
      id: string;
      cycleId: string;
      ownerId: string;
      status: PulseReportStatus;
      managerFinalOpinion: string | null;
      finalizedAt: Date | null;
      owner: {
        id: string;
        fullName: string;
        managerId: string | null;
        areaId: string | null;
        area: { name: string } | null;
        position: { name: string } | null;
      };
      cycle: { label: string; status: string };
      aiAnalysis: unknown;
    },
    viewingAsOwner: boolean,
  ) {
    const score = await this.prisma.pulseScore.findUnique({
      where: { cycleId_userId: { cycleId: report.cycleId, userId: report.ownerId } },
    });

    const feedbacks = await this.prisma.pulseFeedback.findMany({
      where: { cycleId: report.cycleId, targetId: report.ownerId, status: PulseEvaluationStatus.FINALIZADO },
      include: { evaluator: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    let colegaCount = 0;
    let liderdadoCount = 0;

    const comentarios = feedbacks.map((fb) => {
      let autor: string;

      if (fb.type === PulseEvaluationType.AUTOAVALIACAO) {
        autor = 'Autoavaliação';
      } else if (fb.type === PulseEvaluationType.AVALIACAO_EQUIPE) {
        // Alguém acima avaliando o dono — sempre nome real (é o gestor direto)
        autor = fb.evaluator.fullName;
      } else if (fb.type === PulseEvaluationType.AVALIACAO_GESTOR) {
        // Um liderado avaliando o dono (que é gestor) — anonimizado pro próprio dono
        autor = viewingAsOwner ? `Liderado ${++liderdadoCount}` : fb.evaluator.fullName;
      } else {
        // COLEGA
        autor = viewingAsOwner ? `Colega ${++colegaCount}` : fb.evaluator.fullName;
      }

      return { tipo: fb.type, autor, texto: fb.comment };
    });

    // Avaliações DADAS pelo dono do relatório (pedido do Erick — seção 5.57):
    // além do que ele recebeu (acima), o quadro completo do Pulse dessa
    // pessoa inclui o que ELA avaliou — colegas e o próprio gestor.
    // Autoavaliação fica de fora daqui (já aparece em `comentarios`, senão
    // apareceria duplicada). Sem trava adicional de visibilidade: quem já
    // pode ver este relatório (gestor direto ou admin — ver
    // `assertCanAccessReport`) já tem acesso liberado a este mesmo nível de
    // detalhe; o próprio dono, vendo seu relatório, também vê o que ele
    // mesmo escreveu (não é informação nova pra ele).
    const dadas = await this.prisma.pulseFeedback.findMany({
      where: {
        cycleId: report.cycleId,
        evaluatorId: report.ownerId,
        type: { not: PulseEvaluationType.AUTOAVALIACAO },
        status: PulseEvaluationStatus.FINALIZADO,
      },
      include: { target: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const avaliacoesDadas = dadas.map((fb) => ({
      tipo: fb.type,
      rotulo:
        fb.type === PulseEvaluationType.AVALIACAO_GESTOR
          ? 'Avaliação para o gestor'
          : fb.type === PulseEvaluationType.AVALIACAO_EQUIPE
            ? 'Avaliação para liderado'
            : 'Avaliação para colega',
      destinatario: fb.target.fullName,
      texto: fb.comment,
    }));

    return {
      id: report.id,
      status: report.status,
      managerFinalOpinion: report.managerFinalOpinion,
      finalizedAt: report.finalizedAt,
      // Quem está no topo da hierarquia (sem gestor direto) não precisa de
      // parecer final — pedido do Erick. O frontend usa isso pra esconder
      // o painel de parecer e mostrar só as avaliações recebidas.
      requiresOpinion: report.owner.managerId !== null,
      owner: {
        id: report.owner.id,
        fullName: report.owner.fullName,
        areaName: report.owner.area?.name ?? '—',
        positionName: report.owner.position?.name ?? '—',
      },
      cycle: report.cycle,
      score,
      aiAnalysis: report.aiAnalysis,
      comentarios,
      avaliacoesDadas,
    };
  }

  async generateAiAnalysis(id: string, requester: AuthUser) {
    const report = await this.getReportForAction(id, requester);

    const score = await this.prisma.pulseScore.findUnique({
      where: { cycleId_userId: { cycleId: report.cycleId, userId: report.ownerId } },
    });
    if (!score) {
      throw new BadRequestException('O ciclo ainda não foi consolidado — não há score calculado pra essa pessoa.');
    }

    const feedbacks = await this.prisma.pulseFeedback.findMany({
      where: { cycleId: report.cycleId, targetId: report.ownerId, status: PulseEvaluationStatus.FINALIZADO },
    });

    const selfFeedback = feedbacks.find((f) => f.type === PulseEvaluationType.AUTOAVALIACAO);
    const receivedComments = feedbacks
      .filter((f) => f.type !== PulseEvaluationType.AUTOAVALIACAO && f.comment)
      .map((f) => f.comment as string);

    const result = await this.anthropic.generateAnalysis({
      personName: report.owner.fullName,
      areaName: report.owner.area?.name ?? '—',
      positionName: report.owner.position?.name ?? '—',
      finalScore: score.finalScore,
      teamScore: score.teamScore,
      managerScore: score.managerScore,
      selfScore: score.selfScore,
      npsScore: score.npsScore,
      scoreBand: score.scoreBand,
      receivedComments,
      selfComment: selfFeedback?.comment ?? null,
    });

    const existing = await this.prisma.pulseAiAnalysis.findUnique({ where: { reportId: id } });

    const aiAnalysis = await this.prisma.pulseAiAnalysis.upsert({
      where: { reportId: id },
      create: {
        reportId: id,
        strengths: result.strengths,
        improvements: result.improvements,
        trends: result.trends,
        summary: result.summary,
        suggestedOpinion: result.suggestedOpinion,
        strengthsItems: result.strengthsItems,
        improvementItems: result.improvementItems,
        valuationItems: result.valuationItems,
        model: process.env.ANTHROPIC_MODEL ?? 'não configurado',
      },
      update: {
        strengths: result.strengths,
        improvements: result.improvements,
        trends: result.trends,
        summary: result.summary,
        suggestedOpinion: result.suggestedOpinion,
        strengthsItems: result.strengthsItems,
        improvementItems: result.improvementItems,
        valuationItems: result.valuationItems,
        model: process.env.ANTHROPIC_MODEL ?? 'não configurado',
        regenCount: (existing?.regenCount ?? 0) + 1,
      },
    });

    // Status único de espera (AGUARDANDO_FECHAMENTO) — gerar a análise de
    // IA não muda o status, só o parecer final + finalize() fazem isso.

    return aiAnalysis;
  }

  async setOpinion(id: string, opinion: string, requester: AuthUser) {
    const report = await this.getReportForAction(id, requester);

    if (report.status === PulseReportStatus.FINALIZADO) {
      throw new ForbiddenException('Este relatório já foi finalizado e não pode mais ser editado.');
    }

    return this.prisma.pulseReport.update({
      where: { id },
      data: { managerFinalOpinion: opinion },
    });
  }

  async finalize(id: string, opinion: string | undefined, requester: AuthUser) {
    let report = await this.getReportForAction(id, requester);

    // Segunda camada de segurança: se o parecer vier junto nesta chamada
    // (ex: o frontend salva e finaliza em sequência), grava antes de checar
    // — assim não depende só de um clique anterior em "Salvar rascunho".
    if (opinion && opinion.trim()) {
      await this.prisma.pulseReport.update({ where: { id }, data: { managerFinalOpinion: opinion } });
      report = await this.getReportForAction(id, requester);
    }

    // Quem está no topo da hierarquia (sem gestor direto) não precisa de
    // parecer final — ninguém está acima dele pra escrever isso. Já sai
    // auto-finalizado na consolidação, mas esta é uma segunda camada de
    // segurança caso alguém tente agir manualmente antes disso.
    const requiresOpinion = report.owner.managerId !== null;

    if (requiresOpinion && !report.managerFinalOpinion) {
      throw new BadRequestException('É preciso escrever o parecer final antes de finalizar.');
    }
    if (report.status === PulseReportStatus.FINALIZADO) {
      throw new ForbiddenException('Este relatório já está finalizado.');
    }

    return this.prisma.pulseReport.update({
      where: { id },
      data: {
        status: PulseReportStatus.FINALIZADO,
        finalizedById: requester.id,
        finalizedAt: new Date(),
      },
    });
  }

  // Helper: busca o relatório e garante que quem está agindo (gerar IA,
  // escrever parecer, finalizar) é o gestor direto do dono ou o admin —
  // nunca o próprio dono, mesmo que ele tecnicamente "acesse" via assertCanAccessReport.
  private async getReportForAction(id: string, requester: AuthUser) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: { owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } } },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado.');

    if (requester.role === UserRole.ADMIN) return report;

    if (requester.role === UserRole.GESTOR && report.owner.managerId === requester.id) {
      return report;
    }

    throw new ForbiddenException('Só o gestor direto desta pessoa (ou o admin) pode consolidar este relatório.');
  }
}

// v1.8.0 — One Page Executiva (seção 5.60, pedido do Erick): resumo de UMA
// PÁGINA com todas as áreas geridas pelo gestor logado — score geral,
// score/pontos de cada colaborador por área, e sinalizações pro RH. Reúne
// dados que hoje já existem espalhados (PulseScore, PulseAiAnalysis, Dossiê
// Confidencial) — não recalcula nada do motor de score, só lê o que já foi
// consolidado.
//
// Mesma banda de score do resto do sistema (Excepcional…Crítico) — duplicada
// aqui de propósito (não importada de pulse-cycles.module.ts) pra evitar
// import circular entre os dois módulos, que já se importam um ao outro na
// direção contrária. Qualquer mudança nos limiares de `SCORE_BANDS` em
// pulse-cycles.module.ts precisa ser replicada aqui também.
const ONE_PAGE_SCORE_BANDS: [number, string][] = [
  [90, 'Excepcional'],
  [80, 'Excelente'],
  [70, 'Muito Bom'],
  [60, 'Adequado'],
  [50, 'Atenção'],
  [0, 'Crítico'],
];
function onePageScoreBand(score: number): string {
  for (const [min, label] of ONE_PAGE_SCORE_BANDS) {
    if (score >= min) return label;
  }
  return 'Crítico';
}
const ZONA_VERDE_BANDS = new Set(['Excepcional', 'Excelente', 'Muito Bom']);

function tenureLabel(dataInicioEmpresa: Date | null): string {
  if (!dataInicioEmpresa) return '—';
  const now = new Date();
  let months =
    (now.getFullYear() - dataInicioEmpresa.getFullYear()) * 12 + (now.getMonth() - dataInicioEmpresa.getMonth());
  if (now.getDate() < dataInicioEmpresa.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths}m`;
  if (remMonths === 0) return `${years}a`;
  return `${years}a ${remMonths}m`;
}
function tenureMonths(dataInicioEmpresa: Date | null): number {
  if (!dataInicioEmpresa) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - dataInicioEmpresa.getFullYear()) * 12 + (now.getMonth() - dataInicioEmpresa.getMonth());
  if (now.getDate() < dataInicioEmpresa.getDate()) months -= 1;
  return Math.max(0, months);
}

@Injectable()
export class OnePageExecutivaService {
  constructor(private prisma: PrismaService) {}

  // v1.8.3 — pedido do Erick: o Relatório Executivo (seção 5.60) sempre
  // pegava, por trás dos panos e por área, "o ciclo mais recente
  // finalizado/arquivado" — sem avisar qual, e sem deixar o gestor
  // escolher. Isso funciona bem quando todas as áreas fecham o Pulse
  // juntas (premissa confirmada com o Erick), mas ficava implícito demais
  // — por exemplo, ao abrir um ciclo novo, não dava pra gerar o executivo
  // do ciclo ANTERIOR sem esperar o próximo fechar. Esse método lista os
  // ciclos fechados disponíveis (mais recente primeiro) pra alimentar um
  // seletor na tela, antes de gerar o PDF.
  async listCycles(requesterId: string): Promise<{ id: string; label: string; openedAt: Date | null }[]> {
    const gestor = await this.prisma.user.findUniqueOrThrow({
      where: { id: requesterId },
      select: { managedAreas: { select: { id: true } } },
    });

    if (gestor.managedAreas.length === 0) {
      throw new BadRequestException('Você não gerencia nenhuma área ainda — não há o que resumir.');
    }

    return this.prisma.pulseCycle.findMany({
      where: {
        status: { in: [PulseCycleStatus.FINALIZADO, PulseCycleStatus.ARQUIVADO] },
        ...areaGroupWhere(gestor.managedAreas.map((a) => a.id)),
      },
      select: { id: true, label: true, openedAt: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  // v1.8.3 — `cycleId` agora é opcional e, quando informado (vindo do
  // seletor de ciclo na tela), o MESMO ciclo é usado pra TODAS as áreas
  // geridas — em vez de cada área buscar "seu" ciclo mais recente de
  // forma independente (comportamento antigo, mantido como fallback
  // abaixo só por compatibilidade/robustez, pro caso raro de uma área
  // ainda não ter fechado esse ciclo específico).
  async build(requesterId: string, cycleId?: string): Promise<OnePageData> {
    const gestor = await this.prisma.user.findUniqueOrThrow({
      where: { id: requesterId },
      select: {
        fullName: true,
        position: { select: { name: true } },
        managedAreas: { select: { id: true, name: true } },
      },
    });

    if (gestor.managedAreas.length === 0) {
      throw new BadRequestException('Você não gerencia nenhuma área ainda — não há o que resumir.');
    }

    // Sem cycleId explícito (chamada antiga, ou API usada direto): cai no
    // último ciclo fechado que toca QUALQUER área gerida — mantém
    // compatibilidade com quem já usava o endpoint sem o seletor novo.
    let selectedCycle: { id: string; label: string; openedAt: Date | null } | null = null;
    if (cycleId) {
      selectedCycle = await this.prisma.pulseCycle.findFirst({
        where: {
          id: cycleId,
          status: { in: [PulseCycleStatus.FINALIZADO, PulseCycleStatus.ARQUIVADO] },
          ...areaGroupWhere(gestor.managedAreas.map((a) => a.id)),
        },
        select: { id: true, label: true, openedAt: true },
      });
      if (!selectedCycle) {
        throw new BadRequestException('Ciclo não encontrado, não finalizado/arquivado, ou fora das suas áreas geridas.');
      }
    } else {
      selectedCycle = await this.prisma.pulseCycle.findFirst({
        where: {
          status: { in: [PulseCycleStatus.FINALIZADO, PulseCycleStatus.ARQUIVADO] },
          ...areaGroupWhere(gestor.managedAreas.map((a) => a.id)),
        },
        select: { id: true, label: true, openedAt: true },
        orderBy: { openedAt: 'desc' },
      });
    }

    if (!selectedCycle) {
      throw new BadRequestException('Nenhum ciclo finalizado/arquivado encontrado pra nenhuma das suas áreas geridas ainda.');
    }

    // Liderados diretos (mesma base usada no Dashboard do Gestor — seção
    // 5.55), com o que o Dossiê Confidencial já guarda (salário, data de
    // início) e o cargo (nome do cargo é escopado por área no cadastro,
    // mas aqui comparamos só pelo NOME — pedido explícito do Erick: "cargos
    // de mesmo nível e intensidade dentro de todas as áreas do gestor").
    const team = await this.prisma.user.findMany({
      where: { managerId: requesterId, active: true },
      select: {
        id: true,
        fullName: true,
        areaId: true,
        salario: true,
        dataInicioEmpresa: true,
        position: { select: { name: true } },
      },
    });

    const areasOut: OnePageArea[] = [];
    // Coleta cross-área (todas as áreas geridas) pra benchmarking salarial
    // por NOME do cargo — pedido explícito do Erick.
    const salaryByPosition = new Map<string, { total: number; count: number }>();
    // Dados brutos por pessoa, guardados à parte pra rodar as regras de RH
    // só depois de ter a média salarial de TODOS os cargos calculada.
    const rawPeople: {
      fullName: string;
      areaName: string;
      positionName: string | null;
      salario: number | null;
      score: number | null;
      scoreBand: string | null;
      prevScore: number | null;
      tenureLabel: string;
      tenureMonths: number;
      valuationItems: string[];
    }[] = [];

    let scoreSum = 0;
    let scoreCount = 0;

    for (const area of gestor.managedAreas) {
      // v1.8.3 — o MESMO ciclo escolhido (selectedCycle) é usado pra todas
      // as áreas. Confirma que esse ciclo específico realmente cobre esta
      // área (Geral, ou área explícita/legada) — na prática deveria cobrir
      // sempre, já que as áreas do gestor fecham o Pulse juntas, mas o
      // check evita mostrar dado de outra área caso algum dia isso mude.
      const areaCycle = await this.prisma.pulseCycle.findFirst({
        where: { id: selectedCycle.id, ...areaGroupWhere([area.id]) },
        select: { id: true, label: true, openedAt: true },
      });
      if (!areaCycle) continue; // ciclo selecionado não cobre essa área — fica de fora do resumo

      const membrosDaArea = team.filter((t) => t.areaId === area.id);
      if (membrosDaArea.length === 0) continue;

      const colaboradores: OnePageColaborador[] = [];
      let areaScoreSum = 0;
      let areaScoreCount = 0;

      for (const membro of membrosDaArea) {
        const [pulseScore, pulseReport] = await Promise.all([
          this.prisma.pulseScore.findUnique({
            where: { cycleId_userId: { cycleId: areaCycle.id, userId: membro.id } },
          }),
          this.prisma.pulseReport.findFirst({
            where: { cycleId: areaCycle.id, ownerId: membro.id },
            include: { aiAnalysis: true },
          }),
        ]);

        // Score do ciclo ANTERIOR do mesmo colaborador (não necessariamente
        // desta mesma área — a pessoa pode ter mudado, mas o normal é
        // continuar na mesma), só pra detectar queda relevante (seção 5.60).
        const prevScore = await this.prisma.pulseScore.findFirst({
          where: { userId: membro.id, cycle: { openedAt: { lt: areaCycle.openedAt ?? new Date() } } },
          orderBy: { cycle: { openedAt: 'desc' } },
          select: { finalScore: true },
        });

        const score = pulseScore?.finalScore ?? null;
        const band = score !== null ? onePageScoreBand(score) : null;
        if (score !== null) {
          areaScoreSum += score;
          areaScoreCount += 1;
        }

        const positionName = membro.position?.name ?? null;
        const salarioNum = membro.salario !== null ? Number(membro.salario) : null;
        if (positionName && salarioNum !== null) {
          const key = positionName.trim().toLowerCase();
          const entry = salaryByPosition.get(key) ?? { total: 0, count: 0 };
          entry.total += salarioNum;
          entry.count += 1;
          salaryByPosition.set(key, entry);
        }

        // v1.8.2 — pedido do Erick: nada de frase truncada. Os itens já
        // vêm prontos (curtos, 3 cada) da própria Análise IA do relatório
        // (seção 5.62), gerados junto quando o gestor clica "Gerar Análise
        // IA" — aqui só lemos o que já foi salvo, sem chamar IA de novo.
        const pontosForte = pulseReport?.aiAnalysis?.strengthsItems ?? [];
        const pontosMelhoria = pulseReport?.aiAnalysis?.improvementItems ?? [];
        const valuationItems = pulseReport?.aiAnalysis?.valuationItems ?? [];

        colaboradores.push({
          fullName: membro.fullName,
          positionName,
          tenureLabel: tenureLabel(membro.dataInicioEmpresa),
          score,
          scoreBand: band,
          pontosForte,
          pontosMelhoria,
        });

        rawPeople.push({
          fullName: membro.fullName,
          areaName: area.name,
          positionName,
          salario: salarioNum,
          score,
          scoreBand: band,
          prevScore: prevScore?.finalScore ?? null,
          tenureLabel: tenureLabel(membro.dataInicioEmpresa),
          tenureMonths: tenureMonths(membro.dataInicioEmpresa),
          valuationItems,
        });
      }

      const scoreArea = areaScoreCount > 0 ? areaScoreSum / areaScoreCount : null;
      if (scoreArea !== null) {
        scoreSum += scoreArea;
        scoreCount += 1;
      }

      areasOut.push({
        areaName: area.name,
        scoreArea,
        scoreBandArea: scoreArea !== null ? onePageScoreBand(scoreArea) : null,
        colaboradores,
      });
    }

    // Score geral do gestor = média das médias de cada área (pedido
    // explícito do Erick: "a média geral do Score de todas as suas áreas"
    // — cada área pesa igual, não pondera pelo número de colaboradores).
    const scoreGeral = scoreCount > 0 ? scoreSum / scoreCount : null;
    const bandGeral = scoreGeral !== null ? onePageScoreBand(scoreGeral) : null;

    // Regras de RH (seção 5.60/5.61) — prioridade: desempenho em queda/baixo >
    // valorização. Cada pessoa entra com no máximo UM sinalizador, o mais
    // relevante. A partir da v1.8.1 (pedido do Erick), "valorização" e
    // "retenção" foram unificados num único flag, mostrando SEMPRE 3 motivos
    // de valorização antes de qualquer número de salário, e considerando
    // nessa análise apenas quem tem mais de 1 ano de casa (tenureMonths > 12).
    const rhAlertas: OnePageRhAlerta[] = [];
    for (const p of rawPeople) {
      if (p.score !== null && p.score < 60) {
        rhAlertas.push({
          fullName: p.fullName,
          areaName: p.areaName,
          motivo: `Score ${Math.round(p.score)} neste ciclo (banda ${p.scoreBand}) — recomenda-se plano de desenvolvimento com o gestor.`,
          flagLabel: 'Plano de desenvolvimento',
          flagKind: 'desenvolvimento',
        });
        continue;
      }
      if (p.score !== null && p.prevScore !== null && p.prevScore - p.score >= 10) {
        rhAlertas.push({
          fullName: p.fullName,
          areaName: p.areaName,
          motivo: `Queda de ${Math.round(p.prevScore - p.score)} pontos em relação ao ciclo anterior (${Math.round(p.prevScore)} → ${Math.round(p.score)}).`,
          flagLabel: 'Plano de desenvolvimento',
          flagKind: 'desenvolvimento',
        });
        continue;
      }

      // Valorização: só entra quem tem mais de 1 ano de casa E desempenho
      // forte (score >= 75). Regra explícita do Erick: "sempre considerar
      // nessa avaliação funcionários com mais de 1 ano de casa".
      if (p.tenureMonths > 12 && p.score !== null && p.score >= 75) {
        // v1.8.2 — os 3 motivos vêm prontos da Análise IA (valuationItems,
        // seção 5.62), já como itens curtos e completos (nunca frase
        // truncada). Sem análise IA gerada ainda pro relatório dessa
        // pessoa, cai num fallback genérico (nunca deixa o card vazio).
        const destaques: string[] =
          p.valuationItems.length > 0
            ? p.valuationItems
            : [
                `Score ${Math.round(p.score)} (banda ${p.scoreBand}) neste ciclo.`,
                `${p.tenureLabel} de casa.`,
                'Gere a Análise IA do relatório desta pessoa pra ver os motivos detalhados.',
              ];

        let salarioLinha: string;
        const key = p.positionName?.trim().toLowerCase();
        const group = key ? salaryByPosition.get(key) : undefined;
        if (p.salario !== null && group && group.count >= 2) {
          const avg = group.total / group.count;
          const pctBelow = avg > 0 ? Math.round((1 - p.salario / avg) * 100) : 0;
          if (pctBelow >= 1) {
            salarioLinha = `Salário ${pctBelow}% abaixo da média do cargo "${p.positionName}" entre as áreas geridas.`;
          } else {
            salarioLinha = `Salário alinhado ou acima da média do cargo "${p.positionName}" entre as áreas geridas.`;
          }
        } else {
          salarioLinha = 'Sem dado salarial comparável suficiente para este cargo entre as áreas geridas.';
        }

        rhAlertas.push({
          fullName: p.fullName,
          areaName: p.areaName,
          destaques,
          salarioLinha,
          flagLabel: 'Valorização',
          flagKind: 'valorizacao',
        });
      }
    }

    // Prioriza desenvolvimento > valorização, e corta em 6 pra não estourar
    // o espaço de uma página só.
    const kindOrder: Record<OnePageRhAlerta['flagKind'], number> = { desenvolvimento: 0, valorizacao: 1 };
    rhAlertas.sort((a, b) => kindOrder[a.flagKind] - kindOrder[b.flagKind]);

    return {
      gestor: { fullName: gestor.fullName, positionName: gestor.position?.name ?? null },
      // v1.8.3 — antes era um texto genérico ("ciclo mais recente de cada
      // área"); agora mostra o rótulo do ciclo específico escolhido no
      // seletor (ex: "Ciclo: Pulse Setembro/2026").
      cicloResumo: `Ciclo: ${selectedCycle.label}`,
      geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      scoreGeral,
      bandGeral,
      totalColaboradores: areasOut.reduce((sum, a) => sum + a.colaboradores.length, 0),
      totalAreas: gestor.managedAreas.length,
      areasEmZonaVerde: areasOut.filter((a) => a.scoreBandArea && ZONA_VERDE_BANDS.has(a.scoreBandArea)).length,
      areas: areasOut,
      rhAlertas: rhAlertas.slice(0, 6),
    };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('pulse-reports')
class PulseReportsController {
  constructor(
    private pulseReportsService: PulseReportsService,
    private pdfService: PulseReportPdfService,
    private onePageService: OnePageExecutivaService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.GESTOR)
  @Get()
  findForManager(@Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findForManager(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  findAllForAdmin() {
    return this.pulseReportsService.findAllForAdmin();
  }

  @Get('mine')
  findMine(@Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findMine(req.user.id);
  }

  // v1.8.0 — One Page Executiva (seção 5.60). Precisa vir ANTES de ':id' —
  // senão o Nest trataria "one-page"/"one-page/cycles" como um id de
  // relatório.
  //
  // v1.8.3 — pedido do Erick: antes de gerar o PDF, a tela pergunta de
  // qual ciclo Pulse fechado é o relatório (em vez de sempre assumir "o
  // mais recente" sem avisar). Essa rota alimenta o seletor.
  @UseGuards(RolesGuard)
  @Roles(UserRole.GESTOR)
  @Get('one-page/cycles')
  getOnePageCycles(@Req() req: { user: AuthUser }) {
    return this.onePageService.listCycles(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.GESTOR)
  @Audit(AuditAction.GERACAO_PDF)
  @Get('one-page/pdf')
  async getOnePagePdf(@Req() req: { user: AuthUser }, @Res() res: Response, @Query('cycleId') cycleId?: string) {
    const data = await this.onePageService.build(req.user.id, cycleId);
    const html = this.pdfService.buildOnePageHtml(data);
    const buffer = await this.pdfService.generatePdf(
      html,
      { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      { landscape: true },
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="one-page-executiva-${data.gestor.fullName.replace(/\s+/g, '-')}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findOne(id, req.user);
  }

  // CORREÇÃO URGENTE (seção 5.58): usava findOne() aqui — mesma checagem de
  // permissão, mas o anonimato de findOne() depende de QUEM pediu (o
  // gestor, que vê nome real na tela). O PDF é sempre pro DONO ler, então
  // usa getForPdf(), que aplica o anonimato de colega/liderado sempre,
  // não importa quem clicou em "Baixar PDF".
  @Audit(AuditAction.GERACAO_PDF)
  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Req() req: { user: AuthUser }, @Res() res: Response) {
    const report = await this.pulseReportsService.getForPdf(id, req.user);
    const html = this.pdfService.buildHtml(report as any);
    const buffer = await this.pdfService.generatePdf(html);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio-${report.owner.fullName.replace(/\s+/g, '-')}-${report.cycle.label.replace(/\s+/g, '-')}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.GERACAO_IA)
  @Patch(':id/ai-analysis')
  generateAiAnalysis(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.generateAiAnalysis(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EDICAO)
  @Patch(':id/opinion')
  setOpinion(@Param('id') id: string, @Body() dto: SetOpinionDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.setOpinion(id, dto.opinion, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.FECHAMENTO)
  @Patch(':id/finalize')
  finalize(@Param('id') id: string, @Body() dto: FinalizeDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.finalize(id, dto?.opinion, req.user);
  }
}

@Module({
  imports: [AnthropicModule],
  controllers: [PulseReportsController],
  providers: [PulseReportsService, PulseReportPdfService, OnePageExecutivaService],
  exports: [PulseReportsService, PulseReportPdfService],
})
export class PulseReportsModule {}
