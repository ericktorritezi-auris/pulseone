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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseEvaluationStatus, PulseEvaluationType, PulseReportStatus, UserRole } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { AnthropicService } from '../anthropic/anthropic.service';
import { PulseReportPdfService } from './pulse-report-pdf.service';
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
class PulseReportsService {
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

    const score = await this.prisma.pulseScore.findUnique({
      where: { cycleId_userId: { cycleId: report.cycleId, userId: report.ownerId } },
    });

    const feedbacks = await this.prisma.pulseFeedback.findMany({
      where: { cycleId: report.cycleId, targetId: report.ownerId, status: PulseEvaluationStatus.FINALIZADO },
      include: { evaluator: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // REGRA DE ANONIMATO (PRD seção 19): quem está vendo o PRÓPRIO relatório
    // (o dono) vê colegas como "Colega 1/2/3" e liderados como "Liderado 1/2/3"
    // — só o gestor direto aparece com nome real. Gestor/Admin veem todo
    // mundo com nome real (precisam pra consolidar de verdade).
    const viewingAsOwner = requester.id === report.ownerId && requester.role !== UserRole.ADMIN;

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
        model: process.env.ANTHROPIC_MODEL ?? 'não configurado',
      },
      update: {
        strengths: result.strengths,
        improvements: result.improvements,
        trends: result.trends,
        summary: result.summary,
        suggestedOpinion: result.suggestedOpinion,
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

@UseGuards(JwtAuthGuard)
@Controller('pulse-reports')
class PulseReportsController {
  constructor(
    private pulseReportsService: PulseReportsService,
    private pdfService: PulseReportPdfService,
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

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findOne(id, req.user);
  }

  // Reaproveita findOne() por completo — mesma checagem de permissão e
  // mesma regra de anonimato já aplicadas, só troca a saída de JSON pra PDF.
  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Req() req: { user: AuthUser }, @Res() res: Response) {
    const report = await this.pulseReportsService.findOne(id, req.user);
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
  @Patch(':id/ai-analysis')
  generateAiAnalysis(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.generateAiAnalysis(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id/opinion')
  setOpinion(@Param('id') id: string, @Body() dto: SetOpinionDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.setOpinion(id, dto.opinion, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id/finalize')
  finalize(@Param('id') id: string, @Body() dto: FinalizeDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.finalize(id, dto?.opinion, req.user);
  }
}

@Module({
  imports: [AnthropicModule],
  controllers: [PulseReportsController],
  providers: [PulseReportsService, PulseReportPdfService],
})
export class PulseReportsModule {}
